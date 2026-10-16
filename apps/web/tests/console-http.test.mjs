import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleConsoleCapabilities } from '../src/infrastructure/console/handlers.ts';
import { consoleEnabled } from '../src/infrastructure/console/flags.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';

async function signedIn(slugs) {
  const world = makeWorld();
  world.data.permissions = new Set(slugs.map((s) => `4:${s}`));
  world.addUser({ id: 4, roleId: 4 });
  const response = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  // The batched source answers from the same synthetic permission table as the fake `has()`.
  const source = { calls: 0, async grantedAmong(roleId, list) { this.calls++; return new Set(list.filter((s) => world.data.permissions.has(`${roleId}:${s}`))); } };
  return { world, cookie: cookieOf(response), source };
}

test('the console flag is off unless exactly "true"', () => {
  assert.equal(consoleEnabled({}), false);
  assert.equal(consoleEnabled({ CONSOLE_ENABLED: '1' }), false);
  assert.equal(consoleEnabled({ CONSOLE_ENABLED: 'false' }), false);
  assert.equal(consoleEnabled({ CONSOLE_ENABLED: 'true' }), true);
});

test('capabilities API: 404 when the console is off, before any session or database work', async () => {
  const { world, cookie, source } = await signedIn(['sales_add']);
  const response = await handleConsoleCapabilities(world.services, makeRequest('/api/console/capabilities', { cookie }), source, false);
  assert.equal(response.status, 404);
  assert.equal(source.calls, 0);
});

test('capabilities API: anonymous -> 401 without resolving permissions', async () => {
  const { world, source } = await signedIn(['sales_add']);
  const response = await handleConsoleCapabilities(world.services, makeRequest('/api/console/capabilities', { cookie: undefined }), source, true);
  assert.equal(response.status, 401);
  assert.equal(source.calls, 0);
});

test('capabilities API: a user without sales_add still receives their other capabilities (not excluded from the console)', async () => {
  const { world, cookie, source } = await signedIn(['sales_view', 'items_view']);
  const response = await handleConsoleCapabilities(world.services, makeRequest('/api/console/capabilities', { cookie }), source, true);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await bodyOf(response);
  assert.deepEqual(body.capabilities, ['toko.products.view', 'toko.sales.view']);
  assert.equal(body.companyId, 1, 'branch comes from the validated session');
  assert.equal(source.calls, 1, 'one batched permission read');
});

test('capabilities API: a permission store failure is 503, never an empty allow-list', async () => {
  const { world, cookie } = await signedIn(['sales_add']);
  const broken = { async grantedAmong() { const { StoreUnavailableError } = await import('@koperasi/domain/auth/errors'); throw new StoreUnavailableError('permission_set'); } };
  const response = await handleConsoleCapabilities(world.services, makeRequest('/api/console/capabilities', { cookie }), broken, true);
  assert.equal(response.status, 503);
});

test('capabilities API: a role without any TOKO slug gets an empty set, not an error', async () => {
  const { world, cookie, source } = await signedIn([]);
  const response = await handleConsoleCapabilities(world.services, makeRequest('/api/console/capabilities', { cookie }), source, true);
  assert.equal(response.status, 200);
  assert.deepEqual((await bodyOf(response)).capabilities, []);
});
