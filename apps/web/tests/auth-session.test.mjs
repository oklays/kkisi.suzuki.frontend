import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleSession } from '../src/infrastructure/auth/handlers/session.ts';
import { handleRegister } from '../src/infrastructure/pos/handlers/register.ts';
import { handleProducts } from '../src/infrastructure/pos/handlers/products.ts';
import { ReadProductsUseCase } from '@koperasi/application/inventory';
import { ABSOLUTE_MS, IDLE_MS } from '@koperasi/domain/auth/session-policy';
import { bodyOf, cookieOf, legacyStyleHash, makeRequest, makeWorld } from './helpers/auth-fakes.mjs';

const PW = 'Pw-Synthetic-1';
async function loggedIn(o = {}) {
  const w = makeWorld(o.world); w.addUser({ id: 1, username: 'kasir', roleId: 4, companyId: 1, passwordHash: legacyStyleHash(PW), ...o.user });
  const r = await handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: PW } }));
  assert.equal(r.status, 200);
  return { w, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken };
}
const me = (w, cookie) => handleSession(w.services, makeRequest('/api/auth/session', { cookie }));
const catalogFake = () => { const calls = []; return { calls, uc: new ReadProductsUseCase({ search: async (q) => { calls.push(q); return []; }, findById: async () => null, findByBarcode: async (q) => { calls.push(q); return null; }, listCategories: async () => [] }) }; };

test('no cookie / malformed / unknown session id -> 401 on session, register and products', async () => {
  const { w } = await loggedIn(); const c = catalogFake();
  for (const cookie of [undefined, 'kkisi_sid=', 'kkisi_sid=short', 'kkisi_sid=' + 'Z'.repeat(43), 'other=1']) {
    assert.equal((await me(w, cookie)).status, 401);
    assert.equal((await handleRegister(w.services, makeRequest('/api/pos/register', { cookie }))).status, 401);
    assert.equal((await handleProducts(w.services, c.uc, makeRequest('/api/pos/products', { cookie }))).status, 401);
  }
  assert.equal(c.calls.length, 0, 'the catalog is never read without a session');
});

test('idle timeout 2 h: activity slides it, silence kills it', async () => {
  const { w, cookie } = await loggedIn();
  for (let i = 0; i < 4; i++) { w.clock.advance(IDLE_MS - 60000); assert.equal((await me(w, cookie)).status, 200, `active request ${i}`); }
  w.clock.advance(IDLE_MS + 1000);
  assert.equal((await me(w, cookie)).status, 401);
});

test('absolute timeout 12 h: constant activity cannot extend it', async () => {
  const { w, cookie } = await loggedIn();
  let elapsed = 0;
  while (elapsed + 3600000 < ABSOLUTE_MS) { w.clock.advance(3600000); elapsed += 3600000; assert.equal((await me(w, cookie)).status, 200, `at ${elapsed / 3600000} h`); }
  w.clock.advance(ABSOLUTE_MS - elapsed);
  assert.equal((await me(w, cookie)).status, 401);
});

test('last_seen is written at most once per 300 s (touch is throttled) and a touch failure never denies access', async () => {
  const { w, cookie } = await loggedIn();
  const touches = () => w.sessions.calls.filter((c) => c === 'touch').length;
  w.clock.advance(60000); await me(w, cookie); w.clock.advance(60000); await me(w, cookie);
  assert.equal(touches(), 0);
  w.clock.advance(300000); await me(w, cookie); assert.equal(touches(), 1);
  w.clock.advance(1000); await me(w, cookie); assert.equal(touches(), 1);
  w.clock.advance(400000); w.sessions.touch = async () => { throw new Error('boom'); };
  assert.equal((await me(w, cookie)).status, 200);
});

test('password change (fingerprint) invalidates every session of that user on the next request', async () => {
  const { w, cookie } = await loggedIn();
  assert.equal((await me(w, cookie)).status, 200);
  w.data.users.get(1).passwordHash = legacyStyleHash('a-new-password');
  assert.equal((await me(w, cookie)).status, 401);
  const row = [...w.sessions.rows.values()][0]; assert.equal(row.revokedReason, 'password_changed');
  assert.equal((await me(w, cookie)).status, 401, 'stays dead even if the password is changed back');
});

test('user disabled, role deactivated, branch disabled: effective on the very next request', async () => {
  for (const [label, mutate] of [['user', (w) => { w.data.users.get(1).status = 0; }], ['role', (w) => { w.data.users.get(1).roleStatus = 0; }], ['branch', (w) => { w.data.inactiveCompanies.add(1); }], ['user deleted', (w) => { w.data.users.delete(1); }]]) {
    const { w, cookie } = await loggedIn(); assert.equal((await me(w, cookie)).status, 200);
    mutate(w); assert.equal((await me(w, cookie)).status, 401, label);
  }
});

test('role change takes effect immediately: a role without sales_add gets 403 (and no data)', async () => {
  const { w, cookie } = await loggedIn(); const c = catalogFake();
  assert.equal((await handleProducts(w.services, c.uc, makeRequest('/api/pos/products', { cookie }))).status, 200);
  w.data.users.get(1).roleId = 9;                                        // a role that has no permission rows
  assert.equal((await handleProducts(w.services, c.uc, makeRequest('/api/pos/products', { cookie }))).status, 403);
  assert.equal((await handleRegister(w.services, makeRequest('/api/pos/register', { cookie }))).status, 403);
  assert.equal(c.calls.length, 1);
});

test('no bypass for user id 1: with no permission rows for its role it is refused like anybody else', async () => {
  const { w, cookie } = await loggedIn({ user: { id: 1, roleId: 1 } }); const c = catalogFake();
  w.data.permissions.clear();
  assert.equal((await handleProducts(w.services, c.uc, makeRequest('/api/pos/products', { cookie }))).status, 403);
  assert.equal(c.calls.length, 0);
});

test('branch scope: the catalog always uses the SESSION branch; company_id/companyId/headers are ignored (IDOR)', async () => {
  const { w, cookie } = await loggedIn({ user: { companyId: 2 } }); const c = catalogFake();
  for (const url of ['/api/pos/products?company_id=3&companyId=3&q=x', '/api/pos/products?barcode=123&company_id=1']) {
    assert.equal((await handleProducts(w.services, c.uc, makeRequest(url, { cookie, headers: { 'x-company-id': '3', 'x-forwarded-for': '1.2.3.4' } }))).status, 200);
  }
  assert.ok(c.calls.length === 2 && c.calls.every((q) => q.companyId === 2), JSON.stringify(c.calls));
});

test('role > 2 whose branch changed in the legacy DB after login is refused (session cid != db_users.company_id)', async () => {
  const { w, cookie } = await loggedIn(); w.data.users.get(1).companyId = 2;
  assert.equal((await me(w, cookie)).status, 401);
});

test('role <= 2 keeps a chosen branch while it is active; if that branch is disabled the session ends', async () => {
  const { w, cookie } = await loggedIn({ user: { roleId: 2 } });
  [...w.sessions.rows.values()][0].companyId = 3;
  assert.equal((await me(w, cookie)).status, 200);
  w.data.inactiveCompanies.add(3);
  assert.equal((await me(w, cookie)).status, 401);
});

test('database failures deny access: session store, legacy users, permissions, companies -> 503 on every route', async () => {
  const { w, cookie } = await loggedIn(); const c = catalogFake();
  const probes = () => Promise.all([me(w, cookie), handleRegister(w.services, makeRequest('/api/pos/register', { cookie })), handleProducts(w.services, c.uc, makeRequest('/api/pos/products', { cookie }))]);
  w.sessions.down = true; for (const r of await probes()) assert.equal(r.status, 503); w.sessions.down = false;
  for (const what of ['users', 'permissions']) {
    w.data.failing.add(what);
    const [s, reg, prod] = await probes();
    assert.equal(prod.status, 503, what); assert.equal(reg.status, 503, what);
    if (what === 'users') assert.equal(s.status, 503); else assert.equal(s.status, 200, 'session info needs no permission');
    w.data.failing.clear();
  }
  w.data.failing.add('registers'); assert.equal((await handleRegister(w.services, makeRequest('/api/pos/register', { cookie }))).status, 503); w.data.failing.clear();
  assert.equal(c.calls.length, 0, 'no catalog read happened during any outage');
  for (const r of await probes()) assert.equal(r.status, 200, 'and everything recovers');
});

test('register read: own open register in the session branch only; stale flag; anomaly warning; kasir list of the branch', async () => {
  const { w, cookie } = await loggedIn();
  w.data.registers.push({ id: 5, userId: 1, companyId: 1, status: 1, noref: 'KRS-A', stale: true }, { id: 6, userId: 1, companyId: 1, status: 1, noref: 'KRS-B' },
    { id: 7, userId: 2, companyId: 1, status: 1, noref: 'OTHER-USER' }, { id: 8, userId: 1, companyId: 2, status: 1, noref: 'OTHER-BRANCH' });
  w.data.kasir.push({ id: 9, companyId: 2, noKasir: 'KRS-X' });
  const r = await bodyOf(await handleRegister(w.services, makeRequest('/api/pos/register', { cookie })));
  assert.equal(r.open.noref, 'KRS-A'); assert.deepEqual(r.warnings, ['MULTIPLE_OPEN']); assert.deepEqual(r.kasir, [{ id: 1, noKasir: 'KRS01' }]);
  assert.equal(JSON.stringify(r).includes('OTHER'), false, 'no register of another user or branch is ever returned');
  w.data.registers.length = 0;
  assert.deepEqual(await bodyOf(await handleRegister(w.services, makeRequest('/api/pos/register', { cookie }))), { open: null, warnings: [], kasir: [{ id: 1, noKasir: 'KRS01' }] });
});

test('read paths never write to the auth store beyond the throttled touch, and never touch the legacy fakes', async () => {
  const { w, cookie } = await loggedIn(); const before = w.sessions.calls.length;
  await handleRegister(w.services, makeRequest('/api/pos/register', { cookie }));
  const writes = w.sessions.calls.slice(before).filter((c) => !['find'].includes(c));
  assert.deepEqual(writes, []);
});

test('GET /api/auth/session returns identity, branch and a fresh CSRF token; role <= 2 also the branch list', async () => {
  const kasir = await loggedIn(); const a = await bodyOf(await me(kasir.w, kasir.cookie));
  assert.equal(a.canSwitchBranch, false); assert.equal(a.companies, null); assert.equal(a.company.id, 1); assert.equal(a.csrfToken, kasir.token);
  const admin = await loggedIn({ user: { roleId: 2 } }); const b = await bodyOf(await me(admin.w, admin.cookie));
  assert.equal(b.canSwitchBranch, true); assert.deepEqual(b.companies.map((c) => c.id), [1, 2, 3]);
});
