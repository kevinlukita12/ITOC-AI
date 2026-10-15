export interface Chunk {
  text: string;
  /** Halaman PDF (dimulai dari 1). */
  pageStart: number;
  pageEnd: number;
  /** Mis. "BAB II > Pasal 5" bila terdeteksi. */
  heading: string;
}

interface Line {
  text: string;
  page: number;
}

/** Membersihkan teks hasil ekstraksi PDF per halaman. */
export function cleanPageText(raw: string): string {
  return (
    raw
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      // Gabungkan kata yang terpotong tanda hubung di akhir baris.
      .replace(/([a-zA-Z])-\n([a-z])/g, '$1$2')
      .split('\n')
      .map((l) => l.trim())
      // Buang baris yang hanya nomor halaman, mis. "- 5 -" atau "12".
      .filter((l) => !/^[-–]?\s*\d{1,4}\s*[-–]?$/.test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const BAB_RE = /^BAB\s+[IVXLCDM]+\b/i;
const PASAL_RE = /^Pasal\s+\d+[A-Z]?$/i;
const BAGIAN_RE = /^(Bagian|Paragraf)\s+(Ke\w+|\d+)$/i;

/** Mis. ["BAB I", "BAB I > Pasal 1", "BAB I > Pasal 2"] -> "BAB I > Pasal 1–2". */
function summarizeHeadings(headings: string[]): string {
  const nonEmpty = headings.filter(Boolean);
  if (!nonEmpty.length) return '';
  const pasals = nonEmpty.filter((h) => /Pasal\s+\d+/i.test(h));
  if (!pasals.length) return nonEmpty[0];
  const first = pasals[0];
  const last = pasals[pasals.length - 1];
  if (first === last) return first;
  const lastNo = last.match(/Pasal\s+(\d+[A-Z]?)/i)?.[1];
  return lastNo ? `${first}–${lastNo}` : first;
}

/**
 * Memecah dokumen menjadi potongan yang menghormati struktur peraturan
 * (BAB / Pasal) bila ada, dan jatuh ke pemotongan per paragraf bila tidak
 * (misalnya untuk Pedoman yang memakai penomoran 1., 1.1, a., dst).
 */
export function chunkDocument(pages: string[], chunkSize: number, overlap: number): Chunk[] {
  const lines: Line[] = [];
  pages.forEach((p, i) => {
    for (const l of cleanPageText(p).split('\n')) {
      if (l) lines.push({ text: l, page: i + 1 });
    }
  });

  // 1) Kelompokkan baris menjadi "section" berdasarkan judul Pasal/BAB.
  type Section = { heading: string; lines: Line[] };
  const sections: Section[] = [];
  let bab = '';
  let current: Section = { heading: '', lines: [] };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].text;
    const isBab = BAB_RE.test(t);
    const isPasal = PASAL_RE.test(t);
    const isBagian = BAGIAN_RE.test(t);

    if (isBab || isPasal || isBagian) {
      if (current.lines.length) sections.push(current);
      if (isBab) {
        // Judul BAB biasanya ada di baris berikutnya (huruf kapital).
        const next = lines[i + 1]?.text ?? '';
        bab = next && next === next.toUpperCase() && next.length < 120 ? `${t} ${next}` : t;
      }
      const heading = isPasal ? (bab ? `${bab} > ${t}` : t) : bab || t;
      current = { heading, lines: [] };
    }
    current.lines.push(lines[i]);
  }
  if (current.lines.length) sections.push(current);

  // 2) Gabungkan section kecil, pecah section besar.
  const chunks: Chunk[] = [];
  let buf: Line[] = [];
  let bufHeadings: string[] = [];
  const bufLen = () => buf.reduce((n, l) => n + l.text.length + 1, 0);

  const flush = () => {
    if (!buf.length) return;
    chunks.push({
      text: buf.map((l) => l.text).join('\n'),
      pageStart: buf[0].page,
      pageEnd: buf[buf.length - 1].page,
      heading: summarizeHeadings(bufHeadings),
    });
    buf = [];
    bufHeadings = [];
  };

  for (const s of sections) {
    const sLen = s.lines.reduce((n, l) => n + l.text.length + 1, 0);

    if (sLen > chunkSize) {
      // Section panjang: potong per baris dengan overlap.
      flush();
      bufHeadings = [s.heading];
      for (const line of s.lines) {
        if (bufLen() + line.text.length > chunkSize && buf.length) {
          const prev = buf;
          flush();
          // Bawa beberapa baris terakhir sebagai overlap.
          let carried = 0;
          const tail: Line[] = [];
          for (let j = prev.length - 1; j >= 0 && carried < overlap; j--) {
            tail.unshift(prev[j]);
            carried += prev[j].text.length;
          }
          buf = tail;
          bufHeadings = [s.heading];
        }
        buf.push(line);
      }
      flush();
      continue;
    }

    if (bufLen() + sLen > chunkSize) flush();
    bufHeadings.push(s.heading);
    buf.push(...s.lines);
  }
  flush();

  // Buang potongan yang terlalu pendek untuk berguna (mis. halaman sampul kosong).
  return chunks.filter((c) => c.text.replace(/\s/g, '').length >= 40);
}
