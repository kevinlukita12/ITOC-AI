import path from 'node:path';

/**
 * Semua pengaturan AI dan RAG (Retrieval-Augmented Generation) dikumpulkan di sini.
 * Nilai bisa di-override lewat file .env.local tanpa mengubah kode.
 */
export const RAG_CONFIG = {
  /** Folder tempat PDF peraturan disimpan. */
  documentsDir: path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.RAG_DOCUMENTS_DIR || 'DokumenPedoman',
  ),

  /** File index hasil `npm run ingest`. */
  indexFile: path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.RAG_INDEX_FILE || 'data/rag-index.json',
  ),

  /** Alamat Ollama. Boleh ditulis dengan atau tanpa akhiran /v1. */
  ollamaURL: (process.env.AI_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '').replace(/\/v1$/, ''),

  /**
   * Model chat. Harus sama persis dengan `ollama list`.
   * qwen2.5:3b dipilih supaya cepat di laptop tanpa GPU. Jalankan sekali: `ollama pull qwen2.5:3b`
   */
  chatModel: process.env.AI_MODEL_NAME || 'qwen2.5:3b',

  /**
   * Model embedding. bge-m3 dipilih karena multibahasa dan bagus untuk Bahasa Indonesia.
   * Jalankan sekali: `ollama pull bge-m3`
   */
  embedModel: process.env.AI_EMBED_MODEL || 'bge-m3',

  // ---- Kecepatan ----------------------------------------------------------

  /**
   * Context window per permintaan (token). Nilainya harus tetap sama di setiap
   * permintaan; kalau berubah, Ollama memuat ulang model (lambat).
   * 8192 cukup untuk konteks dokumen + riwayat chat dan lebih hemat memori
   * daripada 16384, sehingga lebih banyak bagian model muat di GPU.
   */
  numCtx: Number(process.env.AI_NUM_CTX || 8192),

  /** Batas panjang jawaban (token). Di CPU, setiap token jawaban butuh waktu. */
  maxAnswerTokens: Number(process.env.AI_MAX_ANSWER_TOKENS || 900),

  /** Berapa lama model tetap di memori setelah dipakai. "-1" = selamanya. */
  keepAlive: process.env.AI_KEEP_ALIVE || '60m',

  /** Jumlah potongan dokumen yang diberikan ke model per pertanyaan. */
  topK: Number(process.env.RAG_TOP_K || 4),

  /** Batas total karakter potongan dokumen per pertanyaan. */
  maxContextChars: Number(process.env.RAG_MAX_CONTEXT_CHARS || 6500),

  /** Jumlah pesan riwayat chat yang ikut dikirim ke model. */
  historyMessages: Number(process.env.AI_HISTORY_MESSAGES || 6),

  /** Jawaban AI sebelumnya dipotong sepanjang ini saat dikirim ulang sebagai riwayat. */
  historyAnswerChars: Number(process.env.AI_HISTORY_ANSWER_CHARS || 800),

  // ---- Ingest --------------------------------------------------------------

  /** Ukuran potongan teks (karakter). */
  chunkSize: Number(process.env.RAG_CHUNK_SIZE || 1600),
  chunkOverlap: Number(process.env.RAG_CHUNK_OVERLAP || 250),
};
