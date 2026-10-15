import fs from 'node:fs/promises';
import path from 'node:path';
import { connection } from 'next/server';
import { RAG_CONFIG } from '@/lib/rag/config';
import { loadIndex } from '@/lib/rag/store';

const MIME: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
};

/**
 * Membuka file sumber agar member bisa mengecek teks aslinya.
 * Hanya file yang terdaftar di index yang boleh dibuka.
 */
export async function GET(req: Request) {
    await connection();
    const name = new URL(req.url).searchParams.get('name') ?? '';
    const index = await loadIndex();

    if (!index?.documents.some((d) => d.file === name)) {
        return new Response('Dokumen tidak ditemukan', { status: 404 });
    }

    const root = RAG_CONFIG.documentsDir;
    const full = path.resolve(root, name);
    if (!full.startsWith(root + path.sep)) {
        return new Response('Dokumen tidak ditemukan', { status: 404 });
    }

    try {
        const data = await fs.readFile(full);
        const ext = path.extname(full).toLowerCase();
        return new Response(new Uint8Array(data), {
            headers: {
                'Content-Type': MIME[ext] ?? 'application/octet-stream',
                'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(path.basename(full))}`,
                'Cache-Control': 'private, max-age=300',
            },
        });
    } catch {
        return new Response('Dokumen tidak ditemukan', { status: 404 });
    }
}
