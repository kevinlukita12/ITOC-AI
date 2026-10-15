/**
 * Membaca semua dokumen di folder DokumenPedoman/, memotongnya, membuat embedding,
 * lalu menyimpan hasilnya ke data/rag-index.json.
 *
 *   npm run ingest            -> hanya memproses file baru / yang berubah
 *   npm run ingest -- --rebuild  -> memproses ulang semuanya
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { RAG_CONFIG } from '../lib/rag/config';
import { chunkDocument } from '../lib/rag/chunk';
import { embedTexts } from '../lib/rag/embed';
import {
  encodeVector,
  readIndexFile,
  titleFromFile,
  writeIndexFile,
  type DocumentInfo,
  type IndexFile,
  type StoredChunk,
} from '../lib/rag/store';

const SUPPORTED = new Set(['.pdf', '.txt', '.md']);

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full)));
    else if (SUPPORTED.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function readPages(fullPath: string): Promise<string[]> {
  const ext = path.extname(fullPath).toLowerCase();
  const buf = await fs.readFile(fullPath);
  if (ext !== '.pdf') return [buf.toString('utf8')];

  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

async function main() {
  const rebuild = process.argv.includes('--rebuild');
  const docsDir = RAG_CONFIG.documentsDir;

  try {
    await fs.access(docsDir);
  } catch {
    await fs.mkdir(docsDir, { recursive: true });
    console.log(`Folder ${docsDir} belum ada, sudah dibuat. Taruh file PDF di sana lalu jalankan lagi.`);
    return;
  }

  const files = (await listFiles(docsDir)).sort();
  if (!files.length) {
    console.log(`Tidak ada PDF di ${docsDir}. Taruh file PDF di sana lalu jalankan lagi.`);
    return;
  }

  const old = rebuild ? null : await readIndexFile();
  const sameModel = old?.embedModel === RAG_CONFIG.embedModel;
  if (old && !sameModel) {
    console.log(`Model embedding berubah (${old.embedModel} -> ${RAG_CONFIG.embedModel}), memproses ulang semua.`);
  }
  const oldDocs = new Map((sameModel ? old?.documents : [])?.map((d) => [d.file, d]) ?? []);

  const documents: DocumentInfo[] = [];
  const chunks: StoredChunk[] = [];
  let processed = 0;
  let skipped = 0;
  const warnings: string[] = [];

  console.log(`Model embedding: ${RAG_CONFIG.embedModel} @ ${RAG_CONFIG.baseURL}`);
  console.log(`Ditemukan ${files.length} dokumen di ${docsDir}\n`);

  for (const [n, full] of files.entries()) {
    const rel = path.relative(docsDir, full).split(path.sep).join('/');
    const stat = await fs.stat(full);
    const prefix = `[${n + 1}/${files.length}] ${rel}`;

    const prev = oldDocs.get(rel);
    if (prev && prev.size === stat.size && Math.floor(prev.mtimeMs) === Math.floor(stat.mtimeMs)) {
      documents.push(prev);
      chunks.push(...old!.chunks.filter((c) => c.file === rel));
      skipped++;
      console.log(`${prefix} — tidak berubah, dilewati`);
      continue;
    }

    try {
      const pages = await readPages(full);
      const totalChars = pages.reduce((s, p) => s + p.trim().length, 0);

      if (totalChars < 50 * pages.length) {
        warnings.push(
          `${rel}: hampir tidak ada teks (${totalChars} karakter, ${pages.length} halaman). ` +
            `Kemungkinan PDF hasil scan; perlu di-OCR dulu agar bisa dibaca.`,
        );
        if (totalChars < 40) {
          console.log(`${prefix} — DILEWATI (tidak ada teks, kemungkinan hasil scan)`);
          continue;
        }
      }

      const title = titleFromFile(rel);
      const docChunks = chunkDocument(pages, RAG_CONFIG.chunkSize, RAG_CONFIG.chunkOverlap);

      // Judul & heading ikut di-embed supaya pertanyaan seperti "BOFIS pasal 3" lebih tepat sasaran.
      const vectors = await embedTexts(
        docChunks.map((c) => `Dokumen: ${title}\n${c.heading ? `Bagian: ${c.heading}\n` : ''}${c.text}`),
      );

      docChunks.forEach((c, i) => {
        chunks.push({
          id: `${rel}#${i}`,
          file: rel,
          title,
          heading: c.heading,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          text: c.text,
          embedding: encodeVector(vectors[i]),
        });
      });

      documents.push({
        file: rel,
        title,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        pages: pages.length,
        chunkCount: docChunks.length,
      });
      processed++;
      console.log(`${prefix} — ${pages.length} halaman, ${docChunks.length} potongan`);
    } catch (err) {
      warnings.push(`${rel}: gagal diproses — ${(err as Error).message}`);
      console.log(`${prefix} — GAGAL`);
      // Bila Ollama mati, tidak ada gunanya lanjut ke file berikutnya.
      if (/Embedding gagal|fetch failed|ECONNREFUSED/i.test((err as Error).message)) {
        console.error(`\n${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const index: IndexFile = {
    version: 1,
    embedModel: RAG_CONFIG.embedModel,
    updatedAt: new Date().toISOString(),
    documents,
    chunks,
  };
  await writeIndexFile(index);

  const removed = [...oldDocs.keys()].filter((f) => !documents.some((d) => d.file === f));
  console.log(
    `\nSelesai. ${documents.length} dokumen, ${chunks.length} potongan ` +
      `(${processed} diproses, ${skipped} tidak berubah${removed.length ? `, ${removed.length} dihapus dari index` : ''}).`,
  );
  console.log(`Index disimpan di ${RAG_CONFIG.indexFile}`);
  if (warnings.length) {
    console.log('\nPerhatian:');
    for (const w of warnings) console.log(`  - ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
