/**
 * Dijalankan sekali saat server Next.js mulai.
 * Memuat model AI ke memori di latar belakang, supaya pertanyaan pertama tidak lambat.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const { warmUpModels } = await import('./lib/llm/ollama');
    // Tidak di-await: server tetap bisa langsung dibuka sementara model dimuat.
    void warmUpModels();
}
