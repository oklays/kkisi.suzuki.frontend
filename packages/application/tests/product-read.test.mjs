import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadProductsUseCase } from '@koperasi/application/inventory';

const product = {
  id: 7,
  companyId: 2,
  code: 'SKU-7',
  barcode: '899000700',
  name: 'Beras',
  sellingPrice: '25000.00',
  discount: '0.00',
  stock: 12,
  category: { id: 3, name: 'Sembako' },
};

test('search validates and forwards a bounded, company-scoped read', async () => {
  const calls = [];
  const useCase = new ReadProductsUseCase({
    search: async (query) => { calls.push(query); return [product]; },
    findById: async () => null,
  });
  assert.deepEqual(await useCase.search({ companyId: 2, term: ' beras ', limit: 5 }), [product]);
  assert.deepEqual(calls, [{ companyId: 2, term: 'beras', limit: 5 }]);
});

test('category filter and category list are validated and company-scoped', async () => {
  const calls = [];
  const useCase = new ReadProductsUseCase({
    search: async (query) => { calls.push(query); return []; },
    findById: async () => null,
    listCategories: async (query) => { calls.push(query); return [{ id: 3, name: 'Sembako' }]; },
  });
  await useCase.search({ companyId: 2, term: '', limit: 24, categoryId: 3 });
  assert.deepEqual(await useCase.categories({ companyId: 2 }), [{ id: 3, name: 'Sembako' }]);
  assert.deepEqual(calls, [{ companyId: 2, term: '', limit: 24, categoryId: 3 }, { companyId: 2 }]);
  await assert.rejects(useCase.search({ companyId: 2, categoryId: 0 }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.search({ companyId: 2, categoryId: Number.NaN }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.categories({ companyId: 0 }), { code: 'INVALID_INPUT' });
  assert.equal(calls.length, 2, 'invalid input must not reach the repository');
});

test('barcode lookup trims input, rejects blanks and reports a miss as NOT_FOUND', async () => {
  const calls = [];
  const useCase = new ReadProductsUseCase({
    search: async () => [],
    findById: async () => null,
    findByBarcode: async (query) => { calls.push(query); return query.barcode === '899000700' ? product : null; },
  });
  assert.deepEqual(await useCase.findByBarcode({ companyId: 2, barcode: ' 899000700 ' }), product);
  assert.deepEqual(calls, [{ companyId: 2, barcode: '899000700' }]);
  await assert.rejects(useCase.findByBarcode({ companyId: 2, barcode: 'missing' }), { code: 'NOT_FOUND' });
  await assert.rejects(useCase.findByBarcode({ companyId: 2, barcode: '   ' }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.findByBarcode({ companyId: 2, barcode: 'x'.repeat(101) }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.findByBarcode({ companyId: 0, barcode: '1' }), { code: 'INVALID_INPUT' });
});

test('invalid company and item identifiers never reach the repository', async () => {
  const useCase = new ReadProductsUseCase({
    search: async () => { throw Error('repository called'); },
    findById: async () => { throw Error('repository called'); },
  });
  await assert.rejects(useCase.search({ companyId: 0 }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.search({ companyId: 2, limit: 101 }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.search({ companyId: 2, term: 7 }), { code: 'INVALID_INPUT' });
  await assert.rejects(useCase.findById({ companyId: 2, id: -1 }), { code: 'INVALID_INPUT' });
});

test('missing product is distinct from database failures', async () => {
  const useCase = new ReadProductsUseCase({
    search: async () => [],
    findById: async () => null,
  });
  await assert.rejects(useCase.findById({ companyId: 2, id: 7 }), { code: 'NOT_FOUND' });
});

test('unexpected repository errors do not leak raw details', async () => {
  const useCase = new ReadProductsUseCase({
    search: async () => { throw Error('mysql://user:password@private-host/db'); },
    findById: async () => null,
  });
  await assert.rejects(useCase.search({ companyId: 2 }), (error) =>
    error.code === 'UNEXPECTED' && !error.message.includes('private-host'));
});
