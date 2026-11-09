import test from 'node:test';
import assert from 'node:assert/strict';
import { LOAN_DECISION_STATUS, isLoanDecisionAction, loanDecisionOptions, loanDecisionSnapshot, parseLoanDecision, planLoanDecision } from '../src/kosipa/loan-decision.ts';
import { parseLoanListQuery, LOAN_PENDING_FILTER } from '../src/kosipa/loan-read.ts';

const KEY = '00000000-0000-4000-8000-000000000001';
const V = 'a'.repeat(64);
const fail = (fn, code) => assert.throws(fn, (e) => e.code === code, code);
const loan = (extra = {}) => ({ id: 9120, docNo: 'PIN20261100120', status: 'POSTING', disbursement: 'OPEN', repayment: 'BELUM LUNAS', planPrincipal: '6000000.00', type: 'PINJAMAN REGULAR', nik: 'SKFA0001', mobile: false, headerCount: 1, ...extra });
const ctx = (extra = {}) => ({ actorConsoleUserId: 20, posterConsoleUserId: null, members: [{ status: 'AKTIVE' }], mobileRequests: 0, ppobOrders: 0, ...extra });

test('actions and the legacy status vocabulary', () => {
  assert.deepEqual(LOAN_DECISION_STATUS, { open: 'OPEN', posting: 'POSTING', approved: 'APPROVED', rejected: 'REJECTED' });
  assert.ok(isLoanDecisionAction('post') && isLoanDecisionAction('approve') && isLoanDecisionAction('reject'));
  for (const a of ['APPROVED', 'posting', 'disburse', 'delete', '']) assert.equal(isLoanDecisionAction(a), false, a);
});

test('parse: version + key always; reason required (5-200) for reject and refused for post/approve; forged fields refused (ANO-K03)', () => {
  assert.deepEqual(parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY }, 'approve'), { expectedVersion: V, idempotencyKey: KEY });
  assert.deepEqual(parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY, reason: '  Gaji   tidak cukup ' }, 'reject'), { expectedVersion: V, idempotencyKey: KEY, reason: 'Gaji tidak cukup' });
  fail(() => parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY }, 'reject'), 'REASON_INVALID');
  fail(() => parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY, reason: 'abc' }, 'reject'), 'REASON_INVALID');
  fail(() => parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY, reason: 'x'.repeat(201) }, 'reject'), 'REASON_INVALID');
  fail(() => parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY, reason: 'catatan approve' }, 'approve'), 'FIELD_NOT_ALLOWED');
  for (const forged of ['doc_status', 'status', 'pengajuan_mobile', 'cd_usr', 'status_pencairan']) fail(() => parseLoanDecision({ expectedVersion: V, idempotencyKey: KEY, [forged]: 'APPROVED' }, 'approve'), 'FIELD_NOT_ALLOWED');
  fail(() => parseLoanDecision({ expectedVersion: 'abc', idempotencyKey: KEY }, 'post'), 'VERSION_INVALID');
  fail(() => parseLoanDecision({ expectedVersion: V, idempotencyKey: 'nope' }, 'post'), 'IDEMPOTENCY_KEY_INVALID');
  fail(() => parseLoanDecision(null, 'post'), 'INVALID_INPUT');
  fail(() => parseLoanDecision([], 'post'), 'INVALID_INPUT');
});

test('transitions: post OPEN->POSTING; approve/reject from OPEN or POSTING; decided documents and unknown statuses are immutable', () => {
  assert.deepEqual(planLoanDecision(loan({ status: 'OPEN' }), 'post', ctx()), { action: 'post', from: 'OPEN', to: 'POSTING', reason: null, stamp: 'posting', syncMobile: false });
  fail(() => planLoanDecision(loan({ status: 'POSTING' }), 'post', ctx()), 'LOAN_STATUS_INVALID');
  for (const status of ['OPEN', 'POSTING']) {
    assert.equal(planLoanDecision(loan({ status }), 'approve', ctx()).to, 'APPROVED');
    const r = planLoanDecision(loan({ status }), 'reject', ctx(), 'Berkas tidak lengkap');
    assert.deepEqual([r.to, r.reason, r.stamp], ['REJECTED', 'Berkas tidak lengkap', 'rejected']);
  }
  for (const status of ['APPROVED', 'REJECTED', null, '', 'approved', 'CANCELLED']) for (const action of ['post', 'approve', 'reject']) fail(() => planLoanDecision(loan({ status }), action, ctx(), 'alasan valid'), 'LOAN_STATUS_INVALID');
  fail(() => planLoanDecision(null, 'approve', ctx()), 'LOAN_NOT_FOUND');
  fail(() => planLoanDecision(loan(), 'reject', ctx()), 'REASON_INVALID');
});

test('integrity blockers apply to every action: duplicate doc_no, disbursed/settled while undecided, PPOB order, several mobile requests', () => {
  for (const action of ['approve', 'reject']) {
    fail(() => planLoanDecision(loan({ headerCount: 2 }), action, ctx(), 'alasan valid'), 'LOAN_DUPLICATE_HEADER');
    fail(() => planLoanDecision(loan({ disbursement: 'APPROVED' }), action, ctx(), 'alasan valid'), 'LOAN_STATE_INCONSISTENT');
    fail(() => planLoanDecision(loan({ repayment: 'LUNAS' }), action, ctx(), 'alasan valid'), 'LOAN_STATE_INCONSISTENT');
    fail(() => planLoanDecision(loan(), action, ctx({ ppobOrders: 1 }), 'alasan valid'), 'LOAN_PPOB_ORDER');
    fail(() => planLoanDecision(loan({ mobile: true }), action, ctx({ mobileRequests: 2 }), 'alasan valid'), 'LOAN_MOBILE_REQUEST_CONFLICT');
  }
  fail(() => planLoanDecision(loan({ status: 'OPEN', headerCount: 2 }), 'post', ctx()), 'LOAN_DUPLICATE_HEADER');
  // Not a mobile loan: stray request rows are irrelevant and never synchronised.
  assert.equal(planLoanDecision(loan({ mobile: false }), 'approve', ctx({ mobileRequests: 3 })).syncMobile, false);
});

test('mobile request: synchronised only for a stored mobile loan with exactly one request; a missing request does not block', () => {
  assert.equal(planLoanDecision(loan({ mobile: true }), 'approve', ctx({ mobileRequests: 1 })).syncMobile, true);
  assert.equal(planLoanDecision(loan({ mobile: true }), 'reject', ctx({ mobileRequests: 1 }), 'Plafon penuh').syncMobile, true);
  assert.equal(planLoanDecision(loan({ mobile: true }), 'approve', ctx({ mobileRequests: 0 })).syncMobile, false);
});

test('maker != checker (BR-105): the native poster cannot approve or reject; a legacy-posted loan (no native poster) can be decided (FD-17 c)', () => {
  fail(() => planLoanDecision(loan(), 'approve', ctx({ posterConsoleUserId: 20 })), 'LOAN_MAKER_CHECKER');
  fail(() => planLoanDecision(loan(), 'reject', ctx({ posterConsoleUserId: 20 }), 'alasan valid'), 'LOAN_MAKER_CHECKER');
  assert.equal(planLoanDecision(loan(), 'approve', ctx({ posterConsoleUserId: 31 })).to, 'APPROVED');
  assert.equal(planLoanDecision(loan(), 'approve', ctx({ posterConsoleUserId: null })).to, 'APPROVED');
});

test('approval only: positive principal and exactly one known member who has not left; rejection stays possible for exited members', () => {
  for (const planPrincipal of ['0', '0.00', '-5', '', 'abc', '  ']) fail(() => planLoanDecision(loan({ planPrincipal }), 'approve', ctx()), 'LOAN_AMOUNT_INVALID');
  assert.equal(planLoanDecision(loan({ planPrincipal: '0.01' }), 'approve', ctx()).to, 'APPROVED');
  fail(() => planLoanDecision(loan(), 'approve', ctx({ members: [] })), 'LOAN_MEMBER_NOT_FOUND');
  fail(() => planLoanDecision(loan(), 'approve', ctx({ members: [{ status: 'AKTIVE' }, { status: 'AKTIVE' }] })), 'LOAN_MEMBER_AMBIGUOUS');
  for (const status of ['RESIGN', 'PENSIUN', ' resign ']) fail(() => planLoanDecision(loan(), 'approve', ctx({ members: [{ status }] })), 'LOAN_MEMBER_INACTIVE');
  for (const status of ['AKTIVE', 'KONTRAK', 'LUAR BIASA', null]) assert.equal(planLoanDecision(loan(), 'approve', ctx({ members: [{ status }] })).to, 'APPROVED');
  assert.equal(planLoanDecision(loan({ planPrincipal: '0' }), 'reject', ctx({ members: [{ status: 'RESIGN' }] }), 'Anggota sudah keluar').to, 'REJECTED');
  assert.equal(planLoanDecision(loan({ status: 'OPEN', planPrincipal: '0' }), 'post', ctx({ members: [] })).to, 'POSTING');
});

test('options for the page: capability first, then the same planner; snapshot carries no member identity', () => {
  const all = { post: true, approve: true, reject: true };
  assert.deepEqual(loanDecisionOptions(loan({ status: 'OPEN' }), ctx(), all).map((o) => [o.action, o.allowed]), [['post', true], ['approve', true], ['reject', true]]);
  assert.deepEqual(loanDecisionOptions(loan(), ctx(), { post: true, approve: false, reject: false }).map((o) => o.blocker), ['LOAN_STATUS_INVALID', 'FORBIDDEN', 'FORBIDDEN']);
  assert.deepEqual(loanDecisionOptions(loan(), ctx({ posterConsoleUserId: 20 }), all).map((o) => o.blocker), ['LOAN_STATUS_INVALID', 'LOAN_MAKER_CHECKER', 'LOAN_MAKER_CHECKER']);
  const snap = loanDecisionSnapshot(loan({ mobile: true }), 'APPROVED');
  assert.deepEqual(snap, { id: 9120, doc_no: 'PIN20261100120', doc_status: 'APPROVED', status_pencairan: 'OPEN', status_bayar: 'BELUM LUNAS', plan_pinjaman: '6000000.00', jenis_pinjaman: 'PINJAMAN REGULAR', mobile: true });
  assert.ok(!JSON.stringify(snap).includes('SKFA'), 'no NIK in the ledger snapshot');
});

test('list filter: Menunggu keputusan = OPEN + POSTING; other statuses unchanged; unknown values still refused', () => {
  const q = parseLoanListQuery({ status: LOAN_PENDING_FILTER });
  assert.equal(q.pending, true); assert.equal(q.docStatus, null);
  const p = parseLoanListQuery({ status: 'POSTING' });
  assert.equal(p.pending, false); assert.equal(p.docStatus, 'POSTING');
  assert.throws(() => parseLoanListQuery({ status: 'PERLU' }), (e) => e.code === 'FILTER_INVALID');
});
