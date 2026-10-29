/**
 * CP1-T01B — B-11 idempotency and unknown-commit decisions (KKISI-PSS-2026-V1 v1.0.0). The unit of work, unique keys and the
 * authoritative lookup are infrastructure (CP1-T02/T05); these pure decisions define what each outcome must mean.
 */
import type { PublicSavingsErrorCode } from './savings-application.ts';
import { fail, isText, plain, type PssResult } from './savings-shared.ts';

export type IdempotencyErrorCode = PublicSavingsErrorCode | 'IDEMPOTENCY_CONFLICT' | 'COMMIT_OUTCOME_UNKNOWN';
export interface IdempotencyScope { readonly actorRef: string; readonly memberRef: string; readonly command: 'ISSUE_LINK' | 'REVOKE_LINK' | 'SUBMIT' }
export interface IdempotencyRequest { readonly scope: IdempotencyScope; readonly key: string; readonly payloadFingerprint: string }
export interface StoredIdempotencyRecord extends IdempotencyRequest { readonly receiptRef: string }
export type IdempotencyOutcome = { readonly kind: 'NEW' } | { readonly kind: 'REPLAY'; readonly receiptRef: string };

const KEY = /^[\x21-\x7e]{1,128}$/u;
const sameScope = (a: unknown, b: unknown) => {
  const x = plain(a, ['actorRef', 'memberRef', 'command']); const y = plain(b, ['actorRef', 'memberRef', 'command']);
  return !!x && !!y && x.actorRef === y.actorRef && x.memberRef === y.memberRef && x.command === y.command;
};

/** Same scope + key + payload -> the existing receipt; same key with a different payload or scope -> conflict without revealing it. */
export function idempotencyDecision(stored: unknown, request: IdempotencyRequest): PssResult<IdempotencyOutcome, IdempotencyErrorCode> {
  if (typeof request.key !== 'string' || !KEY.test(request.key)) return fail('INVALID_INPUT', 'key');
  if (!isText(request.payloadFingerprint, 160) || !plain(request.scope, ['actorRef', 'memberRef', 'command'])) return fail('INVALID_INPUT', 'request');
  if (stored === null) return { ok: true, value: { kind: 'NEW' } };
  const s = plain(stored, ['scope', 'key', 'payloadFingerprint', 'receiptRef']);
  if (!s || !isText(s.receiptRef, 128)) return fail('INVALID_INPUT', 'stored');
  if (s.key !== request.key || !sameScope(s.scope, request.scope) || s.payloadFingerprint !== request.payloadFingerprint) return fail('IDEMPOTENCY_CONFLICT');
  return { ok: true, value: { kind: 'REPLAY', receiptRef: s.receiptRef } };
}

/**
 * After a timeout that may have committed: only an authoritative lookup decides. Found + same payload -> replay; found + other
 * payload -> conflict; authoritatively absent -> retry with the SAME key; lookup unavailable -> unknown (no new write, no failure claim).
 */
export function resolveUncertainCommit(lookup: unknown, request: { key: string; payloadFingerprint: string }): PssResult<IdempotencyOutcome | { readonly kind: 'RETRY_SAME_KEY' }, IdempotencyErrorCode> {
  const l = plain(lookup, ['status', 'payloadFingerprint', 'receiptRef'], ['status']);
  if (!l) return fail('COMMIT_OUTCOME_UNKNOWN');
  if (l.status === 'FOUND') {
    if (!isText(l.receiptRef, 128)) return fail('COMMIT_OUTCOME_UNKNOWN');
    return l.payloadFingerprint === request.payloadFingerprint ? { ok: true, value: { kind: 'REPLAY', receiptRef: l.receiptRef } } : fail('IDEMPOTENCY_CONFLICT');
  }
  if (l.status === 'NOT_FOUND_AUTHORITATIVE') return { ok: true, value: { kind: 'RETRY_SAME_KEY' } };
  return fail('COMMIT_OUTCOME_UNKNOWN');
}
