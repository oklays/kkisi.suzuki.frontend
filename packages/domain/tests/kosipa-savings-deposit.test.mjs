import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVINGS_DEPOSIT, parseDepositCreate, parseDepositDecision, planDepositCreate, planDepositApprove, planDepositReject, depositLedgerSummary } from '../src/kosipa/savings-deposit.ts';
import { DOCUMENT_NUMBER_SCHEMES, formatDocumentNumber } from '../src/kosipa/document-number.ts';

const KEY = '00000000-0000-4000-8000-000000000001';
const V = 'c'.repeat(64);
const today = '2026-11-07';
const fail = (fn, code) => assert.throws(fn, (e) => e.code === code, code);
const body = (extra = {}) => ({ memberId: '9101', docDate: '2026-11-07', paymentType: 'TRANSFER', amount: '150000.50', bankName: 'BANK SYNTH', bankAccount: '123-456', remarks: 'Setoran bulanan', idempotencyKey: KEY, ...extra });
const member = (extra = {}) => ({ id: 9101, nik: 'SKFA0001', name: 'SYNTH ANGGOTA', group: 'ANGGOTA', status: 'AKTIVE', ...extra });
const doc = (extra = {}, lines = [{ kredit: '0', kreditCash: '150000.50', debit: '0', status: 'POSTING' }]) => ({ id: 77, docNo: 'TFCSH20261100077', docType: 'KREDIT', kind: 'CASH/TRANSFER', type: 'SIMPANAN SUKARELA', status: 'POSTING', docDate: '2026-11-07', lines, ...extra });

test('legacy contract constants (sim_setor_c): voluntary savings only, KREDIT + CASH/TRANSFER, POSTING until approved; TFCSH numbering', () => {
  assert.deepEqual(SAVINGS_DEPOSIT, { jenisSimpanan: 'SIMPANAN SUKARELA', docType: 'KREDIT', jenisTransaksi: 'CASH/TRANSFER', pending: 'POSTING', approved: 'APPROVED', rejected: 'REJECTED' });
  const scheme = DOCUMENT_NUMBER_SCHEMES['savings-cash-transfer'];
  assert.deepEqual([scheme.prefix, scheme.width, scheme.strategy, scheme.period, scheme.table, scheme.column], ['TFCSH', 5, 'row-id', 'clock', 'trans_simpanan', 'doc_no']);
  assert.equal(formatDocumentNumber(scheme, '202611', 77), 'TFCSH20261100077');
});

test('create: exact amount, current Jakarta month only (FD-36), method enum, bank details only for transfers, short printable remarks', () => {
  assert.deepEqual(parseDepositCreate(body(), today), { memberId: 9101, docDate: '2026-11-07', paymentType: 'TRANSFER', amount: '150000.5', bankName: 'BANK SYNTH', bankAccount: '123-456', remarks: 'Setoran bulanan', idempotencyKey: KEY });
  assert.equal(parseDepositCreate(body({ docDate: '2026-11-01' }), today).docDate, '2026-11-01');
  for (const docDate of ['2026-10-31', '2026-11-08', '2025-11-07', '2026-02-30', '07-11-2026', '']) fail(() => parseDepositCreate(body({ docDate }), today), 'SAVINGS_DATE_INVALID');
  for (const amount of ['0', '0.00', '-1', '1,5', '1.234', '10000000000000.01', 'abc', 5]) fail(() => parseDepositCreate(body({ amount }), today), 'SAVINGS_AMOUNT_INVALID');
  assert.equal(parseDepositCreate(body({ amount: '0010000.00' }), today).amount, '10000');
  fail(() => parseDepositCreate(body({ paymentType: 'GIRO' }), today), 'SAVINGS_FIELD_INVALID');
  const cash = parseDepositCreate(body({ paymentType: 'CASH', bankName: '', bankAccount: '' }), today);
  assert.equal(cash.bankName, ''); assert.equal(cash.bankAccount, '');
  fail(() => parseDepositCreate(body({ paymentType: 'CASH' }), today), 'SAVINGS_FIELD_INVALID');
  fail(() => parseDepositCreate(body({ remarks: 'x'.repeat(51) }), today), 'SAVINGS_FIELD_INVALID');
  fail(() => parseDepositCreate(body({ bankAccount: 'x'.repeat(51) }), today), 'SAVINGS_FIELD_INVALID');
  fail(() => parseDepositCreate(body({ remarks: 'a\u0000b' }), today), 'SAVINGS_FIELD_INVALID');
  for (const memberId of ['0', '-1', '1 OR 1=1', 'abc']) fail(() => parseDepositCreate(body({ memberId }), today), 'MEMBER_ID_INVALID');
  fail(() => parseDepositCreate(body({ jenisSimpanan: 'SIMPANAN POKOK' }), today), 'FIELD_NOT_ALLOWED');
  fail(() => parseDepositCreate(body({ status: 'APPROVED' }), today), 'FIELD_NOT_ALLOWED');
  fail(() => parseDepositCreate(body({ idempotencyKey: 'x' }), today), 'IDEMPOTENCY_KEY_INVALID');
  fail(() => parseDepositCreate(null, today), 'INVALID_INPUT');
});

test('create plan: member must exist, fit the line columns and not have left; the voluntary-savings product must exist and be active', () => {
  const input = parseDepositCreate(body(), today);
  const plan = planDepositCreate(input, member(), { code: 'SIMPANAN SUKARELA', active: true });
  assert.deepEqual(plan, { nik: 'SKFA0001', name: 'SYNTH ANGGOTA', group: 'ANGGOTA', periodYear: '2026', periodMonth: '11' });
  fail(() => planDepositCreate(input, null, { code: 'SIMPANAN SUKARELA', active: true }), 'MEMBER_NOT_FOUND');
  for (const status of ['RESIGN', 'PENSIUN']) fail(() => planDepositCreate(input, member({ status }), { code: 'SIMPANAN SUKARELA', active: true }), 'SAVINGS_MEMBER_INACTIVE');
  for (const status of ['AKTIVE', 'LUAR BIASA', 'KONTRAK']) assert.ok(planDepositCreate(input, member({ status }), { code: 'SIMPANAN SUKARELA', active: true }));
  fail(() => planDepositCreate(input, member({ nik: '12345678901' }), { code: 'SIMPANAN SUKARELA', active: true }), 'SAVINGS_NIK_TOO_LONG');
  fail(() => planDepositCreate(input, member({ nik: '' }), { code: 'SIMPANAN SUKARELA', active: true }), 'SAVINGS_NIK_TOO_LONG');
  fail(() => planDepositCreate(input, member(), null), 'SAVINGS_PRODUCT_INACTIVE');
  fail(() => planDepositCreate(input, member(), { code: 'SIMPANAN SUKARELA', active: false }), 'SAVINGS_PRODUCT_INACTIVE');
});

test('approve: only a pending cash/transfer deposit with valid credit lines; maker ≠ checker (FD-35); legacy-created documents (no native maker) may be approved', () => {
  assert.deepEqual(planDepositApprove(doc(), 20, 31), { from: 'POSTING', to: 'APPROVED', lines: 1, total: '150000.5' });
  fail(() => planDepositApprove(doc(), 31, 31), 'SAVINGS_MAKER_CHECKER');
  assert.equal(planDepositApprove(doc(), 31, null).to, 'APPROVED', 'legacy-created: no maker in the ledger (FD-17 c)');
  assert.equal(planDepositApprove(doc({}, [{ kredit: '0', kreditCash: '10', debit: '0', status: null }]), 20, null).to, 'APPROVED', 'legacy lines carry no status until approval');
  fail(() => planDepositApprove(null, 20, null), 'SAVINGS_DOC_NOT_FOUND');
  for (const status of ['APPROVED', 'REJECTED', 'OPEN']) fail(() => planDepositApprove(doc({ status }), 20, null), 'SAVINGS_STATUS_INVALID');
  fail(() => planDepositApprove(doc({ kind: 'SALDO AWAL' }), 20, null), 'SAVINGS_NOT_A_DEPOSIT');
  fail(() => planDepositApprove(doc({ docType: 'DEBIT' }), 20, null), 'SAVINGS_NOT_A_DEPOSIT');
  fail(() => planDepositApprove(doc({}, []), 20, null), 'SAVINGS_LINES_INVALID');
  fail(() => planDepositApprove(doc({}, [{ kredit: '0', kreditCash: '0', debit: '0', status: 'POSTING' }]), 20, null), 'SAVINGS_LINES_INVALID');
  fail(() => planDepositApprove(doc({}, [{ kredit: '0', kreditCash: '10', debit: '5', status: 'POSTING' }]), 20, null), 'SAVINGS_LINES_INVALID');
  fail(() => planDepositApprove(doc({}, [{ kredit: '0', kreditCash: '10', debit: '0', status: 'APPROVED' }]), 20, null), 'SAVINGS_LINES_INVALID', 'a line already in another state means the document diverged');
});

test('reject (FD-37): pending only, reason mandatory; decisions are exact bodies; ledger summary has no personal data', () => {
  assert.deepEqual(parseDepositDecision({ expectedVersion: V, idempotencyKey: KEY }, false), { expectedVersion: V, idempotencyKey: KEY });
  assert.deepEqual(parseDepositDecision({ expectedVersion: V, reason: 'Nominal salah ketik', idempotencyKey: KEY }, true), { expectedVersion: V, reason: 'Nominal salah ketik', idempotencyKey: KEY });
  fail(() => parseDepositDecision({ expectedVersion: V, idempotencyKey: KEY }, true), 'REASON_INVALID');
  fail(() => parseDepositDecision({ expectedVersion: 'x', idempotencyKey: KEY }, false), 'VERSION_INVALID');
  fail(() => parseDepositDecision({ expectedVersion: V, idempotencyKey: KEY, amount: '1' }, false), 'FIELD_NOT_ALLOWED');
  assert.deepEqual(planDepositReject(doc()), { from: 'POSTING', to: 'REJECTED', lines: 1, total: '150000.5' });
  fail(() => planDepositReject(doc({ status: 'APPROVED' })), 'SAVINGS_STATUS_INVALID');
  const s = depositLedgerSummary(doc(), 'APPROVED');
  assert.deepEqual(s, { id: 77, doc_no: 'TFCSH20261100077', status: 'APPROVED', lines: 1, total: '150000.5', jenis_simpanan: 'SIMPANAN SUKARELA' });
});
