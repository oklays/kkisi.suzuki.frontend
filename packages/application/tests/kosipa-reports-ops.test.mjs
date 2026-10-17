import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readMembershipReport, readSavingsMovementReport, bangkokDate, OPS_SOURCE_CAP } from '../src/kosipa/reports-ops.ts';
import { exportMembershipReportCsv, exportSavingsMovementCsv } from '../src/kosipa/report-export.ts';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e?.stack ?? e)); return e.code; } };
const actor = (...caps) => ({ userId: 7, capabilities: new Set(caps), requestId: 'r1' });
const NOW = () => new Date('2026-10-17T20:30:00Z');   // 2026-10-18 03:30 in Asia/Bangkok
function world(over = {}) {
  const calls = []; const fail = new Set();
  const d = { members: [{ status: 'AKTIVE', employment: 'TETAP', members: 10, withExitDate: 1, exitDateBeforeToday: 1, withoutNik: 0 }, { status: '0,00', employment: null, members: 3, withExitDate: 0, exitDateBeforeToday: 0, withoutNik: 0 }], groups: [{ group: 'ANGGOTA', members: 12 }, { group: '150.000,00', members: 1 }],
    aggs: [{ docNo: 'A', type: 'WAJIB', rows: 2, credit: '100.00', debit: '0.00', interest: '0.00' }], headers: [{ docNo: 'A', docDate: '2026-05-01', status: 'APPROVED' }], ...over };
  const r = (n, f) => async (...a) => { calls.push([n, ...a]); if (fail.has(n)) throw new Error('timeout'); return f(...a); };
  const ops = { membershipCounts: r('membershipCounts', () => d.members), membershipGroups: r('membershipGroups', (cap) => d.groups.slice(0, cap)), savingsDocAggregates: r('savingsDocAggregates', (cap) => d.aggs.slice(0, cap)), savingsHeaders: r('savingsHeaders', (cap) => d.headers.slice(0, cap)) };
  const events = [];
  return { calls, fail, events, deps: { reader: {}, ops, audit: { async append(e) { events.push(e); } }, now: NOW } };
}

test('Bangkok business date, not UTC, drives "today"', () => { assert.equal(bangkokDate(NOW()), '2026-10-18'); });

test('membership report: member grant first, audit before the read, unrecognised values reported, failures explicit', async () => {
  const w = world();
  assert.equal(await code(readMembershipReport(w.deps, actor('kosipa.loan.view'))), 'FORBIDDEN'); assert.equal(w.calls.length, 0); assert.equal(w.events.length, 0);
  const r = await readMembershipReport(w.deps, actor('kosipa.member.view'));
  assert.equal(w.events[0].action, 'kosipa.report.membership.view'); assert.equal(w.events[0].subjectId, 'report:membership');
  assert.deepEqual([r.state, r.data.total, r.data.unrecognised.status, r.data.unrecognised.group], ['ok', 13, 3, 1]); assert.equal(w.calls[0][0], 'membershipGroups'); assert.equal(w.calls.find((c) => c[0] === 'membershipCounts')[1], '2026-10-18');
  w.fail.add('membershipCounts'); assert.deepEqual(await readMembershipReport(w.deps, actor('kosipa.member.view')), { state: 'unavailable', reason: 'READ_FAILED' });
  w.fail.clear(); const many = world({ groups: Array.from({ length: 201 }, (_, i) => ({ group: `G${i}`, members: 1 })) });
  assert.deepEqual(await readMembershipReport(many.deps, actor('kosipa.member.view')), { state: 'unavailable', reason: 'SOURCE_TRUNCATED' });
});

test('savings movement report: savings grant first, year validated before audit, newest year by default, truncated or failed source is never partial', async () => {
  const w = world();
  assert.equal(await code(readSavingsMovementReport(w.deps, actor('kosipa.member.view'), {})), 'FORBIDDEN');
  assert.equal(await code(readSavingsMovementReport(w.deps, actor('kosipa.savings.view'), { tahun: "2026'--" })), 'PERIOD_INVALID'); assert.equal(w.calls.length, 0); assert.equal(w.events.length, 0);
  const r = await readSavingsMovementReport(w.deps, actor('kosipa.savings.view'), {}); assert.equal(w.events[0].subjectId, 'report:savings');
  assert.deepEqual([r.state, r.data.year, r.data.lines[0].bucket, r.data.lines[0].posted4.credit], ['ok', 2026, '2026-05', 1000000]);
  assert.equal((await readSavingsMovementReport(w.deps, actor('kosipa.savings.view'), { tahun: '2024' })).data.lines.length, 0);
  w.fail.add('savingsHeaders'); assert.deepEqual(await readSavingsMovementReport(w.deps, actor('kosipa.savings.view'), {}), { state: 'unavailable', reason: 'READ_FAILED' });
  const big = world({ aggs: Array.from({ length: OPS_SOURCE_CAP + 1 }, (_, i) => ({ docNo: `D${i}`, type: 'W', rows: 1, credit: '1.00', debit: '0.00', interest: '0.00' })) });
  assert.deepEqual(await readSavingsMovementReport(big.deps, actor('kosipa.savings.view'), {}), { state: 'unavailable', reason: 'SOURCE_TRUNCATED' });
  const bad = world({ aggs: [{ docNo: 'A', type: 'W', rows: 1, credit: 'oops', debit: '0.00', interest: '0.00' }] });
  assert.equal(await code(readSavingsMovementReport(bad.deps, actor('kosipa.savings.view'), {})), 'AMOUNT_INVALID');
});

test('exports: export grant AND the report view grant, audited first, aggregate only, an unavailable source is an error (never an empty-looking file)', async () => {
  const w = world(); const exp = (...c) => actor(...c, 'kosipa.report.export');
  assert.equal(await code(exportMembershipReportCsv(w.deps, actor('kosipa.member.view'))), 'FORBIDDEN'); assert.equal(await code(exportMembershipReportCsv(w.deps, exp('kosipa.savings.view'))), 'FORBIDDEN');
  assert.equal(await code(exportSavingsMovementCsv(w.deps, exp('kosipa.member.view'), {})), 'FORBIDDEN'); assert.equal(await code(exportSavingsMovementCsv(w.deps, exp('kosipa.savings.view'), { tahun: '26' })), 'PERIOD_INVALID');
  assert.equal(w.calls.length, 0); assert.equal(w.events.length, 0);
  const m = await exportMembershipReportCsv(w.deps, exp('kosipa.member.view')); assert.equal(w.events[0].action, 'kosipa.report.export'); assert.equal(w.events[0].subjectId, 'report:membership');
  const ml = m.body.split('\r\n'); assert.ok(ml.includes('STATUS,AKTIVE,TETAP,YA,10,1,1,0')); assert.ok(ml.includes('STATUS,"0,00",KOSONG,TIDAK,3,0,0,0'), ml.join('\n')); assert.ok(ml.includes('GRUP,,"150.000,00",TIDAK,1,,,'));
  const s = await exportSavingsMovementCsv(w.deps, exp('kosipa.savings.view'), {}); const sl = s.body.split('\r\n');
  assert.ok(sl.some((l) => l.startsWith('saldo_resmi,TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED)'))); assert.ok(sl.includes('BULAN,2026-05,WAJIB,2,100.00,0.00,0.00,0.00,0.00,0'));
  assert.equal(s.filename, 'ringkasan-mutasi-simpanan-2026.csv');
  w.fail.add('membershipCounts'); assert.equal(await code(exportMembershipReportCsv(w.deps, exp('kosipa.member.view'))), 'EXPORT_SOURCE_UNAVAILABLE');
  const big = world({ groups: Array.from({ length: 201 }, (_, i) => ({ group: `G${i}`, members: 1 })) }); assert.equal(await code(exportMembershipReportCsv(big.deps, exp('kosipa.member.view'))), 'EXPORT_TOO_LARGE');
});
