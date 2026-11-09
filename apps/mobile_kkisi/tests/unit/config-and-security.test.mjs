import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadAuthSettings, loadReaderSettings, parseOrigin, parseSecrets } from '../../src/lib/config/env.ts';
import { clientIp, isJson, sameOrigin, sessionCookie } from '../../src/lib/security/request.ts';
import { isWellFormedSid, newSessionId, sessionHashes, throttleKey } from '../../src/server/auth/crypto.ts';

const key = (b) => Buffer.alloc(32, b).toString('base64');
const base = {
  APP_ENV: 'production', APP_ORIGIN: 'https://app.kkisitb2.id', MEMBER_AUTH_SECRETS: `k1:${key(1)}`,
  DATABASE_URL_MEMBER_READ: 'mysql://mobile_reader:x@10.0.0.5:3306/smart_kopkar', DATABASE_URL_MEMBER_AUTH: 'mysql://mobile_auth:y@10.0.0.5:3306/kkisi_member_auth',
};

test('production settings: HTTPS public origin, __Host- cookie, separate accounts', () => {
  const s = loadAuthSettings(base);
  assert.equal(s.cookieName, '__Host-kkisi_member');
  assert.equal(s.secure, true);
  assert.equal(s.store.kind, 'mysql');
});

test('production refuses HTTP, loopback, paths and the in-memory session store', () => {
  for (const origin of ['http://app.kkisitb2.id', 'https://127.0.0.1', 'https://app.kkisitb2.id/x', 'https://u:p@app.kkisitb2.id']) {
    assert.throws(() => parseOrigin(origin, 'production'), ConfigError, origin);
  }
  assert.throws(() => loadAuthSettings({ ...base, MEMBER_AUTH_STORE: 'memory' }), ConfigError);
});

test('development allows loopback HTTP and the memory store', () => {
  const s = loadAuthSettings({ ...base, APP_ENV: 'development', APP_ORIGIN: 'http://127.0.0.1:3240', MEMBER_AUTH_STORE: 'memory' });
  assert.equal(s.cookieName, 'kkisi_member');
  assert.equal(s.store.kind, 'memory');
  assert.throws(() => parseOrigin('http://192.168.1.4:3240', 'development'), ConfigError, 'non-loopback HTTP is never accepted');
});

test('secrets: >= 32 bytes, unique kids, fail closed', () => {
  assert.equal(parseSecrets(`k1:${key(1)},k2:${key(2)}`).length, 2);
  for (const bad of [undefined, '', 'k1:short', `k1:${key(1)},k1:${key(2)}`, `K1:${key(1)}`]) assert.throws(() => parseSecrets(bad), ConfigError);
});

test('DSNs: root refused; reader and session store must be different accounts', () => {
  assert.throws(() => loadReaderSettings({ ...base, DATABASE_URL_MEMBER_READ: 'mysql://root:x@10.0.0.5/db' }), ConfigError);
  assert.throws(() => loadAuthSettings({ ...base, DATABASE_URL_MEMBER_AUTH: base.DATABASE_URL_MEMBER_READ }), ConfigError);
  assert.throws(() => loadReaderSettings({ ...base, MEMBER_DB_POOL_LIMIT: '20' }), ConfigError);
  assert.equal(loadReaderSettings(base).poolLimit, 2);
});

test('CSRF origin check, JSON body requirement, trusted-proxy IP', () => {
  const h = (o) => new Headers(o);
  assert.equal(sameOrigin(h({ origin: 'https://app.kkisitb2.id' }), 'https://app.kkisitb2.id'), true);
  assert.equal(sameOrigin(h({ origin: 'https://evil.example' }), 'https://app.kkisitb2.id'), false);
  assert.equal(sameOrigin(h({ origin: 'https://app.kkisitb2.id', 'sec-fetch-site': 'cross-site' }), 'https://app.kkisitb2.id'), false);
  assert.equal(sameOrigin(h({ referer: 'https://app.kkisitb2.id/masuk' }), 'https://app.kkisitb2.id'), true);
  assert.equal(sameOrigin(h({}), 'https://app.kkisitb2.id'), false);
  assert.equal(isJson(h({ 'content-type': 'application/json; charset=utf-8' })), true);
  assert.equal(isJson(h({ 'content-type': 'application/x-www-form-urlencoded' })), false);
  assert.equal(clientIp(h({ 'x-forwarded-for': '1.1.1.1, 10.0.0.2' }), 0), null);
  assert.equal(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1' }), 1), '1.1.1.1', 'a spoofed left-most value is ignored');
});

test('session cookie is host-only HttpOnly SameSite=Lax (+Secure); ids are 256-bit and stored only as HMAC', () => {
  const c = sessionCookie('__Host-kkisi_member', true, 'abc');
  assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Lax/); assert.match(c, /Secure/); assert.doesNotMatch(c, /Domain=/i);
  const sid = newSessionId();
  assert.equal(isWellFormedSid(sid), true);
  assert.equal(isWellFormedSid(`${sid}x`), false);
  const secrets = parseSecrets(`k1:${key(1)},k2:${key(2)}`);
  const [a, b] = sessionHashes(sid, secrets);
  assert.notEqual(a.hash, b.hash);
  assert.ok(!a.hash.includes(sid));
  assert.notEqual(throttleKey('identity', 'nik:10234', secrets[0]), throttleKey('ip', 'nik:10234', secrets[0]));
});
