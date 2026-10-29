import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateMembershipEligibility } from '../src/kosipa/savings-eligibility.ts';
import { resolveRequestedPeriod } from '../src/kosipa/savings-period.ts';
import { PSS_POLICY_V1 } from '../src/kosipa/savings-policy.ts';

// CP1-T01B: B-03 eligibility + B-09 trusted contact, B-04 payroll period (KKISI-PSS-2026-V1 v1.0.0). Synthetic facts only.
const DAY = 86400000; const NOW = Date.UTC(2026, 9, 24, 3, 0, 0);   // 2026-10-24 10:00 Asia/Jakarta
const facts = (o = {}) => ({
  membershipStatus: 'AKTIVE', identity: 'UNIQUE', identifierMappingConflict: false, payrollRoster: 'ACTIVE',
  groupCode: 'G1', activePayrollEligibleGroups: ['G1', 'G2'], branch: 'VALID', conflictingActiveSubmission: false,
  contact: { status: 'VERIFIED', verifiedAtEpochMs: NOW - 10 * DAY, provenanceRef: 'membership-record:1', changedSinceVerification: false }, ...o,
});
const elig = (o) => evaluateMembershipEligibility(facts(o), PSS_POLICY_V1, NOW);
const err = (r, code, field) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.error.code, code); if (field) assert.equal(r.error.field, field); };

test('B-03: all eight conditions satisfied -> eligible for self-service (still not a submission authorisation)', () => {
  const r = elig(); assert.equal(r.ok, true); assert.equal(r.value.eligible, true); assert.equal(r.value.submissionAuthorized, false);
});

test('B-03: definite ineligibility refuses self-service; missing or ambiguous evidence routes to staff (ASSISTED_REQUIRED)', () => {
  for (const s of ['RESIGN', 'KELUAR', 'NONAKTIF', 'aktive']) err(elig({ membershipStatus: s }), 'MEMBER_NOT_ELIGIBLE', 'membershipStatus');
  err(elig({ membershipStatus: null }), 'ASSISTED_REQUIRED', 'membershipStatus');
  err(elig({ identity: 'NOT_FOUND' }), 'MEMBER_UNAVAILABLE', 'identity');
  err(elig({ identity: 'AMBIGUOUS' }), 'ASSISTED_REQUIRED', 'identity');
  err(elig({ identifierMappingConflict: true }), 'ASSISTED_REQUIRED', 'identity');
  err(elig({ payrollRoster: 'INACTIVE' }), 'MEMBER_NOT_ELIGIBLE', 'payrollRoster');
  err(elig({ payrollRoster: 'UNVERIFIED' }), 'ASSISTED_REQUIRED', 'payrollRoster');
  err(elig({ groupCode: 'G9' }), 'MEMBER_NOT_ELIGIBLE', 'group');
  err(elig({ activePayrollEligibleGroups: null }), 'ASSISTED_REQUIRED', 'group');   // groups come from verified roster data, never a hardcoded list
  err(elig({ activePayrollEligibleGroups: [] }), 'ASSISTED_REQUIRED', 'group');
  err(elig({ branch: 'INVALID' }), 'MEMBER_NOT_ELIGIBLE', 'branch');
  err(elig({ branch: 'UNVERIFIED' }), 'ASSISTED_REQUIRED', 'branch');
  err(elig({ conflictingActiveSubmission: true }), 'PENDING_CONFLICT', 'submission');
  err(elig({ conflictingActiveSubmission: 'UNVERIFIED' }), 'ASSISTED_REQUIRED', 'submission');
});

test('B-09: contact must be verified, attributable, unchanged and no older than 180 days; otherwise staff-assisted verification', () => {
  const c = (o) => ({ ...facts().contact, ...o });
  assert.equal(elig({ contact: c({ verifiedAtEpochMs: NOW - 180 * DAY }) }).ok, true, 'exactly 180 days is still within the limit');
  err(elig({ contact: c({ verifiedAtEpochMs: NOW - 180 * DAY - 1 }) }), 'CONTACT_UNTRUSTED', 'contact');
  err(elig({ contact: c({ status: 'UNVERIFIED' }) }), 'CONTACT_UNTRUSTED', 'contact');
  err(elig({ contact: c({ status: 'MISSING' }) }), 'CONTACT_UNTRUSTED', 'contact');
  err(elig({ contact: c({ provenanceRef: '' }) }), 'CONTACT_UNTRUSTED', 'contact');
  err(elig({ contact: c({ changedSinceVerification: true }) }), 'CONTACT_UNTRUSTED', 'contact');
  err(elig({ contact: c({ verifiedAtEpochMs: NOW + DAY }) }), 'CONTACT_UNTRUSTED', 'contact');
  err(elig({ contact: null }), 'CONTACT_UNTRUSTED', 'contact');
});

test('eligibility refuses unapproved policies and malformed facts (fail closed)', () => {
  err(evaluateMembershipEligibility(facts(), { ...PSS_POLICY_V1, approvalState: 'PROPOSED', approval: null }, NOW), 'POLICY_UNAPPROVED');
  err(evaluateMembershipEligibility(null, PSS_POLICY_V1, NOW), 'INVALID_INPUT');
  err(evaluateMembershipEligibility({ ...facts(), extra: 1 }, PSS_POLICY_V1, NOW), 'INVALID_INPUT');
  err(evaluateMembershipEligibility(facts(), PSS_POLICY_V1, Number.NaN), 'INVALID_INPUT', 'now');
});

const cal = (periods, verified = true) => ({ source: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR', verified, periods });
const per = (year, month, state) => ({ year, month, state });

test('B-04: the first OPEN period at or after the intended period is used; locked, posting and closed periods are skipped', () => {
  const r = resolveRequestedPeriod(cal([per(2026, 11, 'LOCKED'), per(2026, 12, 'POSTING'), per(2027, 1, 'OPEN'), per(2027, 2, 'OPEN')]), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW);
  assert.equal(r.ok, true); assert.deepEqual(r.value.requestedPeriod, { year: 2027, month: 1 }); assert.deepEqual(r.value.intendedPeriod, { year: 2026, month: 11 });
  assert.equal(r.value.effectivePeriodCondition, 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL'); assert.equal(r.value.timezone, 'Asia/Jakarta');
  const direct = resolveRequestedPeriod(cal([per(2026, 11, 'OPEN')]), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW);
  assert.deepEqual(direct.value.requestedPeriod, { year: 2026, month: 11 });
});

test('B-04: never retroactive — an intended month before the current Asia/Jakarta month starts from the current month', () => {
  const r = resolveRequestedPeriod(cal([per(2026, 9, 'OPEN'), per(2026, 10, 'CLOSED'), per(2026, 11, 'OPEN')]), { year: 2026, month: 9 }, PSS_POLICY_V1, NOW);
  assert.deepEqual(r.value.requestedPeriod, { year: 2026, month: 11 });
  // 2026-10-31 17:30 UTC is already 2026-11-01 in Asia/Jakarta
  const late = resolveRequestedPeriod(cal([per(2026, 10, 'OPEN'), per(2026, 11, 'OPEN')]), { year: 2026, month: 10 }, PSS_POLICY_V1, Date.UTC(2026, 9, 31, 17, 30));
  assert.deepEqual(late.value.requestedPeriod, { year: 2026, month: 11 });
});

test('B-04: no verified eligible period -> PERIOD_UNVERIFIED (keep pending / staff), never a guessed month', () => {
  err(resolveRequestedPeriod(cal([per(2026, 11, 'CLOSED')]), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW), 'PERIOD_UNVERIFIED');
  err(resolveRequestedPeriod(cal([per(2026, 11, 'OPEN')], false), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW), 'PERIOD_UNVERIFIED');
  err(resolveRequestedPeriod(cal([per(2026, 11, 'OPEN'), per(2026, 11, 'LOCKED')]), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW), 'PERIOD_UNVERIFIED', 'calendar');
  err(resolveRequestedPeriod(cal([per(2026, 11, 'UNKNOWN')]), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW), 'PERIOD_UNVERIFIED', 'calendar');
  err(resolveRequestedPeriod(cal([per(2026, 13, 'OPEN')]), { year: 2026, month: 11 }, PSS_POLICY_V1, NOW), 'PERIOD_UNVERIFIED', 'calendar');
  err(resolveRequestedPeriod({ ...cal([per(2026, 11, 'OPEN')]), source: 'GUESS' }, { year: 2026, month: 11 }, PSS_POLICY_V1, NOW), 'PERIOD_UNVERIFIED');
  err(resolveRequestedPeriod(cal([per(2026, 11, 'OPEN')]), { year: 2026, month: 0 }, PSS_POLICY_V1, NOW), 'INVALID_INPUT', 'intendedPeriod');
});

test('B-04: December to January and leap-year boundaries order correctly', () => {
  const r = resolveRequestedPeriod(cal([per(2027, 2, 'OPEN'), per(2028, 1, 'OPEN'), per(2027, 12, 'CLOSED')]), { year: 2027, month: 12 }, PSS_POLICY_V1, Date.UTC(2027, 11, 1));
  assert.deepEqual(r.value.requestedPeriod, { year: 2028, month: 1 });
  const leap = resolveRequestedPeriod(cal([per(2028, 2, 'OPEN')]), { year: 2028, month: 2 }, PSS_POLICY_V1, Date.UTC(2028, 1, 28, 18));   // 2028-02-29 01:00 Jakarta
  assert.deepEqual(leap.value.requestedPeriod, { year: 2028, month: 2 });
});
