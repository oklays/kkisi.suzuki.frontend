import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConsoleAccess } from '../src/console/resolve-capabilities.usecase.ts';

const perms = (slugs) => ({ async grantedAmong() { return new Set(slugs); } });
const subject = (canSwitchBranch) => ({ userId: 7, roleId: canSwitchBranch ? 2 : 4, canSwitchBranch });

test('the synthetic Warehouse preview needs the deployment flag AND the existing global-warehouse capability; neither alone is enough', async () => {
  const has = async (slugs, canSwitch, features) => (await resolveConsoleAccess({ permissions: perms(slugs), kosipa: null, features }, subject(canSwitch))).capabilities.has('warehouse.preview.view');
  assert.equal(await has(['inventory_view'], true, { warehousePreview: true }), true);
  assert.equal(await has(['inventory_view'], true, { warehousePreview: false }), false, 'flag off');
  assert.equal(await has(['inventory_view'], true, undefined), false, 'no features');
  assert.equal(await has([], true, { warehousePreview: true }), false, 'no inventory_view');
  assert.equal(await has(['inventory_view'], false, { warehousePreview: true }), false, 'a branch cashier (no branch chooser) never gets it');
});

test('the preview capability does not depend on KOSIPA or the console store (a failing identity store changes nothing for it)', async () => {
  const kosipa = { links: { async activeForConsoleUser() { throw new Error('console db down'); } }, kosipa: { async kosipaUser() { return null; }, async allowedMenuUrls() { return []; } } };
  const a = await resolveConsoleAccess({ permissions: perms(['inventory_view']), kosipa, features: { warehousePreview: true } }, subject(true));
  assert.equal(a.kosipa, 'unavailable'); assert.ok(a.capabilities.has('warehouse.preview.view'));
});
