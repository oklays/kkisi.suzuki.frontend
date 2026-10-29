/**
 * CP1-T01B — B-03 membership eligibility and B-09 trusted-contact assurance (KKISI-PSS-2026-V1 v1.0.0).
 * Facts are injected by future adapters from authoritative records; nothing here guesses group codes or statuses.
 * Definite ineligibility -> MEMBER_NOT_ELIGIBLE; missing/ambiguous evidence -> ASSISTED_REQUIRED (staff-assisted, never auto-approved).
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isEpochMs, isText, plain, type PssResult } from './savings-shared.ts';

export type EligibilityErrorCode = PublicSavingsErrorCode | 'MEMBER_NOT_ELIGIBLE' | 'MEMBER_UNAVAILABLE' | 'ASSISTED_REQUIRED' | 'PENDING_CONFLICT' | 'CONTACT_UNTRUSTED';

export interface MemberEligibilityFacts {
  /** Legacy status already mapped by the adapter to the authoritative status code. null = not resolvable. */
  readonly membershipStatus: string | null;
  readonly identity: 'UNIQUE' | 'AMBIGUOUS' | 'NOT_FOUND';
  readonly identifierMappingConflict: boolean;
  readonly payrollRoster: 'ACTIVE' | 'INACTIVE' | 'UNVERIFIED';
  readonly groupCode: string | null;
  /** From the verified active payroll roster/configuration; null or empty = not verified. */
  readonly activePayrollEligibleGroups: readonly string[] | null;
  readonly branch: 'VALID' | 'INVALID' | 'UNVERIFIED';
  readonly conflictingActiveSubmission: boolean | 'UNVERIFIED';
  readonly contact: {
    readonly status: 'VERIFIED' | 'UNVERIFIED' | 'MISSING';
    readonly verifiedAtEpochMs: number | null;
    readonly provenanceRef: string;
    readonly changedSinceVerification: boolean;
  } | null;
}

const FIELDS = ['membershipStatus', 'identity', 'identifierMappingConflict', 'payrollRoster', 'groupCode', 'activePayrollEligibleGroups', 'branch', 'conflictingActiveSubmission', 'contact'];
const DAY_MS = 86400000;

export function evaluateMembershipEligibility(input: unknown, policy: unknown, nowEpochMs: number): PssResult<{ readonly eligible: true; readonly policyVersion: string; readonly submissionAuthorized: false }, EligibilityErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  if (!isEpochMs(nowEpochMs)) return fail('INVALID_INPUT', 'now');
  const f = plain(input, FIELDS);
  if (!f) return fail('INVALID_INPUT', 'facts');
  const rules = resolved.value.rules.eligibility;

  if (f.identity === 'NOT_FOUND') return fail('MEMBER_UNAVAILABLE', 'identity');
  if (f.identity !== 'UNIQUE' || f.identifierMappingConflict !== false) return fail('ASSISTED_REQUIRED', 'identity');
  if (f.membershipStatus === null || typeof f.membershipStatus !== 'string') return fail('ASSISTED_REQUIRED', 'membershipStatus');
  if (f.membershipStatus !== rules.requiredMembershipStatus) return fail('MEMBER_NOT_ELIGIBLE', 'membershipStatus');
  if (f.payrollRoster === 'INACTIVE') return fail('MEMBER_NOT_ELIGIBLE', 'payrollRoster');
  if (f.payrollRoster !== 'ACTIVE') return fail('ASSISTED_REQUIRED', 'payrollRoster');
  const groups = f.activePayrollEligibleGroups;
  if (!Array.isArray(groups) || groups.length === 0 || !groups.every((g) => isText(g, 64)) || !isText(f.groupCode, 64)) return fail('ASSISTED_REQUIRED', 'group');
  if (!groups.includes(f.groupCode)) return fail('MEMBER_NOT_ELIGIBLE', 'group');
  if (f.branch === 'INVALID') return fail('MEMBER_NOT_ELIGIBLE', 'branch');
  if (f.branch !== 'VALID') return fail('ASSISTED_REQUIRED', 'branch');
  if (f.conflictingActiveSubmission === true) return fail('PENDING_CONFLICT', 'submission');
  if (f.conflictingActiveSubmission !== false) return fail('ASSISTED_REQUIRED', 'submission');

  const c = plain(f.contact, ['status', 'verifiedAtEpochMs', 'provenanceRef', 'changedSinceVerification']);
  if (!c || c.status !== 'VERIFIED' || c.changedSinceVerification !== false || !isText(c.provenanceRef) || !isEpochMs(c.verifiedAtEpochMs)
    || c.verifiedAtEpochMs > nowEpochMs || nowEpochMs - c.verifiedAtEpochMs > rules.contactMaxAgeDays * DAY_MS) {
    return fail('CONTACT_UNTRUSTED', 'contact');   // staff-assisted verification; never a typed replacement number
  }
  return { ok: true, value: { eligible: true, policyVersion: resolved.value.policyVersion, submissionAuthorized: false } };
}
