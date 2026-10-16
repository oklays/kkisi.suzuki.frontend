import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConsoleCapabilities } from '../src/console/resolve-capabilities.usecase.ts';

test('resolves all TOKO capabilities from one batched permission read', async () => {
  const calls = [];
  const source = { async grantedAmong(roleId, slugs) { calls.push({ roleId, slugs: [...slugs] }); return new Set(['sales_add', 'items_view', 'not_asked']); } };
  const result = await resolveConsoleCapabilities(source, { roleId: 7, canSwitchBranch: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].roleId, 7);
  assert.ok(calls[0].slugs.includes('inventory_view') && calls[0].slugs.includes('sales_return_add'));
  assert.deepEqual([...result].sort(), ['toko.pos.checkout', 'toko.products.view']);
});

test('a permission store failure propagates (fail-closed), it is never read as "no capability"', async () => {
  const source = { async grantedAmong() { throw new Error('store down'); } };
  await assert.rejects(resolveConsoleCapabilities(source, { roleId: 1, canSwitchBranch: true }), /store down/);
});
