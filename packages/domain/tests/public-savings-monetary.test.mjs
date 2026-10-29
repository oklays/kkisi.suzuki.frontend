import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMonetaryPolicy, validateSavingsAmount, evaluateDeductionChange, isStaffAssistedOutcome } from '../src/kosipa/savings-monetary.ts';
import { PSS_POLICY_V1, PSS_POLICY_V1_VERSION, resolveApprovedPolicy } from '../src/kosipa/savings-policy.ts';
import { evaluatePublicSavingsSubmission } from '../src/kosipa/savings-application.ts';

// CP1-T01B-1: B-01/B-02 of KKISI-PSS-2026-V1 v1.0.0. Every expected outcome below is taken from the approved acceptance examples.
const P = PSS_POLICY_V1;
const clone = (v) => JSON.parse(JSON.stringify(v));
const amount = (v) => validateSavingsAmount(v, P);
const change = (existing, v) => evaluateDeductionChange(existing, v, P);
const AMOUNT = (value) => ({ kind: 'AMOUNT', value });
const err = (r, code, field) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code); if (field) assert.equal(r.error.field, field); assert.equal('value' in r, false); };
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.value.submissionAuthorized, false); assert.equal(r.value.policyVersion, PSS_POLICY_V1_VERSION); return r.value; };

test('B-01 approved values are the registered policy and the only accepted source of rules', () => {
  const v = ok(validateMonetaryPolicy(P));
  assert.deepEqual([v.minAmount, v.increment, v.incrementBasis, v.maxAmount, v.technicalMaxAmount, v.currency], ['10000', '1000', 'ZERO', '5000000', '5000000', 'IDR']);
  assert.equal(resolveApprovedPolicy(clone(P)).ok, true, 'an exact copy of the registered approved policy is accepted');
  assert.ok(Object.isFrozen(P.rules.monetary), 'approved values cannot be mutated at runtime');
});

test('registered policy matching rejects nested accessors and hostile metadata without executing getters', () => {
  let reads = 0;
  const accessor = clone(P);
  Object.defineProperty(accessor.rules.monetary, 'minAmount', { enumerable: true, get() { reads++; return '10000'; } });
  err(resolveApprovedPolicy(accessor), 'POLICY_UNAPPROVED');
  assert.equal(reads, 0);
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  const hostile = clone(P); hostile.rules.monetary = proxy;
  err(resolveApprovedPolicy(hostile), 'POLICY_UNAPPROVED');
});

test('provisional, synthetic, revoked or altered policies stay rejected (fail closed)', () => {
  const proposed = { ...clone(P), approvalState: 'PROPOSED', approval: null };
  const revoked = { ...clone(P), approvalState: 'REVOKED', approval: null };
  const altered = clone(P); altered.rules.monetary.maxAmount = '9000000';
  const forged = { ...clone(P), policyVersion: 'SYNTHETIC_UNAPPROVED_FIXTURE/v1' };
  const extraField = clone(P); extraField.rules.monetary.fixtureLabel = 'SYNTHETIC_UNAPPROVED_FIXTURE';
  const otherApproval = clone(P); otherApproval.approval.evidenceRef = 'other';
  for (const p of [proposed, revoked, altered, forged, extraField, otherApproval, null, undefined, 'policy', []]) {
    err(validateMonetaryPolicy(p), 'POLICY_UNAPPROVED');
    err(validateSavingsAmount('10000', p), 'POLICY_UNAPPROVED');
    err(evaluateDeductionChange(AMOUNT('0'), '10000', p), 'POLICY_UNAPPROVED');
  }
  err(validateMonetaryPolicy({ ...clone(P), contractVersion: 'public-savings-policy/v0' }), 'CONTRACT_VERSION_UNSUPPORTED');
});

test('B-01 acceptance examples: 10.000 / 11.000 / 5.000.000 valid; 10.500 invalid increment; 5.001.000 exceeds maximum; 0 staff-assisted', () => {
  for (const v of ['10000', '11000', '5000000', '4999000', '25000']) assert.equal(ok(amount(v)).amount, v);
  err(amount('10500'), 'INVALID_INCREMENT', 'amountRupiah');
  err(amount('5001000'), 'AMOUNT_EXCEEDS_MAXIMUM', 'amountRupiah');
  err(amount('5000500'), 'AMOUNT_EXCEEDS_MAXIMUM', 'amountRupiah');
  err(amount('0'), 'ASSISTED_REQUIRED', 'amountRupiah');
  err(amount('9000'), 'AMOUNT_BELOW_MINIMUM', 'amountRupiah');
  err(amount('1000'), 'AMOUNT_BELOW_MINIMUM', 'amountRupiah');
  for (const code of ['ASSISTED_REQUIRED', 'AMOUNT_BELOW_MINIMUM', 'AMOUNT_EXCEEDS_MAXIMUM', 'SELF_SERVICE_DENIED']) assert.equal(isStaffAssistedOutcome(code), true, `${code} routes to staff, never truncated`);
  for (const code of ['INVALID_AMOUNT', 'INVALID_INCREMENT', 'UNCHANGED_REJECTED', 'POLICY_UNAPPROVED']) assert.equal(isStaffAssistedOutcome(code), false);
});

test('B-01 representation: negative, decimal, scientific, NaN, Infinity, separators, leading zeros and non-strings are INVALID_AMOUNT', () => {
  for (const v of ['-10000', '10000.00', '10000,00', '1e4', '1E4', 'NaN', 'Infinity', '10.000', '10 000', ' 10000', '010000', '+10000', '１００００', '', NaN, Infinity, 10000, BigInt(10000), null, undefined, {}, ['10000']]) {
    err(amount(v), 'INVALID_AMOUNT', 'amountRupiah');
  }
  err(amount('9'.repeat(400)), 'AMOUNT_EXCEEDS_MAXIMUM', 'amountRupiah');   // compared as a canonical string before any BigInt conversion
});

test('B-02 exact comparison examples: increase, decrease, unchanged rejected', () => {
  const inc = ok(change(AMOUNT('100000'), '150000'));
  assert.equal(inc.direction, 'INCREASE'); assert.equal(inc.existing.original, '100000');
  assert.equal(ok(change(AMOUNT('150000'), '100000')).direction, 'DECREASE');
  err(change(AMOUNT('100000'), '100000'), 'UNCHANGED_REJECTED', 'amountRupiah');
  err(change(AMOUNT('100000.00'), '100000'), 'UNCHANGED_REJECTED', 'amountRupiah');
});

test('B-02 existing fractional deductions: zero fraction compares exactly; any non-zero fraction is staff-assisted, never rounded', () => {
  const v = ok(change(AMOUNT('1000.00'), '20000'));
  assert.equal(v.direction, 'INCREASE'); assert.equal(v.existing.original, '1000.00', 'legacy value preserved verbatim');
  // the approved examples (1.000,49 / 1.000,50 -> 2.000) are fractional legacy values: staff-assisted before any amount rule applies
  err(change(AMOUNT('1000.49'), '2000'), 'ASSISTED_REQUIRED', 'existingAmount');
  err(change(AMOUNT('1000.50'), '2000'), 'ASSISTED_REQUIRED', 'existingAmount');
  err(change(AMOUNT('150000.01'), '150000'), 'ASSISTED_REQUIRED', 'existingAmount');
  err(change(AMOUNT('100000.5'), '100000'), 'ASSISTED_REQUIRED', 'existingAmount');
});

test('B-02 approved example 1.000,00 -> 2.000 is valid only "if other policy constraints pass": 2.000 is below the B-01 minimum', () => {
  err(change(AMOUNT('1000.00'), '2000'), 'AMOUNT_BELOW_MINIMUM', 'amountRupiah');
  assert.equal(ok(change(AMOUNT('1000.00'), '10000')).direction, 'INCREASE');
});

test('B-02 first enrollment, unknown current and zero target', () => {
  const first = ok(change({ kind: 'VERIFIED_NONE' }, '10000'));
  assert.equal(first.direction, 'INCREASE'); assert.equal(first.existing.kind, 'VERIFIED_NONE'); assert.equal(first.existing.original, null);
  err(change({ kind: 'UNKNOWN' }, '10000'), 'SELF_SERVICE_DENIED', 'existingAmount');
  err(change(AMOUNT('100000'), '0'), 'ASSISTED_REQUIRED', 'amountRupiah');
  err(change({ kind: 'VERIFIED_NONE' }, '0'), 'ASSISTED_REQUIRED', 'amountRupiah');
});

test('B-01 maximum is not retroactive: an existing deduction above 5.000.000 may be decreased to an allowed amount', () => {
  assert.equal(ok(change(AMOUNT('7500000'), '5000000')).direction, 'DECREASE');
  err(change(AMOUNT('7500000'), '7500000'), 'AMOUNT_EXCEEDS_MAXIMUM', 'amountRupiah');
});

test('malformed existing facts are refused, never coerced', () => {
  for (const e of [undefined, null, '100000', { kind: 'AMOUNT' }, { kind: 'AMOUNT', value: 100000 }, { kind: 'AMOUNT', value: '-1' }, { kind: 'AMOUNT', value: '1.2.3' },
    { kind: 'AMOUNT', value: '1.' }, { kind: 'AMOUNT', value: '.5' }, { kind: 'AMOUNT', value: '01000' }, { kind: 'AMOUNT', value: '1e5' }, { kind: 'AMOUNT', value: '1'.repeat(40) },
    { kind: 'AMOUNT', value: '100000', extra: true }, { kind: 'ZERO' }, Object.assign(Object.create({ kind: 'AMOUNT' }), { value: '1' })]) {
    err(change(e, '10000'), 'LEGACY_AMOUNT_INVALID', 'existingAmount');
  }
});

test('evaluation is deterministic, does not mutate inputs and the public submission evaluator stays fail-closed', () => {
  const e = AMOUNT('100000'); const before = JSON.stringify(e);
  assert.deepEqual(change(e, '150000'), change(e, '150000')); assert.equal(JSON.stringify(e), before);
  const draft = { amountRupiah: '150000', sectionId: 'S', startMonth: '11', startYear: '2026', consent: true, consentVersion: 'c1', formVersion: 'f1', signature: { reference: 'r', contentHash: 'h' } };
  err(evaluatePublicSavingsSubmission(draft, P), 'POLICY_NOT_IMPLEMENTED');
});
