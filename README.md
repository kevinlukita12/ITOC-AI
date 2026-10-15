# ITOC AI

Asisten AI untuk member ITOC (IT Officer Community). AI ini membaca dokumen peraturan
(POJK, SEOJK, Pedoman BOFIS, Pedoman DRC, Pedoman Remote Trading, dll.) yang ditaruh di
folder `DokumenPedoman/`, lalu menjawab pertanyaan berdasarkan isi dokumen tersebut lengkap dengan
sumbernya (nama dokumen, Pasal, dan halaman). Sumber bisa diklik untuk membuka PDF aslinya
tepat di halaman yang dikutip.

## Cara kerja singkat

1. `npm run ingest` membaca semua PDF di `DokumenPedoman/`, memotongnya per Pasal/bagian, lalu
   membuat "embedding" (representasi makna) dengan model `bge-m3` di Ollama. Hasilnya disimpan di
   `data/rag-index.json`.
2. Saat member bertanya, server mencari potongan yang paling relevan dengan dua cara sekaligus:
   berdasarkan makna (embedding) dan kata kunci persis (mis. "Pasal 12", "RTO", "POJK 11/2022").
3. Potongan terbaik (default 6) diberikan ke model chat (`qwen2.5:14b`) beserta instruksi untuk
   menjawab hanya dari dokumen dan mencantumkan nomor sumber, mis. [1], [2].

## Persiapan (sekali saja)

### 1. Unduh model embedding

```powershell
ollama pull bge-m3
```

### 2. Perbesar context window Ollama (penting)

Bawaan Ollama hanya 2.048–4.096 token. Potongan dokumen + riwayat chat melebihi itu, dan Ollama
akan **memotong prompt diam-diam** sehingga AI seolah-olah tidak membaca dokumen. Set ke 16.384:

Windows (PowerShell), lalu tutup Ollama dari system tray dan buka lagi:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", "16384", "User")
```

macOS/Linux: jalankan `OLLAMA_CONTEXT_LENGTH=16384 ollama serve`.

Bila RAM/VRAM terbatas, 8192 juga cukup; turunkan `RAG_TOP_K` menjadi 4.

### 3. Install dependency baru

```powershell
npm install
```

## Menambah dokumen

1. Taruh file PDF di folder `DokumenPedoman/`. Boleh pakai subfolder, mis.
   `DokumenPedoman/POJK/`, `DokumenPedoman/Pedoman BEI/`.
2. Beri nama file yang jelas, karena nama file dipakai sebagai judul sumber. Contoh:
   - `Pedoman BOFIS 2024.pdf`
   - `Pedoman DRC Anggota Bursa.pdf`
   - `POJK 11-POJK.03-2022 Penyelenggaraan TI oleh Bank Umum.pdf`
     (pakai tanda `-` sebagai pengganti `/`, karena `/` tidak boleh ada di nama file)
3. Jalankan:

```powershell
npm run ingest
```

Hanya file baru atau yang berubah yang diproses, jadi menjalankannya lagi cepat. File yang
dihapus dari `DokumenPedoman/` otomatis dikeluarkan dari index. Server **tidak perlu di-restart**;
index baru langsung dipakai pada pertanyaan berikutnya.

Untuk memproses ulang semuanya (mis. setelah mengganti model embedding atau ukuran potongan):

```powershell
npm run ingest -- --rebuild
```

### PDF hasil scan

PDF hasil scan (gambar, bukan teks) tidak bisa dibaca dan akan muncul peringatan saat ingest.
Jalankan OCR dulu, mis. dengan Adobe Acrobat ("Scan & OCR" / "Recognize Text") atau
[OCRmyPDF](https://ocrmypdf.readthedocs.io), lalu taruh hasilnya di `DokumenPedoman/`.
Cara cepat mengecek: buka PDF dan coba blok/salin teksnya. Kalau tidak bisa, berarti hasil scan.

File `.txt` dan `.md` juga didukung.

## Menjalankan

```powershell
npm run dev
```

Buka http://localhost:3000. Di halaman awal ada daftar dokumen yang sudah dimuat, sehingga member
tahu peraturan apa saja yang dicakup.

## Pengaturan (opsional)

Salin `.env.example` menjadi `.env.local` lalu ubah sesuai kebutuhan:

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `AI_BASE_URL` | `http://localhost:11434/v1` | Alamat Ollama |
| `AI_MODEL_NAME` | `qwen2.5:14b` | Model chat |
| `AI_EMBED_MODEL` | `bge-m3` | Model embedding (ganti = wajib `--rebuild`) |
| `RAG_TOP_K` | `6` | Jumlah potongan dokumen per pertanyaan |
| `RAG_MAX_CONTEXT_CHARS` | `12000` | Batas total teks dokumen per pertanyaan |
| `RAG_CHUNK_SIZE` | `1600` | Ukuran potongan (karakter) saat ingest |
| `RAG_DOCUMENTS_DIR` | `DokumenPedoman` | Folder dokumen |

## Struktur file terkait RAG

```
DokumenPedoman/                 PDF peraturan (taruh di sini)
data/rag-index.json             Hasil ingest (dibuat otomatis, tidak di-commit)
scripts/ingest.ts               Pembaca PDF + pembuat index
lib/rag/chunk.ts                Pemotongan teks per BAB/Pasal
lib/rag/embed.ts                Pemanggil embedding Ollama
lib/rag/search.ts               Pencarian hybrid (makna + kata kunci)
lib/rag/store.ts                Simpan/muat index (otomatis reload)
app/api/chat/route.ts           Endpoint chat dengan konteks dokumen
app/api/documents/route.ts      Daftar dokumen
app/api/documents/file/route.ts Membuka PDF sumber
```

## Tips kualitas jawaban

- Bila jawaban kurang tepat, cek dulu sumber yang ditampilkan di bawah jawaban. Kalau sumbernya
  salah, masalahnya di pencarian (coba sebut nama dokumen atau nomor Pasal di pertanyaan). Kalau
  sumbernya benar tapi jawabannya keliru, masalahnya di model chat (pertimbangkan model yang lebih
  besar, mis. `qwen2.5:32b`, bila hardware memungkinkan).
- Jangan simpan beberapa versi dari peraturan yang sama sekaligus; hapus versi lama yang sudah
  dicabut supaya AI tidak mengutip ketentuan yang sudah tidak berlaku.
