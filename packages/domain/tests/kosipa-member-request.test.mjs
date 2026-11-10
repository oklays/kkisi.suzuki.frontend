import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBER_REQUEST, activeDeductionOptions, assertIntakeMember, buildMobileLoanProducts, intakeLedgerKey, parseMemberIntake, parseRequestDecision, parseRequestDocNo,
  planDeductionApprove, planDeductionIntake, planDeductionReject, planLoanIntake, planLoanRequestReject, requestChannel, requestDocNo, simulateMobileLoan, validateDeductionChange,
} from '../src/kosipa/member-request.ts';

const fail = (fn, code, field) => assert.throws(fn, (e) => e.code === code && (field === undefined || e.field === field), `${code}${field ? `:${field}` : ''}`);
const member = { memberId: 9001, userId: 101, nik: '10234' };
const loanBody = (extra = {}) => ({ kind: 'loan', clientKey: 'idem-loan-0000000001', member, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Biaya sekolah', ...extra });
const dedBody = (extra = {}) => ({ kind: 'deduction', clientKey: 'idem-ded-00000000001', member, savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000, ...extra });
const products = buildMobileLoanProducts([
  { id: 1, name: 'PINJAMAN REGULAR', minAmount: '1000000.00', maxAmount: '50000000.00', minMonths: 3, maxMonths: 36, ratePercent: '1.00', method: 'Flat' },
  { id: 2, name: 'KASBON', minAmount: '500000.00', maxAmount: '2000000.00', minMonths: 1, maxMonths: 3, ratePercent: '', method: null },
]);

test('intake parse: strict fields, typed values, member assertion shape', () => {
  assert.deepEqual(parseMemberIntake(loanBody()), { kind: 'loan', clientKey: 'idem-loan-0000000001', member, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Biaya sekolah' });
  assert.equal(parseMemberIntake(dedBody()).requestedRp, 150_000);
  fail(() => parseMemberIntake(loanBody({ doc_status: 'APPROVED' })), 'FIELD_NOT_ALLOWED');
  fail(() => parseMemberIntake(dedBody({ consent: true })), 'FIELD_NOT_ALLOWED');
  fail(() => parseMemberIntake(loanBody({ amountRp: '5000000' })), 'REQUEST_FIELD_INVALID', 'amountRp');
  fail(() => parseMemberIntake(loanBody({ purpose: '   ' })), 'REQUEST_FIELD_INVALID', 'purpose');
  fail(() => parseMemberIntake(loanBody({ purpose: 'x'.repeat(121) })), 'REQUEST_FIELD_INVALID', 'purpose');
  fail(() => parseMemberIntake(loanBody({ member: { ...member, role: 'admin' } })), 'REQUEST_MEMBER_INVALID');
  fail(() => parseMemberIntake(loanBody({ member: { ...member, nik: "1' OR 1" } })), 'REQUEST_MEMBER_INVALID');
  fail(() => parseMemberIntake(loanBody({ clientKey: 'short' })), 'IDEMPOTENCY_KEY_INVALID');
  fail(() => parseMemberIntake({ ...loanBody(), kind: 'withdrawal' }), 'INVALID_INPUT');
  fail(() => parseMemberIntake(dedBody({ requestedRp: MEMBER_REQUEST.deductionMaxRp + 1 })), 'REQUEST_FIELD_INVALID', 'requestedRp');
});

test('ledger key and document number are stable per (member, client key) and differ across members', () => {
  const a = intakeLedgerKey(9001, 'idem-loan-0000000001');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(intakeLedgerKey(9001, 'idem-loan-0000000001'), a);
  assert.notEqual(intakeLedgerKey(9002, 'idem-loan-0000000001'), a);
  const now = new Date('2026-11-10T18:30:00Z');   // already 11 Nov in Jakarta
  assert.match(requestDocNo('loan', 9001, 'idem-loan-0000000001', now), /^PGJ-MBL-20261111-[0-9A-F]{6}$/);
  assert.match(requestDocNo('deduction', 9001, 'k', now), /^PPS-MBL-20261111-/);
  assert.deepEqual([requestChannel('PGJ-MBL-20261111-ABCDEF'), requestChannel(`PSS${'a'.repeat(32)}00000`), requestChannel('PNJ/2026/001')], ['pwa', 'public-link', 'smartkkisi']);
});

test('intake plans: server-side product bounds, rate presence, open limit, member assertion', () => {
  const ok = planLoanIntake(parseMemberIntake(loanBody()), products, 2);
  assert.equal(ok.product.id, 1);
  assert.equal(ok.simulation.ok, true);
  fail(() => planLoanIntake(parseMemberIntake(loanBody({ amountRp: 60_000_000 })), products, 0), 'REQUEST_FIELD_INVALID', 'amountRp');
  fail(() => planLoanIntake(parseMemberIntake(loanBody({ months: 48 })), products, 0), 'REQUEST_FIELD_INVALID', 'months');
  fail(() => planLoanIntake(parseMemberIntake(loanBody({ productId: 2, amountRp: 1_000_000, months: 2 })), products, 0), 'REQUEST_FIELD_INVALID', 'productId');
  fail(() => planLoanIntake(parseMemberIntake(loanBody()), products, 3), 'REQUEST_OPEN_LIMIT');
  assert.equal(simulateMobileLoan(products, { productId: 9, amountRp: 1, months: 1 }).ok, false);
  const facts = { id: 9001, nik: '10234', name: 'UJI', status: 'AKTIVE', section: null, location: null, phone: null, group: null };
  assert.equal(assertIntakeMember(facts, member).id, 9001);
  for (const bad of [null, { ...facts, nik: '010234' }, { ...facts, id: 9002 }, { ...facts, status: 'RESIGN' }]) fail(() => assertIntakeMember(bad, member), 'REQUEST_MEMBER_INVALID');
});

test('deduction intake: wajib only up, differs from current, effective next Jakarta month', () => {
  const options = activeDeductionOptions([
    { id: 3, type: 'SIMPANAN WAJIB', payroll: '100000.00', status: 1 }, { id: 2, type: 'SIMPANAN WAJIB', payroll: '50000.00', status: 1 },
    { id: 1, type: 'SIMPANAN SUKARELA', payroll: '0.00', status: 1 }, { id: 0, type: 'SIMPANAN LAMA', payroll: '1.00', status: 0 },
  ]);
  assert.deepEqual(options.map((o) => [o.type, o.monthlySen]), [['SIMPANAN WAJIB', 10_000_000], ['SIMPANAN SUKARELA', 0]]);
  const plan = planDeductionIntake(parseMemberIntake(dedBody()), options, new Date('2026-12-31T18:00:00Z'));
  assert.deepEqual([plan.previousRp, plan.effectiveYear, plan.effectiveMonth], [100_000, '2027', '02']);
  fail(() => planDeductionIntake(parseMemberIntake(dedBody({ requestedRp: 90_000 })), options, new Date()), 'REQUEST_FIELD_INVALID', 'requestedRp');
  fail(() => planDeductionIntake(parseMemberIntake(dedBody({ savingsType: 'SIMPANAN LAMA' })), options, new Date()), 'REQUEST_FIELD_INVALID', 'savingsType');
  assert.equal(validateDeductionChange(options[1], '0'), 'Potongan baru sama dengan potongan saat ini.');
  assert.match(validateDeductionChange(options[0], '100.000'), /lebih besar dari Rp/);
});

const KEY = '00000000-0000-4000-8000-000000000001';
const V = 'b'.repeat(64);
test('decision parse and doc numbers', () => {
  assert.deepEqual(parseRequestDecision({ expectedVersion: V, idempotencyKey: KEY }, 'approve'), { expectedVersion: V, idempotencyKey: KEY });
  assert.equal(parseRequestDecision({ expectedVersion: V, idempotencyKey: KEY, reason: '  Data tidak sesuai ' }, 'reject').reason, 'Data tidak sesuai');
  fail(() => parseRequestDecision({ expectedVersion: V, idempotencyKey: KEY }, 'reject'), 'REASON_INVALID');
  fail(() => parseRequestDecision({ expectedVersion: V, idempotencyKey: KEY, reason: 'catatan' }, 'approve'), 'FIELD_NOT_ALLOWED');
  fail(() => parseRequestDecision({ expectedVersion: V, idempotencyKey: KEY, doc_status: 'APPROVED' }, 'approve'), 'FIELD_NOT_ALLOWED');
  fail(() => parseRequestDecision({ expectedVersion: 'x', idempotencyKey: KEY }, 'approve'), 'VERSION_INVALID');
  assert.equal(parseRequestDocNo('PGJ-MBL-20261110-ABCDEF'), 'PGJ-MBL-20261110-ABCDEF');
  assert.equal(parseRequestDocNo('PNJ%2F2026%2F001'), 'PNJ/2026/001');
  for (const bad of ["x' OR 1", '', 'a b']) fail(() => parseRequestDocNo(bad), 'DOC_NO_INVALID');
});

test('loan request reject: OPEN only, single row, never once converted', () => {
  const row = (extra = {}) => ({ docNo: 'PGJ-MBL-20261110-ABCDEF', status: 'OPEN', headerCount: 1, convertedLoans: 0, ...extra });
  assert.deepEqual(planLoanRequestReject(row()), { from: 'OPEN', to: 'REJECTED' });
  fail(() => planLoanRequestReject(null), 'NOT_FOUND');
  fail(() => planLoanRequestReject(row({ status: 'APPROVED' })), 'REQUEST_STATUS_INVALID');
  fail(() => planLoanRequestReject(row({ headerCount: 2 })), 'REQUEST_STATE_INCONSISTENT');
  fail(() => planLoanRequestReject(row({ convertedLoans: 1 })), 'REQUEST_ALREADY_CONVERTED');
});

test('deduction approve (F45 corrected): update all matching rows or insert one; member column; guards', () => {
  const req = (extra = {}) => ({ docNo: 'PPS-MBL-20261110-ABCDEF', status: 'OPEN', headerCount: 1, type: 'SIMPANAN WAJIB', nik: '10234', requestedRp: '150000.00', docDate: '2026-11-10', ...extra });
  const one = [{ id: 9001, nik: '10234', name: 'UJI', group: 'G1', status: 'AKTIVE' }];
  const update = planDeductionApprove(req(), one, [{ id: 7, status: 1, payroll: '100000.00' }, { id: 5, status: 0, payroll: '50000.00' }]);
  assert.deepEqual([update.memberColumn, update.amountRp, update.update, update.insert], ['sim_wajib', 150_000, [7, 5], null], 'legacy updates every NIK+jenis row');
  const insert = planDeductionApprove(req({ type: 'SIMPANAN SUKARELA', requestedRp: '25000' }), one, []);
  assert.deepEqual([insert.memberColumn, insert.update, insert.insert], ['sim_sukarela', [], { nik: '10234', type: 'SIMPANAN SUKARELA', name: 'UJI', group: 'G1', previousRp: 0, periodStart: '2026-11-01', periodEnd: '2026-12-31' }]);
  fail(() => planDeductionApprove(req({ status: 'APPROVED' }), one, []), 'REQUEST_STATUS_INVALID');
  fail(() => planDeductionApprove(req({ status: 'POSTING' }), one, []), 'REQUEST_STATUS_INVALID');
  fail(() => planDeductionApprove(req({ nik: '12345678901' }), one, []), 'REQUEST_NIK_TOO_LONG');
  fail(() => planDeductionApprove(req({ type: 'SIMPANAN POKOK' }), one, []), 'REQUEST_TYPE_UNSUPPORTED');
  fail(() => planDeductionApprove(req({ docNo: `PSS${'a'.repeat(32)}00000` }), one, []), 'REQUEST_TYPE_UNSUPPORTED');
  fail(() => planDeductionApprove(req(), [...one, { ...one[0], id: 9002 }], []), 'REQUEST_MEMBER_INVALID');
  fail(() => planDeductionApprove(req(), [{ ...one[0], status: 'RESIGN' }], []), 'REQUEST_MEMBER_INVALID');
  fail(() => planDeductionApprove(req({ requestedRp: '120000.00' }), one, [{ id: 7, status: 1, payroll: '150000.00' }]), 'REQUEST_AMOUNT_INVALID');
  fail(() => planDeductionApprove(req({ requestedRp: '150000.50' }), one, []), 'REQUEST_AMOUNT_INVALID');
  fail(() => planDeductionApprove(req({ docDate: '0000-00-00' }), one, []), 'REQUEST_STATE_INCONSISTENT');
  assert.deepEqual(planDeductionReject(req()), { from: 'OPEN', to: 'REJECTED' });
  fail(() => planDeductionReject(req({ status: 'REJECTED' })), 'REQUEST_STATUS_INVALID');
});
