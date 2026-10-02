import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import * as preview from '../src/components/pos/preview.ts';

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

test('rupiah display shows whole rupiah and only adds decimals when the price has a fraction', () => {
  const plain = preview.formatRupiah(350000).replace(/\s/g, ' ');
  assert.match(plain, /Rp\s?3\.500$/);
  assert.match(preview.formatRupiah(400010).replace(/\s/g, ' '), /Rp\s?4\.000,10$/);
  assert.match(preview.formatRupiah(0).replace(/\s/g, ' '), /Rp\s?0$/);
});
