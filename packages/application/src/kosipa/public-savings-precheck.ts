/**
 * CP1-T01B application use case: read-only precheck of a requested deduction change against the approved policy
 * (KKISI-PSS-2026-V1 v1.0.0). It never writes and never authorises a submission: public submission stays disabled until the
 * integration gates (U-01 cross-channel prevention, CP1-T02..T08) pass. Dependency failures are reported without detail.
 */
import { PSS_POLICY_V1_VERSION, resolveApprovedPolicy } from '@koperasi/domain/kosipa/savings-policy';
import { evaluateMembershipEligibility } from '@koperasi/domain/kosipa/savings-eligibility';
import { evaluateDeductionChange } from '@koperasi/domain/kosipa/savings-monetary';
import { resolveRequestedPeriod, type PayrollPeriod } from '@koperasi/domain/kosipa/savings-period';
import { evaluateDuplicateConflict } from '@koperasi/domain/kosipa/savings-lifecycle';
import { resolveSavingsFormFacts, type AuthoritativeSavingsForm } from '@koperasi/domain/kosipa/savings-form-binding';
import type { PayrollCalendarSource, PublicSavingsClock, PublicSavingsMemberFacts, PublicSavingsPolicySource } from './public-savings.ts';

export interface PrecheckDeps {
  readonly policies: PublicSavingsPolicySource;
  readonly clock: PublicSavingsClock;
  readonly members: PublicSavingsMemberFacts;
  readonly calendar: PayrollCalendarSource;
}
export interface PrecheckInput { readonly memberRef: string; readonly requestedAmount: string; readonly intendedPeriod: PayrollPeriod }
export interface PrecheckPassed {
  readonly form: AuthoritativeSavingsForm;
  readonly policyVersion: string;
  readonly direction: 'INCREASE' | 'DECREASE';
  readonly requestedAmount: string;
  readonly requestedPeriod: PayrollPeriod;
  readonly submissionAuthorized: false;
}
export type PrecheckResult = { readonly ok: true; readonly value: PrecheckPassed } | { readonly ok: false; readonly error: { readonly code: string; readonly field?: string } };

const unavailable = (field: string): PrecheckResult => ({ ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', field } });

async function read<T>(field: string, load: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; result: PrecheckResult }> {
  try { return { ok: true, value: await load() }; } catch { return { ok: false, result: unavailable(field) }; }
}

export async function precheckPublicSavingsChange(deps: PrecheckDeps, input: PrecheckInput): Promise<PrecheckResult> {
  if (typeof input?.memberRef !== 'string' || input.memberRef.trim() === '' || input.memberRef.length > 128) return { ok: false, error: { code: 'INVALID_INPUT', field: 'memberRef' } };
  let policy: unknown;
  try { policy = deps.policies.read(PSS_POLICY_V1_VERSION); } catch { return unavailable('policy'); }
  const approved = resolveApprovedPolicy(policy);
  if (!approved.ok) return approved;
  const now = deps.clock.nowEpochMs();

  const facts = await read('member', () => deps.members.readEligibilityFacts(input.memberRef));
  if (!facts.ok) return facts.result;
  const eligibility = evaluateMembershipEligibility(facts.value, policy, now);
  if (!eligibility.ok) return eligibility;
  const form = await read('form', () => deps.members.readFormFacts(input.memberRef));
  if (!form.ok) return form.result;
  const authoritative = resolveSavingsFormFacts(form.value, input.memberRef, policy);
  if (!authoritative.ok) return authoritative;

  const existing = await read('member', () => deps.members.readExistingDeduction(input.memberRef));
  if (!existing.ok) return existing.result;
  const change = evaluateDeductionChange(existing.value, input.requestedAmount, policy);
  if (!change.ok) return change;

  const calendar = await read('calendar', () => deps.calendar.read());
  if (!calendar.ok) return calendar.result;
  const period = resolveRequestedPeriod(calendar.value, input.intendedPeriod, policy, now);
  if (!period.ok) return period;

  const requests = await read('member', () => deps.members.readChangeRequests(input.memberRef));
  if (!requests.ok) return requests.result;
  const duplicate = evaluateDuplicateConflict(input.memberRef, requests.value, period.value.requestedPeriod, policy);
  if (!duplicate.ok) return duplicate;

  return { ok: true, value: { form: authoritative.value, policyVersion: approved.value.policyVersion, direction: change.value.direction, requestedAmount: change.value.amount,
    requestedPeriod: period.value.requestedPeriod, submissionAuthorized: false } };
}
