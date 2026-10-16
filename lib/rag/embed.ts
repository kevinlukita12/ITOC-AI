import { OllamaError, ollamaErrorMessage, ollamaPost } from '../llm/http';
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
 * Membuat embedding lewat API native Ollama (`/api/embed`).
 * `keep_alive` membuat model embedding tetap di memori, jadi tidak dimuat ulang
 * setiap kali ada pertanyaan.
 */
export async function embedTexts(texts: string[], batchSize = 16): Promise<Float32Array[]> {
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await ollamaPost('/api/embed', {
      model: RAG_CONFIG.embedModel,
      input: batch,
      keep_alive: RAG_CONFIG.keepAlive,
      truncate: true,
    });

    if (res.status !== 200) {
      throw new OllamaError(`Embedding gagal. ${await ollamaErrorMessage(res, RAG_CONFIG.embedModel)}`);
    }

    const json = JSON.parse(await res.text()) as { embeddings: number[][] };
    for (const e of json.embeddings) results.push(normalize(e));
  }

  return results;
}

// Pertanyaan yang sama (mis. pertanyaan contoh di halaman awal) tidak perlu di-embed ulang.
const queryCache = new Map<string, Float32Array>();
const QUERY_CACHE_MAX = 200;

export async function embedQuery(text: string): Promise<Float32Array> {
  const key = text.trim().toLowerCase();
  const hit = queryCache.get(key);
  if (hit) return hit;

  const [v] = await embedTexts([text]);
  if (queryCache.size >= QUERY_CACHE_MAX) {
    queryCache.delete(queryCache.keys().next().value as string);
  }
  queryCache.set(key, v);
  return v;
}
