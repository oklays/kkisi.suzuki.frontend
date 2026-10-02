import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductReadError } from '@koperasi/domain/inventory';
import { ReadProductsUseCase } from '@koperasi/application/inventory';
import { findCatalogBarcode, listCatalogCategories, searchCatalog, toPosProduct } from '@koperasi/application/pos/catalog';

const item = (over = {}) => ({
  id: 98, companyId: 1, code: 'BRG-98', barcode: '8998866202343', name: 'SEDAAP MIE',
  sellingPrice: '3500.00', discount: '0.00', stock: 40, category: { id: 1, name: 'MAKANAN' }, ...over,
});
const reader = (repo) => new ReadProductsUseCase({ search: async () => [], findById: async () => null, findByBarcode: async () => null, listCategories: async () => [], ...repo });

test('projection keeps price and discount exact and clamps legacy negative stock to zero', () => {
  const product = toPosProduct(item({ sellingPrice: '4000.10', discount: '500.00', stock: -3 }));
  assert.equal(product.priceSen, 400010);
  assert.equal(product.discountSen, 50000);
  assert.equal(product.stock, 0);
  assert.equal(product.stockStatus, 'empty');
  assert.equal(product.id, '98');
  assert.equal(product.companyId, '1');
  assert.equal(product.imageUrl, null);
  assert.equal(toPosProduct(item({ name: '  VAPE 600 ML ' })).name, 'VAPE 600 ML');
  assert.equal(toPosProduct(item()).stockStatus, 'available');
});

test('projection handles products without a category and without a barcode', () => {
  const product = toPosProduct(item({ category: null, barcode: '' }));
  assert.equal(product.categoryId, '0');
  assert.equal(product.categoryName, 'Tanpa kategori');
  assert.equal(product.barcode, null);
});

test('catalog search asks for one bounded page for the trusted branch', async () => {
  const calls = [];
  const products = await searchCatalog(reader({ search: async (q) => { calls.push(q); return [item()]; } }), { companyId: 1, term: ' mie ', categoryId: 1 });
  assert.deepEqual(calls, [{ companyId: 1, term: 'mie', limit: 24, categoryId: 1 }]);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'SEDAAP MIE');
});

test('an unknown barcode is an empty result while database failures still propagate', async () => {
  assert.deepEqual(await findCatalogBarcode(reader({}), { companyId: 1, barcode: '000' }), []);
  const found = await findCatalogBarcode(reader({ findByBarcode: async () => item() }), { companyId: 1, barcode: '8998866202343' });
  assert.equal(found[0].barcode, '8998866202343');
  await assert.rejects(
    findCatalogBarcode(reader({ findByBarcode: async () => { throw new ProductReadError('DB_UNAVAILABLE'); } }), { companyId: 1, barcode: '1' }),
    { code: 'DB_UNAVAILABLE' });
});

test('category list is passed to the UI with string ids', async () => {
  const categories = await listCatalogCategories(reader({ listCategories: async () => [{ id: 3, name: 'SEMBAKO' }] }), { companyId: 1 });
  assert.deepEqual(categories, [{ id: '3', name: 'SEMBAKO' }]);
});

test('an empty branch catalog is an empty list, not an error', async () => {
  assert.deepEqual(await searchCatalog(reader({}), { companyId: 1, term: 'nothing' }), []);
});
