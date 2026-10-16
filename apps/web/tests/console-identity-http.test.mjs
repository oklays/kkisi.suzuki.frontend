import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleCreateIdentityLink, handleRevokeIdentityLink } from '../src/infrastructure/console/identity-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';

async function signedIn({ roleId = 2, slugs = ['users_edit'] } = {}) {
  const world = makeWorld();
  world.data.permissions = new Set(slugs.map((s) => `${roleId}:${s}`));
  world.addUser({ id: 4, roleId });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  const permissions = { async grantedAmong(role, list) { return new Set(list.filter((s) => world.data.permissions.has(`${role}:${s}`))); } };
  return { world, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken, permissions };
}
function ports() {
  const links = []; const audit = [];
  return { links, audit, value: {
    links: { async activeForConsoleUser(id) { return links.find((l) => l.consoleUserId === id && l.status === 'active') ?? null; }, async activeForKosipaUser(id) { return links.find((l) => l.externalUserId === id && l.status === 'active') ?? null; },
      async find(id) { return links.find((l) => l.id === id) ?? null; }, async listActive() { return links; },
      async create(l) { links.push({ id: links.length + 1, status: 'active', ...l }); return links.length; }, async revoke(id) { const l = links.find((x) => x.id === id && x.status === 'active'); if (!l) return false; l.status = 'revoked'; return true; } },
    audit: { async append(e) { audit.push(e); } },
    kosipa: { async kosipaUser(id) { return id === 9 ? { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 } : null; }, async allowedMenuUrls() { return []; } },
    consoleUsers: { async consoleUser(id) { return [4, 5].includes(id) ? { id, active: true } : null; } },
    now: () => new Date('2026-10-16T05:00:00Z'),
  } };
}
const post = (path, cookie, token, body) => makeRequest(path, { method: 'POST', cookie, token, body });

test('create link: flag off 404, anonymous 401, missing CSRF 403, store missing 503 — all before any write', async () => {
  const { world, cookie, token, permissions } = await signedIn(); const p = ports();
  const call = (req, deps) => handleCreateIdentityLink(world.services, req, { enabled: true, permissions, ports: p.value, ...deps });
  assert.equal((await call(post('/api/console/identity-links', cookie, token, { consoleUserId: 5, kosipaUserId: 9 }), { enabled: false })).status, 404);
  assert.equal((await call(post('/api/console/identity-links', undefined, token, { consoleUserId: 5, kosipaUserId: 9 }))).status, 401);
  assert.equal((await call(post('/api/console/identity-links', cookie, undefined, { consoleUserId: 5, kosipaUserId: 9 }))).status, 403);
  assert.equal((await call(post('/api/console/identity-links', cookie, token, { consoleUserId: 5, kosipaUserId: 9 }), { ports: null })).status, 503);
  assert.equal(p.links.length, 0);
});

test('create link: capability is resolved on the server; branch staff with users_edit (role > 2) are refused', async () => {
  const { world, cookie, token, permissions } = await signedIn({ roleId: 4, slugs: ['users_edit'] }); const p = ports();
  const r = await handleCreateIdentityLink(world.services, post('/api/console/identity-links', cookie, token, { consoleUserId: 5, kosipaUserId: 9 }), { enabled: true, permissions, ports: p.value });
  assert.equal(r.status, 403); assert.equal((await bodyOf(r)).error, 'FORBIDDEN'); assert.equal(p.links.length, 0);
});

test('create link: success 201, self-link 422, duplicate 409, bad body 400; revoke needs a reason, then 409 when repeated', async () => {
  const { world, cookie, token, permissions } = await signedIn(); const p = ports();
  const deps = { enabled: true, permissions, ports: p.value };
  const create = (body) => handleCreateIdentityLink(world.services, post('/api/console/identity-links', cookie, token, body), deps);
  assert.equal((await create({ consoleUserId: 5, kosipaUserId: '9' })).status, 400);
  assert.equal((await create({ consoleUserId: 4, kosipaUserId: 9 })).status, 422, 'the signed-in admin is user 4: self-link');
  const ok = await create({ consoleUserId: 5, kosipaUserId: 9 });
  assert.equal(ok.status, 201); assert.deepEqual(await bodyOf(ok), { id: 1 });
  assert.equal((await create({ consoleUserId: 5, kosipaUserId: 9 })).status, 409);
  const revoke = (id, body) => handleRevokeIdentityLink(world.services, post(`/api/console/identity-links/${id}/revoke`, cookie, token, body), String(id), deps);
  assert.equal((await revoke(1, { reason: '' })).status, 422);
  assert.equal((await revoke('1x', { reason: 'pindah' })).status, 400);
  assert.equal((await revoke(1, { reason: 'pindah tugas' })).status, 200);
  assert.equal((await revoke(1, { reason: 'pindah tugas' })).status, 409);
  assert.deepEqual(p.audit.map((a) => `${a.action}:${a.outcome}`), ['identity_link.denied:denied', 'identity_link.create:success', 'identity_link.denied:denied', 'identity_link.denied:denied', 'identity_link.revoke:success', 'identity_link.denied:denied']);
});

test('a console-store outage during linking is a 503 and nothing is reported as linked', async () => {
  const { world, cookie, token, permissions } = await signedIn(); const p = ports();
  p.value.links.activeForConsoleUser = async () => { throw new Error('ECONNREFUSED'); };
  const r = await handleCreateIdentityLink(world.services, post('/api/console/identity-links', cookie, token, { consoleUserId: 5, kosipaUserId: 9 }), { enabled: true, permissions, ports: p.value });
  assert.equal(r.status, 503); assert.equal((await bodyOf(r)).error, 'CONSOLE_STORE_UNAVAILABLE');
});
