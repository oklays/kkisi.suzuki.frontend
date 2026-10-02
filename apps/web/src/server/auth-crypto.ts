import { createHash } from 'node:crypto';
import type { SessionIdentity } from '@koperasi/application/auth/ports';

export function sidToHash(sid: string): Buffer {
  return createHash('sha256').update(sid, 'utf8').digest();
}

/** Password fingerprint: first 8 bytes of SHA-256(stored password hash). Changes when the password changes. */
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash, 'utf8').digest().subarray(0, 8).toString('hex');
}

export const sessionIdentity: SessionIdentity = { sidToHash, passwordFingerprint };
