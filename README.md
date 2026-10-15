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
3. Potongan terbaik (default 4) diberikan ke model chat (`qwen2.5:14b`) beserta instruksi untuk
   menjawab hanya dari dokumen dan mencantumkan nomor sumber, mis. [1], [2].

## Yang perlu di-install

| Software | Wajib? | Untuk apa |
| --- | --- | --- |
| **Node.js** (versi LTS) | Wajib | Menjalankan aplikasi. `npm` otomatis ikut terpasang bersama Node.js. |
| **Ollama** | Wajib | Menjalankan model AI di komputer sendiri, tanpa internet dan tanpa biaya API. |
| Model **qwen2.5:14b** dan **bge-m3** | Wajib | Model chat dan model pembaca dokumen. Diunduh lewat Ollama. |
| Next.js, AI SDK, tsx, unpdf | Tidak perlu di-install manual | Semuanya otomatis terpasang saat menjalankan `npm install` (langkah 4). |
| VS Code | Opsional | Hanya kalau ingin mengedit kode. Tidak dibutuhkan untuk menjalankan aplikasi. |
| Git | Opsional | Hanya kalau proyek disimpan di GitHub/GitLab. |

### Kebutuhan komputer

- Windows 10 atau 11, 64-bit.
- RAM minimal 16 GB.
- Ruang disk kosong sekitar 10 GB (model AI sekitar 6 GB, `node_modules` sekitar 700 MB).
- GPU NVIDIA tidak wajib, tapi membuat jawaban jauh lebih cepat.

## Instalasi STEP by STEP

Semua perintah di bawah dijalankan di **PowerShell** (klik Start, ketik `PowerShell`, lalu Enter).

### 1. Install Node.js

1. Buka https://nodejs.org lalu unduh versi **LTS** untuk Windows (file `.msi`).
2. Jalankan installer dan ikuti pilihan bawaan sampai selesai.
3. Tutup PowerShell, buka lagi, lalu cek:

```powershell
node -v
npm -v
```

Kalau keduanya menampilkan nomor versi, Node.js sudah terpasang. `node -v` minimal harus `v20.9`.

### 2. Install Ollama

1. Buka https://ollama.com/download lalu unduh versi Windows.
2. Jalankan `OllamaSetup.exe`. Setelah selesai, ikon Ollama muncul di system tray (pojok kanan
   bawah) dan Ollama berjalan otomatis setiap kali Windows menyala.
3. Tutup PowerShell, buka lagi, lalu cek:

```powershell
ollama --version
```

### 3. Unduh model AI

Butuh koneksi internet. Total unduhan sekitar 6 GB, jadi bisa makan waktu.

```powershell
ollama pull qwen2.5:14b
ollama pull bge-m3
```

Cek hasilnya dengan `ollama list`. Kedua model harus muncul di daftar.

Model `qwen2.5:14b` adalah pilihan seimbang antara kecepatan dan kualitas. Kalau komputer kuat
(GPU NVIDIA dengan VRAM 12 GB ke atas), `qwen2.5:14b` memberi jawaban lebih baik. Kalau komputer
lemah, `qwen2.5:3b` lebih cepat.

### 4. Siapkan proyek

1. Ekstrak folder `ITOC-AI` ke lokasi yang mudah, misalnya `C:\ITOC-AI`. Hindari folder yang
   disinkronkan OneDrive (seperti `Documents` atau `Desktop`), karena ribuan file di
   `node_modules` membuat sinkronisasi lambat dan bisa bentrok.
2. Masuk ke folder proyek dan install semua dependency (termasuk Next.js). Butuh internet dan
   beberapa menit:

```powershell
cd C:\ITOC-AI
npm install
```

3. Buat file pengaturan dari contohnya:

```powershell
copy .env.example .env.local
```

4. Buka `.env.local` dengan Notepad dan pastikan `AI_MODEL_NAME` sama dengan model yang
   diunduh di langkah 3, misalnya `AI_MODEL_NAME=qwen2.5:14b`.

Context window Ollama tidak perlu diatur, karena aplikasi sudah mengirim `num_ctx` (default 8192)
di setiap permintaan. Kalau sebelumnya Anda men-set `OLLAMA_CONTEXT_LENGTH=16384`, sebaiknya
dihapus karena memakai memori lebih banyak.

### 5. Masukkan dokumen dan buat index

Taruh PDF peraturan di folder `DokumenPedoman/`, lalu jalankan:

```powershell
npm run ingest
```

Detail tentang penamaan file dan PDF hasil scan ada di bagian "Menambah dokumen" di bawah.

### 6. Jalankan

```powershell
npm run dev
```

Buka http://localhost:3000 di browser. Biarkan jendela PowerShell tetap terbuka selama aplikasi
dipakai. Untuk mematikan, tekan `Ctrl + C` di jendela tersebut.

### Masalah umum saat instalasi

| Pesan error | Penyebab | Solusi |
| --- | --- | --- |
| `running scripts is disabled on this system` | PowerShell memblokir script `npm` | Jalankan `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, ketik `Y`, lalu coba lagi. Atau pakai Command Prompt (`cmd`) sebagai ganti PowerShell. |
| `'node'` / `'npm'` / `'ollama'` `is not recognized` | Terminal dibuka sebelum instalasi selesai | Tutup lalu buka lagi PowerShell. Kalau masih, install ulang Node.js atau Ollama. |
| `'tsx' is not recognized` | `npm install` belum dijalankan di folder proyek | Masuk ke folder proyek, jalankan `npm install`. |
| `model "..." not found` | Model belum diunduh, atau nama di `.env.local` salah ketik | Jalankan `ollama list` dan samakan nama di `.env.local` persis dengan yang muncul. |
| `Port 3000 is in use` | Aplikasi lain memakai port 3000 | Jalankan `npm run dev -- -p 3001`, lalu buka http://localhost:3001 |

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

## Kecepatan menjawab

Setiap kali selesai menjawab, terminal `npm run dev` menampilkan baris seperti ini:

```
[ITOC AI] cari dokumen 0.1 dtk | baca 2100 token 35.2 dtk | tulis 420 token 98.4 dtk (4.3 token/dtk) | total 134.0 dtk
```

Di halaman chat, waktu total juga muncul di bawah setiap jawaban ("Answered in ...").
Baca bagian yang paling besar untuk tahu apa yang perlu diperbaiki:

| Yang besar | Artinya | Yang bisa dilakukan |
| --- | --- | --- |
| `muat model ... dtk` muncul di setiap pertanyaan | Memori tidak cukup untuk menyimpan model chat dan embedding sekaligus, jadi Ollama bongkar-muat model | Tutup aplikasi berat lain, atau pakai model chat yang lebih kecil |
| `baca ... dtk` | Model membaca potongan dokumen (prompt) | Turunkan `RAG_TOP_K` ke 3; aktifkan `OLLAMA_FLASH_ATTENTION=1` bila pakai GPU NVIDIA |
| `tulis ... token/dtk` di bawah 5 | Model menulis jawaban lambat, biasanya karena jalan di CPU | Pakai model yang lebih kecil (lihat di bawah) atau komputer dengan GPU |

**Ganti model chat** adalah cara paling ampuh. Model 3B kira-kira dua kali lebih cepat dari 7B.
Karena jawabannya diambil dari potongan dokumen, model yang lebih kecil umumnya tetap cukup baik:

```powershell
ollama pull qwen2.5:3b
```

Lalu di `.env.local` tulis `AI_MODEL_NAME=qwen2.5:3b` dan restart `npm run dev`.

Pengaturan Ollama yang membantu bila memakai GPU NVIDIA (PowerShell, lalu restart Ollama dari tray):

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_FLASH_ATTENTION", "1", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE", "q8_0", "User")
```

Yang sudah otomatis dilakukan aplikasi:

- Model dimuat ke memori saat server mulai, dan tetap di memori selama 60 menit setelah dipakai.
- Hanya 4 potongan dokumen paling relevan yang dikirim, dan riwayat chat dipersingkat.
- Jawaban diminta ringkas (sekitar 250 kata) kecuali pengguna meminta detail.
- Tombol Stop benar-benar menghentikan Ollama, jadi pertanyaan berikutnya tidak perlu antre.
- Mode "berpikir" dimatikan untuk model yang memilikinya (mis. qwen3), karena sangat memperlambat.

## Pengaturan (opsional)

Salin `.env.example` menjadi `.env.local` lalu ubah sesuai kebutuhan:

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `AI_BASE_URL` | `http://localhost:11434` | Alamat Ollama |
| `AI_MODEL_NAME` | `qwen2.5:14b` | Model chat |
| `AI_EMBED_MODEL` | `bge-m3` | Model embedding (ganti = wajib `--rebuild`) |
| `AI_NUM_CTX` | `8192` | Context window per permintaan (token) |
| `AI_MAX_ANSWER_TOKENS` | `900` | Batas panjang jawaban (token) |
| `AI_KEEP_ALIVE` | `60m` | Lama model disimpan di memori; `-1` = selamanya |
| `RAG_TOP_K` | `4` | Jumlah potongan dokumen per pertanyaan |
| `RAG_MAX_CONTEXT_CHARS` | `6500` | Batas total teks dokumen per pertanyaan |
| `AI_HISTORY_MESSAGES` | `6` | Jumlah pesan riwayat chat yang ikut dikirim |
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
lib/llm/ollama.ts               Pemanggil Ollama (streaming, keep_alive, num_ctx)
instrumentation.ts              Memuat model saat server mulai
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
