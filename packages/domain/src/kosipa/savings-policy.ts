/**
 * Approved business policy for Public Simpanan Sukarela (CP1-T01B). The values are the business decisions recorded as
 * KKISI-PSS-2026-V1 v1.0.0 (decision register 13 / sign-off sheet 15 §5). They are KKISI internal policy, not regulatory limits.
 * An APPROVED-looking envelope from anywhere else is not trusted: `resolveApprovedPolicy` only accepts an envelope that is
 * exactly a registered approved version. Business approval does not activate public submission (U-01 integration gate).
 */
import { inspectPublicSavingsPolicy } from './savings-application.ts';
import { plain } from './savings-shared.ts';
import type { PublicSavingsPolicyEnvelope, PublicSavingsResult } from './savings-application.ts';

export const PSS_POLICY_V1_VERSION = 'KKISI-PSS-2026-V1@1.0.0';

export interface PublicSavingsMonetaryRules {
  readonly contractVersion: 'public-savings-monetary/v1';
  readonly currency: 'IDR';
  readonly minAmount: string;
  readonly increment: string;
  readonly incrementBasis: 'ZERO' | 'MINIMUM';
  readonly maxAmount: string | 'NO_ADDITIONAL_BUSINESS_CAP';
  readonly technicalMaxAmount: string;
  readonly allowIncrease: boolean;
  readonly allowDecrease: boolean;
  readonly unchangedHandling: 'REJECT';
  readonly zeroAmountHandling: 'STAFF_ASSISTED_ONLY';
  readonly unknownCurrentHandling: 'SELF_SERVICE_DENIED';
  readonly existingFractionalHandling: 'REJECT_FRACTIONAL';
  readonly comparisonBasis: 'EXACT_NUMERIC';
}

export interface PublicSavingsPolicyRules {
  readonly monetary: PublicSavingsMonetaryRules;
  readonly eligibility: {
    readonly requiredMembershipStatus: 'AKTIVE';
    readonly groupSelection: 'ALL_ACTIVE_PAYROLL_ELIGIBLE_GROUPS';
    readonly contactMaxAgeDays: number;
  };
  readonly period: { readonly timezone: 'Asia/Jakarta'; readonly calendarSource: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR' };
  readonly duplicate: { readonly scope: 'ONE_ACTIVE_CHANGE_PER_MEMBER_ALL_CHANNELS' };
  readonly token: { readonly entropyBits: number; readonly ttlHours: number; readonly extensionAllowed: false; readonly maxSuccessfulSubmissions: 1 };
  readonly otp: {
    readonly digits: number; readonly ttlMinutes: number; readonly maxFailedAttempts: number; readonly resendMinIntervalSeconds: number;
    readonly resendMaxPerLinkPer15Minutes: number; readonly resendMaxPerMemberPerHour: number; readonly proofTtlMinutes: number;
  };
  readonly signature: { readonly format: 'PNG'; readonly maxDecodedBytes: number; readonly mandatory: true };
  readonly lifecycle: { readonly staleSubmissionDays: number; readonly escalationBusinessDays: number };
  readonly retention: {
    readonly tokenTombstoneDays: number; readonly securityLogDays: number; readonly financialEvidenceYearsAfterFinancialYear: number;
    readonly temporaryExportHours: number;
  };
}

export type ApprovedPublicSavingsPolicy = PublicSavingsPolicyEnvelope & { readonly approvalState: 'APPROVED'; readonly rules: PublicSavingsPolicyRules };

/** KKISI-PSS-2026-V1 v1.0.0, decided 2026-10-24 (Asia/Jakarta). Evidence: see decision register 13 / 15 §5. */
export const PSS_POLICY_V1: ApprovedPublicSavingsPolicy = deepFreeze({
  contractVersion: 'public-savings-policy/v1',
  policyVersion: PSS_POLICY_V1_VERSION,
  approvalState: 'APPROVED',
  approval: {
    approverRole: 'Authorized Project & Business Owner (self-declared in the project conversation)',
    approvedAt: '2026-10-24',
    scope: 'Public Simpanan Sukarela business rules B-01..B-14, CP1-CP3; business approval only, not operational activation',
    evidenceRef: 'Project conversation 2026-10-24: owner directive "FINAL BUSINESS POLICY & IMPLEMENTATION DIRECTIVE", Policy ID KKISI-PSS-2026-V1 v1.0.0 (no external record identifier available)',
  },
  rules: {
    monetary: {
      contractVersion: 'public-savings-monetary/v1', currency: 'IDR',
      minAmount: '10000', increment: '1000', incrementBasis: 'ZERO', maxAmount: '5000000', technicalMaxAmount: '5000000',
      allowIncrease: true, allowDecrease: true, unchangedHandling: 'REJECT', zeroAmountHandling: 'STAFF_ASSISTED_ONLY',
      unknownCurrentHandling: 'SELF_SERVICE_DENIED', existingFractionalHandling: 'REJECT_FRACTIONAL', comparisonBasis: 'EXACT_NUMERIC',
    },
    eligibility: { requiredMembershipStatus: 'AKTIVE', groupSelection: 'ALL_ACTIVE_PAYROLL_ELIGIBLE_GROUPS', contactMaxAgeDays: 180 },
    period: { timezone: 'Asia/Jakarta', calendarSource: 'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR' },
    duplicate: { scope: 'ONE_ACTIVE_CHANGE_PER_MEMBER_ALL_CHANNELS' },
    token: { entropyBits: 256, ttlHours: 48, extensionAllowed: false, maxSuccessfulSubmissions: 1 },
    otp: { digits: 6, ttlMinutes: 5, maxFailedAttempts: 5, resendMinIntervalSeconds: 60, resendMaxPerLinkPer15Minutes: 3, resendMaxPerMemberPerHour: 5, proofTtlMinutes: 15 },
    signature: { format: 'PNG', maxDecodedBytes: 1048576, mandatory: true },
    lifecycle: { staleSubmissionDays: 30, escalationBusinessDays: 2 },
    retention: { tokenTombstoneDays: 90, securityLogDays: 180, financialEvidenceYearsAfterFinancialYear: 10, temporaryExportHours: 24 },
  },
});

const REGISTRY: Readonly<Record<string, ApprovedPublicSavingsPolicy>> = Object.freeze({ [PSS_POLICY_V1_VERSION]: PSS_POLICY_V1 });

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') { for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]); Object.freeze(value); }
  return value;
}

/** Order-independent exact equality; inspect every nested record without invoking accessors or accepting prototypes. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(b)) return false;
  const keys = Object.keys(b);
  const candidate = plain(a, keys);
  return !!candidate && keys.every((key) => sameData(candidate[key], (b as Record<string, unknown>)[key]));
}

/**
 * The only door from an untrusted policy input to approved rules: inspection (T01A) first, then an exact match with a
 * registered approved version. Proposed, revoked, synthetic or altered envelopes fail closed with POLICY_UNAPPROVED.
 */
export function resolveApprovedPolicy(input: unknown): PublicSavingsResult<ApprovedPublicSavingsPolicy> {
  const inspected = inspectPublicSavingsPolicy(input);
  if (!inspected.ok) return inspected;
  const registered = Object.prototype.hasOwnProperty.call(REGISTRY, inspected.value.policyVersion) ? REGISTRY[inspected.value.policyVersion] : undefined;
  if (!registered || !sameData(inspected.value, registered)) return { ok: false, error: { code: 'POLICY_UNAPPROVED', field: 'policyVersion' } };
  return { ok: true, value: registered };
}
