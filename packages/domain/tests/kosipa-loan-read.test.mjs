import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError, parseLoanListQuery, parseLoanDocNo, parseScheduleCursor, scheduleCursor, statusFlags, describeLoan, assessSchedule, describeScheduleRow, OFFICIAL_BALANCE } from '../src/kosipa/index.ts';

const RP = (n) => n * 10000;
const header = (over = {}) => ({ id: 1, docNo: 'PIN0001', docDate: '2026-01-10', type: 'PINJAMAN REGULAR', method: 'Flat', rate: '1', nik: '00100', name: 'SYNTH', docStatus: 'APPROVED', disbursement: 'APPROVED', repayment: 'BELUM LUNAS',
  planPrincipal: '1200000.00', actualPrincipal: '0.00', planInstallment: '110000.00', actualInstallment: '0.00', planMonths: 12, actualMonths: 0, startDate: '2026-02-01', endDate: '2027-01-01', disbursedDate: '2026-01-15', disbursedAmount: '1200000.00',
  adminFee: '0.00', insuranceFee: '0.00', totalDeduction: '0.00', totalReceived: '1200000.00', settlementStatus: null, settlementDate: null, settlementTotal: '0.00', rollOver: 'NO', ...over });
const agg = (over = {}) => ({ rows: 12, distinctNo: 12, minNo: 1, maxNo: 12, principalSum: '1200000.00', interestSum: '120000.00', totalSum: '1320000.00', paidRows: 2, unpaidRows: 10, otherStatusRows: 0, paidPrincipal: '200000.00', unpaidPrincipal: '1000000.00', unpaidTotal: '1100000.00',
  zeroDue: 0, missingDue: 0, implausibleDue: 0, componentMismatch: 0, paidWithoutPaidDate: 0, ...over });

test('list filters: only known statuses, NIK / document prefix / name are classified, wildcards are literal, cursor is a positive integer', () => {
  assert.deepEqual(parseLoanListQuery({}), { docStatus: null, disbursement: null, repayment: null, search: null, afterId: null });
  const q = parseLoanListQuery({ status: 'APPROVED', cair: 'OPEN', bayar: 'BELUM LUNAS', after: '500' });
  assert.deepEqual([q.docStatus, q.disbursement, q.repayment, q.afterId], ['APPROVED', 'OPEN', 'BELUM LUNAS', 500]);
  assert.deepEqual(parseLoanListQuery({ q: 'PINMOB2024' }).search, { nikKeys: null, docNoPrefix: 'PINMOB2024', nameLike: null });
  assert.ok(parseLoanListQuery({ q: '04296' }).search.nikKeys.includes('04296'));
  assert.deepEqual(parseLoanListQuery({ q: '50%_' }).search.nameLike, '50\\%\\_');
  assert.equal(parseLoanListQuery({ q: 'a' }).search, null, 'one character is no search');
  for (const bad of [{ status: "APPROVED' OR 1=1" }, { cair: 'X' }, { bayar: 'lunas' }, { after: '0' }, { after: '1;DROP' }]) assert.throws(() => parseLoanListQuery(bad), (e) => e instanceof KosipaError, JSON.stringify(bad));
});

test('document number and schedule cursor are strictly validated and round-trip', () => {
  assert.equal(parseLoanDocNo('PIN-0001_x'), 'PIN-0001_x');
  for (const bad of ['', 'ab', "x'--", 'a b c d', 'A'.repeat(51), 5, null]) assert.throws(() => parseLoanDocNo(bad), (e) => e.code === 'DOC_NO_INVALID');
  assert.equal(parseScheduleCursor(undefined), null);
  assert.deepEqual(parseScheduleCursor('12.3456'), { no: 12, id: 3456 });
  assert.equal(scheduleCursor({ installmentNo: null, id: 9 }), '0.9');
  for (const bad of ['12', '1.2.3', '-1.2', "1.2'", 'a.b']) assert.throws(() => parseScheduleCursor(bad), (e) => e.code === 'CURSOR_INVALID');
});

test('status combinations are flagged as recorded, never corrected', () => {
  assert.deepEqual(statusFlags({ docStatus: 'APPROVED', disbursement: 'APPROVED', repayment: 'LUNAS' }), []);
  assert.deepEqual(statusFlags({ docStatus: 'REJECTED', disbursement: 'OPEN', repayment: 'LUNAS' }), ['REJECTED_BUT_SETTLED']);
  assert.deepEqual(statusFlags({ docStatus: 'REJECTED', disbursement: 'APPROVED', repayment: 'BELUM LUNAS' }), ['REJECTED_BUT_DISBURSED']);
  assert.deepEqual(statusFlags({ docStatus: 'POSTING', disbursement: 'APPROVED', repayment: 'LUNAS' }), ['SETTLED_BUT_NOT_APPROVED', 'DISBURSED_BUT_NOT_APPROVED']);
  assert.deepEqual(statusFlags({ docStatus: 'WEIRD', disbursement: null, repayment: 'BELUM LUNAS' }), ['STATUS_UNKNOWN']);
});

test('describeLoan keeps recorded values exact and classifies zero / implausible dates without guessing', () => {
  const v = describeLoan(header({ planPrincipal: '1200000.00', docDate: '0000-00-00', endDate: '9999-12-10', startDate: null, adminFee: '12.34' }));
  assert.equal(v.planPrincipal4, RP(1200000)); assert.equal(v.adminFee4, 123400);
  assert.deepEqual([v.docDate.kind, v.endDate.kind, v.startDate.kind], ['zero', 'invalid', 'missing']);
  assert.throws(() => describeLoan(header({ planPrincipal: 'abc' })), (e) => e.code === 'AMOUNT_INVALID');
});

test('schedule integrity: a consistent schedule has no issues and the recorded sums are exact (never presented as a balance)', () => {
  const loan = describeLoan(header());
  const r = assessSchedule(loan, agg(), 1);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.recorded, { principal4: RP(1200000), interest4: RP(120000), total4: RP(1320000), paidPrincipal4: RP(200000), unpaidPrincipal4: RP(1000000), unpaidTotal4: RP(1100000) });
  assert.deepEqual(OFFICIAL_BALANCE, { state: 'unavailable', reason: 'OFFICIAL_BALANCE_UNVERIFIED' });
  assert.equal('outstanding' in r, false);
});

test('schedule integrity: every anomaly is named', () => {
  const loan = describeLoan(header({ repayment: 'LUNAS' }));
  const bad = assessSchedule(loan, agg({ principalSum: '1199999.99', rows: 11, distinctNo: 10, zeroDue: 1, implausibleDue: 2, componentMismatch: 3, paidWithoutPaidDate: 1, otherStatusRows: 1 }), 2);
  assert.deepEqual(bad.issues.sort(), ['DUE_DATES_UNUSABLE', 'DUPLICATE_HEADER', 'DUPLICATE_INSTALLMENT_NUMBERS', 'PRINCIPAL_SUM_DIFFERS_FROM_PLAN', 'ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS', 'ROW_TOTAL_DIFFERS_FROM_PRINCIPAL_PLUS_INTEREST', 'SETTLED_WITH_UNPAID_ROWS', 'STATUS_UNRECOGNISED_ROWS']);
  assert.deepEqual(bad.dueDates, { zero: 1, missing: 0, implausible: 2 });
  assert.equal(bad.paidRowsWithoutPaidDate, 1, 'reported as a fact, not as an issue'); assert.equal(bad.principalDifference4, -100, 'exact difference to the sen');
  assert.deepEqual(assessSchedule(describeLoan(header()), agg({ distinctNo: 11, rows: 11, maxNo: 13, minNo: 1, principalSum: '1200000.00' }), 1).issues, ['ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS', 'NUMBERING_HAS_GAPS']);
  assert.deepEqual(assessSchedule(describeLoan(header()), agg({ rows: 0, distinctNo: 0, minNo: null, maxNo: null, principalSum: '0', interestSum: '0', totalSum: '0', paidRows: 0, unpaidRows: 0, paidPrincipal: '0', unpaidPrincipal: '0', unpaidTotal: '0' }), 1).issues, ['SCHEDULE_ABSENT']);
  assert.deepEqual(assessSchedule(describeLoan(header({ docStatus: 'REJECTED', disbursement: 'OPEN' })), agg(), 1).issues, ['REJECTED_OR_OPEN_WITH_SCHEDULE']);
  assert.deepEqual(assessSchedule(describeLoan(header({ docStatus: 'REJECTED', disbursement: 'OPEN' })), agg({ rows: 0, distinctNo: 0, minNo: null, maxNo: null, principalSum: '0', interestSum: '0', totalSum: '0', paidRows: 0, unpaidRows: 0, paidPrincipal: '0', unpaidPrincipal: '0', unpaidTotal: '0' }), 1).issues, [], 'a rejected loan without a schedule is normal');
});

test('schedule rows: exact amounts, labelled dates, component check', () => {
  const row = describeScheduleRow({ id: 5, installmentNo: 3, dueRaw: '9999-12-10', paidRaw: null, principal: '100000.00', interest: '5000.00', total: '105000.00', status: 'Belum Bayar', type: null, blocked: 0, rollOver: 1, cicilanDocNo: null });
  assert.deepEqual([row.due.kind, row.paid.kind, row.principal4, row.total4, row.totalMatches, row.blocked, row.rollOver], ['invalid', 'missing', RP(100000), RP(105000), true, false, true]);
  assert.equal(describeScheduleRow({ id: 6, installmentNo: null, dueRaw: '0000-00-00', paidRaw: '0000-00-00', principal: '1.00', interest: '0.00', total: '2.00', status: 'Bayar', type: 'PAYROLL', blocked: null, rollOver: null, cicilanDocNo: null }).totalMatches, false);
});
