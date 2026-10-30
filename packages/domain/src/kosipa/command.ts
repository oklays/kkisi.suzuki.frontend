import { KosipaError } from './errors.ts';

/**
 * FA-01 command primitives (spec TASK-106; REQ-105, NFR-105, VAL-108, VAL-109). Pure decisions shared by every native KOSIPA
 * write: the idempotency key, the canonical request fingerprint, what a stored ledger row means for a retry, the reason rule
 * and the allow-listed before/after snapshot. Hashing, locking and persistence are infrastructure.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** VAL-109: one UUID v4 per submit attempt, reused by the client on retry. Normalised to lower case (stored CHAR(36), binary collation). */
export function parseIdempotencyKey(raw: unknown): string {
  const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!UUID_V4.test(key)) throw new KosipaError('IDEMPOTENCY_KEY_INVALID');
  return key;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonical(value: unknown, depth: number): Json {
  if (depth > 8) throw new KosipaError('INVALID_INPUT');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new KosipaError('INVALID_INPUT'); return value; }
  if (Array.isArray(value)) return value.map((item) => canonical(item, depth + 1));
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonical(item, depth + 1);
    }
    return out;
  }
  throw new KosipaError('INVALID_INPUT');
}

/** Key order and `undefined` members never change the fingerprint; anything that is not plain JSON is refused. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value, 0));
}

/**
 * The text whose SHA-256 is the request hash. It binds the command, its subject and the parsed payload, so reusing a key for
 * another command, another record or other values is a conflict, never a silent replay.
 */
export function commandFingerprint(command: string, subject: { type: string; ref: string }, payload: unknown): string {
  return `kosipa-command:v1\n${command}\n${subject.type}:${subject.ref}\n${canonicalJson(payload)}`;
}

export type StoredCommand = { ledgerId: number; command: string; requestHash: string; result: unknown };
export type IdempotencyDecision = { kind: 'execute' } | { kind: 'replay'; ledgerId: number; result: unknown };

/**
 * Only COMMITTED commands are stored (the ledger row is written in the business transaction), so a stored row always means
 * "this effect exists". Same key + same hash -> return the first result; same key + anything else -> conflict.
 */
export function idempotencyDecision(stored: StoredCommand | null, request: { command: string; requestHash: string }): IdempotencyDecision {
  if (!stored) return { kind: 'execute' };
  if (stored.command !== request.command || stored.requestHash !== request.requestHash) throw new KosipaError('IDEMPOTENCY_CONFLICT');
  return { kind: 'replay', ledgerId: stored.ledgerId, result: stored.result };
}

export const REASON_MIN = 5;
export const REASON_MAX = 200;

/** VAL-108: reject/reverse/override/status-change reasons are 5–200 printable characters after trimming. */
export function parseReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX || /[\u0000-\u001f\u007f]/.test(reason)) throw new KosipaError('REASON_INVALID');
  return reason;
}

export type Snapshot = Record<string, string | number | boolean | null>;

/**
 * Ledger before/after values: only the listed fields, only scalars, strings capped. Callers list business codes, amounts,
 * statuses and dates; personal fields (NIK, names, phone, address, salary, bank) are never listed (OBS-101, SEC-111).
 */
export function ledgerSnapshot(values: Record<string, unknown>, allow: readonly string[]): Snapshot {
  const out: Snapshot = {};
  for (const key of allow) {
    const value = values[key];
    if (value === null || typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string') out[key] = value.slice(0, 200);
  }
  return out;
}
