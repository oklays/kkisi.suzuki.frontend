import { createHmac, randomBytes } from 'node:crypto';
import type { Secret } from '../../lib/config/env.ts';

/** 32 random bytes, base64url (43 chars): the only value the member's cookie carries. */
export const newSessionId = (): string => randomBytes(32).toString('base64url');
export const isWellFormedSid = (value: string | null | undefined): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

/** The store keeps only HMAC(secret, sid). With key rotation, lookups try every configured key (first = active). */
export function sessionHashes(sid: string, secrets: readonly Secret[]): { kid: string; hash: string }[] {
  return secrets.map((s) => ({ kid: s.kid, hash: createHmac('sha256', s.key).update(`sid:${sid}`).digest('hex') }));
}

/** Throttle keys never store a raw identity, user id or IP address. */
export function throttleKey(kind: 'identity' | 'ip' | 'pin' | 'write', value: string, secret: Secret): string {
  return createHmac('sha256', secret.key).update(`throttle:${kind}:${value.toLowerCase()}`).digest('hex');
}

/** Keyed digest (active PIN pepper) of the upstream stored PIN so shadow PIN hashes detect upstream PIN resets without storing raw PINs. */
export function pinSourceDigest(storedPin: string, secret: Secret): string {
  return createHmac('sha256', secret.key).update(`pin-src:${storedPin.trim()}`).digest('hex');
}
