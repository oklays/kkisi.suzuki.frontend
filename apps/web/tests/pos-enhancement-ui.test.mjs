import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function component(file, stubs = {}, globals = {}) {
  const slots = []; const cleanups = []; let index = 0;
  const react = {
    useState(initial) { const slot = index++; if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial; return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }]; },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useCallback(fn) { index++; return fn; },
    useEffect(effect) { const slot = index++; if (!(slot in slots)) { slots[slot] = true; cleanups.push(effect()); } },
  };
  const code = ts.transpileModule(readFileSync(new URL(`../src/components/pos/${file}.tsx`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const fixture = { exports: {} };
  runInNewContext(code, { URLSearchParams, module: fixture, exports: fixture.exports, require: id => id === 'react' ? react : id in stubs ? stubs[id] : require(id), ...globals });
  return { render(name, props) { index = 0; return fixture.exports[name](props); }, unmount() { cleanups.forEach(fn => fn?.()); } };
}
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
}
const session = { userId: 1, companyId: 1, checkoutAvailable: true, csrfToken: 'synthetic', register: { open: { noref: 'SYNTHETIC' }, multiple: false } };
const member = { id: 7, name: 'Synthetic Member', nik: '0007', remainingSen: 1000000, limitSen: 1000000 };
const product = { id: '1', companyId: '1', priceSen: 10000, discountSen: 0 };
const flush = () => new Promise(resolve => setImmediate(resolve));

const preview = { previewSubtotal: () => 10000, formatRupiah: String };
const state = { checkoutBlockingReasons: () => [], createCartScanGuard: () => ({ invalidate() {}, capture() {}, isCurrent: () => true }) };

test('confirmed checkout callback clears an outstanding barcode query', async () => {
  const ProductSearch = () => null; const TransactionPanel = () => null;
  const view = component('PosScreen', {
    'next/navigation': { useRouter: () => ({ replace() {} }) },
    '@/features/pos/types': {}, './PosShell': { PosShell() {}, PosHeader() {} },
    './ProductCatalog': { ProductSearch, ProductGrid() {} }, './TransactionPanel': { TransactionPanel },
    './CenterCart': { CenterCart() {}, ClearCartButton() {} }, './preview': {}, '@/features/pos/checkout-state': state, './pos.css': {},
  }, { localStorage: { getItem: () => null, setItem() {} } });
  const render = () => view.render('PosScreen', { products: [], session });
  find(render(), node => node.type === ProductSearch).props.onQuery('BARCODE-LEFTOVER');
  await flush();
  const before = render();
  assert.equal(find(before, node => node.type === ProductSearch).props.query, 'BARCODE-LEFTOVER');
  find(before, node => node.type === TransactionPanel).props.onClear();
  assert.equal(find(render(), node => node.type === ProductSearch).props.query, '');
});

for (const outcome of ['success', 'rejected', 'uncertain']) test(`member search resets only on confirmed checkout: ${outcome}`, async () => {
  const store = new Map(); let cleared = 0;
  const view = component('TransactionPanel', {
    './preview': preview, '../money/CurrencyInput': { CurrencyInput() { return null; } }, './ProductCatalog': { ProductIllustration() {} },
    '@/features/pos/checkout-state': state, './MemberKindPicker': { MemberKindPicker() {} },
  }, {
    localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    crypto: { randomUUID: () => 'SYNTHETIC-KEY' }, window: {}, document: { getElementById: () => ({}) },
    fetch: async () => { if (outcome === 'uncertain') throw Error('response lost'); return { status: outcome === 'success' ? 200 : 400, ok: outcome === 'success', json: async () => outcome === 'success' ? { receipt: { saleId: 1, salesCode: 'SYNTHETIC', grandTotalSen: 10000, paymentType: 'Kredit' } } : { error: 'CREDIT_LIMIT' } }; },
  });
  const render = () => view.render('TransactionPanel', { cart: [{ product, quantity: 1 }], session, storageKey: 'synthetic-cart', onLockChange() {}, onClear() { cleared++; } });
  render(); await flush();
  let tree = render();
  const memberSearch = find(tree, node => node.type?.name === 'MemberSearch');
  memberSearch.props.onMember(member);
  tree = render();
  find(tree, node => node.type?.name === 'CheckoutButton').props.onClick();
  await flush();
  const next = find(render(), node => node.type?.name === 'MemberSearch');
  if (outcome === 'success') { assert.notEqual(next.key, memberSearch.key, 'remount search to clear its private NIK query'); assert.equal(next.props.member, null); assert.equal(cleared, 1); }
  else { assert.equal(next.key, memberSearch.key); assert.equal(next.props.member, member); assert.equal(cleared, 0); }
  assert.equal(store.has('kkisi-payment:1:1'), outcome === 'uncertain', 'preserve retry key for an unknown outcome');
});

test('unmounting member search invalidates a pending lookup', async () => {
  let resolve; const selected = [];
  const view = component('TransactionPanel', {
    './preview': preview, '../money/CurrencyInput': { CurrencyInput() { return null; } }, './ProductCatalog': {}, '@/features/pos/checkout-state': state, './MemberKindPicker': {},
  }, { fetch: () => new Promise(r => { resolve = r; }) });
  const render = () => view.render('MemberSearch', { member: null, disabled: false, onMember: value => selected.push(value) });
  find(render(), node => node.type === 'input').props.onChange({ target: { value: '0007' } });
  find(render(), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  view.unmount();
  resolve({ ok: true, json: async () => ({ member }) }); await flush();
  assert.equal(selected.filter(Boolean).length, 0, 'late member response must not select a member for the next sale');
});

function printFixture({ autoPrint = false, fontsReady = Promise.resolve() } = {}) {
  let height = 420; let prints = 0;
  const events = new Map(); const nodes = new Map(); const timers = new Map(); let nextTimer = 0;
  const paper = { style: { width: '', maxWidth: '' }, getBoundingClientRect: () => ({ width: paper.style.width === '75mm' ? 75 * 96 / 25.4 : 200, height }) };
  const document = {
    fonts: { ready: fontsReady }, querySelector: selector => selector === '.receipt-paper' ? paper : null,
    getElementById: id => nodes.get(id), createElement: () => ({ textContent: '', remove() { nodes.delete(this.id); } }),
    head: { appendChild(node) { nodes.set(node.id, node); } },
  };
  const view = component('ReceiptPrintButton', {}, {
    document,
    window: { focus() {}, print() { prints++; events.get('beforeprint')?.(); }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) },
    setTimeout: fn => { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
  });
  const button = view.render('ReceiptPrintButton', { autoPrint });
  return { view, button, paper, events, nodes, timers, get prints() { return prints; }, setHeight(value) { height = value; } };
}

test('printing bounds the 75 mm page to the content and recalculates for a longer receipt', async () => {
  const fixture = printFixture();
  await fixture.button.props.onClick();
  const page = fixture.nodes.get('receipt-page-size');
  assert.ok(page, 'explicit content-sized page is required');
  const height = Number(page.textContent.match(/75mm\s+([\d.]+)mm/)[1]);
  assert.ok(height >= 420 * 25.4 / 96 && height < 420 * 25.4 / 96 + 2, 'bounded rounding allowance');
  assert.equal(fixture.paper.style.width, ''); assert.equal(fixture.paper.style.maxWidth, '', 'restore preview styles');
  fixture.setHeight(1800); fixture.events.get('beforeprint')();
  assert.match(page.textContent, /75mm 478mm/);
  assert.equal(fixture.nodes.size, 1, 'reprints update the existing rule');
  assert.equal(fixture.prints, 1);
  fixture.view.unmount(); assert.equal(fixture.events.size, 0); assert.equal(fixture.nodes.size, 0, 'page rule must not leak into other routes');
});

test('automatic printing waits for fonts and submits exactly one job', async () => {
  let resolve; const fixture = printFixture({ autoPrint: true, fontsReady: new Promise(r => { resolve = r; }) });
  await flush(); assert.equal(fixture.timers.size, 0);
  resolve(); await flush(); assert.equal(fixture.timers.size, 1);
  await [...fixture.timers.values()][0](); await flush(); assert.equal(fixture.prints, 1);
  fixture.view.unmount(); assert.equal(fixture.timers.size, 0);
});

test('unmounting before fonts load cancels automatic printing', async () => {
  let resolve; const fixture = printFixture({ autoPrint: true, fontsReady: new Promise(r => { resolve = r; }) });
  fixture.view.unmount(); resolve(); await flush();
  assert.equal(fixture.timers.size, 0); assert.equal(fixture.prints, 0);
});
