import http from 'node:http';
import https from 'node:https';
import { RAG_CONFIG } from '../rag/config';

/**
 * Memanggil Ollama dengan node:http, BUKAN fetch().
 *
 * fetch() bawaan Node membatalkan permintaan bila header balasan belum datang
 * dalam 300 detik. Ollama baru mengirim header bersamaan dengan kata pertama
 * jawaban, jadi di komputer yang lambat (model masih dimuat + membaca dokumen)
 * permintaan diputus di menit ke-5 dan jawaban tidak pernah muncul.
 * node:http tidak punya batas waktu seperti itu.
 */

export interface OllamaResponse {
  status: number;
  body: AsyncIterable<Buffer>;
  text(): Promise<string>;
}

export class OllamaError extends Error {}

function ollamaBaseURL(): URL {
  const url = new URL(RAG_CONFIG.ollamaURL);
  // Di Windows, "localhost" kadang diarahkan ke IPv6 (::1), padahal Ollama hanya mendengar di 127.0.0.1.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

export function ollamaPost(path: string, payload: unknown, signal?: AbortSignal): Promise<OllamaResponse> {
  return ollamaRequest('POST', path, payload, signal);
}

export function ollamaGet(path: string): Promise<OllamaResponse> {
  return ollamaRequest('GET', path);
}

function ollamaRequest(
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  signal?: AbortSignal,
): Promise<OllamaResponse> {
  const url = new URL(path, ollamaBaseURL());
  const data = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
        signal,
      },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          body: res,
          async text() {
            const chunks: Buffer[] = [];
            for await (const c of res) chunks.push(c as Buffer);
            return Buffer.concat(chunks).toString('utf8');
          },
        });
      },
    );
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (signal?.aborted) return reject(err);
      reject(
        new OllamaError(
          err.code === 'ECONNREFUSED'
            ? `Ollama tidak berjalan di ${url.origin}. Buka aplikasi Ollama dulu, lalu coba lagi.`
            : `Tidak bisa terhubung ke Ollama di ${url.origin}: ${err.message}`,
        ),
      );
    });
    req.end(data);
  });
}

/** Mengubah balasan error Ollama menjadi pesan yang jelas untuk pengguna. */
export async function ollamaErrorMessage(res: OllamaResponse, model: string): Promise<string> {
  const raw = await res.text().catch(() => '');
  let detail = raw;
  try {
    detail = (JSON.parse(raw) as { error?: string }).error ?? raw;
  } catch {
    // bukan JSON, pakai apa adanya
  }

  if (res.status === 404 || /not found/i.test(detail)) {
    return `Model "${model}" belum ada di Ollama. Jalankan: ollama pull ${model}`;
  }
  if (/memory|out of memory|requires more/i.test(detail)) {
    return `Memori komputer tidak cukup untuk model "${model}". Tutup aplikasi lain atau pakai model yang lebih kecil. Detail: ${detail}`;
  }
  return `Ollama error ${res.status}: ${detail.slice(0, 300)}`;
}
