import assert from 'node:assert/strict';
import test from 'node:test';
import { TOKO_CAPABILITIES, TOKO_PERMISSION_SLUGS, postLoginLanding, tokoCapabilities } from '../src/console/capabilities.ts';
import { currentEntryId, visibleNavigation } from '../src/console/navigation.ts';

const caps = (slugs, chooser = false) => tokoCapabilities(new Set(slugs), chooser);

test('no permission slug -> no capability', () => {
  assert.equal(caps([]).size, 0);
  assert.equal(caps(['unrelated_slug', 'master_kasir'], true).size, 0);
});

test('checkout, history and payments follow the existing page gates', () => {
  assert.deepEqual([...caps(['sales_add'])], ['toko.pos.checkout']);
  assert.deepEqual([...caps(['sales_view'])], ['toko.sales.view']);
  assert.ok(caps(['sales_view', 'sales_payment_view']).has('toko.sales.payments'));
  assert.ok(!caps(['sales_payment_view']).has('toko.sales.payments'), 'payments need sales_view too');
});

test('returns live inside the Sales area: sales_view AND (sales_return_view OR sales_return_add)', () => {
  assert.ok(!caps(['sales_return_view']).has('toko.returns.view'));
  assert.ok(!caps(['sales_return_add']).has('toko.returns.create'));
  assert.ok(caps(['sales_view', 'sales_return_view']).has('toko.returns.view'));
  assert.ok(!caps(['sales_view', 'sales_return_view']).has('toko.returns.create'));
  const add = caps(['sales_view', 'sales_return_add']);
  assert.ok(add.has('toko.returns.view') && add.has('toko.returns.create'));
});

test('product add/edit require items_view', () => {
  assert.equal(caps(['items_add', 'items_edit']).size, 0);
  const all = caps(['items_view', 'items_add', 'items_edit']);
  assert.ok(all.has('toko.products.view') && all.has('toko.products.create') && all.has('toko.products.edit'));
});

test('warehouse master needs inventory_view AND a branch chooser; stock opname needs inventory_so', () => {
  assert.equal(caps(['inventory_view'], false).size, 0, 'role > 2 with inventory_view only has no inventory page access');
  assert.deepEqual([...caps(['inventory_view'], true)].sort(), ['toko.inventory.view', 'toko.inventory.warehouse']);
  assert.deepEqual([...caps(['inventory_so'], false)].sort(), ['toko.inventory.so', 'toko.inventory.view']);
});

test('every mapped capability is declared and every read slug is listed for the batched query', () => {
  const everything = caps(TOKO_PERMISSION_SLUGS, true);
  for (const cap of everything) assert.ok(TOKO_CAPABILITIES.includes(cap), cap);
  assert.equal(everything.size, TOKO_CAPABILITIES.length);
});

test('post-login landing: console off keeps /pos for everyone', () => {
  for (const slugs of [[], ['sales_add'], ['items_view'], TOKO_PERMISSION_SLUGS]) {
    assert.equal(postLoginLanding({ capabilities: caps(slugs, true), consoleEnabled: false }), '/pos');
  }
});

test('post-login landing: console on routes cashier-focused users to /pos and others to /console', () => {
  const on = (slugs, chooser = false) => postLoginLanding({ capabilities: caps(slugs, chooser), consoleEnabled: true });
  assert.equal(on(['sales_add']), '/pos');
  assert.equal(on(['sales_add', 'sales_view', 'sales_return_view']), '/pos', 'history/returns stay cashier work');
  assert.equal(on(['sales_add', 'items_view']), '/console');
  assert.equal(on(['sales_add', 'inventory_so']), '/console');
  assert.equal(on(['sales_view']), '/console', 'a sales viewer without checkout is not excluded from the console');
  assert.equal(on([]), '/console');
});

const entries = [
  { id: 'dash', section: 'dashboard', label: 'Dashboard', href: '/console', order: 0, anyOf: [], readiness: 'available' },
  { id: 'sales', section: 'toko', label: 'Riwayat', href: '/sales', order: 2, anyOf: ['toko.sales.view'], readiness: 'available', excludePrefix: '/sales/returns' },
  { id: 'returns', section: 'toko', label: 'Retur', href: '/sales/returns', order: 3, anyOf: ['toko.returns.view'], readiness: 'available' },
  { id: 'pos', section: 'toko', label: 'POS', href: '/pos', order: 1, anyOf: ['toko.pos.checkout'], readiness: 'available' },
  { id: 'loans', section: 'kosipa', label: 'Pinjaman', href: '/console/kosipa/pinjaman', order: 1, anyOf: [], readiness: 'planned' },
];

test('navigation shows only permitted, available entries, ordered, with empty sections dropped', () => {
  const groups = visibleNavigation(entries, caps(['sales_add', 'sales_view']));
  assert.deepEqual(groups.map((g) => g.section), ['dashboard', 'toko']);
  assert.deepEqual(groups[1].items.map((i) => i.id), ['pos', 'sales']);
  assert.ok(!groups.some((g) => g.items.some((i) => i.readiness === 'planned')), 'planned items are never links');
});

test('current entry: longest prefix wins and exclusions hold', () => {
  assert.equal(currentEntryId(entries, '/sales'), 'sales');
  assert.equal(currentEntryId(entries, '/sales/invoice/9'), 'sales');
  assert.equal(currentEntryId(entries, '/sales/returns/4'), 'returns');
  assert.equal(currentEntryId(entries, '/console'), 'dash');
  assert.equal(currentEntryId(entries, '/salesman'), null, 'prefix match respects path segments');
});
