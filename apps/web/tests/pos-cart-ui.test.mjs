import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise actual React output using the installed compiler; Node cannot parse TSX.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/navigation') return { url: 'data:text/javascript,export const useRouter=()=>({replace(){},refresh(){}})', shortCircuit: true };
    if (specifier === 'next/link') return nextResolve('next/link.js', context);
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
    if (specifier.startsWith('file:') || specifier.startsWith('.')) {
      const url = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(url.pathname)) {
        for (const extension of ['.tsx', '.ts']) if (existsSync(fileURLToPath(url) + extension)) return nextResolve(url.href + extension, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return nextLoad(url, context);
  },
});
const { PosScreen } = await import('../src/components/pos/PosScreen.tsx');
const { ProductCard } = await import('../src/components/pos/ProductCatalog.tsx');
const { TransactionPanel, QuantityControl } = await import('../src/components/pos/TransactionPanel.tsx');
const center = await import('../src/components/pos/CenterCart.tsx').catch(() => null);
const product = { id: '1', companyId: '1', name: 'Full product name with a long packaging description', code: 'ITEM-1', barcode: '8991', categoryName: 'Makanan', priceSen: 1000000, discountSen: 50000, stock: 10 };
const cart = [{ product, quantity: 2 }];
const session = { userId: 1, companyId: 1, branchName: 'Test branch', register: { open: { noref: 'TEST-1', stale: false }, multiple: false }, checkoutAvailable: true, branches: [], userName: 'Tester' };
const noop = () => {};
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('POS initially presents exactly Product and Keranjang tabs with a persistent payment panel', () => {
  const html = render(PosScreen, { products: [product], categories: [], session });
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>.*?Product/s);
  assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*>.*?Keranjang/s);
  assert.doesNotMatch(html, /Kategori produk/);
  assert.equal((html.match(/class="pos-transaction"/g) ?? []).length, 1);
  assert.match(html, /class="pos-clear"/);
});

test('the transaction panel contains member and payment controls without a duplicate cart or clear dialog', () => {
  const html = render(TransactionPanel, { cart, session, storageKey: 'test', onLockChange: noop, onClear: noop });
  assert.match(html, /Pencarian anggota/);
  assert.match(html, /Metode Pembayaran/);
  assert.doesNotMatch(html, /class="pos-cart-item"|<dialog|Keranjang Transaksi/);
});

test('center cart shows full product name, code, discount, exact line total and a confirmation dialog', () => {
  assert.ok(center?.CenterCart, 'center cart is available');
  const html = render(center.CenterCart, { cart, locked: false, onChange: noop, onRemove: noop, onClear: noop });
  assert.match(html, /Full product name with a long packaging description/);
  assert.match(html, /ITEM-1/);
  assert.match(html, /Diskon produk/);
  assert.match(html, /Rp(?:\s|&nbsp;|&#x27;)*500/);
  assert.match(html, /19\.000/);
  const clear = render(center.ClearCartButton, { disabled: false, onClear: noop });
  assert.match(clear, /<dialog/);
  assert.match(clear, /Ya, Hapus Semua/);
});

test('locked cart disables every line mutation and the catalog add button', () => {
  const quantity = render(QuantityControl, { line: cart[0], onChange: noop, disabled: true });
  assert.equal((quantity.match(/disabled=""/g) ?? []).length, 2);
  const html = render(ProductCard, { product, quantity: 0, onAdd: noop, locked: true });
  assert.match(html, /class="pos-add" disabled=""/);
});


test('locked central cart disables removal and its shared clear confirmation', () => {
  const html = render(center.CenterCart, { cart, locked: true, onChange: noop, onRemove: noop });
  assert.match(html, /class="pos-cart-lock" disabled=""/);
  assert.match(html, /disabled="" class="pos-icon-button pos-remove"/);
  const clear = render(center.ClearCartButton, { disabled: true, onClear: noop });
  assert.match(clear, /class="pos-clear" disabled=""/);
  assert.match(clear, /class="pos-confirm-clear" disabled=""/);
});
