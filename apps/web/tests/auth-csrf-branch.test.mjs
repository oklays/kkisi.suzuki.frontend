import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleCompany } from '../src/infrastructure/auth/handlers/company.ts';
import { handleLogout } from '../src/infrastructure/auth/handlers/logout.ts';
import { bodyOf, cookieOf, legacyStyleHash, makeRequest, makeWorld } from './helpers/auth-fakes.mjs';

const PW = 'Pw-Synthetic-1';
async function session(userPatch, id = 1, username = 'u1') {
  const w = makeWorld(); w.addUser({ id, username, passwordHash: legacyStyleHash(PW), ...userPatch });
  const r = await handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body: { username, password: PW } }));
  return { w, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken };
}
const company = (s, companyId, o = {}) => handleCompany(s.w.services, makeRequest('/api/auth/company', { method: 'POST', cookie: s.cookie, token: s.token, body: { companyId }, ...o }));

test('CSRF layers on a state-changing route: origin, referer fallback, JSON only, token bound to THIS session', async () => {
  const s = await session({ roleId: 2 });
  const other = await session({ roleId: 2 }, 2, 'u2');
  assert.equal((await company(s, 2)).status, 200, 'baseline');
  for (const [label, o] of [['no Origin/Referer', { origin: null }], ['foreign Origin', { origin: 'http://evil.test' }], ['null Origin', { origin: 'null' }],
    ['cross-site fetch metadata', { headers: { 'sec-fetch-site': 'cross-site' } }], ['form content-type', { contentType: 'application/x-www-form-urlencoded' }],
    ['text/plain', { contentType: 'text/plain' }], ['no token', { token: null }], ['garbage token', { token: 'k1.deadbeef' }], ['token of another session', { token: other.token }]]) {
    const r = await company(s, 3, { token: undefined, ...(o.token === null ? {} : { token: s.token }), ...o });
    assert.equal(r.status, 403, label); assert.deepEqual(await bodyOf(r), { error: 'CSRF' }, label);
  }
  assert.equal([...s.w.sessions.rows.values()][0].companyId, 2, 'no refused request changed anything');
  const viaReferer = await company(s, 3, { origin: null, headers: { referer: 'http://127.0.0.1:3000/pos' } });
  assert.equal(viaReferer.status, 200, 'a same-origin Referer is accepted when Origin is absent');
});

test('CSRF is checked before any database work on a forged request; unauthenticated requests are 401 not 403', async () => {
  const s = await session({ roleId: 2 }); const before = s.w.sessions.calls.length;
  await company(s, 2, { origin: 'http://evil.test' });
  assert.equal(s.w.sessions.calls.length, before, 'a cross-origin request never reaches the session store');
  const anon = await handleCompany(s.w.services, makeRequest('/api/auth/company', { method: 'POST', body: { companyId: 1 }, origin: null }));
  assert.equal(anon.status, 403, 'no origin -> CSRF first');
  assert.equal((await handleCompany(s.w.services, makeRequest('/api/auth/company', { method: 'POST', body: { companyId: 1 } }))).status, 401, 'same-origin but no session -> 401');
  const anon2 = await handleCompany(s.w.services, makeRequest('/api/auth/company', { method: 'POST', body: { companyId: 1 }, token: 'k1.aa' }));
  assert.equal(anon2.status, 401);
});

test('state-changing routes are POST-only in the handlers; GET handlers never write', async () => {
  const s = await session({ roleId: 4 }); const before = s.w.sessions.calls.length;
  const { handleSession } = await import('../src/infrastructure/auth/handlers/session.ts');
  await handleSession(s.w.services, makeRequest('/api/auth/session', { cookie: s.cookie }));
  assert.deepEqual(s.w.sessions.calls.slice(before), ['find']);
});

test('logout with a foreign Origin is refused and leaves the session alive', async () => {
  const s = await session({ roleId: 4 });
  const r = await handleLogout(s.w.services, makeRequest('/api/auth/logout', { method: 'POST', cookie: s.cookie, token: s.token, origin: 'http://evil.test' }));
  assert.equal(r.status, 403); assert.equal([...s.w.sessions.rows.values()][0].revokedAt, null);
});

test('branch choice: role > 2 can never change branch (403), even for an active branch; nothing changes', async () => {
  for (const roleId of [3, 4]) {
    const s = await session({ roleId, companyId: 1 }, 10 + roleId, 'k' + roleId);
    assert.equal((await company(s, 2)).status, 403); assert.equal((await company(s, 1)).status, 403);
    assert.equal([...s.w.sessions.rows.values()][0].companyId, 1);
  }
});

test('branch choice: role <= 2 may pick any ACTIVE branch; unknown/inactive/garbage targets are 400', async () => {
  const s = await session({ roleId: 2, companyId: 1 });
  assert.equal((await company(s, 3)).status, 200); assert.equal([...s.w.sessions.rows.values()][0].companyId, 3);
  s.w.data.inactiveCompanies.add(2);
  for (const bad of [2, 99, 0, -1, 1.5, '2', null, {}]) assert.equal((await company(s, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await company(s, 3)).status, 200, 'selecting the current branch is a no-op');
});

test('branch choice (S2-6): refused while the user has an open cash register in a branch OTHER than the target', async () => {
  const s = await session({ roleId: 2, companyId: 1 });
  s.w.data.registers.push({ id: 1, userId: 1, companyId: 2, status: 1, noref: 'KRS-2' });
  assert.equal((await company(s, 3)).status, 403, 'open register in branch 2, target 3');
  assert.equal((await company(s, 1)).status, 200, 'staying in the current branch is a no-op, not a switch');
  assert.equal((await company(s, 2)).status, 200, 'going to the branch that holds the open register is fine');
  assert.equal((await company(s, 3)).status, 403, 'from branch 2 to 3 while the register is open in 2 is refused');
  [...s.w.sessions.rows.values()][0].companyId = 3;      // e.g. chosen earlier, before the register was opened
  assert.equal((await company(s, 1)).status, 403, 'branch 3 -> home branch 1 with a register open in 2');
  assert.equal((await company(s, 2)).status, 200, 'going to the branch that holds the open register is fine');
  s.w.data.registers[0].status = 0;
  assert.equal((await company(s, 3)).status, 200, 'after it is closed the switch works');
  s.w.data.registers.push({ id: 2, userId: 99, companyId: 1, status: 1, noref: 'SOMEONE-ELSE' });
  assert.equal((await company(s, 1)).status, 200, "another user's register never blocks");
});

test('branch choice: a store failure while checking registers or writing the session is 503 and changes nothing', async () => {
  const s = await session({ roleId: 2, companyId: 1 });
  s.w.data.failing.add('registers'); assert.equal((await company(s, 3)).status, 503); s.w.data.failing.clear();
  s.w.sessions.setCompany = async () => { throw new (await import('@koperasi/domain/auth/errors')).StoreUnavailableError(); };
  assert.equal((await company(s, 3)).status, 503);
  assert.equal([...s.w.sessions.rows.values()][0].companyId, 1);
});

test('a chosen branch is only in the SESSION: another session of the same user keeps its own branch', async () => {
  const w = makeWorld(); w.addUser({ id: 1, username: 'u1', roleId: 2, companyId: 1, passwordHash: legacyStyleHash(PW) });
  const login = async () => { const r = await handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'u1', password: PW } })); return { cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken }; };
  const a = await login(), b = await login();
  assert.equal((await handleCompany(w.services, makeRequest('/api/auth/company', { method: 'POST', cookie: a.cookie, token: a.token, body: { companyId: 3 } }))).status, 200);
  const rows = [...w.sessions.rows.values()].map((r) => r.companyId).sort(); assert.deepEqual(rows, [1, 3]);
  void b;
});
