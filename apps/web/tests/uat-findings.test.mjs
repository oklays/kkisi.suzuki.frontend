import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ownerStatus, parseChecklist, summarise, render } from '../scripts/lib/uat-findings.mjs';

const CHECKLIST = `## A. Login
| # | Halaman | Akun | Aksi | Hasil | Status | Lulus/Gagal | Catatan |
|---|---|---|---|---|---|---|---|
| A1 | /login | synth_admin | masuk | masuk ke /console | F | PASS | |
| A2 | /login | synth_admin | salah | pesan | F | Gagal | pesan tidak muncul |
| A3 | /login | synth_admin | Enter | masuk | F | | |
| A4 | /pos | synth_kasir1 | buka | kasir | F | blocked | menunggu data |
| A5 | /pos | synth_kasir1 | x | y | F | mungkin | tidak yakin |
## E. Tampilan
| # | Aksi | Hasil | Lulus/Gagal | Catatan |
|---|---|---|---|---|
| E1 | ubah lebar | tidak ada scroll | PASS | |
`;
const machine = { A1: { status: 'PASS' }, A2: { status: 'PASS' }, A3: { status: 'PASS' } };

test('owner status is read ONLY from the owner cell, strictly; unknown text is INVALID and never becomes a pass or fail', () => {
  assert.deepEqual([ownerStatus('PASS').status, ownerStatus('lulus').status, ownerStatus('Gagal').status, ownerStatus('FAIL').status, ownerStatus('Terblokir').status, ownerStatus('').status, ownerStatus('belum diuji').status], ['PASS', 'PASS', 'FAIL', 'FAIL', 'BLOCKED', 'NOT TESTED', 'NOT TESTED']);
  assert.deepEqual(ownerStatus('mungkin'), { status: 'NOT TESTED', invalid: 'mungkin' });
  assert.equal(ownerStatus(undefined).status, 'NOT TESTED');
});

test('machine PASS never leaks into the owner result or the acceptance statement', () => {
  const rows = parseChecklist(CHECKLIST); assert.equal(rows.length, 5, 'only A–D rows; the E table has another shape and is owner-only');
  const s = summarise(rows, machine);
  assert.deepEqual(s.owner, { PASS: 1, FAIL: 1, BLOCKED: 1, 'NOT TESTED': 2 }); assert.deepEqual(s.machine, { PASS: 3, FAIL: 0, 'NOT AUTOMATED': 2 });
  assert.equal(s.ownerComplete, false); assert.deepEqual(s.invalid, ['A5: "mungkin"']); assert.deepEqual(s.toTriage.map((t) => [t.id, t.status]), [['A2', 'FAIL'], ['A4', 'BLOCKED']]);
  const { markdown } = render(rows, machine, '2026-10-19'); assert.match(markdown, /Penerimaan owner: BELUM ADA/); assert.match(markdown, /\| A3 \|[^\n]*\| PASS \|[^\n]*\| NOT TESTED \|/); assert.match(markdown, /Perlu triase/); assert.match(markdown, /INVALID: mungkin/);
});

test('the committed findings register never drifts from the committed checklist: its owner row and its acceptance line are exactly what the checklist implies', () => {
  const dir = new URL('../../../docs/superpowers/specs/unified-console-kosipa-warehouse/', import.meta.url);
  const rows = parseChecklist(readFileSync(new URL('owner-uat-checklist.md', dir), 'utf8')); assert.ok(rows.length >= 46);
  const s = summarise(rows, {}); const reg = readFileSync(new URL('uat-findings-register.md', dir), 'utf8');
  const m = /\| \*\*Owner\*\* \((\d+) baris\) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|/.exec(reg); assert.ok(m, 'owner summary row present');
  assert.deepEqual(m.slice(1).map(Number), [s.total, s.owner.PASS, s.owner.FAIL, s.owner.BLOCKED, s.owner['NOT TESTED']], 'regenerate: node scripts/lib/render-uat-findings.mjs <results.json> <register.md>');
  assert.equal(/Penerimaan owner: BELUM ADA/.test(reg), !s.ownerComplete, 'the acceptance line follows the checklist, never the machine results');
  assert.equal(s.ownerAccepted, false, 'acceptance is the owner\'s written decision; no tool derives it');
});
