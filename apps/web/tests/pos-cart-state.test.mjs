import assert from 'node:assert/strict';
import test from 'node:test';
import * as state from '../src/features/pos/cart-state.ts';
import { changeQuantity, setQuantity } from '@koperasi/domain/pos/preview';
const a = { id: '1', priceSen: 10000, discountSen: 1000, stock: 200 };
const b = { ...a, id: '2' };
const c = { ...a, id: '3' };
const ids = cart => state.cartDisplayOrder(cart).map(line => line.product.id);

test('successful adds and repeats display newest first without reordering canonical checkout lines', () => {
  assert.equal(typeof state.addCartProduct, 'function');
  let cart = state.addCartProduct([], a, 1);
  assert.deepEqual(ids(cart), ['1']);
  cart = state.addCartProduct(cart, b, 2);
  cart = state.addCartProduct(cart, c, 3);
  assert.deepEqual(ids(cart), ['3', '2', '1']);
  cart = state.addCartProduct(cart, a, 4);
  assert.deepEqual(ids(cart), ['1', '3', '2']);
  assert.equal(cart.length, 3);
  assert.equal(cart[0].quantity, 2);
  assert.deepEqual(cart.map(line => line.product.id), ['1', '2', '3']);
  assert.deepEqual(ids(JSON.parse(JSON.stringify(cart))), ['1', '3', '2']);
  assert.deepEqual(ids(cart.filter(line => line.product.id !== '3')), ['1', '2']);
  assert.strictEqual(state.addCartProduct(cart, { ...b, stock: 0 }, 5), cart);
  cart = setQuantity(cart, b, 10);
  cart = changeQuantity(cart, b, 1);
  assert.deepEqual(ids(cart), ['1', '3', '2'], 'manual edits and plus preserve recent-add order');
  cart = changeQuantity(cart, b, -1);
  assert.deepEqual(ids(cart), ['1', '3', '2']);
});

test('out-of-order responses retain accepted action order and every valid increment', () => {
  assert.equal(typeof state.addCartProduct, 'function');
  let cart = state.addCartProduct([], a, 3); // third accepted scan resolves first
  cart = state.addCartProduct(cart, b, 2);
  cart = state.addCartProduct(cart, a, 1); // oldest response must not move A below B
  assert.deepEqual(ids(cart), ['1', '2']);
  assert.equal(cart.find(line => line.product.id === '1').quantity, 2);
  assert.equal(cart.find(line => line.product.id === '1').lastAdded, 3);
  const old = [{ product: a, quantity: 1 }, { product: b, quantity: 2 }];
  assert.deepEqual(ids(old), ['1', '2'], 'old saved carts retain their order');
});
