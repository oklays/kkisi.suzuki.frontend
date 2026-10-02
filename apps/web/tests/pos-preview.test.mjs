import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

// Execute the same pure TypeScript helpers used by the UI without a new runner.
const modulePath = new URL('../src/components/pos/preview.ts', import.meta.url);
const source = existsSync(modulePath) ? readFileSync(modulePath, 'utf8') : 'export {}';
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const preview = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const product = { id: '7', companyId: '1', name: 'Air Mineral', code: 'MIN-001', barcode: '8991234567890', categoryId: 'drink', categoryName: 'Minuman', imageUrl: null, priceSen: 400000, discountSen: 0, stock: 2 };

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
  assert.equal(preview.previewSubtotal(two), 800000);
  assert.equal(preview.previewSubtotal([]), 0);
});

test('a product without a price can never enter the cart', () => {
  const free = { ...product, priceSen: 0 };
  assert.equal(preview.hasPrice(free), false);
  assert.deepEqual(preview.changeQuantity([], free, 1), []);
  assert.equal(preview.hasPrice({ ...product, priceSen: 500, discountSen: 500 }), false);
  assert.equal(preview.hasPrice(product), true);
});

test('sold price is list price minus the nominal item discount, summed in integer sen', () => {
  const discounted = { ...product, id: '9', priceSen: 2200000, discountSen: 400000, stock: 5 };
  assert.equal(preview.netPriceSen(discounted), 1800000);
  const cart = [{ product: discounted, quantity: 3 }, { product: { ...product, priceSen: 400010 }, quantity: 3 }];
  assert.equal(preview.previewSubtotal(cart), 3 * 1800000 + 3 * 400010);
  // 0.1 + 0.2 style drift cannot happen: 3 × Rp4.000,10 is exactly Rp12.000,30
  assert.equal(preview.previewSubtotal([{ product: { ...product, priceSen: 400010 }, quantity: 3 }]), 1200030);
});

test('rupiah display shows whole rupiah and only adds decimals when the price has a fraction', () => {
  const plain = preview.formatRupiah(350000).replace(/\s/g, ' ');
  assert.match(plain, /Rp\s?3\.500$/);
  assert.match(preview.formatRupiah(400010).replace(/\s/g, ' '), /Rp\s?4\.000,10$/);
  assert.match(preview.formatRupiah(0).replace(/\s/g, ' '), /Rp\s?0$/);
});
