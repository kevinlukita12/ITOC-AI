import path from 'node:path';

/**
 * Semua pengaturan RAG (Retrieval-Augmented Generation) dikumpulkan di sini.
 * Nilai bisa di-override lewat file .env.local tanpa mengubah kode.
 */
export const RAG_CONFIG = {
  /** Folder tempat PDF peraturan disimpan. */
  documentsDir: path.resolve(process.cwd(), process.env.RAG_DOCUMENTS_DIR || 'DokumenPedoman'),

  /** File index hasil `npm run ingest`. */
  indexFile: path.resolve(process.cwd(), process.env.RAG_INDEX_FILE || 'data/rag-index.json'),

  /** Server Ollama (endpoint OpenAI-compatible). */
  baseURL: (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''),

  /**
   * Model embedding. bge-m3 dipilih karena multibahasa dan bagus untuk Bahasa Indonesia.
   * Jalankan sekali: `ollama pull bge-m3`
   */
  embedModel: process.env.AI_EMBED_MODEL || 'bge-m3',

  /** Ukuran potongan teks (karakter). */
  chunkSize: Number(process.env.RAG_CHUNK_SIZE || 1600),
  chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP || 250),

  /** Jumlah potongan yang diberikan ke model per pertanyaan. */
  topK: Number(process.env.RAG_TOP_K || 6),

  /** Batas total karakter konteks agar tidak melebihi context window model. */
  maxContextChars: Number(process.env.RAG_MAX_CONTEXT_CHARS || 12000),
};
