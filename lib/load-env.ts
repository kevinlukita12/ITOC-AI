import fs from 'node:fs';
import path from 'node:path';

/**
 * Next.js otomatis membaca .env.local, tapi script `npm run ingest` / `npm run diagnose`
 * tidak. File ini membacanya supaya semua memakai pengaturan yang sama.
 * Harus di-import paling atas, sebelum modul lain.
 */
for (const name of ['.env.local', '.env']) {
  const file = path.resolve(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
