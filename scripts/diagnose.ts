/**
 * Memeriksa kenapa ITOC AI lambat atau tidak menjawab, dan mengukur kecepatan
 * model di komputer ini.   npm run diagnose
 */
import '../lib/load-env';
import os from 'node:os';
import fs from 'node:fs';
import { RAG_CONFIG } from '../lib/rag/config';
import { readIndexFile } from '../lib/rag/store';
import { ollamaGet } from '../lib/llm/http';
import { streamChat, type OllamaStats } from '../lib/llm/ollama';
import { embedQuery } from '../lib/rag/embed';

const ok = (s: string) => console.log(`  [OK]    ${s}`);
const warn = (s: string) => console.log(`  [!]     ${s}`);
const fail = (s: string) => console.log(`  [GAGAL] ${s}`);
const info = (s: string) => console.log(`          ${s}`);
const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const sec = (ns?: number) => (ns ?? 0) / 1e9;
const withTag = (m: string) => (m.includes(':') ? m : `${m}:latest`);
const onSmallModel = /[:-](0\.5|1\.5|3)b/i.test(RAG_CONFIG.chatModel);

async function getJson<T>(path: string): Promise<T> {
  const res = await ollamaGet(path);
  const text = await res.text();
  if (res.status !== 200) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

async function main() {
  const advice: string[] = [];
  console.log('\n=== ITOC AI: pemeriksaan ===\n');

  // 1) Komputer
  console.log('Komputer');
  const cpus = os.cpus();
  info(`CPU: ${cpus[0]?.model ?? '?'} (${cpus.length} thread)`);
  info(`RAM: ${gb(os.totalmem())} total, ${gb(os.freemem())} kosong saat ini`);
  if (os.totalmem() < 15 * 1024 ** 3) {
    warn('RAM di bawah 16 GB: model AI + Windows bisa membuat komputer swap ke disk (sangat lambat).');
    advice.push(
      onSmallModel
        ? 'RAM terbatas: tutup aplikasi lain (browser dengan banyak tab, Teams, dll.) saat memakai ITOC AI.'
        : 'RAM terbatas: coba AI_MODEL_NAME=qwen2.5:3b di .env.local.',
    );
  }

  // 2) Pengaturan
  console.log('\nPengaturan (.env.local)');
  info(`Ollama       : ${RAG_CONFIG.ollamaURL}`);
  info(`Model chat   : ${RAG_CONFIG.chatModel}`);
  info(`Model embed  : ${RAG_CONFIG.embedModel}`);
  info(`num_ctx      : ${RAG_CONFIG.numCtx}, maks jawaban ${RAG_CONFIG.maxAnswerTokens} token, top-K ${RAG_CONFIG.topK}`);

  // 3) Ollama
  console.log('\nOllama');
  try {
    const v = await getJson<{ version: string }>('/api/version');
    ok(`Ollama berjalan, versi ${v.version}`);
  } catch (err) {
    fail((err as Error).message);
    console.log('\nBuka aplikasi Ollama dulu, lalu jalankan lagi `npm run diagnose`.\n');
    process.exitCode = 1;
    return;
  }

  const tags = await getJson<{ models: Array<{ name: string; size: number }> }>('/api/tags');
  const installed = new Map(tags.models.map((m) => [m.name, m.size]));
  let modelsOk = true;
  for (const m of [RAG_CONFIG.chatModel, RAG_CONFIG.embedModel]) {
    const size = installed.get(withTag(m)) ?? installed.get(m);
    if (size) ok(`Model ${m} terpasang (${gb(size)})`);
    else {
      fail(`Model ${m} BELUM terpasang. Jalankan: ollama pull ${m}`);
      modelsOk = false;
    }
  }
  if (!modelsOk) {
    info(`Model yang terpasang: ${[...installed.keys()].join(', ') || '(kosong)'}`);
    console.log('\nPasang model yang kurang, lalu jalankan lagi `npm run diagnose`.\n');
    process.exitCode = 1;
    return;
  }

  // 4) Index dokumen
  console.log('\nIndex dokumen');
  const index = fs.existsSync(RAG_CONFIG.indexFile) ? await readIndexFile() : null;
  if (!index) {
    fail(`Index belum ada di ${RAG_CONFIG.indexFile}. Jalankan: npm run ingest`);
  } else {
    ok(`${index.documents.length} dokumen, ${index.chunks.length} potongan`);
    if (index.embedModel !== RAG_CONFIG.embedModel) {
      warn(`Index dibuat dengan ${index.embedModel}, sekarang memakai ${RAG_CONFIG.embedModel}. Jalankan: npm run ingest -- --rebuild`);
    }
  }

  // 5) Uji embedding
  console.log('\nUji model embedding');
  let t = Date.now();
  try {
    await embedQuery(`uji kecepatan ${Date.now()}`);
    ok(`bge-m3 menjawab dalam ${((Date.now() - t) / 1000).toFixed(1)} dtk`);
  } catch (err) {
    fail((err as Error).message);
  }

  // 6) Uji model chat dengan prompt seukuran pertanyaan sungguhan
  console.log('\nUji model chat (prompt seukuran pertanyaan sungguhan, bisa 1-5 menit di komputer lambat)...');
  const excerpts = (index?.chunks ?? [])
    .slice(0, RAG_CONFIG.topK)
    .map((c, i) => `[${i + 1}] ${c.title}\n${c.text}`)
    .join('\n\n---\n\n');
  const prompt = `<excerpts>\n${excerpts || 'Contoh teks peraturan. '.repeat(300)}\n</excerpts>\n\nQuestion: Ringkas isi potongan di atas dalam satu kalimat.`;

  t = Date.now();
  let firstTokenMs = 0;
  let stats: OllamaStats = {};
  const ticker = setInterval(() => process.stdout.write('.'), 5000);
  try {
    for await (const ev of streamChat([{ role: 'user', content: prompt }], undefined, { num_predict: 80 })) {
      if (ev.type === 'delta' && !firstTokenMs) firstTokenMs = Date.now() - t;
      if (ev.type === 'done') stats = ev.stats;
    }
  } catch (err) {
    clearInterval(ticker);
    console.log('');
    fail((err as Error).message);
    process.exitCode = 1;
    return;
  }
  clearInterval(ticker);
  console.log('');

  const promptRate = (stats.prompt_eval_count ?? 0) / (sec(stats.prompt_eval_duration) || 1);
  const genRate = (stats.eval_count ?? 0) / (sec(stats.eval_duration) || 1);
  ok(`Selesai dalam ${((Date.now() - t) / 1000).toFixed(1)} dtk (kata pertama setelah ${(firstTokenMs / 1000).toFixed(1)} dtk)`);
  info(`Muat model   : ${sec(stats.load_duration).toFixed(1)} dtk`);
  info(`Baca prompt  : ${stats.prompt_eval_count} token dalam ${sec(stats.prompt_eval_duration).toFixed(1)} dtk (${promptRate.toFixed(1)} token/dtk)`);
  info(`Tulis jawaban: ${genRate.toFixed(1)} token/dtk`);

  // 7) Model ada di GPU atau CPU?
  try {
    const ps = await getJson<{ models: Array<{ name: string; size: number; size_vram: number }> }>('/api/ps');
    const m = ps.models.find((x) => x.name === withTag(RAG_CONFIG.chatModel) || x.name === RAG_CONFIG.chatModel);
    if (m) {
      const pct = m.size ? Math.round((m.size_vram / m.size) * 100) : 0;
      if (pct >= 99) ok(`Model chat 100% di GPU`);
      else if (pct > 0) warn(`Model chat ${pct}% di GPU, sisanya di CPU (lebih lambat)`);
      else warn('Model chat berjalan 100% di CPU (tidak ada GPU yang terpakai)');
    }
  } catch {
    // /api/ps tidak tersedia di Ollama versi lama
  }

  // 8) Perkiraan waktu jawaban sungguhan: baca prompt + tulis ~400 token.
  const answerTokens = 400;
  const estimate = sec(stats.prompt_eval_duration) + answerTokens / (genRate || 1);
  console.log('\nPerkiraan waktu satu jawaban (sekitar 250 kata)');
  info(`${Math.round(estimate)} dtk (${(estimate / 60).toFixed(1)} menit)`);

  if (sec(stats.load_duration) > 10) {
    advice.push('Model butuh waktu lama dimuat. Normal untuk pertanyaan pertama; kalau terjadi terus, memori kurang.');
  }
  if (estimate > 180) {
    if (genRate < 5) {
      advice.push(
        onSmallModel
          ? `Penulisan jawaban lambat (${genRate.toFixed(1)} token/dtk) padahal modelnya sudah kecil. Colok charger, pilih Power mode "Best performance", dan update Ollama ke versi terbaru.`
          : `Penulisan jawaban lambat (${genRate.toFixed(1)} token/dtk). Coba model lebih kecil: ollama pull qwen2.5:3b lalu AI_MODEL_NAME=qwen2.5:3b`,
      );
    }
    if (promptRate < 30) advice.push(`Pembacaan dokumen lambat (${promptRate.toFixed(0)} token/dtk). Kurangi potongan: RAG_TOP_K=3 dan RAG_MAX_CONTEXT_CHARS=4500 di .env.local`);
    advice.push('Jawaban lebih pendek juga membantu: AI_MAX_ANSWER_TOKENS=500 di .env.local');
  }

  console.log('\n=== Saran ===');
  if (advice.length) advice.forEach((a) => console.log(`  - ${a}`));
  else console.log('  Semua baik. Kecepatan seharusnya cukup.');
  console.log('\nKirim seluruh hasil di atas bila masih ada masalah.\n');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
