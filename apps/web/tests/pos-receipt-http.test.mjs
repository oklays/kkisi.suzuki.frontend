import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { handleReceipt } from '../src/infrastructure/pos/handlers/receipt.ts';

test('receipt API checks session and permission before reading and never accepts a client company', async () => {
  const w = makeWorld(); w.addUser({ id: 4, username: 'synthetic' });
  const login = await handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'synthetic', password: 'Pw-Synthetic-1' } }));
  assert.equal(login.status, 200);
  const cookie = cookieOf(login); let reads = 0;
  const repo = { async find(companyId, id) { reads++; assert.equal(companyId, 1); assert.equal(id, 42); return { saleId: 42, grandTotalSen: 12345 }; } };
  const get = (id, over = {}) => handleReceipt(w.services, makeRequest(`/api/pos/receipts/${id}?companyId=999`, { cookie, ...over }), id, () => repo);
  assert.equal((await get('42', { cookie: undefined })).status, 401);
  assert.equal((await get('0')).status, 400);
  assert.equal(reads, 0);
  const response = await get('42');
  assert.equal(response.status, 200);
  assert.equal((await bodyOf(response)).receipt.grandTotalSen, 12345);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  w.data.users.get(4).roleId = 9;
  assert.equal((await get('42')).status, 403);
  assert.equal(reads, 1);
});

test('receipt API uses the same 404 for absent and other-branch sales', async () => {
  const w = makeWorld(); w.addUser({ id: 4, username: 'synthetic' });
  const login = await handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'synthetic', password: 'Pw-Synthetic-1' } }));
  const response = await handleReceipt(w.services, makeRequest('/api/pos/receipts/42', { cookie: cookieOf(login) }), '42', () => ({ find: async () => null }));
  assert.equal(response.status, 404);
  assert.deepEqual(await bodyOf(response), { error: 'NOT_FOUND' });
});
