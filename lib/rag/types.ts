/** Data sumber yang dikirim ke browser untuk ditampilkan di bawah jawaban. */
export interface SourceRef {
  n: number;
  title: string;
  file: string;
  heading: string;
  pageStart: number;
  pageEnd: number;
}
