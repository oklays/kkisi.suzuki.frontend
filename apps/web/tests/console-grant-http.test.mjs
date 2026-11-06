import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleCreateKosipaGrant, handleListKosipaGrants } from '../src/infrastructure/console/kosipa-grant-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';

async function fixture() {
  const world = makeWorld();
  world.addUser({ id: 23, roleId: 2, username: 'grant-admin' });
  const login = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'grant-admin', password: 'Pw-Synthetic-1' } }));
  const cookie = cookieOf(login), token = (await bodyOf(login)).csrfToken;
  const requests = [];
  const deps = {
    enabled: true,
    permissions: { async grantedAmong() { return new Set(['users_edit']); }, async kosipaRoleAccess() { return 'allowed'; } },
    ports: {
      roleWriteGrantsEnabled: true, grantAdmins: new Set([23]),
      links: { async activeForConsoleUser(id) { return id === 23 ? null : { externalUserId: 9102, status: 'active' }; } },
      kosipa: { async kosipaUser() { throw new Error('admin has no legacy identity'); } },
      consoleUsers: { async consoleUser(id) { return { id, active: true }; } },
      grants: { async activeCapabilities() { return []; }, async listOpen() { return []; }, async openFor() { return null; }, async request(input) { requests.push(input); return 1; } },
      audit: { async append() {} }, now: () => new Date(),
    },
  };
  const list = () => handleListKosipaGrants(world.services, makeRequest('/api/console/kosipa-grants', { cookie }), deps);
  const request = (consoleUserId = 24) => handleCreateKosipaGrant(world.services, makeRequest('/api/console/kosipa-grants', { method: 'POST', cookie, token, body: { consoleUserId, capability: 'kosipa.master.manage', reason: 'Synthetic grant request' } }), deps);
  return { deps, requests, list, request };
}

test('grant HTTP forwards role opt-in and supports explicitly allowlisted IAM administrator without a legacy actor', async () => {
  const f = await fixture();
  assert.equal((await f.list()).status, 200);
  assert.equal((await f.request()).status, 201);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].requestedBy, 23);
  assert.equal((await f.request(23)).status, 422, 'no self grant');
});

for (const missing of ['opt-in', 'iam', 'allowlist']) {
  test(`grant HTTP denies missing ${missing}`, async () => {
    const f = await fixture();
    if (missing === 'opt-in') f.deps.ports.roleWriteGrantsEnabled = false;
    if (missing === 'iam') f.deps.permissions.grantedAmong = async () => new Set();
    if (missing === 'allowlist') f.deps.ports.grantAdmins = new Set();
    assert.equal((await f.list()).status, 403);
    assert.equal((await f.request()).status, 403);
    assert.deepEqual(f.requests, []);
  });
}

for (const dependency of ['identity', 'grant']) {
  test(`grant HTTP returns 503 on ${dependency} lookup outage even for an unlinked administrator`, async () => {
    const f = await fixture();
    const fail = async () => { throw new Error('private connection string'); };
    if (dependency === 'identity') f.deps.ports.links.activeForConsoleUser = fail;
    else f.deps.ports.grants.activeCapabilities = fail;
    for (const response of [await f.list(), await f.request()]) {
      assert.equal(response.status, 503);
      assert.deepEqual(await bodyOf(response), { error: 'CONSOLE_STORE_UNAVAILABLE' });
    }
    assert.deepEqual(f.requests, []);
  });
}

test('actual service factories derive role opt-in solely from existing server flag without database queries', async () => {
  const { kosipaServices, kosipaCommandServices, kosipaGrantServices } = await import('../src/infrastructure/console/services.ts');
  const previous = process.env.DATABASE_URL_CONSOLE;
  process.env.DATABASE_URL_CONSOLE = 'mysql://synthetic_console:pw@127.0.0.1:1/synthetic_console';
  const env = { KOSIPA_READ_ENABLED: 'true', DATABASE_URL: 'mysql://synthetic_read:pw@127.0.0.1:1/synthetic_read', DATABASE_URL_AUTH: 'mysql://synthetic_auth:pw@127.0.0.1:1/synthetic_auth', DATABASE_URL_CONSOLE: process.env.DATABASE_URL_CONSOLE };
  try {
    for (const flag of [undefined, 'false', '1', 'true']) {
      const enabled = flag === 'true';
      const configured = { ...env, KOSIPA_WRITE_GRANTS_ENABLED: flag };
      for (const create of [kosipaServices, kosipaCommandServices]) {
        const services = create(configured);
        assert.ok(services);
        assert.equal(services.roleWriteGrantsEnabled === true, enabled);
        assert.equal(!!services.grants, enabled);
      }
      const grant = kosipaGrantServices(configured);
      assert.equal(grant?.roleWriteGrantsEnabled === true, enabled);
      assert.equal(!!grant, enabled);
    }
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL_CONSOLE;
    else process.env.DATABASE_URL_CONSOLE = previous;
  }
});
