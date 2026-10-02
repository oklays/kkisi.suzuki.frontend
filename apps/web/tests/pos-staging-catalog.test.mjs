import assert from 'node:assert/strict';
import test from 'node:test';

// Opt-in: POS_STAGING_DB_TEST=1 npm test  (reads the local staging copy; never writes).
// Refuses to run unless DATABASE_URL is a local host and a database whose name contains "staging".
const enabled = process.env.POS_STAGING_DB_TEST === '1';
const options = { skip: enabled ? false : 'set POS_STAGING_DB_TEST=1 to read the local staging database' };

async function catalog() {
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://none@invalid/none');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'DATABASE_URL must point at a local staging database');
  assert.match(url.pathname, /staging/, 'database name must contain "staging"');
  const { ReadProductsUseCase } = await import('../src/application/inventory/use-cases/read-products.usecase.ts');
  const { PrismaItemRepository } = await import('../src/infrastructure/repositories/prisma-item.repository.ts');
  const { searchCatalog, findCatalogBarcode, listCatalogCategories } = await import('../src/application/pos/catalog.ts');
  return { reader: new ReadProductsUseCase(new PrismaItemRepository()), searchCatalog, findCatalogBarcode, listCatalogCategories };
}

test('staging: every branch only sees its own sellable products within one page', options, async () => {
  const { reader, searchCatalog } = await catalog();
  for (const companyId of [1, 2, 3]) {
    const products = await searchCatalog(reader, { companyId });
    assert.ok(products.length > 0 && products.length <= 24, `branch ${companyId}`);
    for (const product of products) {
      assert.equal(product.companyId, String(companyId));
      assert.ok(Number.isInteger(product.priceSen) && product.priceSen >= 0);
      assert.ok(product.discountSen <= product.priceSen);
      assert.ok(product.stock > 0, 'browsing lists sellable stock only');
    }
  }
});

test('staging: barcode found in one branch resolves inside that branch only', options, async () => {
  const { reader, searchCatalog, findCatalogBarcode } = await catalog();
  const [sample] = await searchCatalog(reader, { companyId: 1, term: 'mie' });
  assert.ok(sample?.barcode, 'expected a sample product with a barcode');
  const [found] = await findCatalogBarcode(reader, { companyId: 1, barcode: sample.barcode });
  assert.equal(found.id, sample.id);
  assert.equal(found.priceSen, sample.priceSen);
  for (const companyId of [2, 3]) {
    const other = await findCatalogBarcode(reader, { companyId, barcode: sample.barcode });
    for (const product of other) assert.equal(product.companyId, String(companyId));
  }
  assert.deepEqual(await findCatalogBarcode(reader, { companyId: 1, barcode: 'NO-SUCH-BARCODE-0' }), []);
});

test('staging: name search, empty result and wildcard characters behave', options, async () => {
  const { reader, searchCatalog } = await catalog();
  const hits = await searchCatalog(reader, { companyId: 1, term: 'mie' });
  assert.ok(hits.length > 0);
  assert.ok(hits.some((p) => p.name.toLowerCase().includes('mie')), 'a name search must return name matches');
  assert.deepEqual(await searchCatalog(reader, { companyId: 1, term: 'zzzz-no-such-product' }), []);
  assert.deepEqual(await searchCatalog(reader, { companyId: 1, term: '%' }), []);
  const all = await searchCatalog(reader, { companyId: 1, term: 'mie' });
  assert.ok(all.some((p) => p.stock === 0), 'search must still show out-of-stock items');
});

test('staging: fractional prices survive exactly (Rp 4.000,10 stays 400010 sen)', options, async () => {
  const { toPosProduct } = await import('../src/application/pos/catalog.ts');
  const { PrismaItemRepository } = await import('../src/infrastructure/repositories/prisma-item.repository.ts');
  // Branch-2 item 12233 is priced 4000.10 in the staging copy (DOUBLE(18,2) column).
  const item = await new PrismaItemRepository().findById({ companyId: 2, id: 12233 });
  assert.ok(item, 'expected item 12233 in the staging copy');
  assert.equal(item.sellingPrice, '4000.10');
  assert.equal(toPosProduct(item).priceSen, 400010);
});

test('staging: categories come from the branch catalogue with real names', options, async () => {
  const { reader, listCatalogCategories } = await catalog();
  const categories = await listCatalogCategories(reader, { companyId: 2 });
  assert.ok(categories.length > 10);
  assert.ok(categories.every((c) => /^\d+$/.test(c.id) && c.name.length > 0));
});
