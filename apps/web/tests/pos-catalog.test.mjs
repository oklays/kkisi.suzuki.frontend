import assert from 'node:assert/strict';
import test from 'node:test';
import { toMinorUnits } from '../src/domain/shared/money.ts';
import { ProductReadError } from '../src/domain/shared/product-read-error.ts';
import { ReadProductsUseCase } from '../src/application/inventory/use-cases/read-products.usecase.ts';
import { findCatalogBarcode, listCatalogCategories, searchCatalog, toPosProduct } from '../src/application/pos/catalog.ts';

const item = (over = {}) => ({
  id: 98, companyId: 1, code: 'BRG-98', barcode: '8998866202343', name: 'SEDAAP MIE',
  sellingPrice: '3500.00', discount: '0.00', stock: 40, category: { id: 1, name: 'MAKANAN' }, ...over,
});
const reader = (repo) => new ReadProductsUseCase({ search: async () => [], findById: async () => null, findByBarcode: async () => null, listCategories: async () => [], ...repo });

test('money converts exact decimal strings to integer sen without floating point drift', () => {
  assert.equal(toMinorUnits('3500.00'), 350000);
  assert.equal(toMinorUnits('4000.10'), 400010);
  assert.equal(toMinorUnits('9909.90'), 990990);
  assert.equal(toMinorUnits('0.07'), 7);
  assert.equal(toMinorUnits('12'), 1200);
  assert.equal(toMinorUnits('11220000.00'), 1122000000);
  assert.equal(toMinorUnits('-1.5'), -150);
  for (const bad of ['', '1e3', '1,5', '1.234', 'abc', '.5']) assert.throws(() => toMinorUnits(bad), RangeError, bad);
});

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
