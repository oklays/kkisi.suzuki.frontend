// Owner-UAT intake (pure functions). The OWNER's result for a row is whatever the owner typed in the checklist's "Lulus/Gagal" cell, normalised strictly:
//   PASS | FAIL | BLOCKED | NOT TESTED (empty). Anything else is reported as INVALID and counted as NOT TESTED — never guessed into a pass or a fail.
// The MACHINE column comes from the walkthrough results and is never mixed into the owner column or the acceptance summary.
export function ownerStatus(cell) {
  const t = String(cell ?? '').trim();
  if (t === '') return { status: 'NOT TESTED', invalid: null };
  if (/^(pass|lulus|ok|berhasil)$/i.test(t)) return { status: 'PASS', invalid: null };
  if (/^(fail|gagal)$/i.test(t)) return { status: 'FAIL', invalid: null };
  if (/^(blocked|terblokir)$/i.test(t)) return { status: 'BLOCKED', invalid: null };
  if (/^(not tested|belum diuji|nt)$/i.test(t)) return { status: 'NOT TESTED', invalid: null };
  return { status: 'NOT TESTED', invalid: t.slice(0, 40) };
}

export function parseChecklist(text) {
  const rows = []; let section = '';
  for (const line of text.split('\n')) {
    const h = /^## ([A-G])\. (.+)$/.exec(line); if (h) { section = `${h[1]}. ${h[2]}`; continue; }
    if (!/^\| [A-DG]\d+ \|/.test(line)) continue;
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    rows.push({ id: c[0], section, page: c[1], role: c[2], action: c[3], expected: c[4], kind: c[5], ownerCell: c[6] ?? '', ownerNote: c[7] ?? '' });
  }
  return rows;
}

export function summarise(rows, results) {
  const owner = { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT TESTED': 0 }; const machine = { PASS: 0, FAIL: 0, 'NOT AUTOMATED': 0 }; const invalid = []; const toTriage = [];
  for (const r of rows) {
    const o = ownerStatus(r.ownerCell); owner[o.status]++; if (o.invalid) invalid.push(`${r.id}: "${o.invalid}"`);
    if (o.status === 'FAIL' || o.status === 'BLOCKED') toTriage.push({ id: r.id, status: o.status, note: r.ownerNote });
    machine[results[r.id]?.status ?? 'NOT AUTOMATED']++;
  }
  const decided = owner.PASS + owner.FAIL + owner.BLOCKED;
  return { owner, machine, invalid, toTriage, total: rows.length, ownerComplete: decided === rows.length && invalid.length === 0, ownerAccepted: false };
}

const esc = (t) => String(t).replace(/\|/g, '\\|');
export function render(rows, results, today) {
  const sum = summarise(rows, results);
  const out = ['# Temuan UAT & register defect — DEV LOCAL', '',
    'Kolom **Mesin** = hasil walkthrough otomatis (`tests/owner-uat-walkthrough-browser.mjs`) pada data sintetis DEV LOCAL; ini **bukan** penerimaan owner. Kolom **Owner** diambil apa adanya dari sel *Lulus/Gagal* di `owner-uat-checklist.md` yang diisi owner (PASS / FAIL / BLOCKED); sel kosong = NOT TESTED; isian yang tidak dikenali dilaporkan sebagai INVALID dan dihitung NOT TESTED.', '',
    `Dihasilkan: ${today} dari checklist + results.json. Jenis: F fungsional · B baca saja · S pratinjau sintetis · N nonaktif sengaja · E terblokir eksternal.`, '',
    '## Ringkasan', '', '| | PASS | FAIL | BLOCKED | NOT TESTED / belum otomatis |', '|---|---|---|---|---|',
    `| **Owner** (${sum.total} baris) | ${sum.owner.PASS} | ${sum.owner.FAIL} | ${sum.owner.BLOCKED} | ${sum.owner['NOT TESTED']} |`,
    `| Mesin | ${sum.machine.PASS} | ${sum.machine.FAIL} | — | ${sum.machine['NOT AUTOMATED']} |`, '',
    `**Penerimaan owner: ${sum.ownerComplete ? 'semua baris sudah diisi owner; keputusan menerima/menolak tetap keputusan tertulis owner' : 'BELUM ADA'}** — status ini tidak pernah diturunkan dari hasil mesin.`];
  if (sum.invalid.length) out.push('', '**Isian owner yang tidak dikenali (perlu diperbaiki):** ' + sum.invalid.join('; '));
  if (sum.toTriage.length) { out.push('', '## Perlu triase (FAIL / BLOCKED dari owner)', '', '| ID | Status owner | Catatan owner | Klasifikasi (diisi saat triase) |', '|---|---|---|---|'); for (const t of sum.toTriage) out.push(`| ${t.id} | ${t.status} | ${esc(t.note)} | |`); out.push('', 'Klasifikasi: defect fungsional · UX/UI · izin · fitur disetujui yang belum ada · keterbatasan data sintetis · pertanyaan aturan bisnis.'); }
  let current = '';
  for (const r of rows) {
    if (r.section !== current) { current = r.section; out.push('', `## ${current}`, '', '| ID | Peran | Langkah (ringkas) | Hasil yang diharapkan | Jenis | Mesin | Catatan mesin | Owner | Catatan owner |', '|---|---|---|---|---|---|---|---|---|'); }
    const res = results[r.id]; const o = ownerStatus(r.ownerCell);
    out.push(`| ${r.id} | ${esc(r.role)} | ${esc(r.action)} | ${esc(r.expected)} | ${esc(r.kind)} | ${res ? res.status : 'NOT AUTOMATED'} | ${esc(res?.note ?? '')} | ${o.status}${o.invalid ? ` (INVALID: ${esc(o.invalid)})` : ''} | ${esc(r.ownerNote)} |`);
  }
  out.push('');
  return { markdown: out.join('\n'), summary: sum };
}
