/** Data sumber yang dikirim ke browser untuk ditampilkan di bawah jawaban. */
export interface SourceRef {
  n: number;
  title: string;
  file: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
}

/** Waktu yang dibutuhkan untuk menjawab, ditampilkan di bawah jawaban. */
export interface AnswerTiming {
  totalMs: number;
  firstTokenMs: number;
  retrievalMs: number;
  promptTokens: number;
  answerTokens: number;
  tokensPerSec: number;
}

/**
 * Tahapan menjawab, dikirim ke browser selama menunggu supaya pengguna tahu AI masih bekerja.
 * - searching : mencari potongan dokumen yang relevan
 * - reading   : model membaca potongan dokumen (paling lama sebelum kata pertama)
 * - writing   : model mulai menulis jawaban
 */
export type ProgressUpdate =
  | { stage: 'searching' }
  | { stage: 'reading'; excerpts: number; loadingModel: boolean }
  | { stage: 'writing' };
