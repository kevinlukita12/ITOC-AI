import { connection } from 'next/server';
import { loadIndex } from '@/lib/rag/store';

/** Daftar dokumen yang sudah di-index, ditampilkan di halaman awal. */
export async function GET() {
    await connection(); // selalu dijalankan saat request, jangan di-prerender saat build
    const index = await loadIndex();
    return Response.json({
        updatedAt: index?.updatedAt ?? null,
        documents: (index?.documents ?? []).map((d) => ({
            title: d.title,
            file: d.file,
            pages: d.pages,
        })),
    });
}
