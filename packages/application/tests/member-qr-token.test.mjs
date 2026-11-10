import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  MemberQrReplayGuard, issueMemberQr, isDynamicMemberQr, parseMemberQrSigningKey, parseMemberQrVerifyKeys, verifyMemberQr,
} from '../src/member-qr/token.ts';

function pair(kid) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    signing: parseMemberQrSigningKey(`${kid}:${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`),
    verifyRaw: `${kid}:${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}`,
  };
}
const T = new Date('2026-11-11T03:00:00Z');
const at = (s) => new Date(T.getTime() + s * 1000);

test('issue -> verify: compact token, member id only, single use', () => {
  const k = pair('q1');
  const keys = parseMemberQrVerifyKeys(k.verifyRaw);
  const { token, expiresAt } = issueMemberQr(k.signing, 9001, T);
  assert.match(token, /^KQ1\.q1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
  assert.ok(token.length < 200, `short enough for a dense-free QR: ${token.length}`);
  assert.equal(expiresAt, Math.floor(T.getTime() / 1000) + 60);
  assert.ok(!Buffer.from(token.split('.')[2], 'base64url').toString().includes('nik'), 'no NIK in the payload');
  const guard = new MemberQrReplayGuard();
  const r = verifyMemberQr(keys, token, at(5), guard);
  assert.equal(r.ok, true);
  assert.equal(r.claims.memberId, 9001);
  assert.deepEqual(verifyMemberQr(keys, token, at(6), guard), { ok: false, reason: 'REPLAYED' });
  assert.equal(isDynamicMemberQr(token), true);
  assert.equal(isDynamicMemberQr('U2FsdGVkX1+legacy=='), false);
});

test('refusals: expired, not yet valid, tampered, foreign key, unknown kid, malformed', () => {
  const k = pair('q1'), other = pair('q1');
  const keys = parseMemberQrVerifyKeys(k.verifyRaw);
  const { token } = issueMemberQr(k.signing, 9001, T);
  assert.deepEqual(verifyMemberQr(keys, token, at(60 + 31)), { ok: false, reason: 'EXPIRED' });
  assert.equal(verifyMemberQr(keys, token, at(60 + 29)).ok, true, 'small clock skew tolerated');
  assert.deepEqual(verifyMemberQr(keys, token, at(-31)), { ok: false, reason: 'NOT_YET_VALID' });
  const [p, kid, payload, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), m: 9002 })).toString('base64url');
  assert.deepEqual(verifyMemberQr(keys, [p, kid, forged, sig].join('.'), at(1)), { ok: false, reason: 'BAD_SIGNATURE' }, 'another member id cannot be substituted');
  assert.deepEqual(verifyMemberQr(keys, issueMemberQr(other.signing, 9001, T).token, at(1)), { ok: false, reason: 'BAD_SIGNATURE' });
  assert.deepEqual(verifyMemberQr(keys, token.replace('KQ1.q1.', 'KQ1.q9.'), at(1)), { ok: false, reason: 'UNKNOWN_KEY' });
  assert.deepEqual(verifyMemberQr(keys, 'KQ1.q1.abc', at(1)), { ok: false, reason: 'MALFORMED' });
  assert.deepEqual(verifyMemberQr(keys, '10234', at(1)), { ok: false, reason: 'NOT_DYNAMIC' });
});

test('key rotation: tokens of the old kid verify while both public keys are configured', () => {
  const a = pair('q1'), b = pair('q2');
  const both = parseMemberQrVerifyKeys(`${b.verifyRaw},${a.verifyRaw}`);
  assert.equal(verifyMemberQr(both, issueMemberQr(a.signing, 7, T).token, at(1)).ok, true);
  assert.equal(verifyMemberQr(both, issueMemberQr(b.signing, 7, T).token, at(1)).ok, true);
});

test('key parsing fails closed', () => {
  const k = pair('q1');
  for (const bad of [undefined, '', 'q1:short', 'Q1:AAAA', `${k.verifyRaw},${k.verifyRaw}`]) assert.throws(() => parseMemberQrVerifyKeys(bad));
  assert.throws(() => parseMemberQrSigningKey(k.verifyRaw), 'a public key is not a signing key');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  assert.throws(() => parseMemberQrSigningKey(`q1:${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`), 'only Ed25519');
  assert.throws(() => issueMemberQr(k.signing, 0, T));
  assert.throws(() => issueMemberQr(k.signing, 1, T, 600));
});
