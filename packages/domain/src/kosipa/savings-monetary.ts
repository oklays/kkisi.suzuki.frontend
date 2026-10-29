/**
 * CP1-T01B-1 — monetary validation and deduction-change rules (B-01/B-02 of KKISI-PSS-2026-V1 v1.0.0).
 * Adopted from the reviewed monetary candidate (spike commit 2ae3cb5f): same canonical-string arithmetic, synthetic simulation
 * mode replaced by approved-policy resolution. Results describe the amount rule only; `submissionAuthorized` is always false.
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsMonetaryRules } from './savings-policy.ts';
import type { PublicSavingsErrorCode, PublicSavingsResult } from './savings-application.ts';

export type MonetaryErrorCode = PublicSavingsErrorCode
  | 'MONETARY_POLICY_INVALID' | 'INVALID_AMOUNT' | 'INVALID_INCREMENT' | 'AMOUNT_BELOW_MINIMUM' | 'AMOUNT_EXCEEDS_MAXIMUM'
  | 'AMOUNT_TECHNICAL_LIMIT' | 'ASSISTED_REQUIRED' | 'SELF_SERVICE_DENIED' | 'UNCHANGED_REJECTED' | 'DEDUCTION_CHANGE_NOT_ALLOWED'
  | 'LEGACY_AMOUNT_INVALID';
export type MonetaryResult<T> = Extract<PublicSavingsResult<T>, { ok: true }>
  | { readonly ok: false; readonly error: { readonly code: MonetaryErrorCode; readonly field?: string } };

/** Outcomes that must be routed to an authorised staff-assisted process (B-01: never truncated, never silently corrected). */
const STAFF_ASSISTED: readonly MonetaryErrorCode[] = ['ASSISTED_REQUIRED', 'AMOUNT_BELOW_MINIMUM', 'AMOUNT_EXCEEDS_MAXIMUM', 'SELF_SERVICE_DENIED'];
export function isStaffAssistedOutcome(code: string): boolean {
  return (STAFF_ASSISTED as readonly string[]).includes(code);
}

/** Authoritative current deduction fact. VERIFIED_NONE must be positively verified (a missing row alone is UNKNOWN). */
export type ExistingDeduction =
  | { readonly kind: 'AMOUNT'; readonly value: string }
  | { readonly kind: 'VERIFIED_NONE' }
  | { readonly kind: 'UNKNOWN' };

interface Trace { readonly policyVersion: string; readonly submissionAuthorized: false }
export interface ValidatedMonetaryPolicy extends PublicSavingsMonetaryRules, Trace {}
export interface MonetaryAmountEvaluation extends Trace { readonly amount: string }
export interface DeductionChangeEvaluation extends MonetaryAmountEvaluation {
  readonly direction: 'INCREASE' | 'DECREASE';
  readonly comparisonBasis: 'EXACT_NUMERIC';
  /** The authoritative legacy value is preserved verbatim; it is never rounded or rewritten. */
  readonly existing: { readonly kind: 'AMOUNT' | 'VERIFIED_NONE'; readonly original: string | null };
}

const ZERO = BigInt(0);
/** Structural guard on the legacy decimal text (digits plus one separator); not a business limit. */
const MAX_LEGACY_TEXT = 32;

function reject(code: MonetaryErrorCode, field?: string): Extract<MonetaryResult<never>, { ok: false }> {
  return { ok: false, error: { code, ...(field === undefined ? {} : { field }) } };
}

/** Own enumerable data properties of a plain object only; no accessors, no inherited fields. */
function record(input: unknown, allowed: readonly string[]): Record<string, unknown> | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== null && prototype !== Object.prototype) return undefined;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(input)) {
      if (typeof key !== 'string' || !allowed.includes(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

/** Canonical non-negative integer string: ASCII digits, no sign, no separators, no leading zero (except "0"). */
function canonical(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[^0-9]/u.test(value) && (value === '0' || value[0] !== '0');
}

/** Compares canonical integer strings without converting arbitrarily long input to BigInt. */
function compare(a: string, b: string): number {
  return a.length !== b.length ? (a.length < b.length ? -1 : 1) : a === b ? 0 : a < b ? -1 : 1;
}

/** Approved B-01/B-02 rules from the registered policy only; provisional/synthetic/altered envelopes fail closed. */
export function validateMonetaryPolicy(input: unknown): MonetaryResult<ValidatedMonetaryPolicy> {
  const resolved = resolveApprovedPolicy(input);
  if (!resolved.ok) return resolved;
  const m = resolved.value.rules.monetary;
  // Defence in depth: a future registered version must still be internally consistent before it can be used.
  if (!canonical(m.minAmount) || !canonical(m.increment) || m.increment === '0' || !canonical(m.technicalMaxAmount)
    || (m.maxAmount !== 'NO_ADDITIONAL_BUSINESS_CAP' && !canonical(m.maxAmount)) || compare(m.minAmount, m.technicalMaxAmount) > 0) {
    return reject('MONETARY_POLICY_INVALID', 'rules.monetary');
  }
  return { ok: true, value: { ...m, policyVersion: resolved.value.policyVersion, submissionAuthorized: false } };
}

function amountWithPolicy(input: unknown, p: ValidatedMonetaryPolicy): MonetaryResult<MonetaryAmountEvaluation> {
  if (!canonical(input)) return reject('INVALID_AMOUNT', 'amountRupiah');
  if (input === '0') return reject('ASSISTED_REQUIRED', 'amountRupiah');            // zero target: STAFF_ASSISTED_ONLY
  if (p.maxAmount !== 'NO_ADDITIONAL_BUSINESS_CAP' && compare(input, p.maxAmount) > 0) return reject('AMOUNT_EXCEEDS_MAXIMUM', 'amountRupiah');
  if (compare(input, p.technicalMaxAmount) > 0) return reject('AMOUNT_TECHNICAL_LIMIT', 'amountRupiah');
  if (compare(input, p.minAmount) < 0) return reject('AMOUNT_BELOW_MINIMUM', 'amountRupiah');
  const anchor = p.incrementBasis === 'MINIMUM' ? BigInt(p.minAmount) : ZERO;
  if ((BigInt(input) - anchor) % BigInt(p.increment) !== ZERO) return reject('INVALID_INCREMENT', 'amountRupiah');
  return { ok: true, value: { amount: input, policyVersion: p.policyVersion, submissionAuthorized: false } };
}

/** B-01: validates a requested new deduction (canonical integer rupiah string). */
export function validateSavingsAmount(input: unknown, policy: unknown): MonetaryResult<MonetaryAmountEvaluation> {
  const validated = validateMonetaryPolicy(policy);
  return validated.ok ? amountWithPolicy(input, validated.value) : validated;
}

/** Legacy decimal text "123" / "123.45" -> integer part and whether a non-zero fraction exists; undefined when malformed. */
function legacyAmount(value: unknown): { whole: string; fractional: boolean } | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LEGACY_TEXT) return undefined;
  const parts = value.split('.');
  if (parts.length > 2) return undefined;
  const [whole, fraction] = parts;
  if (!canonical(whole)) return undefined;
  if (parts.length === 2 && (fraction.length === 0 || /[^0-9]/u.test(fraction))) return undefined;
  return { whole, fractional: parts.length === 2 && /[1-9]/u.test(fraction) };
}

/**
 * B-02: compares the requested amount with the authoritative current deduction. Order: policy, existing fact
 * (unknown -> SELF_SERVICE_DENIED, non-zero fraction -> ASSISTED_REQUIRED), requested amount (B-01), then exact comparison.
 */
export function evaluateDeductionChange(existing: unknown, next: unknown, policy: unknown): MonetaryResult<DeductionChangeEvaluation> {
  const validated = validateMonetaryPolicy(policy);
  if (!validated.ok) return validated;
  const p = validated.value;
  const fact = record(existing, ['kind', 'value']);
  if (!fact) return reject('LEGACY_AMOUNT_INVALID', 'existingAmount');
  let old: { whole: string; original: string | null; kind: 'AMOUNT' | 'VERIFIED_NONE' };
  if (fact.kind === 'UNKNOWN' && !('value' in fact)) return reject('SELF_SERVICE_DENIED', 'existingAmount');
  if (fact.kind === 'VERIFIED_NONE' && !('value' in fact)) old = { whole: '0', original: null, kind: 'VERIFIED_NONE' };
  else if (fact.kind === 'AMOUNT') {
    const parsed = legacyAmount(fact.value);
    if (!parsed) return reject('LEGACY_AMOUNT_INVALID', 'existingAmount');
    if (parsed.fractional) return reject('ASSISTED_REQUIRED', 'existingAmount');   // REJECT_FRACTIONAL: never rounded
    old = { whole: parsed.whole, original: fact.value as string, kind: 'AMOUNT' };
  } else return reject('LEGACY_AMOUNT_INVALID', 'existingAmount');
  const amount = amountWithPolicy(next, p);
  if (!amount.ok) return amount;
  const comparison = compare(amount.value.amount, old.whole);
  if (comparison === 0) return reject('UNCHANGED_REJECTED', 'amountRupiah');
  const direction = comparison > 0 ? 'INCREASE' : 'DECREASE';
  if ((direction === 'INCREASE' && !p.allowIncrease) || (direction === 'DECREASE' && !p.allowDecrease)) return reject('DEDUCTION_CHANGE_NOT_ALLOWED', 'amountRupiah');
  return { ok: true, value: { ...amount.value, direction, comparisonBasis: 'EXACT_NUMERIC', existing: { kind: old.kind, original: old.original } } };
}
