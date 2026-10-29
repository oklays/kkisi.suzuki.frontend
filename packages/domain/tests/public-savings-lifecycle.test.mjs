import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDuplicateConflict, nextSubmissionState, isStaleSubmission } from '../src/kosipa/savings-lifecycle.ts';
import { evaluateLinkState, evaluateOtpResend, evaluateOtpAttempt, carryFailedAttempts, evaluateVerificationProof } from '../src/kosipa/savings-link.ts';
import { PSS_POLICY_V1 } from '../src/kosipa/savings-policy.ts';

const P = PSS_POLICY_V1; const MIN = 60000; const H = 3600000; const DAY = 24 * H; const NOW = Date.UTC(2026, 9, 24, 3);
const err = (r, code, field) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code); if (field) assert.equal(r.error.field, field); };
const req = (state, period = { year: 2026, month: 11 }, memberRef = 'm1') => ({ memberRef, channel: 'MOBILE', state, period });

test('B-05: one active change request per member across channels and periods; blocking states block', () => {
  for (const s of ['PENDING_VALIDATION', 'PENDING_REVIEW', 'OPEN', 'POSTING', 'APPROVED_NOT_POSTED']) {
    err(evaluateDuplicateConflict('m1', [req(s, { year: 2027, month: 3 })], { year: 2026, month: 11 }, P), 'PENDING_CONFLICT', 'state');
  }
  assert.equal(evaluateDuplicateConflict('m1', [], { year: 2026, month: 11 }, P).ok, true);
  assert.equal(evaluateDuplicateConflict('m1', [req('REJECTED'), req('CANCELLED'), req('POSTED_CONFIRMED', { year: 2026, month: 10 })], { year: 2026, month: 11 }, P).ok, true);
});

test('B-05: POSTED_CONFIRMED releases the block except for the same payroll period; unknown states block (fail closed)', () => {
  err(evaluateDuplicateConflict('m1', [req('POSTED_CONFIRMED', { year: 2026, month: 11 })], { year: 2026, month: 11 }, P), 'PENDING_CONFLICT', 'period');
  err(evaluateDuplicateConflict('m1', [req('SOMETHING_NEW')], { year: 2026, month: 11 }, P), 'PENDING_CONFLICT', 'state');
  err(evaluateDuplicateConflict('m1', [req('OPEN', undefined, 'm2')], { year: 2026, month: 11 }, P), 'INVALID_INPUT', 'requests');   // keyed by canonical member id, never NIK
  err(evaluateDuplicateConflict('', [], { year: 2026, month: 11 }, P), 'INVALID_INPUT', 'memberRef');
});

test('§16 lifecycle: allowed logical transitions only; consumed/terminal states never reopen', () => {
  const path = [['ISSUED', 'VERIFY', 'VERIFIED'], ['VERIFIED', 'REVIEW', 'REVIEWED'], ['REVIEWED', 'SUBMIT', 'SUBMITTED'], ['SUBMITTED', 'QUEUE_FOR_APPROVAL', 'PENDING_APPROVAL'],
    ['PENDING_APPROVAL', 'APPROVE', 'APPROVED'], ['APPROVED', 'START_POSTING', 'POSTING'], ['POSTING', 'CONFIRM_POSTED', 'POSTED_CONFIRMED'], ['PENDING_APPROVAL', 'REJECT', 'REJECTED'],
    ['ISSUED', 'REVOKE', 'REVOKED'], ['VERIFIED', 'EXPIRE', 'EXPIRED'], ['PENDING_APPROVAL', 'CANCEL', 'CANCELLED']];
  for (const [from, ev, to] of path) { const r = nextSubmissionState(from, ev); assert.equal(r.ok, true, `${from}+${ev}`); assert.equal(r.value, to); }
  for (const [from, ev] of [['SUBMITTED', 'REVIEW'], ['REJECTED', 'APPROVE'], ['POSTED_CONFIRMED', 'CANCEL'], ['REVOKED', 'VERIFY'], ['EXPIRED', 'SUBMIT'], ['APPROVED', 'SUBMIT'], ['ISSUED', 'APPROVE']]) {
    err(nextSubmissionState(from, ev), 'INVALID_TRANSITION');
  }
  err(nextSubmissionState('NOPE', 'VERIFY'), 'INVALID_INPUT', 'state');
});

test('§16: unresolved for more than 30 calendar days -> staff review, never automatic', () => {
  assert.equal(isStaleSubmission(NOW - 30 * DAY, NOW, P), false); assert.equal(isStaleSubmission(NOW - 30 * DAY - 1, NOW, P), true);
});

const link = (o = {}) => ({ memberRef: 'm1', purpose: 'PUBLIC_SAVINGS_DEDUCTION_CHANGE', issuedAtEpochMs: NOW - H, expiresAtEpochMs: NOW - H + 48 * H, consumedAtEpochMs: null, revokedAtEpochMs: null, ...o });
const expect = { memberRef: 'm1', purpose: 'PUBLIC_SAVINGS_DEDUCTION_CHANGE' };

test('B-07 link: 48 h validity, no extension, single use, binding; consumed > revoked > expired precedence', () => {
  assert.equal(evaluateLinkState(link(), expect, NOW, P).value, 'ACTIVE');
  err(evaluateLinkState(link({ issuedAtEpochMs: NOW - 48 * H, expiresAtEpochMs: NOW }), expect, NOW, P), 'LINK_EXPIRED');
  err(evaluateLinkState(link({ expiresAtEpochMs: NOW - H + 49 * H }), expect, NOW, P), 'LINK_INVALID', 'expiresAt');   // extension not allowed
  err(evaluateLinkState(link({ revokedAtEpochMs: NOW - 1 }), expect, NOW, P), 'LINK_REVOKED');
  err(evaluateLinkState(link({ consumedAtEpochMs: NOW - 1, revokedAtEpochMs: NOW - 2, issuedAtEpochMs: NOW - 60 * H, expiresAtEpochMs: NOW - 12 * H }), expect, NOW, P), 'LINK_CONSUMED');
  err(evaluateLinkState(link({ revokedAtEpochMs: NOW - 1, issuedAtEpochMs: NOW - 60 * H, expiresAtEpochMs: NOW - 12 * H }), expect, NOW, P), 'LINK_REVOKED');
  err(evaluateLinkState(link(), { ...expect, memberRef: 'm2' }, NOW, P), 'LINK_INVALID', 'binding');
  err(evaluateLinkState(link(), { ...expect, purpose: 'OTHER' }, NOW, P), 'LINK_INVALID', 'binding');
  err(evaluateLinkState(link({ issuedAtEpochMs: NOW + H, expiresAtEpochMs: NOW + 49 * H }), expect, NOW, P), 'LINK_INVALID', 'issuedAt');
});

test('B-07 OTP resend: >=60 s apart, <=3 per link per 15 min, <=5 per member per hour', () => {
  const ok = (linkSends, memberSends) => evaluateOtpResend({ linkSendTimesEpochMs: linkSends, memberSendTimesEpochMs: memberSends }, NOW, P);
  assert.equal(ok([], []).ok, true);
  err(ok([NOW - 59000], [NOW - 59000]), 'RESEND_TOO_SOON');
  assert.equal(ok([NOW - 60000], [NOW - 60000]).ok, true);
  err(ok([NOW - 14 * MIN, NOW - 10 * MIN, NOW - 5 * MIN], [NOW - 14 * MIN, NOW - 10 * MIN, NOW - 5 * MIN]), 'RESEND_LIMIT', 'link');
  assert.equal(ok([NOW - 16 * MIN, NOW - 10 * MIN, NOW - 5 * MIN], [NOW - 16 * MIN, NOW - 10 * MIN, NOW - 5 * MIN]).ok, true);
  err(ok([NOW - 2 * MIN], [NOW - 50 * MIN, NOW - 40 * MIN, NOW - 30 * MIN, NOW - 20 * MIN, NOW - 2 * MIN]), 'RESEND_LIMIT', 'member');
});

test('B-07 OTP attempt: 5 minutes, 5 failures per verification lifecycle (not reset by resend), single use, superseded on resend', () => {
  const ch = (o = {}) => ({ issuedAtEpochMs: NOW - MIN, failedAttempts: 0, usedAtEpochMs: null, superseded: false, ...o });
  assert.equal(evaluateOtpAttempt(ch(), NOW, P).ok, true);
  err(evaluateOtpAttempt(ch({ issuedAtEpochMs: NOW - 5 * MIN }), NOW, P), 'CHALLENGE_EXPIRED');
  err(evaluateOtpAttempt(ch({ failedAttempts: 5 }), NOW, P), 'CHALLENGE_LOCKED');
  assert.equal(evaluateOtpAttempt(ch({ failedAttempts: 4 }), NOW, P).ok, true);
  err(evaluateOtpAttempt(ch({ usedAtEpochMs: NOW - 1 }), NOW, P), 'CHALLENGE_USED');
  err(evaluateOtpAttempt(ch({ superseded: true }), NOW, P), 'CHALLENGE_SUPERSEDED');
  assert.equal(carryFailedAttempts(ch({ failedAttempts: 3 })), 3, 'a resend never resets the failure count');
});

test('B-07/B-10 proof: at most 15 minutes, never beyond link expiry, bound to member, link and contact version', () => {
  const pr = (o = {}) => ({ memberRef: 'm1', linkRef: 'l1', contactVersion: 'c3', verifiedAtEpochMs: NOW - MIN, ...o });
  const ctx = { memberRef: 'm1', linkRef: 'l1', contactVersion: 'c3', linkExpiresAtEpochMs: NOW + H };
  assert.equal(evaluateVerificationProof(pr(), ctx, NOW, P).ok, true);
  err(evaluateVerificationProof(pr({ verifiedAtEpochMs: NOW - 15 * MIN }), ctx, NOW, P), 'PROOF_EXPIRED');
  err(evaluateVerificationProof(pr(), { ...ctx, linkExpiresAtEpochMs: NOW }, NOW, P), 'PROOF_EXPIRED');
  err(evaluateVerificationProof(pr({ contactVersion: 'c2' }), ctx, NOW, P), 'VERIFICATION_REQUIRED', 'binding');   // contact change invalidates proof
  err(evaluateVerificationProof(pr({ linkRef: 'l0' }), ctx, NOW, P), 'VERIFICATION_REQUIRED', 'binding');
});
