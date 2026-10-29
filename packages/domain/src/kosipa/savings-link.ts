/**
 * CP1-T01B — B-07 token and OTP lifecycle decisions (KKISI-PSS-2026-V1 v1.0.0). Pure decisions over stored facts;
 * secure generation, keyed digests and comparison are infrastructure (crypto port, CP1-T03/T04). Same-channel link + OTP is
 * channel-possession verification bound to the trusted contact, never two independent authentication factors.
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isEpochMs, isText, plain, type PssResult } from './savings-shared.ts';

export type LinkErrorCode = PublicSavingsErrorCode | 'LINK_INVALID' | 'LINK_EXPIRED' | 'LINK_REVOKED' | 'LINK_CONSUMED'
  | 'RESEND_TOO_SOON' | 'RESEND_LIMIT' | 'CHALLENGE_EXPIRED' | 'CHALLENGE_LOCKED' | 'CHALLENGE_USED' | 'CHALLENGE_SUPERSEDED'
  | 'PROOF_EXPIRED' | 'VERIFICATION_REQUIRED';

export const PUBLIC_SAVINGS_LINK_PURPOSE = 'PUBLIC_SAVINGS_DEDUCTION_CHANGE';
const MIN = 60000; const HOUR = 3600000;
const nullableTime = (v: unknown) => v === null || isEpochMs(v);

/** Link state with fixed precedence consumed > revoked > expired. A consumed link only supports receipt recovery, never reopening. */
export function evaluateLinkState(link: unknown, expected: { memberRef: string; purpose: string }, nowEpochMs: number, policy: unknown): PssResult<'ACTIVE', LinkErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  const l = plain(link, ['memberRef', 'purpose', 'issuedAtEpochMs', 'expiresAtEpochMs', 'consumedAtEpochMs', 'revokedAtEpochMs']);
  if (!l || !isText(l.memberRef, 128) || !isEpochMs(l.issuedAtEpochMs) || !isEpochMs(l.expiresAtEpochMs) || !nullableTime(l.consumedAtEpochMs) || !nullableTime(l.revokedAtEpochMs) || !isEpochMs(nowEpochMs)) return fail('LINK_INVALID');
  if (l.purpose !== PUBLIC_SAVINGS_LINK_PURPOSE || l.purpose !== expected.purpose || l.memberRef !== expected.memberRef) return fail('LINK_INVALID', 'binding');
  if (l.issuedAtEpochMs > nowEpochMs) return fail('LINK_INVALID', 'issuedAt');
  if (l.expiresAtEpochMs !== l.issuedAtEpochMs + resolved.value.rules.token.ttlHours * HOUR) return fail('LINK_INVALID', 'expiresAt');   // fixed 48 h, no extension
  if (l.consumedAtEpochMs !== null) return fail('LINK_CONSUMED');
  if (l.revokedAtEpochMs !== null) return fail('LINK_REVOKED');
  if (nowEpochMs >= l.expiresAtEpochMs) return fail('LINK_EXPIRED');
  return { ok: true, value: 'ACTIVE' };
}

/** Resend decision from recorded send instants (shared across instances by the adapter). */
export function evaluateOtpResend(history: unknown, nowEpochMs: number, policy: unknown): PssResult<'ALLOWED', LinkErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  const h = plain(history, ['linkSendTimesEpochMs', 'memberSendTimesEpochMs']);
  const times = (v: unknown) => Array.isArray(v) && v.every((t) => isEpochMs(t) && t <= nowEpochMs);
  if (!h || !isEpochMs(nowEpochMs) || !times(h.linkSendTimesEpochMs) || !times(h.memberSendTimesEpochMs)) return fail('INVALID_INPUT', 'history');
  const otp = resolved.value.rules.otp;
  const link = h.linkSendTimesEpochMs as number[]; const member = h.memberSendTimesEpochMs as number[];
  if (link.some((t) => nowEpochMs - t < otp.resendMinIntervalSeconds * 1000)) return fail('RESEND_TOO_SOON');
  if (link.filter((t) => nowEpochMs - t < 15 * MIN).length >= otp.resendMaxPerLinkPer15Minutes) return fail('RESEND_LIMIT', 'link');
  if (member.filter((t) => nowEpochMs - t < HOUR).length >= otp.resendMaxPerMemberPerHour) return fail('RESEND_LIMIT', 'member');
  return { ok: true, value: 'ALLOWED' };
}

/** Whether a code may still be checked against this challenge. Verification itself (keyed digest compare) is infrastructure. */
export function evaluateOtpAttempt(challenge: unknown, nowEpochMs: number, policy: unknown): PssResult<'ATTEMPT_ALLOWED', LinkErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  const c = plain(challenge, ['issuedAtEpochMs', 'failedAttempts', 'usedAtEpochMs', 'superseded']);
  if (!c || !isEpochMs(c.issuedAtEpochMs) || !Number.isSafeInteger(c.failedAttempts) || (c.failedAttempts as number) < 0 || !nullableTime(c.usedAtEpochMs) || typeof c.superseded !== 'boolean' || !isEpochMs(nowEpochMs)) return fail('INVALID_INPUT', 'challenge');
  const otp = resolved.value.rules.otp;
  if (c.superseded) return fail('CHALLENGE_SUPERSEDED');          // a resend invalidates the previous OTP
  if (c.usedAtEpochMs !== null) return fail('CHALLENGE_USED');      // OTP reuse forbidden
  if ((c.failedAttempts as number) >= otp.maxFailedAttempts) return fail('CHALLENGE_LOCKED');   // cooldown + new authorised verification flow
  if (nowEpochMs - c.issuedAtEpochMs >= otp.ttlMinutes * MIN || c.issuedAtEpochMs > nowEpochMs) return fail('CHALLENGE_EXPIRED');
  return { ok: true, value: 'ATTEMPT_ALLOWED' };
}

/** The failure count belongs to the verification lifecycle: a resent challenge starts with the previous count (never reset). */
export function carryFailedAttempts(previous: { readonly failedAttempts: number }): number {
  return Number.isSafeInteger(previous.failedAttempts) && previous.failedAttempts > 0 ? previous.failedAttempts : 0;
}

/** Verified proof: <= 15 minutes, never past link expiry, bound to member, link and current contact version. */
export function evaluateVerificationProof(proof: unknown, context: { memberRef: string; linkRef: string; contactVersion: string; linkExpiresAtEpochMs: number }, nowEpochMs: number, policy: unknown): PssResult<'PROOF_VALID', LinkErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  const p = plain(proof, ['memberRef', 'linkRef', 'contactVersion', 'verifiedAtEpochMs']);
  if (!p || !isEpochMs(p.verifiedAtEpochMs) || !isEpochMs(nowEpochMs) || !isEpochMs(context.linkExpiresAtEpochMs)) return fail('VERIFICATION_REQUIRED');
  if (p.memberRef !== context.memberRef || p.linkRef !== context.linkRef || p.contactVersion !== context.contactVersion) return fail('VERIFICATION_REQUIRED', 'binding');
  if (p.verifiedAtEpochMs > nowEpochMs || nowEpochMs - p.verifiedAtEpochMs >= resolved.value.rules.otp.proofTtlMinutes * MIN || nowEpochMs >= context.linkExpiresAtEpochMs) return fail('PROOF_EXPIRED');
  return { ok: true, value: 'PROOF_VALID' };
}
