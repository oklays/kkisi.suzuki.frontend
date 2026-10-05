import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
const app = await import('@koperasi/application/inventory').catch(() => null);
const handler = await import('../src/infrastructure/products/handler.ts').catch(() => null);
const view = await import('../src/components/products/product-view.ts').catch(() => null);

test('master query validates before reading and normalizes pagination and filters', async () => {
  assert.ok(app?.ReadMasterProducts, 'master read use case exists');
  let calls = 0;
  const usecase = new app.ReadMasterProducts({ async list(query) { calls++; return query; } });
  for (const input of [{ companyId: 0 }, { companyId: 1, page: 0 }, { companyId: 1, pageSize: 999 }, { companyId: 1, status: 'secret' }, { companyId: 1, categoryId: -1 }, { companyId: 1, term: 'x'.repeat(101) }, { companyId: 1, stock: 'anything' }, { companyId: 1, sort: 'DROP TABLE' }]) {
    await assert.rejects(usecase.list(input), { code: 'INVALID_INPUT' });
  }
  assert.equal(calls, 0);
  assert.deepEqual(await usecase.list({ companyId: 2, term: '  soap  ', page: 2, pageSize: 10, stock: 'low' }), { companyId: 2, term: 'soap', page: 2, pageSize: 10, status: 'all', stock: 'low', sort: 'newest' });
});

test('product API guards items_view, trusts session company and returns safe errors', async () => {
  assert.ok(handler?.handleMasterProducts, 'master HTTP handler exists');
  const w = makeWorld(); w.addUser({ id: 4, username: 'synthetic', roleId: 4 });
  const login = await handleLogin(w.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'synthetic', password: 'Pw-Synthetic-1' } }));
  assert.equal(login.status, 200); const cookie = cookieOf(login); let calls = 0;
  const factory = () => { calls++; return { async list(query) { return query; } }; };
  const read = options => handler.handleMasterProducts(w.services, makeRequest('/api/products?q=soap&companyId=999&page=2&pageSize=10&category=3', options), factory);
  assert.equal((await read({})).status, 401);
  assert.equal((await read({ cookie })).status, 403); assert.equal(calls, 0);
  w.data.permissions.add('4:items_view');
  const response = await read({ cookie }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await bodyOf(response)).companyId, 1);
  assert.equal((await handler.handleMasterProducts(w.services, makeRequest('/api/products?page=2x', { cookie }), factory)).status, 400);
  const error = await handler.handleMasterProducts(w.services, makeRequest('/api/products', { cookie }), () => ({ async list() { throw new Error('mysql://secret SQL'); } }));
  assert.equal(error.status, 503); assert.deepEqual(await bodyOf(error), { error: 'PRODUCTS_UNAVAILABLE' });
  assert.doesNotMatch(JSON.stringify(w.logs), /secret|SQL/);
});

test('stock labels use legacy alert quantity and CSV cannot run spreadsheet formulas', () => {
  assert.ok(view?.stockState, 'product view helpers exist');
  assert.equal(view.stockState({ stock: -2, alertQty: 10 }), 'empty');
  assert.equal(view.stockState({ stock: 4, alertQty: 4 }), 'low');
  assert.equal(view.stockState({ stock: 1, alertQty: 0 }), 'available');
  assert.equal(view.csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(view.csvCell(' \t+formula'), '"\' \t+formula"');
  assert.equal(view.csvCell('a,b\nc'), '"a,b\nc"');
});

test('master repository keeps empty/inactive/SO rows, uses scoped parameters and clamps pagination', async () => {
  const { Prisma } = await import('@prisma/client');
  const { PrismaMasterProductRepository } = await import('../src/infrastructure/repositories/prisma-master-product.repository.ts');
  const statements = [];
  const row = { id: 7, stock: 0, alertQty: 5, status: 0, statusSo: 1, sellingPrice: new Prisma.Decimal('4000.10'), purchasePrice: new Prisma.Decimal('3000.01'), discount: new Prisma.Decimal('0.00') };
  const tx = { async $queryRaw(sql) { statements.push(sql); return statements.length === 1 ? [{ total: 1n, active: 0n, low: 0n, empty: 1n, locked: 1n }] : statements.length === 2 ? [row] : []; } };
  const repo = new PrismaMasterProductRepository({ async $transaction(run) { return run(tx); } });
  const result = await repo.list({ companyId: 2, term: "%'_", page: 100, pageSize: 10, status: 'all', stock: 'all', sort: 'name', categoryId: 8, brandId: 9 });
  assert.equal(result.page, 1); assert.equal(result.items[0].stock, 0); assert.equal(result.items[0].active, false); assert.equal(result.items[0].locked, true); assert.equal(result.items[0].sellingPrice, '4000.10');
  assert.match(statements[1].sql, /a.company_id=\?/); assert.doesNotMatch(statements[1].sql, /AND a.status=|AND a.stock>|AND a.status_so=|%'_/);
  assert.match(statements[1].sql, /a.category_id=\? AND a.brand_id=\?/); assert.deepEqual(statements[1].values.slice(-4), [8, 9, 10, 0]);
  assert.ok(statements[1].values.includes("%\\%'\\_%")); assert.equal(statements[1].values[0], 2);
  assert.deepEqual(statements[2].values, [2]); assert.deepEqual(statements[3].values, [2]);
});
