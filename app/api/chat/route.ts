import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { RAG_CONFIG } from '@/lib/rag/config';
import { embedQuery } from '@/lib/rag/embed';
import { hybridSearch, type SearchHit } from '@/lib/rag/search';
import { loadIndex } from '@/lib/rag/store';
import type { SourceRef } from '@/lib/rag/types';

const ollama = createOpenAI({
    baseURL: RAG_CONFIG.baseURL,
    apiKey: 'ollama',
});

// Must match the tag shown by `ollama list` exactly (Ollama tags are case-sensitive).
const MODEL_NAME = process.env.AI_MODEL_NAME || 'qwen2.5:14b';

// Hanya N pesan terakhir yang dikirim ke model, supaya konteks dokumen tetap muat.
const MAX_HISTORY_MESSAGES = 10;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type IncomingMessage = {
    role: ChatMessage['role'];
    content?: unknown;
    parts?: Array<{ type: string; text?: string }>;
};

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
function buildRetrievalQuery(messages: ChatMessage[]): string {
    const userMsgs = messages.filter((m) => m.role === 'user').map((m) => m.content.trim());
    const last = userMsgs[userMsgs.length - 1] ?? '';
    const prev = userMsgs[userMsgs.length - 2];
    const wordCount = last.split(/\s+/).filter(Boolean).length;
    return prev && wordCount < 8 ? `${prev}\n${last}` : last;
}

function formatPages(h: SearchHit): string {
    const { pageStart, pageEnd } = h.chunk;
    return pageStart === pageEnd ? `hal. ${pageStart}` : `hal. ${pageStart}-${pageEnd}`;
}

const BASE_PROMPT = `You are ITOC AI, an assistant for members of ITOC (IT Officer Community), IT officers at
securities companies, banks, and other capital market institutions in Indonesia.
You answer questions about regulations such as POJK, SEOJK, Pedoman BOFIS, Pedoman DRC,
Pedoman Remote Trading, Pedoman Fasilitas Pesanan Langsung (DMA), and IDX/KSEI/KPEI rules.

Language: always reply in the same language the user writes in (Bahasa Indonesia or English).
Never reply in Chinese unless the user writes in Chinese.`;

function buildSystemPrompt(hits: SearchHit[], indexReady: boolean, docCount: number): string {
    if (!indexReady) {
        return `${BASE_PROMPT}

No regulation documents have been loaded yet. Answer from general knowledge, but start by saying
clearly that the document library is empty, so the answer is not based on the official text and
must be verified against the official OJK or IDX source.`;
    }

    const context = hits
        .map((h, i) => {
            const head = [h.chunk.title, h.chunk.heading, formatPages(h)].filter(Boolean).join(' | ');
            return `[${i + 1}] ${head}\n${h.chunk.text}`;
        })
        .join('\n\n---\n\n');

    return `${BASE_PROMPT}

You have access to a library of ${docCount} official regulation documents. For this question, the
most relevant excerpts were retrieved and are shown below between <excerpts> tags, each numbered.

Rules for answering:
1. Base your answer on the excerpts. Quote or paraphrase the specific requirements they state.
2. Cite every claim taken from an excerpt with its number in square brackets, e.g. [1] or [2][3].
   Mention the document name and, when shown, the Pasal/section, so the reader can find it.
3. If the excerpts do not contain the answer, say plainly that you could not find it in the loaded
   documents. You may then add general knowledge, but label it clearly as not coming from the
   documents and advise checking the official source.
4. Never invent article numbers, regulation numbers, deadlines, or figures that are not in the excerpts.
5. If excerpts from different documents conflict or apply to different entities, point that out.
6. Be concise and well structured. Use lists or tables when comparing requirements.

<excerpts>
${context || '(no relevant excerpts found)'}
</excerpts>`;
}

export async function POST(req: Request) {
    const { messages } = await req.json();

    const formattedMessages: ChatMessage[] = (messages as IncomingMessage[])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: toText(m) }))
        .filter((m) => m.content.trim() !== '')
        .slice(-MAX_HISTORY_MESSAGES);

    // 1) Cari potongan dokumen yang relevan.
    const index = await loadIndex();
    let hits: SearchHit[] = [];

    if (index && index.chunks.length) {
        const query = buildRetrievalQuery(formattedMessages);
        let queryVector: Float32Array;
        try {
            queryVector = await embedQuery(query);
        } catch (err) {
            // Tanpa embedding, pencarian kata kunci (BM25) tetap jalan.
            console.error('[ITOC RAG] Embedding pertanyaan gagal, pakai pencarian kata kunci saja:', err);
            queryVector = new Float32Array(index.chunks[0].vector.length);
        }
        hits = hybridSearch(index, query, queryVector, {
            topK: RAG_CONFIG.topK,
            maxChars: RAG_CONFIG.maxContextChars,
        });
    }

    const sources: SourceRef[] = hits.map((h, i) => ({
        n: i + 1,
        title: h.chunk.title,
        file: h.chunk.file,
        heading: h.chunk.heading,
        pageStart: h.chunk.pageStart,
        pageEnd: h.chunk.pageEnd,
    }));

    // 2) Jawab dengan potongan tadi sebagai konteks.
    const result = await streamText({
        // .chat() targets Ollama's /v1/chat/completions endpoint, its most stable OpenAI-compatible route.
        model: ollama.chat(MODEL_NAME),
        temperature: 0.2, // rendah = jawaban lebih konsisten dan setia pada teks peraturan
        system: buildSystemPrompt(hits, Boolean(index?.chunks.length), index?.documents.length ?? 0),
        messages: formattedMessages,
    });

    // Daftar sumber dikirim sebagai metadata pesan, ditampilkan di bawah jawaban.
    return result.toUIMessageStreamResponse({
        messageMetadata: ({ part }) => (part.type === 'start' ? { sources } : undefined),
    });
}
