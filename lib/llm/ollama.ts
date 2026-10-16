import { RAG_CONFIG } from '../rag/config';
import { OllamaError, ollamaErrorMessage, ollamaGet, ollamaPost } from './http';

/**
 * Klien kecil untuk API native Ollama (`/api/chat`).
 *
 * Dipakai sebagai ganti endpoint OpenAI-compatible (`/v1`) karena hanya API native
 * yang bisa mengatur hal-hal yang menentukan kecepatan per permintaan:
 * - num_ctx      : context window tetap, jadi model tidak dimuat ulang
 * - keep_alive   : model tetap di memori di antara pertanyaan
 * - num_predict  : batas panjang jawaban
 * - think: false : mematikan mode "berpikir" pada model seperti qwen3 (sangat memperlambat)
 */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Statistik dari Ollama di akhir jawaban. Durasi dalam nanodetik. */
export interface OllamaStats {
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
  done_reason?: string;
}

export type ChatEvent = { type: 'delta'; text: string } | { type: 'done'; stats: OllamaStats };

export function modelOptions(overrides: Record<string, number> = {}) {
  return {
    num_ctx: RAG_CONFIG.numCtx,
    num_predict: RAG_CONFIG.maxAnswerTokens,
    temperature: 0.2, // rendah = jawaban konsisten dan setia pada teks peraturan
    ...overrides,
  };
}

/** Membaca balasan NDJSON Ollama (satu objek JSON per baris). */
async function* readNdjson(body: AsyncIterable<Buffer>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

export async function* streamChat(
  messages: ChatTurn[],
  signal?: AbortSignal,
  optionOverrides: Record<string, number> = {},
): AsyncGenerator<ChatEvent> {
  let res;
  try {
    res = await ollamaPost(
      '/api/chat',
      {
        model: RAG_CONFIG.chatModel,
        messages,
        stream: true,
        think: false,
        keep_alive: RAG_CONFIG.keepAlive,
        options: modelOptions(optionOverrides),
      },
      signal,
    );
  } catch (err) {
    if (signal?.aborted) return; // pengguna menekan Stop
    throw err;
  }

  if (res.status !== 200) throw new OllamaError(await ollamaErrorMessage(res, RAG_CONFIG.chatModel));

  try {
    for await (const data of readNdjson(res.body)) {
      const d = data as { message?: { content?: string }; done?: boolean; error?: string } & OllamaStats;
      if (d.error) throw new OllamaError(`Ollama error: ${d.error}`);
      if (d.message?.content) yield { type: 'delta', text: d.message.content };
      if (d.done) {
        yield { type: 'done', stats: d };
        return;
      }
    }
  } catch (err) {
    if (signal?.aborted) return; // pengguna menekan Stop
    throw err;
  }

  throw new OllamaError('Ollama berhenti sebelum jawaban selesai. Cek jendela/log Ollama untuk detailnya.');
}

/**
 * Memuat model chat dan embedding ke memori saat server mulai, dengan
 * num_ctx yang sama seperti saat menjawab, supaya pertanyaan pertama tidak
 * perlu menunggu model dimuat.
 */
export async function warmUpModels(): Promise<void> {
  const started = Date.now();
  const post = async (path: string, body: unknown, model: string) => {
    const res = await ollamaPost(path, body);
    if (res.status !== 200) throw new OllamaError(await ollamaErrorMessage(res, model));
    await res.text();
  };

  try {
    await post(
      '/api/embed',
      { model: RAG_CONFIG.embedModel, input: 'pemanasan', keep_alive: RAG_CONFIG.keepAlive },
      RAG_CONFIG.embedModel,
    );
    // Tanpa prompt: Ollama hanya memuat model, tidak menghasilkan teks.
    await post(
      '/api/generate',
      { model: RAG_CONFIG.chatModel, keep_alive: RAG_CONFIG.keepAlive, options: modelOptions() },
      RAG_CONFIG.chatModel,
    );
    console.log(
      `[ITOC AI] Model siap (${RAG_CONFIG.chatModel} + ${RAG_CONFIG.embedModel}) dalam ` +
        `${((Date.now() - started) / 1000).toFixed(1)} dtk.`,
    );
  } catch (err) {
    console.warn(`[ITOC AI] Pemanasan model gagal: ${(err as Error).message}`);
  }
}

/**
 * Apakah model chat sudah ada di memori? Kalau belum, pertanyaan ini harus menunggu
 * model dimuat dulu, dan halaman chat memberi tahu pengguna.
 */
export async function isChatModelLoaded(): Promise<boolean> {
  try {
    const res = await ollamaGet('/api/ps');
    if (res.status !== 200) return true;
    const { models } = JSON.parse(await res.text()) as { models?: Array<{ name: string }> };
    const want = RAG_CONFIG.chatModel.includes(':') ? RAG_CONFIG.chatModel : `${RAG_CONFIG.chatModel}:latest`;
    return (models ?? []).some((m) => m.name === want || m.name === RAG_CONFIG.chatModel);
  } catch {
    return true; // tidak tahu, jangan tampilkan peringatan
  }
}
