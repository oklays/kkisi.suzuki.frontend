import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSubmissionSnapshot, canonicalSnapshot, materialChanges } from '../src/kosipa/savings-snapshot.ts';
import { idempotencyDecision, resolveUncertainCommit } from '../src/kosipa/savings-idempotency.ts';
import { canPerform, resolveNotificationRecipients, isEscalationDue } from '../src/kosipa/savings-access.ts';
import { PSS_POLICY_V1, PSS_POLICY_V1_VERSION } from '../src/kosipa/savings-policy.ts';

const P = PSS_POLICY_V1; const NOW = Date.UTC(2026, 9, 24, 3);
const err = (r, code, field) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code); if (field) assert.equal(r.error.field, field); };
const sig = (o = {}) => ({ format: 'PNG', decodedBytes: 20480, width: 600, height: 200, contentDigest: 'sha256:aa', storageRef: 'private:sig/1', ...o });
const input = (o = {}) => ({
  memberRef: 'm1', sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', originalDeduction: '100000.00', requestedAmount: '150000', requestedPeriod: { year: 2026, month: 11 },
  effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL', consentTextVersion: 'consent-v1', formVersion: 'form-v1', consent: true,
  submittedAtEpochMs: NOW, verification: { proofRef: 'proof-1', contactVersion: 'c3', method: 'WHATSAPP_OTP_CHANNEL_POSSESSION' }, signature: sig(), ...o,
});

test('B-10/B-12: immutable snapshot carries every required evidence item and the policy version', () => {
  const r = buildSubmissionSnapshot(input(), P); assert.equal(r.ok, true, JSON.stringify(r));
  const s = r.value;
  assert.equal(s.policyVersion, PSS_POLICY_V1_VERSION); assert.equal(s.originalDeduction, '100000.00', 'legacy value preserved verbatim'); assert.equal(s.contractVersion, 'pss-snapshot/v2');
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.signature) && Object.isFrozen(s.verification));
  assert.equal(s.verification.method, 'WHATSAPP_OTP_CHANNEL_POSSESSION', 'never presented as two independent factors');
});

test('B-10: consent must be an explicit true (no prechecked/implicit consent); signature mandatory PNG within 1 MB decoded', () => {
  for (const consent of [false, 'true', 1, undefined]) err(buildSubmissionSnapshot(input({ consent }), P), 'CONSENT_REQUIRED', 'consent');
  err(buildSubmissionSnapshot(input({ signature: null }), P), 'SIGNATURE_REQUIRED', 'signature');
  err(buildSubmissionSnapshot(input({ signature: sig({ format: 'JPEG' }) }), P), 'SIGNATURE_INVALID', 'signature');
  assert.equal(buildSubmissionSnapshot(input({ signature: sig({ decodedBytes: 1048576 }) }), P).ok, true);
  err(buildSubmissionSnapshot(input({ signature: sig({ decodedBytes: 1048577 }) }), P), 'SIGNATURE_INVALID', 'signature');
  err(buildSubmissionSnapshot(input({ signature: sig({ width: 0 }) }), P), 'SIGNATURE_INVALID', 'signature');
  err(buildSubmissionSnapshot(input({ signature: sig({ storageRef: 'https://public.example/sig.png' }) }), P), 'SIGNATURE_INVALID', 'signature');
  err(buildSubmissionSnapshot(input({ requestedAmount: '150000.00' }), P), 'INVALID_INPUT', 'requestedAmount');
  err(buildSubmissionSnapshot({ ...input(), memberName: 'X' }, P), 'INVALID_INPUT');   // authoritative fields cannot be supplied by the member
});

test('canonical form is deterministic and order-independent; any material change is detected', () => {
  const a = buildSubmissionSnapshot(input(), P).value;
  const reordered = Object.fromEntries(Object.entries(input()).reverse());
  assert.equal(canonicalSnapshot(a), canonicalSnapshot(buildSubmissionSnapshot(reordered, P).value));
  assert.match(canonicalSnapshot(a), /^\{"contractVersion":"pss-snapshot\/v2",/);
  const b = buildSubmissionSnapshot(input({ requestedAmount: '160000' }), P).value;
  assert.notEqual(canonicalSnapshot(a), canonicalSnapshot(b));
  assert.deepEqual(materialChanges(a, b), ['requestedAmount']);
  assert.deepEqual(materialChanges(a, buildSubmissionSnapshot(input({ originalDeduction: '120000', consentTextVersion: 'consent-v2' }), P).value), ['originalDeduction', 'consentTextVersion']);
  assert.deepEqual(materialChanges(a, a), []);
});

test('B-11 idempotency: same scope+key+payload replays; changed payload conflicts; foreign scope never reveals a receipt', () => {
  const scope = { actorRef: 'link:l1', memberRef: 'm1', command: 'SUBMIT' };
  const stored = { scope, key: 'k-1', payloadFingerprint: 'sha256:aa', receiptRef: 'r-1' };
  assert.deepEqual(idempotencyDecision(null, { scope, key: 'k-1', payloadFingerprint: 'sha256:aa' }).value, { kind: 'NEW' });
  assert.deepEqual(idempotencyDecision(stored, { scope, key: 'k-1', payloadFingerprint: 'sha256:aa' }).value, { kind: 'REPLAY', receiptRef: 'r-1' });
  err(idempotencyDecision(stored, { scope, key: 'k-1', payloadFingerprint: 'sha256:bb' }), 'IDEMPOTENCY_CONFLICT');
  const other = idempotencyDecision(stored, { scope: { ...scope, memberRef: 'm2' }, key: 'k-1', payloadFingerprint: 'sha256:aa' });
  err(other, 'IDEMPOTENCY_CONFLICT'); assert.equal(JSON.stringify(other).includes('r-1'), false);
  err(idempotencyDecision(null, { scope, key: '', payloadFingerprint: 'x' }), 'INVALID_INPUT', 'key');
});

test('B-11 unknown commit: look up the original first; never blindly write again', () => {
  const req = { key: 'k-1', payloadFingerprint: 'sha256:aa' };
  assert.deepEqual(resolveUncertainCommit({ status: 'FOUND', payloadFingerprint: 'sha256:aa', receiptRef: 'r-1' }, req).value, { kind: 'REPLAY', receiptRef: 'r-1' });
  err(resolveUncertainCommit({ status: 'FOUND', payloadFingerprint: 'sha256:bb', receiptRef: 'r-1' }, req), 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(resolveUncertainCommit({ status: 'NOT_FOUND_AUTHORITATIVE' }, req).value, { kind: 'RETRY_SAME_KEY' });
  err(resolveUncertainCommit({ status: 'LOOKUP_UNAVAILABLE' }, req), 'COMMIT_OUTCOME_UNKNOWN');
  err(resolveUncertainCommit(null, req), 'COMMIT_OUTCOME_UNKNOWN');
});

const actor = (roles, o = {}) => ({ actorRef: 'u1', roles, branches: ['B1'], ...o });

test('snapshot v2 binds section/type to its digest and material-change detection', () => {
  const base = { ...input(), sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA' };
  const a = buildSubmissionSnapshot(base, P);
  assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(a.value.contractVersion, 'pss-snapshot/v2');
  const b = buildSubmissionSnapshot({ ...base, sectionId: 'section:2' }, P);
  assert.equal(b.ok, true); assert.notEqual(canonicalSnapshot(a.value), canonicalSnapshot(b.value));
  assert.deepEqual(materialChanges(a.value, b.value), ['sectionId']);
  for (const key of ['sectionId', 'savingsType']) {
    const missing = { ...base }; delete missing[key]; assert.equal(buildSubmissionSnapshot(missing, P).ok, false);
  }
  err(buildSubmissionSnapshot({ ...base, savingsType: 'SIMPANAN WAJIB' }, P), 'INVALID_INPUT', 'savingsType');
});
test('B-13 role-action matrix: least privilege, branch scoping, maker-checker, reasons, no financial approval in the console', () => {
  assert.equal(canPerform(actor(['STAFF_OPERATOR']), 'ISSUE_LINK', { branch: 'B1' }).ok, true);
  err(canPerform(actor(['STAFF_OPERATOR']), 'ISSUE_LINK', { branch: 'B2' }), 'FORBIDDEN', 'branch');
  err(canPerform(actor(['STAFF_VIEWER']), 'ISSUE_LINK', { branch: 'B1' }), 'FORBIDDEN', 'action');
  assert.equal(canPerform(actor(['STAFF_VIEWER']), 'VIEW_SUBMISSIONS', { branch: 'B1' }).ok, true);
  err(canPerform(actor(['STAFF_OPERATOR']), 'REVOKE_LINK', { branch: 'B1' }), 'REASON_REQUIRED');
  assert.equal(canPerform(actor(['STAFF_OPERATOR']), 'REVOKE_LINK', { branch: 'B1', reason: 'Nomor kontak berubah' }).ok, true);
  err(canPerform(actor(['MEMBERSHIP_VERIFIER']), 'REBIND_CONTACT_CHECK', { branch: 'B1', makerRef: 'u1' }), 'FORBIDDEN', 'makerChecker');
  assert.equal(canPerform(actor(['MEMBERSHIP_VERIFIER']), 'REBIND_CONTACT_CHECK', { branch: 'B1', makerRef: 'u9' }).ok, true);
  err(canPerform(actor(['KOSIPA_SUPERVISOR']), 'APPROVE_EXCEPTION', { branch: 'B1', makerRef: 'u1' }), 'FORBIDDEN', 'makerChecker');
  for (const role of ['SYSTEM_ADMIN', 'LEGACY_APPROVER', 'KOSIPA_SUPERVISOR']) err(canPerform(actor([role]), 'APPROVE_DEDUCTION', { branch: 'B1' }), 'LEGACY_CI2_ONLY');
  err(canPerform(actor(['SYSTEM_ADMIN']), 'APPROVE_EXCEPTION', { branch: 'B1', makerRef: 'u9' }), 'FORBIDDEN', 'action');
  assert.equal(canPerform(actor(['AUDITOR']), 'VIEW_AUDIT', { branch: 'B1' }).ok, true);
  err(canPerform(actor(['AUDITOR']), 'REVOKE_LINK', { branch: 'B1', reason: 'x' }), 'FORBIDDEN', 'action');
  err(canPerform(actor(['STAFF_OPERATOR'], { roles: ['UNKNOWN_ROLE'] }), 'VIEW_SUBMISSIONS', { branch: 'B1' }), 'FORBIDDEN', 'action');
});

test('B-14 routing: branch primary then supervisor/fallback backup from configuration; no hardcoded contacts; alert when none', () => {
  const dir = { B1: { primary: ['ops:B1:1', 'ops:B1:2'], backup: ['sup:1'] }, B2: { primary: [], backup: ['sup:1'] } };
  assert.deepEqual(resolveNotificationRecipients('B1', dir).value, { primary: ['ops:B1:1', 'ops:B1:2'], backup: ['sup:1'] });
  assert.deepEqual(resolveNotificationRecipients('B2', dir).value, { primary: [], backup: ['sup:1'] });
  err(resolveNotificationRecipients('B3', dir), 'ALERT_NO_RECIPIENT');
  err(resolveNotificationRecipients('B1', { B1: { primary: ['someone@example.com'], backup: [] } }), 'INVALID_INPUT', 'directory');   // logical references only
});

test('B-14 escalation: pending longer than two Asia/Jakarta business days (weekends and configured holidays excluded)', () => {
  const fri = Date.UTC(2026, 9, 23, 3);   // Friday 10:00 Jakarta
  assert.equal(isEscalationDue(fri, Date.UTC(2026, 9, 27, 2), [], P), false, 'Tue 09:00: Mon + part of Tue');
  assert.equal(isEscalationDue(fri, Date.UTC(2026, 9, 27, 3), [], P), false, 'Tue 10:00: exactly two business days is not longer than two');
  assert.equal(isEscalationDue(fri, Date.UTC(2026, 9, 27, 3, 1), [], P), true, 'Tue 10:01: longer than two business days');
  assert.equal(isEscalationDue(fri, Date.UTC(2026, 9, 27, 3, 1), ['2026-10-26'], P), false, 'Monday holiday not counted');
});
