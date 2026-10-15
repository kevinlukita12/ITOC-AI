import { RAG_CONFIG } from './config';

/** Normalisasi vektor ke panjang 1 supaya cosine similarity = dot product. */
export function normalize(v: number[]): Float32Array {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/**
 * Membuat embedding lewat endpoint OpenAI-compatible Ollama (`/v1/embeddings`).
 * Mengirim per batch agar tidak membebani server.
 */
export async function embedTexts(texts: string[], batchSize = 16): Promise<Float32Array[]> {
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    let res: Response;
    try {
      res = await fetch(`${RAG_CONFIG.baseURL}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ollama' },
        body: JSON.stringify({ model: RAG_CONFIG.embedModel, input: batch }),
      });
    } catch {
      throw new Error(
        `Embedding gagal: tidak bisa terhubung ke ${RAG_CONFIG.baseURL}. Pastikan Ollama sedang berjalan.`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Embedding gagal (${res.status}). Pastikan Ollama berjalan dan model sudah di-pull: ` +
          `\`ollama pull ${RAG_CONFIG.embedModel}\`. Detail: ${body.slice(0, 300)}`,
      );
    }

    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) results.push(normalize(item.embedding));
  }

  return results;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const [v] = await embedTexts([text]);
  return v;
}
