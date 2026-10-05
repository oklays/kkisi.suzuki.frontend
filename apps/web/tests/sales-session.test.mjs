import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSalesSession } from '../src/infrastructure/sales/page-session.ts';

const auth = (permissions, canSwitchBranch = false) => ({
  ctx: { userId: 1, userName: 'Test', companyId: 9, roleId: 2, sidHash: 'hash', canSwitchBranch, hasPermission: async key => permissions.includes(key) },
  services: { deps: { companies: { findActive: async () => ({ name: 'Cabang test' }), listActive: async () => [{ id: 9, name: 'Cabang test' }] } }, keys: { csrfToken: () => 'csrf' } },
});
test('Sales preserves all authorized sidebar capabilities including on the detail route', async () => {
  const session = await buildSalesSession(auth(['sales_add', 'sales_view', 'sales_payment_view', 'items_view', 'inventory_so']));
  for (const key of ['canSales', 'canCheckout', 'canViewPayments', 'canProducts', 'canInventory']) assert.equal(session[key], true, key);
  assert.equal(session.checkoutAvailable, false);
});
test('Sales capability projection follows inventory branch policy and hides unauthorized actions', async () => {
  const viewer = await buildSalesSession(auth(['sales_view', 'inventory_view']));
  assert.equal(viewer.canProducts, false); assert.equal(viewer.canCheckout, false);
  assert.equal(viewer.canViewPayments, false); assert.equal(viewer.canInventory, false);
  const admin = await buildSalesSession(auth(['sales_view', 'inventory_view'], true));
  assert.equal(admin.canInventory, true); assert.equal(admin.companies.length, 1);
});
