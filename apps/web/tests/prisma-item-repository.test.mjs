import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { PrismaItemRepository } from '../src/infrastructure/repositories/prisma-item.repository.ts';

const row = (over = {}) => ({
  id: 7, companyId: 2, itemCode: 'SKU-7', customBarcode: '899000700', itemName: 'Beras',
  salesPrice: 25000.75, discount: 0, stock: 12,
  category: { id: 3, categoryName: 'Sembako' }, ...over,
});

test('search is scoped to branch, sellable goods and a bounded page, and keeps money exact', async () => {
  let query;
  const repo = new PrismaItemRepository({ item: {
    findMany: async (input) => { query = input; return [row(), row({ id: 8, salesPrice: 4000.1, discount: 500, category: null })]; },
  } });
  const found = await repo.search({ companyId: 2, term: 'beras', limit: 10 });
  assert.deepEqual(found[0], {
    id: 7, companyId: 2, code: 'SKU-7', barcode: '899000700', name: 'Beras',
    sellingPrice: '25000.75', discount: '0.00', stock: 12, category: { id: 3, name: 'Sembako' },
  });
  assert.equal(found[1].sellingPrice, '4000.10');
  assert.equal(found[1].discount, '500.00');
  assert.equal(found[1].category, null);
  assert.equal(query.where.companyId, 2);
  assert.equal(query.where.status, 1);
  assert.equal(query.where.type, 'Produk Jadi');
  assert.equal(query.take, 10);
  assert.equal(query.where.OR.length, 4);
});

test('search reads only the catalog columns: no cost price, tax or pack data leaves the repository', async () => {
  let query;
  const repo = new PrismaItemRepository({ item: { findMany: async (input) => { query = input; return []; } } });
  await repo.search({ companyId: 2, term: '', limit: 5 });
  assert.deepEqual(Object.keys(query.select).sort(),
    ['category', 'companyId', 'customBarcode', 'discount', 'id', 'itemCode', 'itemName', 'salesPrice', 'stock']);
  assert.equal(query.where.OR, undefined);
});

test('browsing lists only in-stock items while a text search also returns out-of-stock ones', async () => {
  const wheres = [];
  const repo = new PrismaItemRepository({ item: { findMany: async (input) => { wheres.push(input.where); return []; } } });
  await repo.search({ companyId: 2, term: '', limit: 5 });
  await repo.search({ companyId: 2, term: 'mie', limit: 5 });
  assert.deepEqual(wheres[0].stock, { gt: 0 });
  assert.equal(wheres[1].stock, undefined);
});

test('search orders alphabetically when browsing and by id when a term is given', async () => {
  const orders = [];
  const repo = new PrismaItemRepository({ item: { findMany: async (input) => { orders.push(input.orderBy); return []; } } });
  await repo.search({ companyId: 2, term: '', limit: 5 });
  await repo.search({ companyId: 2, term: 'mie', limit: 5 });
  assert.deepEqual(orders, [[{ itemName: 'asc' }, { id: 'asc' }], [{ id: 'asc' }]]);
});

test('search escapes LIKE wildcards so "%" and "_" match literally', async () => {
  let query;
  const repo = new PrismaItemRepository({ item: { findMany: async (input) => { query = input; return []; } } });
  await repo.search({ companyId: 2, term: '50%_a\\b', limit: 5 });
  for (const clause of query.where.OR) assert.equal(Object.values(clause)[0].contains, '50\\%\\_a\\\\b');
});

test('search can be narrowed to one category', async () => {
  let query;
  const repo = new PrismaItemRepository({ item: { findMany: async (input) => { query = input; return []; } } });
  await repo.search({ companyId: 2, term: '', limit: 5, categoryId: 3 });
  assert.equal(query.where.categoryId, 3);
});

test('barcode lookup is exact, branch-scoped, prefers the unit barcode and falls back to the pack barcode', async () => {
  const queries = [];
  const repo = new PrismaItemRepository({ item: { findFirst: async (input) => {
    queries.push(input);
    return input.where.customBarcodePack === 'PACK-1' ? row({ id: 9 }) : null;
  } } });
  assert.equal(await repo.findByBarcode({ companyId: 2, barcode: 'NOPE' }), null);
  assert.equal(queries.length, 2);
  assert.equal((await repo.findByBarcode({ companyId: 2, barcode: 'PACK-1' })).id, 9);
  for (const { where, orderBy } of queries) {
    assert.equal(where.companyId, 2);
    assert.equal(where.status, 1);
    assert.equal(where.type, 'Produk Jadi');
    assert.deepEqual(orderBy, { id: 'asc' });
  }
  assert.equal(queries[0].where.customBarcode, 'NOPE');
  assert.equal(queries[1].where.customBarcodePack, 'NOPE');

  let calls = 0;
  const hit = new PrismaItemRepository({ item: { findFirst: async () => { calls++; return row(); } } });
  await hit.findByBarcode({ companyId: 2, barcode: '899000700' });
  assert.equal(calls, 1);
});

test('repository scopes lookup by both product and company', async () => {
  let query;
  const repo = new PrismaItemRepository({ item: {
    findFirst: async (input) => { query = input; return null; },
  } });
  assert.equal(await repo.findById({ companyId: 2, id: 7 }), null);
  assert.deepEqual(query.where, { companyId: 2, id: 7 });
});

test('categories are limited to what the branch sells and are not filtered by a company column', async () => {
  let groupQuery; let categoryQuery;
  const repo = new PrismaItemRepository({
    item: { groupBy: async (input) => { groupQuery = input; return [{ categoryId: 3 }, { categoryId: 1 }]; } },
    category: { findMany: async (input) => { categoryQuery = input; return [{ id: 1, categoryName: 'MAKANAN' }, { id: 3, categoryName: 'SEMBAKO' }]; } },
  });
  assert.deepEqual(await repo.listCategories({ companyId: 2 }), [{ id: 1, name: 'MAKANAN' }, { id: 3, name: 'SEMBAKO' }]);
  assert.equal(groupQuery.where.companyId, 2);
  assert.deepEqual(categoryQuery.where.id, { in: [3, 1] });
  assert.equal(categoryQuery.where.companyId, undefined); // db_category has no company_id
});

test('no categories means no category query', async () => {
  const repo = new PrismaItemRepository({
    item: { groupBy: async () => [] },
    category: { findMany: async () => { throw Error('must not be called'); } },
  });
  assert.deepEqual(await repo.listCategories({ companyId: 2 }), []);
});

test('database connection failures get a safe distinct code', async () => {
  const repo = new PrismaItemRepository({ item: {
    findMany: async () => { throw new Prisma.PrismaClientKnownRequestError(
      'secret connection string', { code: 'P1001', clientVersion: '6.19.3' }); },
  } });
  await assert.rejects(repo.search({ companyId: 2, term: '', limit: 10 }), (error) =>
    error.code === 'DB_UNAVAILABLE' && !error.message.includes('secret'));
});

test('driver initialization failure without a Prisma code is database unavailable', async () => {
  const repo = new PrismaItemRepository({ item: {
    findMany: async () => { throw new Prisma.PrismaClientInitializationError(
      'secret connection string', '6.19.3'); },
  } });
  await assert.rejects(repo.search({ companyId: 2, term: '', limit: 10 }), (error) =>
    error.code === 'DB_UNAVAILABLE' && !error.message.includes('secret'));
});
