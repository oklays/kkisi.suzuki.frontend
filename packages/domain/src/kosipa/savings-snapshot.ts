/**
 * CP1-T01B — B-06/B-10/B-12 immutable submission snapshot and consent contract (KKISI-PSS-2026-V1 v1.0.0).
 * The snapshot is the single source for the receipt and the PDF; it is never rebuilt from a later member profile.
 * Image decoding/re-encoding and digests are infrastructure (CP1-T05); this module validates their descriptors only.
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import { PUBLIC_SAVINGS_TYPE } from './savings-form-binding.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isEpochMs, isText, plain, type PssResult } from './savings-shared.ts';

export type SnapshotErrorCode = PublicSavingsErrorCode | 'CONSENT_REQUIRED' | 'SIGNATURE_REQUIRED' | 'SIGNATURE_INVALID';

export interface SubmissionSnapshot {
  readonly contractVersion: 'pss-snapshot/v2';
  readonly policyVersion: string;
  readonly memberRef: string;
  /** Authoritative readonly echoes, resolved server-side and rechecked under lock. */
  readonly sectionId: string;
  readonly savingsType: typeof PUBLIC_SAVINGS_TYPE;
  /** Authoritative legacy value, verbatim; null = positively verified first enrollment. */
  readonly originalDeduction: string | null;
  readonly requestedAmount: string;
  readonly requestedPeriod: { readonly year: number; readonly month: number };
  readonly effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL';
  readonly consentTextVersion: string;
  readonly formVersion: string;
  readonly consent: true;
  readonly submittedAtEpochMs: number;
  /** Channel-possession verification bound to the trusted contact; not represented as independent factors. */
  readonly verification: { readonly proofRef: string; readonly contactVersion: string; readonly method: string };
  readonly signature: { readonly format: 'PNG'; readonly decodedBytes: number; readonly width: number; readonly height: number; readonly contentDigest: string; readonly storageRef: string };
}

const INPUT_FIELDS = ['memberRef', 'sectionId', 'savingsType', 'originalDeduction', 'requestedAmount', 'requestedPeriod', 'effectivePeriodCondition', 'consentTextVersion', 'formVersion', 'consent', 'submittedAtEpochMs', 'verification', 'signature'];
const ORDER: readonly (keyof SubmissionSnapshot)[] = ['contractVersion', 'policyVersion', 'memberRef', 'sectionId', 'savingsType', 'originalDeduction', 'requestedAmount', 'requestedPeriod', 'effectivePeriodCondition', 'consentTextVersion', 'formVersion', 'consent', 'submittedAtEpochMs', 'verification', 'signature'];
const MATERIAL: readonly (keyof SubmissionSnapshot)[] = ['memberRef', 'sectionId', 'savingsType', 'originalDeduction', 'requestedAmount', 'requestedPeriod', 'effectivePeriodCondition', 'policyVersion', 'consentTextVersion', 'formVersion'];
const canonicalInteger = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v) && v.length <= 20;
const legacyDecimal = (v: unknown): v is string => typeof v === 'string' && v.length <= 32 && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(v);
const positiveInt = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

export function buildSubmissionSnapshot(input: unknown, policy: unknown): PssResult<SubmissionSnapshot, SnapshotErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  const i = plain(input, INPUT_FIELDS, INPUT_FIELDS.filter((f) => f !== 'consent' && f !== 'signature'));
  if (!i) return fail('INVALID_INPUT');
  if (i.consent !== true) return fail('CONSENT_REQUIRED', 'consent');   // explicit affirmative act; nothing prechecked
  if (i.signature === undefined || i.signature === null) return fail('SIGNATURE_REQUIRED', 'signature');
  if (!isText(i.memberRef, 128)) return fail('INVALID_INPUT', 'memberRef');
  if (!isText(i.sectionId, 128)) return fail('INVALID_INPUT', 'sectionId');
  if (i.savingsType !== PUBLIC_SAVINGS_TYPE) return fail('INVALID_INPUT', 'savingsType');
  if (i.originalDeduction !== null && !legacyDecimal(i.originalDeduction)) return fail('INVALID_INPUT', 'originalDeduction');
  if (!canonicalInteger(i.requestedAmount)) return fail('INVALID_INPUT', 'requestedAmount');
  const period = plain(i.requestedPeriod, ['year', 'month']);
  if (!period || !Number.isSafeInteger(period.year) || !Number.isSafeInteger(period.month) || (period.month as number) < 1 || (period.month as number) > 12) return fail('INVALID_INPUT', 'requestedPeriod');
  if (i.effectivePeriodCondition !== 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL') return fail('INVALID_INPUT', 'effectivePeriodCondition');
  if (!isText(i.consentTextVersion, 64) || !isText(i.formVersion, 64)) return fail('INVALID_INPUT', 'version');
  if (!isEpochMs(i.submittedAtEpochMs)) return fail('INVALID_INPUT', 'submittedAt');
  const v = plain(i.verification, ['proofRef', 'contactVersion', 'method']);
  if (!v || !isText(v.proofRef, 128) || !isText(v.contactVersion, 64) || typeof v.method !== 'string' || !/^[A-Z_]+_CHANNEL_POSSESSION$/u.test(v.method)) return fail('INVALID_INPUT', 'verification');
  const s = plain(i.signature, ['format', 'decodedBytes', 'width', 'height', 'contentDigest', 'storageRef']);
  const rules = resolved.value.rules.signature;
  if (!s || s.format !== rules.format || !positiveInt(s.decodedBytes) || s.decodedBytes > rules.maxDecodedBytes || !positiveInt(s.width) || !positiveInt(s.height)
    || !isText(s.contentDigest, 160) || !isText(s.storageRef, 256) || s.storageRef.includes('://')) return fail('SIGNATURE_INVALID', 'signature');   // private storage reference, never a public URL
  const snapshot: SubmissionSnapshot = {
    contractVersion: 'pss-snapshot/v2', policyVersion: resolved.value.policyVersion, memberRef: i.memberRef, sectionId: i.sectionId, savingsType: PUBLIC_SAVINGS_TYPE, originalDeduction: i.originalDeduction as string | null,
    requestedAmount: i.requestedAmount, requestedPeriod: Object.freeze({ year: period.year as number, month: period.month as number }),
    effectivePeriodCondition: 'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL', consentTextVersion: i.consentTextVersion, formVersion: i.formVersion, consent: true,
    submittedAtEpochMs: i.submittedAtEpochMs,
    verification: Object.freeze({ proofRef: v.proofRef, contactVersion: v.contactVersion, method: v.method }),
    signature: Object.freeze({ format: 'PNG', decodedBytes: s.decodedBytes, width: s.width, height: s.height, contentDigest: s.contentDigest, storageRef: s.storageRef }),
  };
  return { ok: true, value: Object.freeze(snapshot) };
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
}

/** Deterministic, versioned serialisation for the payload digest (computed by the crypto port). Field order is fixed by contract. */
export function canonicalSnapshot(snapshot: SubmissionSnapshot): string {
  return `{${ORDER.map((k) => `${JSON.stringify(k)}:${stable(snapshot[k])}`).join(',')}}`;
}

/** Material fields that differ between the reviewed and the final snapshot; any difference requires renewed review and consent. */
export function materialChanges(reviewed: SubmissionSnapshot, final: SubmissionSnapshot): (keyof SubmissionSnapshot)[] {
  return MATERIAL.filter((k) => stable(reviewed[k]) !== stable(final[k]));
}
