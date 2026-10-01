import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleLogout } from '../src/infrastructure/auth/handlers/logout.ts';
import { handleSession } from '../src/infrastructure/auth/handlers/session.ts';
import { StoreUnavailableError } from '../src/domain/auth/errors.ts';
import { bodyOf, cookieOf, legacyStyleHash, makeRequest, makeWorld } from './helpers/auth-fakes.mjs';

const PW = 'Pw-Synthetic-1';
const login = (w, body, o = {}) => handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body, ...o }));
const world = (o) => { const w = makeWorld(o); w.addUser({ id: 1, username: 'kasir', passwordHash: legacyStyleHash(PW) }); return w; };
const shape = async (r) => JSON.stringify({ s: r.status, b: await r.clone().text(), h: [...r.headers].filter(([k]) => !['set-cookie'].includes(k)) });

test('correct credentials: 200, opaque HttpOnly cookie, no hash/secret in the body, session stored hashed', async () => {
  const w = world();
  const r = await login(w, { username: 'kasir', password: PW });
  assert.equal(r.status, 200);
  const body = await bodyOf(r);
  assert.deepEqual(Object.keys(body).sort(), ['companyId', 'csrfToken', 'user']);
  assert.equal(body.companyId, 1);
  assert.deepEqual(Object.keys(body.user).sort(), ['id', 'name', 'roleId']);
  const setCookie = r.headers.get('set-cookie');
  assert.match(setCookie, /^kkisi_sid=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax$/);
  const sid = cookieOf(r).split('=')[1];
  assert.equal(w.sessions.rows.size, 1);
  for (const row of w.sessions.rows.values()) { assert.equal(row.sidHash.toString('base64url') === sid, false); assert.equal(JSON.stringify(row).includes(sid), false); }
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(JSON.stringify(body).includes('$2'), false);
});

test('login is case/space tolerant on the username like the legacy DB collation', async () => {
  const w = world();
  assert.equal((await login(w, { username: '  KASIR ', password: PW })).status, 200);
});

test('passwords with & < > " \' verify through the legacy html_escape candidate', async () => {
  const w = world(); const legacyStored = "a&amp;b&lt;c&gt;&quot;d&#039;e";           // what legacy hashed for a&b<c>"d'e
  w.addUser({ id: 2, username: 'esc', passwordHash: legacyStyleHash(legacyStored) });
  assert.equal((await login(w, { username: 'esc', password: `a&b<c>"d'e` })).status, 200);
  assert.equal((await login(w, { username: 'esc', password: legacyStored })).status, 200, 'the raw candidate also works if it was hashed raw');
});

test('every failure is the SAME 401 body/headers: unknown user, wrong password, disabled user, inactive role/branch, md5 hash, unsupported class', async () => {
  const w = world();
  w.addUser({ id: 2, username: 'off', status: 0, passwordHash: legacyStyleHash(PW) });
  w.addUser({ id: 3, username: 'norole', roleStatus: 0, passwordHash: legacyStyleHash(PW) });
  w.addUser({ id: 4, username: 'nobranch', companyId: 9, passwordHash: legacyStyleHash(PW) });
  w.addUser({ id: 5, username: 'legacymd5', passwordHash: '900150983cd24fb0d6963f7d28e17f72' });
  w.addUser({ id: 6, username: 'pct', passwordHash: legacyStyleHash('pw A') });      // legacy decoded %41 -> 'A'; we cannot reproduce
  const attempts = [['ghost', PW], ['kasir', 'wrong'], ['off', PW], ['norole', PW], ['nobranch', PW], ['legacymd5', 'abc'], ['pct', 'pw%41'], ['norole', 'wrong']];
  const shapes = new Set(); const calls = [];
  for (const [u, p] of attempts) {
    const before = w.verifier.calls; const r = await login(w, { username: u, password: p });
    assert.equal(r.status, 401, u); shapes.add(await shape(r)); calls.push(w.verifier.calls - before);
  }
  assert.equal(shapes.size, 1, 'responses must be byte-identical (body and headers)');
  assert.ok(calls.every((c) => c >= 1 && c <= 2), `each attempt spends 1-2 verifications: ${calls}`);
  assert.deepEqual(new Set(w.logs.filter((l) => l.event === 'login_failed').map((l) => l.reason)), new Set(['bad_credentials', 'role_inactive', 'company_inactive', 'unsupported_hash', 'unsupported_password_class']));
  assert.equal(w.sessions.rows.size, 0, 'no session for any failed login');
});

test('unknown and known usernames spend the same verifier work (no timing/enumeration oracle in call counts)', async () => {
  const w = world();
  const count = async (u) => { const b = w.verifier.calls; await login(w, { username: u, password: 'nope' }); return w.verifier.calls - b; };
  assert.equal(await count('ghost'), await count('kasir'));
});

test('throttle: 10 failures per username lock further attempts (429 + Retry-After) even for the RIGHT password; lock expires', async () => {
  const w = world();
  for (let i = 0; i < 10; i++) assert.equal((await login(w, { username: 'kasir', password: 'x' + i })).status, 401);
  const locked = await login(w, { username: 'kasir', password: PW });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  assert.deepEqual(await bodyOf(locked), { error: 'TOO_MANY_ATTEMPTS' });
  const callsBefore = w.verifier.calls; await login(w, { username: 'kasir', password: PW });
  assert.equal(w.verifier.calls, callsBefore, 'a locked attempt never reaches the password verifier');
  assert.equal((await login(w, { username: ' KASIR', password: PW })).status, 429, 'case/space cannot dodge the key');
  assert.equal((await login(w, { username: 'someoneelse', password: 'x' })).status, 401, 'other users are unaffected');
  w.clock.advance(15 * 60 * 1000 + 1000);
  assert.equal((await login(w, { username: 'kasir', password: PW })).status, 200);
});

test('throttle: a successful login clears the user key; failures below the limit do not lock', async () => {
  const w = world();
  for (let i = 0; i < 9; i++) await login(w, { username: 'kasir', password: 'x' });
  assert.equal((await login(w, { username: 'kasir', password: PW })).status, 200);
  for (let i = 0; i < 9; i++) await login(w, { username: 'kasir', password: 'x' });
  assert.equal((await login(w, { username: 'kasir', password: PW })).status, 200, 'counter restarted after success');
});

test('throttle by IP/pair is OFF without a trusted proxy: forged X-Forwarded-For changes nothing', async () => {
  const w = world();
  for (let i = 0; i < 9; i++) await login(w, { username: 'u' + i, password: 'x' }, { headers: { 'x-forwarded-for': '198.51.100.7' } });
  assert.equal(w.throttle.rows.size, 9, 'only per-username keys exist (one each)');
  for (let i = 0; i < 40; i++) await login(w, { username: 'sprayed' + i, password: 'x' }, { headers: { 'x-forwarded-for': `10.0.0.${i}` } });
  const kinds = new Set([...w.throttle.rows.values()].map((r) => r.kind)); assert.deepEqual([...kinds], ['user']);
});

test('behind a trusted proxy (hops=1) the pair and ip keys are active and use the proxy-appended address only', async () => {
  const w = world({ env: { TRUSTED_PROXY_HOPS: '1' } }); const H = (real) => ({ 'x-forwarded-for': `6.6.6.6, ${real}` });
  for (let i = 0; i < 5; i++) await login(w, { username: 'kasir', password: 'x' }, { headers: H('203.0.113.9') });
  assert.equal((await login(w, { username: 'kasir', password: PW }, { headers: H('203.0.113.9') })).status, 429, 'pair key locked at 5');
  assert.equal((await login(w, { username: 'kasir', password: PW }, { headers: H('203.0.113.77') })).status, 200, 'same user from another IP still passes the pair key (user key < 10)');
  for (let i = 0; i < 30; i++) await login(w, { username: 'spray' + i, password: 'x' }, { headers: H('198.51.100.1') });
  assert.equal((await login(w, { username: 'fresh', password: 'x' }, { headers: H('198.51.100.1') })).status, 429, 'ip key locked at 30');
  assert.equal((await login(w, { username: 'fresh', password: 'x' })).status, 401, 'without the header there is no client address: only the user key applies');
  assert.equal((await login(w, { username: 'fresh', password: 'x' }, { headers: { 'x-forwarded-for': 'garbage' } })).status, 401, 'a malformed header is ignored, never trusted');
});

test('fixation: every login mints a NEW id; a pre-login cookie is never adopted; older sessions are untouched', async () => {
  const w = world();
  const planted = 'A'.repeat(43);
  const a = await login(w, { username: 'kasir', password: PW }, { cookie: `kkisi_sid=${planted}` });
  const b = await login(w, { username: 'kasir', password: PW });
  const sidA = cookieOf(a).split('=')[1], sidB = cookieOf(b).split('=')[1];
  assert.notEqual(sidA, planted); assert.notEqual(sidA, sidB);
  assert.equal(w.sessions.rows.size, 2);
  const okA = await handleSession(w.services, makeRequest('/api/auth/session', { cookie: `kkisi_sid=${sidA}` }));
  assert.equal(okA.status, 200);
  assert.equal((await handleSession(w.services, makeRequest('/api/auth/session', { cookie: `kkisi_sid=${planted}` }))).status, 401);
});

test('malformed input is a 400 before any database work; origin/content-type problems are 403', async () => {
  const w = world(); const calls = () => w.sessions.calls.length + w.verifier.calls;
  for (const body of ['not json', '[]', '{}', '{"username":1,"password":"x"}', '{"username":"","password":"x"}', '{"username":"a","password":""}',
    JSON.stringify({ username: 'a'.repeat(101), password: 'x' }), JSON.stringify({ username: 'a', password: 'x'.repeat(129) }), JSON.stringify({ username: 'a', password: 'x', pad: 'y'.repeat(1100) })]) {
    const r = await login(w, body); assert.equal(r.status, 400, body.slice(0, 30));
  }
  assert.equal(calls(), 0);
  assert.equal((await login(w, { username: 'kasir', password: PW }, { origin: 'http://evil.test' })).status, 403);
  assert.equal((await login(w, { username: 'kasir', password: PW }, { origin: null })).status, 403);
  assert.equal((await login(w, { username: 'kasir', password: PW }, { contentType: 'text/plain' })).status, 403);
  assert.equal((await login(w, { username: 'kasir', password: PW }, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal(calls(), 0);
});

test('store or verifier outage fails closed: 503 (never 200, never 401)', async () => {
  const w = world();
  w.throttle.down = true; assert.equal((await login(w, { username: 'kasir', password: PW })).status, 503); w.throttle.down = false;
  w.sessions.down = true; assert.equal((await login(w, { username: 'kasir', password: PW })).status, 503); w.sessions.down = false;
  w.data.failing.add('users'); assert.equal((await login(w, { username: 'kasir', password: PW })).status, 503); w.data.failing.clear();
  w.verifier.busy = true; const busy = await login(w, { username: 'kasir', password: PW }); assert.equal(busy.status, 503); assert.ok(busy.headers.get('retry-after')); w.verifier.busy = false;
  assert.equal(w.sessions.rows.size, 0);
  assert.equal((await login(w, { username: 'kasir', password: PW })).status, 200, 'and recovers once the dependency is back');
});

test('a failing throttle write while recording a bad password is 503, not a silent pass', async () => {
  const w = world(); const orig = w.throttle.recordFailure.bind(w.throttle);
  w.throttle.recordFailure = async () => { throw new StoreUnavailableError(); };
  assert.equal((await login(w, { username: 'kasir', password: 'wrong' })).status, 503);
  w.throttle.recordFailure = orig;
});

test('housekeeping failures (throttle clear, purge) never block a valid login', async () => {
  const w = world(); w.throttle.clear = async () => { throw new StoreUnavailableError(); }; w.sessions.purge = async () => { throw new StoreUnavailableError(); };
  assert.equal((await login(w, { username: 'kasir', password: PW })).status, 200);
  assert.ok(w.logs.some((l) => l.event === 'housekeeping_failed'));
});

test('logout: persistent revocation (survives a "restart" with the same store), idempotent, needs the CSRF token', async () => {
  const w = world();
  const r = await login(w, { username: 'kasir', password: PW }); const sid = cookieOf(r); const { csrfToken } = await bodyOf(r);
  const call = (o = {}) => handleLogout(w.services, makeRequest('/api/auth/logout', { method: 'POST', cookie: sid, ...o }));
  assert.equal((await call()).status, 403, 'a live session without the token is refused (no logout-CSRF)');
  assert.equal((await handleSession(w.services, makeRequest('/api/auth/session', { cookie: sid }))).status, 200);
  const out = await call({ token: csrfToken });
  assert.equal(out.status, 200); assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  // "restart": a brand new set of services over the SAME persisted store
  const w2 = makeWorld(); w2.sessions = w.sessions; w2.services.deps.sessions = w.sessions; w2.data.users = w.data.users;
  assert.equal((await handleSession(w2.services, makeRequest('/api/auth/session', { cookie: sid }))).status, 401, 'the revoked id stays dead after a restart');
  assert.equal((await call({ token: csrfToken })).status, 200, 'second logout is an idempotent no-op (cookie cleared)');
  const row = [...w.sessions.rows.values()][0]; assert.equal(row.revokedReason, 'logout');
});

test('logout without a live session just clears the cookie; store failure on a live session is 503', async () => {
  const w = world();
  assert.equal((await handleLogout(w.services, makeRequest('/api/auth/logout', { method: 'POST' }))).status, 200);
  assert.equal((await handleLogout(w.services, makeRequest('/api/auth/logout', { method: 'POST', cookie: 'kkisi_sid=' + 'B'.repeat(43) }))).status, 200);
  assert.equal((await handleLogout(w.services, makeRequest('/api/auth/logout', { method: 'POST', origin: 'http://evil.test' }))).status, 403);
  w.sessions.down = true;
  const r = await handleLogout(w.services, makeRequest('/api/auth/logout', { method: 'POST', cookie: 'kkisi_sid=' + 'C'.repeat(43) }));
  assert.equal(r.status, 503);
});

test('no secret, hash, session id or username ever reaches the log or a response', async () => {
  const w = world();
  const ok = await login(w, { username: 'kasir', password: PW });
  const sid = cookieOf(ok).split('=')[1]; const okBody = await bodyOf(ok); const { csrfToken } = okBody;
  const bad = await login(w, { username: 'kasir', password: 'Wrong-Secret-9' });
  const texts = [JSON.stringify(w.logs), await bad.text(), JSON.stringify(okBody)];
  for (const t of texts) for (const secret of [PW, 'Wrong-Secret-9', w.data.users.get(1).passwordHash, sid, 'kasir', process.env.AUTH_SECRETS ?? 'n/a']) assert.equal(t.includes(secret), false, `leak of ${secret.slice(0, 6)}`);
  assert.equal(JSON.stringify(w.logs).includes(csrfToken), false);
});
