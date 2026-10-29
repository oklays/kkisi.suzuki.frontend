import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSavingsFormFacts, validateSavingsFormBinding } from '../src/kosipa/savings-form-binding.ts';
import { PSS_POLICY_V1 } from '../src/kosipa/savings-policy.ts';

// Injected reference fixtures only: not attestation of an actual legacy mapping or operational control.
const facts = (o = {}) => ({ contractVersion: 'pss-form-facts/v1', referenceStatus: 'VERIFIED', sourceEvidenceRef: 'fixture:legacy-reference',
  memberRef: 'm1', sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', formVersion: 'form:1', consentTextVersion: 'consent:1', ...o });
const reviewed = (o = {}) => ({ memberRef: 'm1', sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', formVersion: 'form:1', consentTextVersion: 'consent:1', ...o });
const error = (r, code, field) => {
  assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code);
  if (field !== undefined) assert.equal(r.error.field, field);
};

test('approved B-06 authoritative facts bind only the requested canonical member; no normalization', () => {
  const r = resolveSavingsFormFacts(facts(), 'm1', PSS_POLICY_V1);
  assert.equal(r.ok, true); assert.ok(Object.isFrozen(r.value)); assert.equal(r.value.sourceEvidenceRef, 'fixture:legacy-reference');
  error(resolveSavingsFormFacts(facts({ memberRef: 'm2' }), 'm1', PSS_POLICY_V1), 'AUTHORITATIVE_FORM_UNVERIFIED');
  error(resolveSavingsFormFacts(facts({ memberRef: '01' }), '1', PSS_POLICY_V1), 'AUTHORITATIVE_FORM_UNVERIFIED');
});

test('missing, unverified, wrong-type or ambiguous reference facts fail closed', () => {
  for (const input of [undefined, null, {}, [], facts({ referenceStatus: 'UNVERIFIED' }), facts({ savingsType: 'SIMPANAN WAJIB' }), facts({ sectionId: '' }), facts({ sourceEvidenceRef: '' }), facts({ extra: true }), facts({ contractVersion: 'pss-form-facts/v2' })]) {
    error(resolveSavingsFormFacts(input, 'm1', PSS_POLICY_V1), 'AUTHORITATIVE_FORM_UNVERIFIED');
  }
  const inherited = facts(); Object.setPrototypeOf(inherited, { sectionId: 'section:1' }); delete inherited.sectionId;
  error(resolveSavingsFormFacts(inherited, 'm1', PSS_POLICY_V1), 'AUTHORITATIVE_FORM_UNVERIFIED');
});

test('every material authoritative field requires renewed review when it changes', () => {
  assert.equal(validateSavingsFormBinding(reviewed(), facts(), 'm1', PSS_POLICY_V1).ok, true);
  for (const field of ['memberRef', 'sectionId', 'savingsType', 'formVersion', 'consentTextVersion']) {
    error(validateSavingsFormBinding(reviewed({ [field]: 'changed' }), facts(), 'm1', PSS_POLICY_V1), 'FORM_CHANGED', field);
  }
});

test('malformed echoes and unapproved policy never pass binding; caller input remains unchanged', () => {
  const r = Object.freeze(reviewed()); const f = Object.freeze(facts());
  const before = JSON.stringify([r, f]);
  assert.deepEqual(validateSavingsFormBinding(r, f, 'm1', PSS_POLICY_V1), validateSavingsFormBinding(r, f, 'm1', PSS_POLICY_V1));
  assert.equal(JSON.stringify([r, f]), before);
  error(validateSavingsFormBinding({ ...r, recipient: 'forged' }, f, 'm1', PSS_POLICY_V1), 'INVALID_INPUT');
  error(resolveSavingsFormFacts(f, 'm1', { ...PSS_POLICY_V1, approvalState: 'PROPOSED', approval: null }), 'POLICY_UNAPPROVED');
});

test('revoked reference objects produce a typed closed result instead of an escaping exception', () => {
  const { proxy, revoke } = Proxy.revocable({}, {}); revoke();
  error(resolveSavingsFormFacts(proxy, 'm1', PSS_POLICY_V1), 'AUTHORITATIVE_FORM_UNVERIFIED');
});
