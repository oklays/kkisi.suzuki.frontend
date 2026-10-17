import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError, parseReportYear, buildLoanReport, buildPayrollReport, classifyOrphans, classifyBatchTotals, REPORT_SAMPLE_LIMIT } from '../src/kosipa/index.ts';

const RP = (n) => n * 10000;
const hdr = (docNo, over = {}) => ({ id: 1, docNo, group: 'ANGGOTA', status: 'APPROVED', periodYear: '2026', periodMonth: '08', periodDate: '2026-08-31', docDate: null, cashDate: null, headerTotal: '1000.0000', cashTotal: null, createdBy: null, updatedBy: null, ...over });
const agg = (docNo, over = {}) => ({ docNo, rowCount: 2, distinctNik: 2, rowsTotal: '1000.0000', potonganToko: '600.0000', componentTotals: { TOKO_TAMBUN: '600.0000', PPOB: '400.0000' }, ...over });

test('year parameter: empty = none, four digits in range, anything else refused', () => {
  assert.equal(parseReportYear(undefined), null); assert.equal(parseReportYear(''), null); assert.equal(parseReportYear('2026'), 2026); assert.equal(parseReportYear(['2025', '2026']), 2025);
  for (const bad of ['26', '1999', '2101', "2026' OR 1=1", 'abcd', '2026-01']) assert.throws(() => parseReportYear(bad), (e) => e instanceof KosipaError && e.code === 'PERIOD_INVALID', bad);
});

test('loan report: recorded principal per month and status; unusable dates counted apart and never placed in a month; exact sums', () => {
  const r = buildLoanReport(2026, [2025, 2026], [
    { bucket: '2026-02', docStatus: 'APPROVED', repayment: 'BELUM LUNAS', count: 3, planPrincipal: '3000000.00' },
    { bucket: '2026-02', docStatus: 'REJECTED', repayment: 'BELUM LUNAS', count: 1, planPrincipal: '500000.25' },
    { bucket: '2026-01', docStatus: 'APPROVED', repayment: 'LUNAS', count: 2, planPrincipal: '200000.00' },
    { bucket: 'ZERO', docStatus: 'APPROVED', repayment: 'LUNAS', count: 5, planPrincipal: '50.00' }, { bucket: 'IMPLAUSIBLE', docStatus: null, repayment: null, count: 1, planPrincipal: '1.00' }, { bucket: '2026-13', docStatus: 'OPEN', repayment: null, count: 1, planPrincipal: '1.00' },
  ]);
  assert.deepEqual(r.months.map((m) => [m.bucket, m.count, m.plan4]), [['2026-01', 2, RP(200000)], ['2026-02', 4, 35000002500]]);
  assert.deepEqual(r.unusableDates.map((u) => [u.kind, u.count]), [['IMPLAUSIBLE', 2], ['ZERO', 5]], 'a malformed bucket is never turned into a month');
  assert.deepEqual([r.totals.count, r.years], [13, [2026, 2025]]);
  assert.deepEqual(r.months[1].lines.map((l) => l.docStatus), ['APPROVED', 'REJECTED']);
});

test('payroll report: period from the TEXT columns only; group totals exact; open batch and issues surfaced; unusable period is not reconcilable', () => {
  const headers = [hdr('A'), hdr('B', { status: 'OPEN', headerTotal: '999.0000' }), hdr('C', { periodMonth: '07' }), hdr('D', { periodYear: null, periodMonth: null }), hdr('E', { periodMonth: '06' })];
  const r = buildPayrollReport(2026, [2026], headers, [agg('A'), agg('B', { rowsTotal: '1000.0000' }), agg('C'), agg('D'), agg('ORPHAN')]);
  assert.deepEqual(r.periods.map((p) => p.period), ['2026-08', '2026-07', '2026-06', 'UNKNOWN'], 'newest first, UNKNOWN last');
  const aug = r.periods[0];
  assert.deepEqual([aug.batches.length, aug.rows, aug.rowsTotal4, aug.openBatches, aug.reconcilable], [2, 4, RP(2000), 1, true]);
  assert.deepEqual(aug.groups.map((g) => [g.group, g.amount4]), [['toko', RP(1200)], ['ppob', RP(800)]]);
  assert.deepEqual(aug.toko4, { TOKO_TAMBUN: RP(1200), TOKO_MJ: 0, TOKO_GIIC: 0 });
  assert.ok(aug.batches[1].issues.includes('HEADER_TOTAL_MISMATCH') && aug.issueCount >= 1);
  assert.deepEqual([r.periods[3].reconcilable, r.headersWithoutRows], [false, 1], 'E has no aggregate: a header without rows');
  assert.ok(r.periods[2].batches[0].issues.includes('NO_ROWS'));
});

test('orphan scan: installments without a loan and approved loans without a schedule are found by document number; samples are bounded', () => {
  const dtl = Array.from({ length: 30 }, (_, i) => ({ docNo: `ORPH${i}`, rows: i + 1 })).concat([{ docNo: 'L1', rows: 12 }]);
  const loans = [{ docNo: 'L1', docStatus: 'APPROVED' }, { docNo: 'L2', docStatus: 'APPROVED' }, { docNo: 'L3', docStatus: 'REJECTED' }, { docNo: 'L2', docStatus: 'APPROVED' }];
  const o = classifyOrphans(dtl, loans);
  assert.deepEqual([o.orphanDocs.total, o.orphanRows, o.installmentDocs, o.installmentRows], [30, 465, 31, 477]);
  assert.equal(o.orphanDocs.sample.length, REPORT_SAMPLE_LIMIT); assert.deepEqual(o.orphanDocs.sample[0], { docNo: 'ORPH29', rows: 30 }, 'largest first');
  assert.deepEqual(o.approvedWithoutSchedule.sample, [{ docNo: 'L2' }], 'a rejected loan without a schedule is normal; a duplicated number counts once');
});

test('batch total findings: header/detail mismatch, no rows, missing total and rows without a header are listed, nothing repaired', () => {
  const headers = [hdr('A'), hdr('B', { headerTotal: '5.0000' }), hdr('C', { headerTotal: null }), hdr('D')];
  const r = classifyBatchTotals(headers, [agg('A'), agg('B'), agg('C'), agg('X', { rowCount: 3 })]);
  const by = Object.fromEntries(r.findings.sample.map((f) => [f.docNo, f]));
  assert.deepEqual(Object.keys(by).sort(), ['B', 'C', 'D']);
  assert.deepEqual([by.B.issues, by.B.differenceFrom4], [['HEADER_TOTAL_MISMATCH'], RP(5) - RP(1000)]);
  assert.deepEqual(by.C.issues, ['HEADER_TOTAL_MISSING']); assert.deepEqual(by.D.issues, ['NO_ROWS']);
  assert.deepEqual(r.rowsWithoutHeader.sample, [{ docNo: 'X', rows: 3 }]); assert.equal(r.checked, 4);
});
