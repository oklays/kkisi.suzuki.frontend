import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readLoanReport, readPayrollReport, readDataQuality } from '../src/kosipa/reports.ts';
import { makeReportWorld, bucket, header, aggregate } from './helpers/report-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e?.stack ?? e)); return e.code; } };
const NOW = () => new Date('2026-10-17T05:00:00Z');
const actor = (...caps) => ({ userId: 7, capabilities: new Set(caps), requestId: 'r1' });
const mk = (w, extra = {}) => { const events = []; return { events, deps: { reader: w.reader, audit: { async append(e) { events.push(e); } }, now: NOW, ...extra } }; };
const LOAN = actor('kosipa.loan.view'), PAY = actor('kosipa.payroll.view'), BOTH = actor('kosipa.loan.view', 'kosipa.payroll.view');

test('every report needs its own grant BEFORE anything is audited or read; data quality needs at least one', async () => {
  const w = makeReportWorld(); const { deps, events } = mk(w);
  assert.equal(await code(readLoanReport(deps, PAY, {})), 'FORBIDDEN'); assert.equal(await code(readLoanReport(deps, actor('kosipa.member.view'), {})), 'FORBIDDEN');
  assert.equal(await code(readPayrollReport(deps, LOAN, {})), 'FORBIDDEN');
  assert.equal(await code(readDataQuality(deps, actor('kosipa.member.view', 'kosipa.savings.view'))), 'FORBIDDEN');
  assert.equal(w.calls.length, 0); assert.equal(events.length, 0);
});

test('audit is written BEFORE the first read with opaque report subjects; an audit failure stops the read', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-01', 'APPROVED', 'LUNAS', 1, '100.00')] }); const order = [];
  const deps = { reader: new Proxy(w.reader, { get: (t, k) => (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } }), audit: { async append(e) { order.push(`audit:${e.action}:${e.subjectId}`); } }, now: NOW };
  await readLoanReport(deps, LOAN, {}); assert.equal(order[0], 'audit:kosipa.report.loan.view:report:loan');
  order.length = 0; await readPayrollReport(deps, PAY, {}); assert.equal(order[0], 'audit:kosipa.report.payroll.view:report:payroll');
  order.length = 0; await readDataQuality(deps, BOTH); assert.equal(order[0], 'audit:kosipa.report.quality.view:report:quality');
  const f = makeReportWorld();
  await assert.rejects(readLoanReport({ reader: f.reader, audit: { async append() { throw new Error('console db down'); } }, now: NOW }, LOAN, {}), /console db down/); assert.equal(f.calls.length, 0);
});

test('loan report: newest year by default, explicit year honoured, invalid year refused before any read; official balance never stated', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-03', 'APPROVED', 'BELUM LUNAS', 2, '2000000.00'), bucket('ZERO', 'APPROVED', 'LUNAS', 4, '10.00')] }); const { deps } = mk(w);
  const a = await readLoanReport(deps, LOAN, {}); assert.equal(a.report.year, 2026); assert.equal(w.named('loanBuckets')[0][1], 2026);
  assert.equal(a.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED');
  assert.deepEqual([a.report.months[0].plan4, a.report.unusableDates[0].kind, a.report.unusableDates[0].count], [20000000000, 'ZERO', 4]);
  await readLoanReport(deps, LOAN, { tahun: '2025' }); assert.equal(w.named('loanBuckets')[1][1], 2025);
  const before = w.calls.length;
  for (const bad of ['26', "2026' OR 1=1", '3000']) assert.equal(await code(readLoanReport(deps, LOAN, { tahun: bad })), 'PERIOD_INVALID');
  assert.equal(w.calls.length, before);
  assert.deepEqual((await readLoanReport(mk(makeReportWorld({ loanYears: [] })).deps, LOAN, {})).report.year, null, 'no loans at all: no guessed year');
});

test('payroll report: headers and aggregates are read separately (no join), bounded; recorded components per period; unusable period flagged', async () => {
  const headers = [header('A'), header('B', { status: 'OPEN' }), header('C', { periodMonth: '07' }), header('D', { periodMonth: null })];
  const w = makeReportWorld({ headers, aggregates: [aggregate('A'), aggregate('B'), aggregate('C'), aggregate('D')] }); const { deps } = mk(w);
  const r = await readPayrollReport(deps, PAY, {});
  assert.deepEqual(r.periods.map((p) => p.period), ['2026-08', '2026-07', 'UNKNOWN']); assert.equal(r.periods[0].openBatches, 1); assert.equal(r.periods[2].reconcilable, false);
  assert.deepEqual(w.named('payrollHeadersForYear')[0].slice(1), [2026, 120]); assert.deepEqual(w.named('payrollAggregates')[0][1], ['A', 'B', 'C', 'D']);
  assert.equal(await code(readPayrollReport(deps, PAY, { tahun: 'abc' })), 'PERIOD_INVALID');
  const none = makeReportWorld({ payrollYears: [] }); assert.deepEqual((await readPayrollReport(mk(none).deps, PAY, {})).periods, []); assert.equal(none.named('payrollAggregates').length, 0);
});

test('data quality: sections are gated per grant; loan-only and payroll-only users never see the other domain', async () => {
  const w = makeReportWorld(); const { deps } = mk(w);
  const l = await readDataQuality(deps, LOAN); assert.equal(l.payroll, 'restricted'); assert.notEqual(l.loans, 'restricted');
  assert.equal(w.named('payrollRowTotals').length, 0, 'no payroll query for a loan-only user');
  const p = await readDataQuality(deps, PAY); assert.equal(p.loans, 'restricted'); assert.notEqual(p.payroll, 'restricted');
  assert.equal(w.named('duplicateLoanRefs').length, 1, 'only the first (loan) call read loans');
});

test('data quality: duplicates, conflicting statuses, invalid dates, orphans, payroll totals are reported with bounded samples; nothing is repaired', async () => {
  const dupRefs = Array.from({ length: 30 }, (_, i) => ({ docNo: `D${i}`, count: 2, statusCombinations: i < 3 ? 2 : 1 }));
  const w = makeReportWorld({
    dupRefs, conflicts: { counts: { rejectedSettled: 17, rejectedDisbursed: 1, settledNotApproved: 2, disbursedNotApproved: 3 }, sample: Array.from({ length: 30 }, (_, i) => ({ docNo: `C${i}`, docStatus: 'REJECTED', disbursement: 'OPEN', repayment: 'LUNAS' })) },
    instDocs: [{ docNo: 'L1', rows: 12 }, { docNo: 'ORPH', rows: 7 }], loanDocs: [{ docNo: 'L1', docStatus: 'APPROVED' }, { docNo: 'L2', docStatus: 'APPROVED' }],
    allHeaders: [header('A'), header('B', { headerTotal: '5.0000' })], allAggregates: [aggregate('A'), aggregate('B'), aggregate('X')],
    rowTotals: { rows: 85000, totalDiffersFromComponents: 1061, totalDiffersByHalfSenOrMore: 35, maxDifference: '0.0100', totalWithoutComponents: 4, sample: [{ docNo: 'A', nik: '00100', total: '5.0000', componentSum: '4.0000' }] }, dupNik: [{ docNo: 'A', nik: '00100', count: 2 }],
  });
  const q = await readDataQuality(mk(w, { }).deps, BOTH);
  assert.deepEqual([q.loans.duplicateRefs.data.total, q.loans.duplicateRefs.data.sample.length, q.loans.duplicateRefs.data.conflictingStatuses], [30, 20, 3]);
  assert.deepEqual([q.loans.statusConflicts.data.total, q.loans.statusConflicts.data.sample.length], [23, 20]);
  assert.deepEqual([q.loans.loanDates.data.zero, q.loans.installmentDates.data.implausible], [2, 3]);
  assert.deepEqual([q.loans.orphans.data.orphanDocs.sample, q.loans.orphans.data.orphanRows, q.loans.orphans.data.approvedWithoutSchedule.sample], [[{ docNo: 'ORPH', rows: 7 }], 7, [{ docNo: 'L2' }]]);
  assert.deepEqual(q.payroll.batchTotals.data.findings.sample.map((f) => [f.docNo, f.issues]), [['B', ['HEADER_TOTAL_MISMATCH']]]); assert.deepEqual(q.payroll.batchTotals.data.rowsWithoutHeader.sample, [{ docNo: 'X', rows: 2 }]);
  assert.deepEqual([q.payroll.rowTotals.data.totalDiffersFromComponents, q.payroll.rowTotals.data.totalDiffersByHalfSenOrMore, q.payroll.duplicateBatchNik.data.total], [1061, 35, 1]);
  assert.deepEqual(q.branchMapping, { basis: 'EMPIRICAL_UNCONFIRMED', state: 'UNVERIFIED' });
  const confirmed = await readDataQuality(mk(w, { storeColumnMap: { basis: 'OWNER_CONFIRMED', byCompany: { 1: 'TOKO_TAMBUN' } } }).deps, LOAN);
  assert.deepEqual(confirmed.branchMapping, { basis: 'OWNER_CONFIRMED', state: 'CONFIRMED' });
});

test('data quality: one failing diagnostic never hides the others; an incomplete scan is unavailable, never "clean"', async () => {
  const w = makeReportWorld({ instDocs: [{ docNo: 'L1', rows: 1 }], loanDocs: [{ docNo: 'L1', docStatus: 'APPROVED' }] }); const { deps } = mk(w);
  w.failures.add('installmentDateProblems'); w.failures.add('payrollRowTotals');
  const q = await readDataQuality(deps, BOTH);
  assert.deepEqual([q.loans.installmentDates, q.payroll.rowTotals], [{ state: 'unavailable', reason: 'READ_FAILED' }, { state: 'unavailable', reason: 'READ_FAILED' }]);
  assert.equal(q.loans.loanDates.state, 'ok'); assert.equal(q.loans.orphans.state, 'ok'); assert.equal(q.payroll.batchTotals.state, 'ok');
  w.failures.clear(); w.failures.add('installmentDocs'); assert.deepEqual((await readDataQuality(deps, LOAN)).loans.orphans, { state: 'unavailable', reason: 'READ_FAILED' });
  w.failures.clear();
  const huge = makeReportWorld({ instDocs: Array.from({ length: 100001 }, (_, i) => ({ docNo: `X${i}`, rows: 1 })), loanDocs: [{ docNo: 'L1', docStatus: 'APPROVED' }] });
  assert.deepEqual((await readDataQuality(mk(huge).deps, LOAN)).loans.orphans, { state: 'unavailable', reason: 'SOURCE_TRUNCATED' });
  const manyHeaders = makeReportWorld({ allHeaders: Array.from({ length: 2001 }, (_, i) => header(`H${i}`)) });
  assert.deepEqual((await readDataQuality(mk(manyHeaders).deps, PAY)).payroll.batchTotals, { state: 'unavailable', reason: 'SOURCE_TRUNCATED' });
});

test('malformed stored amounts are an error, not "unavailable" and not zero; the reader contract has no write capability', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-01', 'APPROVED', 'LUNAS', 1, 'oops')] });
  assert.equal(await code(readLoanReport(mk(w).deps, LOAN, {})), 'AMOUNT_INVALID');
  // a diagnostic whose stored data is malformed raises the data error instead of being shown as a transient outage
  const corrupt = makeReportWorld(); corrupt.reader.loanDateProblems = async () => { throw new KosipaError('AMOUNT_INVALID'); };
  assert.equal(await code(readDataQuality(mk(corrupt).deps, LOAN)), 'AMOUNT_INVALID');
  const badBatch = makeReportWorld({ allHeaders: [header('A', { headerTotal: 'oops' })], allAggregates: [aggregate('A')] });
  assert.equal(await code(readDataQuality(mk(badBatch).deps, PAY)), 'AMOUNT_INVALID');
  assert.deepEqual(Object.keys(makeReportWorld().reader).sort(), ['duplicateBatchNik', 'duplicateLoanRefs', 'installmentDateProblems', 'installmentDocs', 'loanBuckets', 'loanDateProblems', 'loanDocs', 'loanStatusConflicts', 'loanYears', 'payrollAggregates', 'payrollAggregatesAll', 'payrollHeadersAll', 'payrollHeadersForYear', 'payrollRowTotals', 'payrollYears']);
});
