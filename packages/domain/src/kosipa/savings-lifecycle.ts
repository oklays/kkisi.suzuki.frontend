/**
 * CP1-T01B — B-05 duplicate policy and the §16 logical submission lifecycle (KKISI-PSS-2026-V1 v1.0.0).
 * These are logical states; adapters map them onto the verified Laravel/CI2 state machine without inventing database values.
 * This decision is necessary but NOT sufficient: B-05 requires a shared transactional enforcement across all writers (CP1-T02/T05).
 */
import { resolveApprovedPolicy } from './savings-policy.ts';
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isEpochMs, isText, plain, type PssResult } from './savings-shared.ts';

export type LifecycleErrorCode = PublicSavingsErrorCode | 'PENDING_CONFLICT' | 'INVALID_TRANSITION';

/** Request states relevant to the cross-channel duplicate rule (B-05). */
export type ChangeRequestState = 'PENDING_VALIDATION' | 'PENDING_REVIEW' | 'OPEN' | 'POSTING' | 'APPROVED_NOT_POSTED' | 'REJECTED' | 'CANCELLED' | 'POSTED_CONFIRMED';
const BLOCKING: readonly string[] = ['PENDING_VALIDATION', 'PENDING_REVIEW', 'OPEN', 'POSTING', 'APPROVED_NOT_POSTED'];
const RELEASED: readonly string[] = ['REJECTED', 'CANCELLED', 'POSTED_CONFIRMED'];

export interface ExistingChangeRequest {
  readonly memberRef: string;
  readonly channel: 'PUBLIC' | 'MOBILE' | 'LEGACY';
  readonly state: string;
  readonly period: { readonly year: number; readonly month: number } | null;
}

const samePeriod = (a: unknown, b: { year: number; month: number }) => {
  const p = plain(a, ['year', 'month']);
  return !!p && p.year === b.year && p.month === b.month;
};

/**
 * One active savings-deduction change per canonical member identity across public and mobile channels, regardless of period.
 * Unknown states block (fail closed). POSTED_CONFIRMED releases except for the same payroll period.
 */
export function evaluateDuplicateConflict(memberRef: unknown, requests: unknown, requestedPeriod: { year: number; month: number }, policy: unknown): PssResult<{ readonly conflict: false }, LifecycleErrorCode> {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok) return resolved;
  if (!isText(memberRef, 128)) return fail('INVALID_INPUT', 'memberRef');
  if (!Array.isArray(requests)) return fail('INVALID_INPUT', 'requests');
  for (const raw of requests) {
    const r = plain(raw, ['memberRef', 'channel', 'state', 'period']);
    if (!r || r.memberRef !== memberRef || typeof r.state !== 'string') return fail('INVALID_INPUT', 'requests');
    if (!RELEASED.includes(r.state) || BLOCKING.includes(r.state)) return fail('PENDING_CONFLICT', 'state');
    if (r.state === 'POSTED_CONFIRMED' && samePeriod(r.period, requestedPeriod)) return fail('PENDING_CONFLICT', 'period');
  }
  return { ok: true, value: { conflict: false } };
}

export type SubmissionState = 'ISSUED' | 'VERIFIED' | 'REVIEWED' | 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'POSTING'
  | 'POSTED_CONFIRMED' | 'REVOKED' | 'EXPIRED' | 'CANCELLED';
export type SubmissionEvent = 'VERIFY' | 'REVIEW' | 'SUBMIT' | 'QUEUE_FOR_APPROVAL' | 'APPROVE' | 'REJECT' | 'START_POSTING' | 'CONFIRM_POSTED' | 'REVOKE' | 'EXPIRE' | 'CANCEL';

/** Allowed logical transitions. Approval/posting events are performed by their legacy owners (CI2/payroll), never by the public flow. */
const TRANSITIONS: Readonly<Record<string, Readonly<Partial<Record<SubmissionEvent, SubmissionState>>>>> = {
  ISSUED: { VERIFY: 'VERIFIED', REVOKE: 'REVOKED', EXPIRE: 'EXPIRED' },
  VERIFIED: { REVIEW: 'REVIEWED', REVOKE: 'REVOKED', EXPIRE: 'EXPIRED' },
  REVIEWED: { SUBMIT: 'SUBMITTED', REVIEW: 'REVIEWED', REVOKE: 'REVOKED', EXPIRE: 'EXPIRED' },
  SUBMITTED: { QUEUE_FOR_APPROVAL: 'PENDING_APPROVAL', CANCEL: 'CANCELLED' },
  PENDING_APPROVAL: { APPROVE: 'APPROVED', REJECT: 'REJECTED', CANCEL: 'CANCELLED' },
  APPROVED: { START_POSTING: 'POSTING' },
  POSTING: { CONFIRM_POSTED: 'POSTED_CONFIRMED' },
  REJECTED: {}, POSTED_CONFIRMED: {}, REVOKED: {}, EXPIRED: {}, CANCELLED: {},
};

export function nextSubmissionState(state: unknown, event: unknown): PssResult<SubmissionState, LifecycleErrorCode> {
  if (typeof state !== 'string' || !Object.prototype.hasOwnProperty.call(TRANSITIONS, state)) return fail('INVALID_INPUT', 'state');
  const next = typeof event === 'string' ? TRANSITIONS[state][event as SubmissionEvent] : undefined;
  return next ? { ok: true, value: next } : fail('INVALID_TRANSITION', 'event');
}

/** §16: a submitted application unresolved for more than 30 calendar days goes to authorised staff review, never auto-applied. */
export function isStaleSubmission(submittedAtEpochMs: number, nowEpochMs: number, policy: unknown): boolean {
  const resolved = resolveApprovedPolicy(policy);
  if (!resolved.ok || !isEpochMs(submittedAtEpochMs) || !isEpochMs(nowEpochMs)) return true;   // fail closed: route to staff
  return nowEpochMs - submittedAtEpochMs > resolved.value.rules.lifecycle.staleSubmissionDays * 86400000;
}
