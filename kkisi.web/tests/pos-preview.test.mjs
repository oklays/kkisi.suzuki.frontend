import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

// Execute the same pure TypeScript helpers used by the UI without a new runner.
const modulePath = new URL('../src/components/pos/preview.ts', import.meta.url);
const source = existsSync(modulePath) ? readFileSync(modulePath, 'utf8') : 'export {}';
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const preview = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const product = { id: '7', companyId: 'demo', name: 'Air Mineral', code: 'MIN-001', barcode: '8991234567890', categoryId: 'drink', categoryName: 'Minuman', imageUrl: null, unitPriceRp: 4000, stock: 2 };

test('search matches trimmed name, code and barcode with category identity', () => {
  for (const query of [' MINERAL ', 'min-001', '8991234567890']) {
    assert.deepEqual(preview.filterProducts([product], query, null), [product]);
  }
  assert.deepEqual(preview.filterProducts([product], '', 'other'), []);
  assert.deepEqual(preview.filterProducts([product], 'missing', null), []);
});

test('fallback stays stable for the same ID, supports all families and prefers real photos', () => {
  for (const family of ['Minuman', 'Makanan', 'Sembako', 'Rumah Tangga', 'Lainnya']) {
    const item = { ...product, categoryName: family };
    const path = preview.productIllustration(item);
    assert.equal(path, preview.productIllustration(item));
    assert.ok(existsSync(new URL(`../public${path}`, import.meta.url)), path);
  }
  assert.match(preview.productIllustration({ ...product, categoryName: 'Kategori Baru' }), /lainnya-illustration-[1-6]\.svg$/);
  assert.equal(preview.productImage({ ...product, imageUrl: '/real.jpg' }), '/real.jpg');
  assert.equal(preview.productImage(product), preview.productIllustration(product));
  assert.equal(preview.productIllustration({ ...product, illustrationIndex: 1 }), '/illustrations/minuman-illustration-1.svg');
});

test('every fallback contains visible drawing content rather than an empty image wrapper', () => {
  for (const family of ['minuman', 'makanan', 'sembako', 'rumah-tangga', 'lainnya']) {
    for (let index = 1; index <= 6; index++) {
      const svg = readFileSync(new URL(`../public/illustrations/${family}-illustration-${index}.svg`, import.meta.url), 'utf8');
      assert.match(svg, /<(path|rect|circle|ellipse|polygon|polyline)\b/, `${family}-${index} is blank`);
    }
  }
});

test('preview cart merges additions, refuses zero stock and never exceeds stock', () => {
  const one = preview.changeQuantity([], product, 1);
  const two = preview.changeQuantity(one, product, 1);
  assert.deepEqual(two, [{ product, quantity: 2 }]);
  assert.deepEqual(preview.changeQuantity(two, product, 1), two);
  assert.deepEqual(preview.changeQuantity([], { ...product, stock: 0 }, 1), []);
  assert.deepEqual(preview.changeQuantity(two, product, -1), one);
  assert.deepEqual(preview.changeQuantity(one, product, -1), []);
  assert.equal(preview.previewSubtotal(two), 8000);
  assert.equal(preview.previewSubtotal([]), 0);
});

test('category filters preserve category IDs and unknown backend names', () => {
  const other = { ...product, id: '8', categoryId: 'new', categoryName: 'Kategori Baru' };
  assert.deepEqual(preview.catalogCategories([product, product, other]), [
    { id: 'drink', name: 'Minuman' }, { id: 'new', name: 'Kategori Baru' },
  ]);
  assert.deepEqual(preview.filterProducts([product, other], '', 'new'), [other]);
});
