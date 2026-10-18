// Renders docs/.../uat-findings-register.md from owner-uat-checklist.md (rows) and the walkthrough's results.json (MACHINE results).
//   node scripts/lib/render-uat-findings.mjs <results.json> <out.md>
// The owner column is always "NOT TESTED" here: it is filled in by the owner, never by this tool.
import { readFileSync, writeFileSync } from 'node:fs';
const [resultsFile, outFile] = process.argv.slice(2);
const dir = new URL('../../../../docs/superpowers/specs/unified-console-kosipa-warehouse/', import.meta.url);
const checklist = readFileSync(new URL('owner-uat-checklist.md', dir), 'utf8');
const results = JSON.parse(readFileSync(resultsFile, 'utf8'));
const rows = []; let section = '';
for (const line of checklist.split('\n')) {
  const h = /^## ([A-F])\. (.+)$/.exec(line); if (h) { section = `${h[1]}. ${h[2]}`; continue; }
  const m = /^\| ([A-D]\d+) \| (.*) \|\s*$/.exec(line); if (!m) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim()); rows.push({ id: cells[0], section, page: cells[1], role: cells[2], action: cells[3], expected: cells[4], kind: cells[5] });
}
const esc = (t) => String(t).replace(/\|/g, '\\|');
const out = ['# Temuan UAT & register defect — DEV LOCAL (checkpoint 15)', '',
  'Kolom **Mesin** = hasil walkthrough otomatis (`tests/owner-uat-walkthrough-browser.mjs`) pada data sintetis DEV LOCAL; ini **bukan** penerimaan owner. Kolom **Owner** diisi oleh owner (PASS / FAIL / BLOCKED / NOT TESTED); sampai ada hasil nyata dari owner, semuanya **NOT TESTED**.', '',
  `Dihasilkan: ${new Date().toISOString().slice(0, 10)} dari checklist + results.json. Status jenis: F fungsional · B baca saja · S pratinjau sintetis · N nonaktif sengaja · E terblokir eksternal.`, ''];
let current = '';
const counts = { PASS: 0, FAIL: 0, 'NOT AUTOMATED': 0 };
for (const r of rows) {
  if (r.section !== current) { current = r.section; out.push('', `## ${current}`, '', '| ID | Peran | Langkah (ringkas) | Hasil yang diharapkan | Jenis | Mesin | Catatan mesin | Owner |', '|---|---|---|---|---|---|---|---|'); }
  const res = results[r.id]; const machine = res ? res.status : /E/.test(r.kind) && !res ? 'NOT AUTOMATED (E)' : 'NOT AUTOMATED';
  counts[res ? res.status : 'NOT AUTOMATED']++;
  out.push(`| ${r.id} | ${esc(r.role)} | ${esc(r.action)} | ${esc(r.expected)} | ${esc(r.kind)} | ${machine} | ${esc(res?.note ?? '')} | NOT TESTED |`);
}
out.push('', '## Ringkasan mesin', '', `PASS ${counts.PASS} · FAIL ${counts.FAIL} · belum otomatis ${counts['NOT AUTOMATED']} (baris E: terblokir eksternal, tidak ada yang dapat diuji).`, '', 'Catatan: B10 dan B11 diuji sampai tombol/aksi UI; penyimpanan produk dan siklus penuh dibuktikan lewat `dev-local-writes-smoke.mjs` (API sesi + CSRF).', '');
writeFileSync(outFile, out.join('\n'));
console.log(`rows ${rows.length}; machine PASS ${counts.PASS}, FAIL ${counts.FAIL}, not automated ${counts['NOT AUTOMATED']}`);
