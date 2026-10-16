import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { isChatModelLoaded, streamChat, type ChatTurn, type OllamaStats } from '@/lib/llm/ollama';
import { RAG_CONFIG } from '@/lib/rag/config';
import { embedQuery } from '@/lib/rag/embed';
import { hybridSearch, type SearchHit } from '@/lib/rag/search';
import { loadIndex } from '@/lib/rag/store';
import type { AnswerTiming, ProgressUpdate, SourceRef } from '@/lib/rag/types';

type IncomingMessage = {
    role: string;
    content?: unknown;
    parts?: Array<{ type: string; text?: string }>;
};

type Turn = { role: 'user' | 'assistant'; content: string };

function toText(m: IncomingMessage): string {
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.parts)) {
        return m.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text ?? '')
            .join('');
    }
    return '';
}

/** Pertanyaan lanjutan pendek ("kalau pasal berikutnya?") digabung dengan pertanyaan sebelumnya. */
function buildRetrievalQuery(turns: Turn[]): string {
    const userMsgs = turns.filter((m) => m.role === 'user').map((m) => m.content.trim());
    const last = userMsgs[userMsgs.length - 1] ?? '';
    const prev = userMsgs[userMsgs.length - 2];
    const wordCount = last.split(/\s+/).filter(Boolean).length;
    return prev && wordCount < 8 ? `${prev}\n${last}` : last;
}

function formatPages(h: SearchHit): string {
    const { pageStart, pageEnd } = h.chunk;
    return pageStart === pageEnd ? `hal. ${pageStart}` : `hal. ${pageStart}-${pageEnd}`;
}

/**
 * System prompt dibuat tetap (tidak berubah antar pertanyaan) supaya Ollama bisa
 * memakai ulang hasil olahannya dari cache. Potongan dokumen ditaruh di pesan terakhir.
 */
const SYSTEM_PROMPT = `You are ITOC AI, an assistant for members of ITOC (IT Officer Community), IT officers at
securities companies, banks, and other capital market institutions in Indonesia.
You answer questions about regulations such as POJK, SEOJK, Pedoman BOFIS, Pedoman BCP/DRC,
Pedoman Remote Trading, Pedoman Fasilitas Pesanan Langsung (DMA), and IDX/KSEI/KPEI rules.

Language: always reply in the same language the user writes in (Bahasa Indonesia or English).
Never reply in Chinese unless the user writes in Chinese.

Each question comes with numbered excerpts from the official documents, inside <excerpts> tags.
Rules:
1. Base your answer on the excerpts. Cite claims with the excerpt number in square brackets, e.g. [1] or [2][3],
   and mention the document name and Pasal/section when shown.
2. If the excerpts do not contain the answer, say so plainly. You may add general knowledge only if you
   label it clearly as not coming from the documents.
3. Never invent article numbers, regulation numbers, deadlines, or figures.
4. Be concise: start with the direct answer, then the key points. Keep it under about 250 words
   unless the user asks for detail or a complete list.`;

const NO_DOCS_NOTE =
    'No regulation documents have been loaded yet. Say so at the start, answer briefly from general knowledge, and advise checking the official OJK or IDX source.';

function buildQuestionWithExcerpts(question: string, hits: SearchHit[], indexReady: boolean): string {
    if (!indexReady) return `${NO_DOCS_NOTE}\n\nQuestion: ${question}`;

    const excerpts = hits.length
        ? hits
              .map((h, i) => {
                  const head = [h.chunk.title, h.chunk.heading, formatPages(h)].filter(Boolean).join(' | ');
                  return `[${i + 1}] ${head}\n${h.chunk.text}`;
              })
              .join('\n\n---\n\n')
        : '(no relevant excerpts found)';

    return `<excerpts>\n${excerpts}\n</excerpts>\n\nQuestion: ${question}`;
}

const ns = (n?: number) => (n ?? 0) / 1e9; // nanodetik -> detik

function describe(t: AnswerTiming, s: OllamaStats): string {
    const parts = [
        `cari dokumen ${(t.retrievalMs / 1000).toFixed(1)} dtk`,
        s.load_duration && ns(s.load_duration) > 0.5 ? `muat model ${ns(s.load_duration).toFixed(1)} dtk` : '',
        `baca ${t.promptTokens} token ${ns(s.prompt_eval_duration).toFixed(1)} dtk`,
        `tulis ${t.answerTokens} token ${ns(s.eval_duration).toFixed(1)} dtk (${t.tokensPerSec.toFixed(1)} token/dtk)`,
        `total ${(t.totalMs / 1000).toFixed(1)} dtk`,
    ];
    return parts.filter(Boolean).join(' | ');
}

export async function POST(req: Request) {
    const started = Date.now();
    const { messages } = (await req.json()) as { messages: IncomingMessage[] };

    const turns: Turn[] = messages
        .filter((m): m is IncomingMessage & { role: Turn['role'] } => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: toText(m) }))
        .filter((m) => m.content.trim() !== '');

    const question = turns[turns.length - 1]?.content ?? '';

    const stream = createUIMessageStream({
        onError: (err) =>
            err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi AI.',
        execute: async ({ writer }) => {
            // Tahapan dikirim ke browser sebagai "transient" data: hanya untuk tampilan progres,
            // tidak disimpan di riwayat chat.
            const progress = (data: ProgressUpdate) =>
                writer.write({ type: 'data-progress', data, transient: true });

            // 1) Cari potongan dokumen yang relevan.
            progress({ stage: 'searching' });
            const index = await loadIndex();
            let hits: SearchHit[] = [];

            if (index && index.chunks.length) {
                const query = buildRetrievalQuery(turns);
                let queryVector: Float32Array;
                try {
                    queryVector = await embedQuery(query);
                } catch (err) {
                    // Tanpa embedding, pencarian kata kunci (BM25) tetap jalan.
                    console.error('[ITOC AI] Embedding pertanyaan gagal, pakai pencarian kata kunci saja:', err);
                    queryVector = new Float32Array(index.chunks[0].vector.length);
                }
                hits = hybridSearch(index, query, queryVector, {
                    topK: RAG_CONFIG.topK,
                    maxChars: RAG_CONFIG.maxContextChars,
                });
            }
            const retrievalMs = Date.now() - started;

            const sources: SourceRef[] = hits.map((h, i) => ({
                n: i + 1,
                title: h.chunk.title,
                file: h.chunk.file,
                heading: h.chunk.heading,
                pageStart: h.chunk.pageStart,
                pageEnd: h.chunk.pageEnd,
            }));
            writer.write({ type: 'start', messageMetadata: { sources } });

            // 2) Susun pesan: riwayat singkat + pertanyaan terakhir beserta potongan dokumen.
            const history: ChatTurn[] = turns
                .slice(0, -1)
                .slice(-RAG_CONFIG.historyMessages)
                .map((m) =>
                    m.role === 'assistant' && m.content.length > RAG_CONFIG.historyAnswerChars
                        ? { ...m, content: `${m.content.slice(0, RAG_CONFIG.historyAnswerChars)}…` }
                        : m,
                );

            const llmMessages: ChatTurn[] = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history,
                { role: 'user', content: buildQuestionWithExcerpts(question, hits, Boolean(index?.chunks.length)) },
            ];

            // 3) Model membaca potongan dokumen. Bagian ini yang paling lama sebelum kata pertama muncul.
            progress({ stage: 'reading', excerpts: hits.length, loadingModel: !(await isChatModelLoaded()) });

            let firstTokenMs = 0;
            let stats: OllamaStats = {};

            // req.signal: tombol Stop di browser ikut menghentikan Ollama, jadi tidak membuang waktu.
            for await (const ev of streamChat(llmMessages, req.signal)) {
                if (ev.type === 'delta') {
                    if (!firstTokenMs) {
                        firstTokenMs = Date.now() - started;
                        progress({ stage: 'writing' });
                        writer.write({ type: 'text-start', id: 'answer' });
                    }
                    writer.write({ type: 'text-delta', id: 'answer', delta: ev.text });
                } else {
                    stats = ev.stats;
                }
            }

            if (firstTokenMs) writer.write({ type: 'text-end', id: 'answer' });

            const timing: AnswerTiming = {
                totalMs: Date.now() - started,
                firstTokenMs,
                retrievalMs,
                promptTokens: stats.prompt_eval_count ?? 0,
                answerTokens: stats.eval_count ?? 0,
                tokensPerSec: stats.eval_duration ? (stats.eval_count ?? 0) / ns(stats.eval_duration) : 0,
            };
            if (stats.eval_count) console.log(`[ITOC AI] ${describe(timing, stats)}`);

            writer.write({ type: 'finish', finishReason: 'stop', messageMetadata: { timing } });
        },
    });

    // keepAliveMs: kirim sinyal kecil berkala selama model masih "membaca", supaya koneksi
    // tidak diputus antivirus/proxy saat menunggu lama sebelum kata pertama muncul.
    return createUIMessageStreamResponse({ stream, keepAliveMs: 15_000 });
}
