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
