import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError, buildMembershipReport, buildSavingsMovementReport } from '../src/kosipa/index.ts';

const RP = (n) => Math.round(n * 10000);
test('membership: counts by recorded status; unrecognised values (column-shifted amounts) are counted apart, never mapped to a guess', () => {
  const r = buildMembershipReport([
    { status: 'AKTIVE', employment: 'TETAP', members: 3649, withExitDate: 18, exitDateBeforeToday: 10, withoutNik: 1 },
    { status: 'RESIGN', employment: 'TETAP', members: 1856, withExitDate: 121, exitDateBeforeToday: 121, withoutNik: 0 },
    { status: '0,00', employment: null, members: 1427, withExitDate: 0, exitDateBeforeToday: 0, withoutNik: 0 },
    { status: 'AKTIVE', employment: '', members: 1, withExitDate: 0, exitDateBeforeToday: 0, withoutNik: 0 },
    { status: 'AKTIVE', employment: 'HARIAN', members: 2, withExitDate: 0, exitDateBeforeToday: 0, withoutNik: 0 },
  ], [{ group: 'NON ANGGOTA', members: 6297 }, { group: '150.000,00', members: 27 }, { group: 'ANGGOTA', members: 1336 }, { group: null, members: 4 }]);
  assert.equal(r.total, 3649 + 1856 + 1427 + 1 + 2); assert.deepEqual(r.unrecognised, { status: 1427, employment: 2, group: 31 });
  assert.deepEqual(r.lines.map((l) => [l.status, l.statusKnown, l.employmentKnown]).slice(0, 3), [['AKTIVE', true, true], ['RESIGN', true, true], ['0,00', false, true]]);
  assert.deepEqual(r.groups.map((g) => [g.group, g.known]), [['NON ANGGOTA', true], ['ANGGOTA', true], ['150.000,00', false], [null, false]]);
  assert.deepEqual(r.totals, { withExitDate: 139, exitDateBeforeToday: 131, withoutNik: 1 });
});

const agg = (docNo, type, rows, credit, debit = '0.00', interest = '0.00') => ({ docNo, type, rows, credit, debit, interest });
const hdr = (docNo, docDate, status) => ({ docNo, docDate, status });
test('savings movement summary: header status decides; months from the header date only; unplaced movements are counted apart; sums exact and NOT balances', () => {
  const r = buildSavingsMovementReport(2026, [
    agg('A', 'WAJIB', 3, '300000.00', '0.00', '1.50'), agg('B', 'WAJIB', 1, '0.00', '40000.00'), agg('C', 'WAJIB', 2, '5.00'), agg('D', 'WAJIB', 1, '7.00'), agg('E', 'WAJIB', 1, '9.00'), agg('F', 'POKOK', 1, '250000.00'), agg('G', 'WAJIB', 4, '1.00'), agg('H', 'WAJIB', 1, '8.00'),
  ], [hdr('A', '2026-05-01', 'APPROVED'), hdr('B', '2026-05-20', 'OPEN'), hdr('C', '2026-06-01', 'POSTING'), hdr('D', '2026-06-02', 'APPROVED'), hdr('D', '2026-06-02', 'APPROVED'), hdr('F', '0000-00-00', 'APPROVED'), hdr('G', '2025-12-31', 'APPROVED'), hdr('H', '9999-12-10', 'APPROVED')]);
  assert.deepEqual(r.years, [2026, 2025]);
  assert.deepEqual(r.lines.map((l) => [l.bucket, l.type, l.rows]), [['2026-05', 'WAJIB', 4], ['2026-06', 'WAJIB', 2]]);
  const may = r.lines[0]; assert.deepEqual([may.posted4, may.pending4], [{ credit: RP(300000), debit: 0, interest: RP(1.5) }, { credit: 0, debit: RP(40000) }]);
  assert.deepEqual([r.lines[1].voidRows, r.lines[1].posted4.credit], [2, 0], 'POSTING is "other status"');
  assert.deepEqual(r.unplaced.map((u) => [u.kind, u.type, u.rows]), [['DATE_UNUSABLE', 'POKOK', 1], ['DATE_UNUSABLE', 'WAJIB', 1], ['HEADER_AMBIGUOUS', 'WAJIB', 1], ['HEADER_MISSING', 'WAJIB', 1]].sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`)).map((x) => x));
  assert.equal(buildSavingsMovementReport(null, [agg('A', 'WAJIB', 1, '1.00')], [hdr('A', '2026-05-01', 'APPROVED')]).lines.length, 1, 'no year filter: every month');
  assert.throws(() => buildSavingsMovementReport(2026, [agg('A', 'WAJIB', 1, 'oops')], [hdr('A', '2026-05-01', 'APPROVED')]), (e) => e instanceof KosipaError && e.code === 'AMOUNT_INVALID');
});
