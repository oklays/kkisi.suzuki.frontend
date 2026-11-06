import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConsoleCapabilities, resolveConsoleAccess } from '../src/console/resolve-capabilities.usecase.ts';

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

import { KOSIPA_CAPABILITIES } from '@koperasi/domain/console/capabilities';
const subject = { userId: 23, roleId: 2, canSwitchBranch: true };
const unusedLinks = { async activeForConsoleUser() { throw new Error('role reads must not invent a legacy identity'); } };

test('non-cashier role policy grants exactly KOSIPA views, no legacy actor, writes, exports or grant administration', async () => {
  const access = await resolveConsoleAccess({
    permissions: { async grantedAmong() { return new Set(['users_edit', 'items_view']); }, async kosipaRoleAccess(roleId) { assert.equal(roleId, 2); return 'allowed'; } },
    kosipa: { links: unusedLinks, kosipa: {}, grants: { async activeCapabilities() { throw new Error('no role write grants'); } }, grantAdmins: new Set([23]), exportPolicy: { enabled: true, allowedUserIds: new Set([23]) } },
  }, subject);
  assert.equal(access.kosipa, 'role');
  assert.equal(access.kosipaUserId, null);
  assert.deepEqual([...access.capabilities].filter(c => c.startsWith('kosipa.')).sort(), [...KOSIPA_CAPABILITIES].sort());
  assert.equal(access.capabilities.has('iam.kosipa.grant'), false);
  assert.equal(access.capabilities.has('toko.products.view'), true);
});

test('cashier role denial takes precedence over identity links and preserves TOKO capabilities', async () => {
  const access = await resolveConsoleAccess({
    permissions: { async grantedAmong() { return new Set(['sales_add']); }, async kosipaRoleAccess() { return 'denied'; } },
    kosipa: { links: unusedLinks, kosipa: {} },
  }, { ...subject, roleId: 4, canSwitchBranch: false });
  assert.equal(access.kosipa, 'restricted');
  assert.equal(access.kosipaUserId, null);
  assert.deepEqual([...access.capabilities], ['toko.pos.checkout']);
});

test('role-policy lookup outage removes KOSIPA access while retaining independently verified TOKO access', async () => {
  const access = await resolveConsoleAccess({
    permissions: { async grantedAmong() { return new Set(['items_view']); }, async kosipaRoleAccess() { throw new Error('role read unavailable'); } },
    kosipa: { links: { async activeForConsoleUser() { return null; } }, kosipa: {} },
  }, subject);
  assert.equal(access.kosipa, 'unavailable');
  assert.deepEqual([...access.capabilities], ['toko.products.view']);
});
