import type { LoadedChunk, LoadedIndex } from './store';

// Kata umum yang tidak membantu pencarian kata kunci.
const STOPWORDS = new Set(
  (
    'yang dan di ke dari untuk dengan pada dalam atau ini itu adalah sebagai oleh tidak akan juga ' +
    'dapat harus apa apakah bagaimana berapa siapa kapan mengapa kenapa saja ada tersebut para serta ' +
    'bisa mohon tolong jelaskan sebutkan saya kami kita anda nya pun lah kah agar bila jika maka ' +
    'the of and to in a an is are for what how which who when why does do on with be by about'
  ).split(' '),
);

// Kata yang muncul di hampir semua judul dokumen, jadi tidak dipakai untuk boost judul.
const GENERIC_TITLE_WORDS = new Set(
  'pedoman peraturan ojk pojk nomor no tahun tentang surat edaran seojk bei idx ksei kpei final versi v'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface Bm25Index {
  docs: Map<string, number>[];
  lengths: number[];
  df: Map<string, number>;
  avgdl: number;
}

export function buildBm25(texts: string[]): Bm25Index {
  const docs: Map<string, number>[] = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();

  for (const t of texts) {
    const tf = new Map<string, number>();
    const tokens = tokenize(t);
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    for (const tok of tf.keys()) df.set(tok, (df.get(tok) ?? 0) + 1);
    docs.push(tf);
    lengths.push(tokens.length);
  }

  const avgdl = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  return { docs, lengths, df, avgdl };
}

function bm25Scores(idx: Bm25Index, queryTokens: string[], k1 = 1.5, b = 0.75): number[] {
  const N = idx.docs.length;
  const unique = [...new Set(queryTokens)];
  return idx.docs.map((tf, i) => {
    let score = 0;
    for (const q of unique) {
      const f = tf.get(q);
      if (!f) continue;
      const n = idx.df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * idx.lengths[i]) / idx.avgdl));
    }
    return score;
  });
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function rankOf(scores: number[], limit: number): Map<number, number> {
  const order = scores
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s > 0)
    .sort((x, y) => y[0] - x[0])
    .slice(0, limit);
  return new Map(order.map(([, i], r) => [i, r + 1]));
}

export interface SearchHit {
  chunk: LoadedChunk;
  score: number;
  similarity: number;
}

/**
 * Pencarian hybrid:
 *  - vektor (makna, cocok untuk pertanyaan dengan kata-kata sendiri)
 *  - BM25 (kata kunci persis, cocok untuk "Pasal 12", "POJK 11/2022", "RTO", "DRC")
 * digabung dengan Reciprocal Rank Fusion, lalu diberi bonus bila pertanyaan
 * menyebut nama dokumen atau nomor pasal tertentu.
 */
export function hybridSearch(
  index: LoadedIndex,
  query: string,
  queryVector: Float32Array,
  opts: { topK: number; maxChars: number },
): SearchHit[] {
  const qTokens = tokenize(query);
  const sims = index.chunks.map((c) => dot(c.vector, queryVector));
  const kw = bm25Scores(index.bm25, qTokens);

  const vecRank = rankOf(sims, 40);
  const kwRank = rankOf(kw, 40);

  // Nama dokumen yang disebut di pertanyaan (mis. "BOFIS", "DRC", "remote trading").
  const qSet = new Set(qTokens);
  const mentionedFiles = new Set(
    index.documents
      .filter((d) =>
        tokenize(d.title).some((t) => !GENERIC_TITLE_WORDS.has(t) && !/^\d+$/.test(t) && qSet.has(t)),
      )
      .map((d) => d.file),
  );

  // Nomor pasal yang disebut, mis. "pasal 12" -> "pasal 12".
  const pasalMatches = [...query.toLowerCase().matchAll(/pasal\s+(\d+[a-z]?)/g)].map(
    (m) => `pasal ${m[1]}`,
  );

  const RRF_K = 60;
  const hits: SearchHit[] = [];

  index.chunks.forEach((chunk, i) => {
    const vr = vecRank.get(i);
    const kr = kwRank.get(i);
    if (!vr && !kr) return;

    let score = (vr ? 1 / (RRF_K + vr) : 0) + (kr ? 1 / (RRF_K + kr) : 0);
    if (mentionedFiles.has(chunk.file)) score *= 1.5;
    if (pasalMatches.length) {
      const hay = `${chunk.heading}\n${chunk.text.slice(0, 200)}`.toLowerCase();
      if (pasalMatches.some((p) => new RegExp(`\\b${p}\\b`).test(hay))) score *= 1.6;
    }
    hits.push({ chunk, score, similarity: sims[i] });
  });

  hits.sort((a, b) => b.score - a.score);

  // Ambil sebanyak topK tanpa melebihi batas karakter konteks.
  const selected: SearchHit[] = [];
  let used = 0;
  for (const h of hits) {
    if (selected.length >= opts.topK) break;
    if (used + h.chunk.text.length > opts.maxChars && selected.length > 0) continue;
    selected.push(h);
    used += h.chunk.text.length;
  }
  return selected;
}
