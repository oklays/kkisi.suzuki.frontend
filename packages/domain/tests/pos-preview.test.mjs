import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeQuantity, hasPrice, netPriceSen, previewSubtotal } from '@koperasi/domain/pos/preview';
import * as preview from '@koperasi/domain/pos/preview';

const product = { id: '7', priceSen: 400000, discountSen: 0, stock: 2 };

test('preview cart merges additions, refuses zero stock and never exceeds stock', () => {
  const one = changeQuantity([], product, 1);
  const two = changeQuantity(one, product, 1);
  assert.deepEqual(two, [{ product, quantity: 2 }]);
  assert.deepEqual(changeQuantity(two, product, 1), two);
  assert.deepEqual(changeQuantity([], { ...product, stock: 0 }, 1), []);
  assert.deepEqual(changeQuantity(two, product, -1), one);
  assert.deepEqual(changeQuantity(one, product, -1), []);
  assert.equal(previewSubtotal(two), 800000);
  assert.equal(previewSubtotal([]), 0);
});

test('a product without a price can never enter the cart', () => {
  const free = { ...product, priceSen: 0 };
  assert.equal(hasPrice(free), false);
  assert.deepEqual(changeQuantity([], free, 1), []);
  assert.equal(hasPrice({ ...product, priceSen: 500, discountSen: 500 }), false);
  assert.equal(hasPrice(product), true);
});

test('sold price is list price minus the nominal item discount, summed in integer sen', () => {
  const discounted = { ...product, id: '9', priceSen: 2200000, discountSen: 400000, stock: 5 };
  assert.equal(netPriceSen(discounted), 1800000);
  const cart = [{ product: discounted, quantity: 3 }, { product: { ...product, priceSen: 400010 }, quantity: 3 }];
  assert.equal(previewSubtotal(cart), 3 * 1800000 + 3 * 400010);
  // 0.1 + 0.2 style drift cannot happen: 3 × Rp4.000,10 is exactly Rp12.000,30
  assert.equal(previewSubtotal([{ product: { ...product, priceSen: 400010 }, quantity: 3 }]), 1200030);
});

test('quantity changes preserve full product metadata and use the latest product projection', () => {
  const item = { ...product, name: 'Air Mineral', imageUrl: '/real.jpg', illustrationIndex: 1, metadata: { barcode: '8991234567890' } };
  const one = changeQuantity([], item, 1);
  assert.strictEqual(one[0].product, item);
  const updated = { ...item, name: 'Air Mineral Baru' };
  const two = changeQuantity(one, updated, 1);
  assert.strictEqual(two[0].product, updated);
  assert.deepEqual(two[0].product.metadata, item.metadata);
  assert.equal(two[0].product.illustrationIndex, 1);
  assert.strictEqual(changeQuantity(two, updated, 1), two);
});

test('absolute quantity updates share delta validation and preserve display metadata', () => {
  assert.equal(typeof preview.setQuantity, 'function');
  const item = { ...product, stock: 20000, discountSen: 100 };
  let cart = [{ product: item, quantity: 1, lastAdded: 7 }];
  for (const quantity of [10, 100, 1, 9999]) {
    cart = preview.setQuantity(cart, item, quantity);
    assert.equal(cart[0].quantity, quantity);
    assert.equal(cart[0].lastAdded, 7);
    assert.equal(previewSubtotal(cart), quantity * 399900);
  }
  for (const quantity of [0, -1, 1.5, NaN, Infinity, 10000, Number.MAX_SAFE_INTEGER]) {
    assert.equal(preview.quantityError(item, quantity), 'invalid');
    assert.strictEqual(preview.setQuantity(cart, item, quantity), cart);
  }
  assert.strictEqual(changeQuantity(cart, item, 1), cart, 'plus uses the checkout maximum');
  assert.equal(preview.quantityError(product, 3), 'stock');
  const one = [{ product, quantity: 1 }];
  assert.strictEqual(preview.setQuantity(one, product, 3), one);
  assert.deepEqual(changeQuantity(one, product, -1), [], 'existing minus-at-one removal remains');
});
