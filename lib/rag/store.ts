import fs from 'node:fs/promises';
import path from 'node:path';
import { RAG_CONFIG } from './config';
import { buildBm25, type Bm25Index } from './search';

export interface DocumentInfo {
  file: string;
  title: string;
  size: number;
  mtimeMs: number;
  pages: number;
  chunkCount: number;
}

export interface StoredChunk {
  id: string;
  file: string;
  title: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
  text: string;
  /** Float32Array dalam bentuk base64 (hemat ukuran file dibanding JSON angka). */
  embedding: string;
}

export interface IndexFile {
  version: 1;
  embedModel: string;
  updatedAt: string;
  documents: DocumentInfo[];
  chunks: StoredChunk[];
}

export interface LoadedChunk extends Omit<StoredChunk, 'embedding'> {
  vector: Float32Array;
}

export interface LoadedIndex {
  embedModel: string;
  updatedAt: string;
  documents: DocumentInfo[];
  chunks: LoadedChunk[];
  bm25: Bm25Index;
}

export function titleFromFile(file: string): string {
  return path
    .basename(file, path.extname(file))
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function encodeVector(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
}

export function decodeVector(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  // Salin ke ArrayBuffer baru agar alignment 4-byte terjamin.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}

export async function readIndexFile(): Promise<IndexFile | null> {
  try {
    const raw = await fs.readFile(RAG_CONFIG.indexFile, 'utf8');
    return JSON.parse(raw) as IndexFile;
  } catch {
    return null;
  }
}

export async function writeIndexFile(index: IndexFile): Promise<void> {
  await fs.mkdir(path.dirname(RAG_CONFIG.indexFile), { recursive: true });
  const tmp = `${RAG_CONFIG.indexFile}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(index));
  // Rename atomik: server yang sedang berjalan tidak akan membaca file setengah jadi.
  await fs.rename(tmp, RAG_CONFIG.indexFile);
}

// Cache di globalThis supaya tidak dimuat ulang setiap request / hot reload.
const g = globalThis as unknown as {
  __itocRag?: { mtimeMs: number; index: LoadedIndex | null };
};

/**
 * Memuat index ke memori. Otomatis memuat ulang bila file index berubah,
 * jadi `npm run ingest` bisa dijalankan tanpa me-restart server.
 */
export async function loadIndex(): Promise<LoadedIndex | null> {
  let mtimeMs: number;
  try {
    mtimeMs = (await fs.stat(RAG_CONFIG.indexFile)).mtimeMs;
  } catch {
    g.__itocRag = { mtimeMs: 0, index: null };
    return null;
  }

  if (g.__itocRag && g.__itocRag.mtimeMs === mtimeMs) return g.__itocRag.index;

  const file = await readIndexFile();
  if (!file) return null;

  const chunks: LoadedChunk[] = file.chunks.map(({ embedding, ...rest }) => ({
    ...rest,
    vector: decodeVector(embedding),
  }));

  const index: LoadedIndex = {
    embedModel: file.embedModel,
    updatedAt: file.updatedAt,
    documents: file.documents,
    chunks,
    bm25: buildBm25(chunks.map((c) => `${c.title} ${c.heading} ${c.text}`)),
  };

  g.__itocRag = { mtimeMs, index };
  console.log(
    `[ITOC RAG] Index dimuat: ${file.documents.length} dokumen, ${chunks.length} potongan.`,
  );
  return index;
}
