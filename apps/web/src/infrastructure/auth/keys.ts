import type { ThrottleKey } from '@koperasi/application/auth/ports';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { ThrottleKind } from '@koperasi/domain/auth/throttle-policy';
import type { ParsedSecret } from './config.ts';

export type AuthKeys = {
  activeKid: string;
  csrfToken(sidHash: Buffer): string;
  verifyCsrf(token: string | null, sidHash: Buffer): boolean;
  throttleKeys(username: string, ip: string | null): ThrottleKey[];
  /** Same HMAC as throttleKeys, for the admin unlock tool. */
  keyFor(kind: ThrottleKind, ...parts: string[]): ThrottleKey;
  shortId(value: string): string;
};

const sub = (secret: Buffer, purpose: string): Buffer => Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `kkisi/${purpose}/v1`, 32));
const hmac = (key: Buffer, data: Buffer | string): Buffer => createHmac('sha256', key).update(data).digest();

export function buildKeys(secrets: ParsedSecret[]): AuthKeys {
  const active = secrets[0];
  const csrfKeys = new Map(secrets.map((s) => [s.kid, sub(s.key, 'csrf')]));
  const throttle = sub(active.key, 'throttle');
  const keyFor = (kind: ThrottleKind, ...parts: string[]): ThrottleKey => ({ kind, keyHash: hmac(throttle, `${kind}|${parts.join('|')}`) });
  return {
    activeKid: active.kid,
    csrfToken: (sidHash) => `${active.kid}.${hmac(csrfKeys.get(active.kid)!, sidHash).toString('hex')}`,
    verifyCsrf(token, sidHash) {
      if (typeof token !== 'string' || token.length > 100) return false;
      const dot = token.indexOf('.');
      const key = dot > 0 ? csrfKeys.get(token.slice(0, dot)) : undefined;
      if (!key) return false;
      const given = Buffer.from(token.slice(dot + 1), 'hex');
      const expected = hmac(key, sidHash);
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
    throttleKeys(username, ip) {
      const list = [keyFor('user', username)];
      if (ip) { list.push(keyFor('pair', username, ip)); list.push(keyFor('ip', ip)); }
      return list;
    },
    keyFor,
    shortId: (value) => hmac(throttle, `log|${value}`).subarray(0, 4).toString('hex'),
  };
}
