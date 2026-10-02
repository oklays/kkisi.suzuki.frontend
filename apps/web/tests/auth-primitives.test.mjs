import { passwordFingerprint, sidToHash } from '../src/server/auth-crypto.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { isBcryptHash, DUMMY_HASH } from '@koperasi/domain/auth/password';
import { isWellFormedSid } from '@koperasi/domain/auth/session-policy';
import { loadAuthConfig, parseAppOrigin, parseSecrets } from '../src/infrastructure/auth/config.ts';
import { buildKeys } from '../src/infrastructure/auth/keys.ts';
import { checkOrigin, isJsonRequest } from '../src/infrastructure/auth/origin.ts';
import { clearedCookie, readCookie, sessionCookie } from '../src/infrastructure/auth/cookies.ts';
import { trustedClientIp } from '../src/infrastructure/auth/client-ip.ts';
import { ENV, SECRET_B64, legacyStyleHash } from './helpers/auth-fakes.mjs';

const throws = (fn, code = 'NOT_CONFIGURED') => assert.throws(fn, (e) => e.code === code);

test('session ids: 43-char base64url only; only their SHA-256 is stored; fingerprint changes with the hash', () => {
  const sid = randomBytes(32).toString('base64url');
  assert.equal(isWellFormedSid(sid), true);
  for (const bad of [null, undefined, '', 'x', sid + 'a', sid.slice(1), sid.replace(/.$/, '='), `${sid.slice(0, 42)}!`, 5]) assert.equal(isWellFormedSid(bad), false, String(bad));
  assert.equal(sidToHash(sid).length, 32);
  assert.notEqual(sidToHash(sid).toString('base64url'), sid);
  const a = passwordFingerprint(legacyStyleHash('one')), b = passwordFingerprint(legacyStyleHash('two'));
  assert.match(a, /^[0-9a-f]{16}$/); assert.notEqual(a, b);
});

test('only bcrypt hashes are accepted; md5 leftovers and junk fail closed; the dummy hash is well formed', () => {
  assert.equal(isBcryptHash(legacyStyleHash('x')), true);
  assert.equal(isBcryptHash(DUMMY_HASH), true);
  for (const h of ['', '900150983cd24fb0d6963f7d28e17f72', '$1$abc$def', '$2y$10$short', 'plain', null]) assert.equal(isBcryptHash(h ?? ''), false, String(h));
});

test('config fails closed: origin must be a bare loopback origin', () => {
  assert.deepEqual(parseAppOrigin('http://127.0.0.1:3000'), { origin: 'http://127.0.0.1:3000', secure: false });
  assert.deepEqual(parseAppOrigin('https://localhost:3443'), { origin: 'https://localhost:3443', secure: true });
  for (const bad of [undefined, '', 'http://example.com', 'http://192.168.1.10:3000', 'http://0.0.0.0:3000', 'https://dev.example.org', 'ftp://127.0.0.1', 'http://127.0.0.1:3000/x', 'http://127.0.0.1:3000/?a=1', 'http://u:p@127.0.0.1:3000', 'not a url', 'http://127.0.0.1.evil.com'])
    throws(() => parseAppOrigin(bad));
});

test('config fails closed: secrets ring is validated (>= 32 bytes, unique kids, first is active)', () => {
  const k = (n) => randomBytes(n).toString('base64');
  assert.equal(parseSecrets(`k2:${k(48)},k1:${k(32)}`)[0].kid, 'k2');
  for (const bad of [undefined, '', 'k1', `:${k(48)}`, `k1:${k(16)}`, `k1:${k(48)},k1:${k(48)}`, `K1:${k(48)}`, `k1:${k(48)}!`, 'k1:'])
    throws(() => parseSecrets(bad));
});

test('config fails closed: both databases must be local, distinct, and the legacy account must not be able to write', () => {
  assert.equal(loadAuthConfig(ENV).cookieName, 'kkisi_sid');
  assert.equal(loadAuthConfig({ ...ENV, APP_ORIGIN: 'https://127.0.0.1:3443' }).cookieName, '__Host-kkisi_sid');
  const bad = (patch) => throws(() => loadAuthConfig({ ...ENV, ...patch }));
  bad({ DATABASE_URL: 'mysql://kkisi_read:pw@db.example.com:3306/kkisi_staging' });
  bad({ DATABASE_URL_AUTH: 'mysql://kkisi_auth:pw@10.0.0.9:3306/kkisi_auth_staging' });
  bad({ DATABASE_URL: 'mysql://kkisi_app:pw@127.0.0.1:3307/kkisi_staging' });
  bad({ DATABASE_URL: 'mysql://root:pw@127.0.0.1:3307/kkisi_staging' });
  bad({ DATABASE_URL_AUTH: ENV.DATABASE_URL });
  bad({ DATABASE_URL: undefined }); bad({ DATABASE_URL_AUTH: undefined }); bad({ AUTH_SECRETS: undefined }); bad({ APP_ORIGIN: undefined });
  bad({ TRUSTED_PROXY_HOPS: '-1' }); bad({ TRUSTED_PROXY_HOPS: 'x' }); bad({ TRUSTED_PROXY_HOPS: '9' });
  assert.equal(loadAuthConfig({ ...ENV, TRUSTED_PROXY_HOPS: '1' }).trustedProxyHops, 1);
  assert.equal(loadAuthConfig(ENV).trustedProxyHops, 0);
});

test('CSRF token is bound to the session, tamper-proof, and survives secret rotation', () => {
  const ring1 = parseSecrets(`k1:${SECRET_B64}`);
  const k1 = buildKeys(ring1); const h1 = sidToHash('s1'), h2 = sidToHash('s2');
  const t = k1.csrfToken(h1);
  assert.equal(k1.verifyCsrf(t, h1), true);
  assert.equal(k1.verifyCsrf(t, h2), false);                                         // another session's token
  for (const bad of [null, '', 'k1.', 'k1.zz', 'nokid', 'k9.' + t.split('.')[1], t.slice(0, -1) + (t.endsWith('0') ? '1' : '0'), 'k1.' + 'a'.repeat(400)]) assert.equal(k1.verifyCsrf(bad, h1), false);
  const ring2 = parseSecrets(`k2:${randomBytes(48).toString('base64')},k1:${SECRET_B64}`);
  const k2 = buildKeys(ring2);
  assert.equal(k2.verifyCsrf(t, h1), true, 'a token minted with k1 is still valid while k1 is in the ring');
  assert.match(k2.csrfToken(h1), /^k2\./);
  assert.equal(buildKeys(parseSecrets(`k2:${randomBytes(48).toString('base64')}`)).verifyCsrf(t, h1), false, 'k1 removed -> its tokens die');
  // the CSRF subkey is not the throttle subkey
  assert.notEqual(k1.keyFor('user', 'a').keyHash.toString('hex'), k1.csrfToken(h1));
});

test('throttle keys are HMACs (no readable username/IP), stable, and IP keys exist only with an address', () => {
  const keys = buildKeys(parseSecrets(`k1:${SECRET_B64}`));
  const a = keys.throttleKeys('kasir', null); assert.deepEqual(a.map((k) => k.kind), ['user']);
  const b = keys.throttleKeys('kasir', '203.0.113.9'); assert.deepEqual(b.map((k) => k.kind), ['user', 'pair', 'ip']);
  assert.equal(a[0].keyHash.length, 32); assert.equal(a[0].keyHash.toString('hex'), b[0].keyHash.toString('hex'));
  for (const k of b) { assert.equal(k.keyHash.includes(Buffer.from('kasir')), false); assert.equal(k.keyHash.includes(Buffer.from('203.0.113.9')), false); }
  assert.notEqual(keys.throttleKeys('other', null)[0].keyHash.toString('hex'), a[0].keyHash.toString('hex'));
});

test('origin check: exact APP_ORIGIN, referer fallback, cross-site refused; JSON only', () => {
  const cfg = { appOrigin: 'http://127.0.0.1:3000' };
  const r = (h) => new Request('http://127.0.0.1:3000/api/x', { method: 'POST', headers: h });
  assert.equal(checkOrigin(r({ origin: cfg.appOrigin }), cfg), true);
  assert.equal(checkOrigin(r({ referer: 'http://127.0.0.1:3000/pos?a=1' }), cfg), true);
  for (const h of [{}, { origin: 'http://evil.test' }, { origin: 'http://localhost:3000' }, { origin: 'http://127.0.0.1:3001' }, { origin: 'null' }, { referer: 'http://evil.test/' }, { referer: 'garbage' }, { origin: cfg.appOrigin, 'sec-fetch-site': 'cross-site' }])
    assert.equal(checkOrigin(r(h), cfg), false, JSON.stringify(h));
  assert.equal(isJsonRequest(r({ 'content-type': 'application/json' })), true);
  assert.equal(isJsonRequest(r({ 'content-type': 'application/json; charset=utf-8' })), true);
  for (const t of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'application/jsonx']) assert.equal(isJsonRequest(r(t ? { 'content-type': t } : {})), false, String(t));
});

test('cookies: HttpOnly, SameSite=Lax, Path=/, no Domain, session cookie; Secure + __Host- over https', () => {
  const plain = sessionCookie({ cookieName: 'kkisi_sid', secure: false }, 'SID');
  assert.equal(plain, 'kkisi_sid=SID; Path=/; HttpOnly; SameSite=Lax');
  const secure = sessionCookie({ cookieName: '__Host-kkisi_sid', secure: true }, 'SID');
  assert.match(secure, /^__Host-kkisi_sid=SID; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
  for (const c of [plain, secure]) { assert.doesNotMatch(c, /Domain=|Max-Age|Expires/i); }
  assert.match(clearedCookie({ cookieName: 'kkisi_sid', secure: false }), /Max-Age=0/);
  assert.equal(readCookie('a=1; kkisi_sid=abc; b=2', 'kkisi_sid'), 'abc');
  assert.equal(readCookie('xkkisi_sid=abc', 'kkisi_sid'), null); assert.equal(readCookie(null, 'kkisi_sid'), null); assert.equal(readCookie('kkisi_sid=' + 'a'.repeat(5000), 'kkisi_sid'), null);
});

test('client IP: X-Forwarded-For is ignored without a trusted proxy and cannot be forged past it', () => {
  assert.equal(trustedClientIp('6.6.6.6', 0), null);                     // no trusted proxy: header ignored (verified in 2A-0)
  assert.equal(trustedClientIp('6.6.6.6, 203.0.113.9', 0), null);
  assert.equal(trustedClientIp('6.6.6.6, 203.0.113.9', 1), '203.0.113.9');         // the proxy appended the real client last
  assert.equal(trustedClientIp('198.51.100.1, 203.0.113.9, 10.0.0.2', 2), '203.0.113.9');
  assert.equal(trustedClientIp('203.0.113.9', 2), null);                 // fewer entries than trusted hops
  for (const bad of [null, '', 'not-an-ip', '999.1.1.1', '1.2.3.4; DROP', 'x'.repeat(500)]) assert.equal(trustedClientIp(bad, 1), null);
  assert.equal(trustedClientIp('2001:db8::1', 1), '2001:db8::1');
});
