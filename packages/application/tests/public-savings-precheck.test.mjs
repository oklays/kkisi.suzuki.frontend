import assert from 'node:assert/strict';
import test from 'node:test';
import { precheckPublicSavingsChange } from '../src/kosipa/public-savings-precheck.ts';
import { PSS_POLICY_V1, PSS_POLICY_V1_VERSION } from '../../domain/src/kosipa/savings-policy.ts';

// CP1-T01B application contract: composes the approved domain rules over injected read ports. In-memory fakes only; no DB/HTTP/provider.
const NOW = Date.UTC(2026, 9, 24, 3); const DAY = 86400000;
const facts = { membershipStatus: 'AKTIVE', identity: 'UNIQUE', identifierMappingConflict: false, payrollRoster: 'ACTIVE', groupCode: 'G1', activePayrollEligibleGroups: ['G1'],
  branch: 'VALID', conflictingActiveSubmission: false, contact: { status: 'VERIFIED', verifiedAtEpochMs: NOW - DAY, provenanceRef: 'm:1', changedSinceVerification: false } };
const deps = (o = {}) => {
  const calls = [];
  const d = {
    calls,
    policies: { read: (v) => { calls.push(['policy', v]); return PSS_POLICY_V1; } },
    clock: { nowEpochMs: () => NOW },
    members: {
      readFormFacts: async (m) => { calls.push(['form', m]); return { contractVersion: 'pss-form-facts/v1', referenceStatus: 'VERIFIED', sourceEvidenceRef: 'fixture:legacy-reference', memberRef: m, sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', formVersion: 'form-v1', consentTextVersion: 'consent-v1' }; },
      readEligibilityFacts: async (m) => { calls.push(['facts', m]); return facts; },
      readExistingDeduction: async (m) => { calls.push(['deduction', m]); return { kind: 'AMOUNT', value: '100000' }; },
      readChangeRequests: async (m) => { calls.push(['requests', m]); return []; },
    },
    calendar: { read: async () => ({ source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR', verified: true, periods: [{ year: 2026, month: 11, state: 'OPEN' }] }) },
    ...o,
  };
  return d;
};
const run = (d, o = {}) => precheckPublicSavingsChange(d, { memberRef: 'm1', requestedAmount: '150000', intendedPeriod: { year: 2026, month: 11 }, ...o });

test('a passing precheck reports the rule outcomes but never authorises a submission', async () => {
  const d = deps(); const r = await run(d);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.value.submissionAuthorized, false); assert.equal(r.value.policyVersion, PSS_POLICY_V1_VERSION);
  assert.equal(r.value.direction, 'INCREASE'); assert.deepEqual(r.value.requestedPeriod, { year: 2026, month: 11 });
  assert.deepEqual(d.calls[0], ['policy', PSS_POLICY_V1_VERSION], 'the approved version is read from the trusted policy source');
  assert.ok(d.calls.every(([kind, arg]) => kind === 'policy' || arg === 'm1'), 'only the session-bound member is read');
});

test('each rule failure is returned with its approved code; nothing is written', async () => {
  const cases = [
    [deps({ members: { ...deps().members, readExistingDeduction: async () => ({ kind: 'UNKNOWN' }) } }), {}, 'SELF_SERVICE_DENIED'],
    [deps(), { requestedAmount: '10500' }, 'INVALID_INCREMENT'],
    [deps(), { requestedAmount: '100000' }, 'UNCHANGED_REJECTED'],
    [deps({ members: { ...deps().members, readEligibilityFacts: async () => ({ ...facts, membershipStatus: 'RESIGN' }) } }), {}, 'MEMBER_NOT_ELIGIBLE'],
    [deps({ members: { ...deps().members, readChangeRequests: async () => [{ memberRef: 'm1', channel: 'MOBILE', state: 'OPEN', period: null }] } }), {}, 'PENDING_CONFLICT'],
    [deps({ calendar: { read: async () => ({ source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR', verified: false, periods: [] }) } }), {}, 'PERIOD_UNVERIFIED'],
    [deps({ policies: { read: () => ({ ...PSS_POLICY_V1, approvalState: 'PROPOSED', approval: null }) } }), {}, 'POLICY_UNAPPROVED'],
  ];
  for (const [d, o, code] of cases) { const r = await run(d, o); assert.equal(r.ok, false); assert.equal(r.error.code, code, JSON.stringify(r)); }
});

test('a failing dependency is DEPENDENCY_UNAVAILABLE without leaking the underlying error', async () => {
  const d = deps({ calendar: { read: async () => { throw new Error('connect ECONNREFUSED 10.0.0.1:3306 user=secret'); } } });
  const r = await run(d);
  assert.deepEqual(r, { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', field: 'calendar' } });
});

test('invalid caller input is refused before any port is read', async () => {
  const d = deps(); const r = await run(d, { memberRef: '' });
  assert.equal(r.ok, false); assert.equal(r.error.code, 'INVALID_INPUT'); assert.deepEqual(d.calls, []);
});

test('precheck requires verified form facts and returns the authoritative readonly fields for review', async () => {
  const form = { contractVersion: 'pss-form-facts/v1', referenceStatus: 'VERIFIED', sourceEvidenceRef: 'fixture:legacy-reference', memberRef: 'm1', sectionId: 'section:1', savingsType: 'SIMPANAN SUKARELA', formVersion: 'form-v1', consentTextVersion: 'consent-v1' };
  const d = deps({ members: { ...deps().members, readFormFacts: async () => form } });
  const result = await run(d);
  assert.equal(result.ok, true); assert.equal(result.value.form?.sectionId, form.sectionId);
  const missing = deps({ members: { ...deps().members, readFormFacts: async () => null } });
  const rejected = await run(missing);
  assert.equal(rejected.ok, false); assert.equal(rejected.error.code, 'AUTHORITATIVE_FORM_UNVERIFIED');
  const down = deps({ members: { ...deps().members, readFormFacts: async () => { throw new Error('private-host'); } } });
  assert.deepEqual(await run(down), { ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', field: 'form' } });
});
