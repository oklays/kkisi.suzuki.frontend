import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { handleCreateReturn, handleReturnContext, handleReturnDocument, handleReturnList } from '../src/infrastructure/sales/return-handlers.ts';
import { PosError } from '@koperasi/domain/pos/sale';

const key = '0f8fad5b-d9cb-469f-a165-70867728950e';
async function signedIn(permissions) {
  const world = makeWorld();
  world.data.permissions = new Set(permissions.map((permission) => `4:${permission}`));
  world.addUser({ id: 4, roleId: 4, username: 'synthetic' });
  const response = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'synthetic', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(response), token: (await bodyOf(response)).csrfToken };
}

test('creating a return needs session, CSRF and sales_return_add before the writer runs; branch and user come from the session', async () => {
  const { world, cookie, token } = await signedIn(['sales_return_add']);
  let calls = 0;
  const repo = { async create(actor, saleId, request) {
    calls++;
    assert.deepEqual(actor, { userId: 4, companyId: 1 });
    assert.equal(saleId, 42);
    assert.deepEqual(request.items, [{ itemId: 7, quantity: 2 }]);
    return { returnId: 9, returnCode: 'RTN-1', saleId: 42, totalSen: 1000, refundMethod: 'Cash', replayed: calls > 1 };
  } };
  const post = (over = {}) => handleCreateReturn(world.services, makeRequest('/api/sales/42/returns', { method: 'POST', cookie, token,
    body: { items: [{ itemId: 7, quantity: 2 }], reason: 'Barang rusak', idempotencyKey: key, companyId: 999, userId: 999 }, ...over }), '42', () => repo);
  assert.equal((await post({ cookie: undefined })).status, 401);
  for (const over of [{ token: null }, { origin: 'http://evil.test' }, { contentType: 'text/plain' }]) assert.equal((await post(over)).status, 403);
  assert.equal(calls, 0);
  const created = await post();
  assert.equal(created.status, 201);
  assert.equal((await bodyOf(created)).return.returnCode, 'RTN-1');
  assert.equal((await post()).status, 200, 'a replayed key answers the saved return');
  assert.equal((await post({ body: { items: [], reason: 'x', idempotencyKey: key } })).status, 400);
  assert.equal((await handleCreateReturn(world.services, makeRequest('/api/sales/abc/returns', { method: 'POST', cookie, token, body: { items: [{ itemId: 7, quantity: 1 }], reason: 'Barang rusak', idempotencyKey: key } }), 'abc', () => repo)).status, 404);
  world.data.permissions = new Set(['4:sales_return_view']);
  assert.equal((await post()).status, 403);
  assert.equal(calls, 2);
});

test('business refusals map to 409 and a missing writer to 503 without leaking details', async () => {
  const { world, cookie, token } = await signedIn(['sales_return_add']);
  for (const [code, status] of [['DRAWER_INSUFFICIENT', 409], ['CREDIT_PERIOD_CLOSED', 409], ['SALE_NOT_FOUND', 404], ['WRITE_NOT_CONFIGURED', 503]]) {
    const repo = { async create() { throw new PosError(code); } };
    const response = await handleCreateReturn(world.services, makeRequest('/api/sales/42/returns', { method: 'POST', cookie, token, body: { items: [{ itemId: 7, quantity: 1 }], reason: 'Barang rusak', idempotencyKey: key } }), '42', () => repo);
    assert.equal(response.status, status, code);
    assert.deepEqual(await bodyOf(response), { error: code });
  }
  const failing = { async create() { throw Object.assign(new Error('SQL secret'), { code: 'P2010' }); } };
  const response = await handleCreateReturn(world.services, makeRequest('/api/sales/42/returns', { method: 'POST', cookie, token, body: { items: [{ itemId: 7, quantity: 1 }], reason: 'Barang rusak', idempotencyKey: key } }), '42', () => failing);
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await bodyOf(response)), /secret/);
});

test('return reads require a return permission and stay inside the session branch', async () => {
  const { world, cookie } = await signedIn(['sales_view']);
  const repo = {
    context: async (companyId, saleId) => { assert.deepEqual([companyId, saleId], [1, 42]); return null; },
    list: async (companyId, query) => { assert.equal(companyId, 1); assert.equal(query.q, 'RTN'); return { rows: [], total: 0 }; },
    document: async (companyId, id) => { assert.deepEqual([companyId, id], [1, 5]); return null; },
  };
  assert.equal((await handleReturnList(world.services, makeRequest('/api/sales/returns', { cookie }), () => repo)).status, 403);
  world.data.permissions.add('4:sales_return_view');
  assert.equal((await handleReturnContext(world.services, makeRequest('/api/sales/42/returns', { cookie }), '42', () => repo)).status, 404);
  assert.equal((await handleReturnDocument(world.services, makeRequest('/api/sales/returns/5', { cookie }), '5', () => repo)).status, 404);
  const list = await handleReturnList(world.services, makeRequest('/api/sales/returns?q=RTN', { cookie }), () => repo);
  assert.equal(list.status, 200);
  assert.deepEqual((await bodyOf(list)).pagination, { page: 1, pageSize: 25, total: 0, hasNext: false });
  assert.equal((await handleReturnList(world.services, makeRequest('/api/sales/returns?companyId=2', { cookie }), () => repo)).status, 400);
  assert.equal((await handleReturnList(world.services, makeRequest('/api/sales/returns?from=2026-01-01&to=2026-10-01', { cookie }), () => repo)).status, 400);
});
