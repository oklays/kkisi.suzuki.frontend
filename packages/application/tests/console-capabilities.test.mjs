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

function roleWriter(overrides = {}) {
  const calls = [];
  const kosipa = {
    roleWriteGrantsEnabled: true,
    links: { async activeForConsoleUser(id) { calls.push(['link', id]); return { externalUserId: 9102, status: 'active' }; } },
    kosipa: { async kosipaUser(id) { calls.push(['user', id]); return { id, active: true, activeGroups: 1 }; }, async allowedMenuUrls() { throw new Error('fenced menus must not control role entitlement or actor'); } },
    grants: { async activeCapabilities(id) { calls.push(['grant', id]); return ['kosipa.master.manage', 'kosipa.loan.disburse', 'kosipa.future.manage']; } },
    grantAdmins: new Set([23]),
    exportPolicy: { enabled: false, allowedUserIds: new Set([23]) },
    ...overrides,
  };
  const permissions = { async grantedAmong() { return new Set(['users_edit', 'items_view']); }, async kosipaRoleAccess() { return 'allowed'; } };
  return { sources: { permissions, kosipa }, calls };
}

test('explicit role write opt-in resolves a real actor and implemented per-user grants independently of fenced menus', async () => {
  const f = roleWriter();
  const access = await resolveConsoleAccess(f.sources, subject);
  assert.equal(access.kosipa, 'role');
  assert.equal(access.kosipaUserId, 9102);
  assert.deepEqual([...access.capabilities].filter(c => c.startsWith('kosipa.')).sort(), [...KOSIPA_CAPABILITIES, 'kosipa.master.manage'].sort());
  assert.equal(access.capabilities.has('iam.kosipa.grant'), true);
  assert.deepEqual(f.calls, [['link', 23], ['user', 9102], ['grant', 23]]);
  const withExport = await resolveConsoleAccess(roleWriter({ exportPolicy: { enabled: true, allowedUserIds: new Set([23]) } }).sources, subject);
  assert.equal(withExport.capabilities.has('kosipa.report.export'), true);
});

test('role write opt-out makes no identity or grant lookup even with configured grants', async () => {
  const f = roleWriter({ roleWriteGrantsEnabled: false });
  const access = await resolveConsoleAccess(f.sources, subject);
  assert.equal(access.kosipaUserId, null);
  assert.deepEqual(f.calls, []);
  assert.deepEqual([...access.capabilities].filter(c => c.startsWith('kosipa.')).sort(), [...KOSIPA_CAPABILITIES].sort());
});

test('valid role actor without an active per-user grant receives no writes', async () => {
  const f = roleWriter({ grants: { async activeCapabilities() { return []; } } });
  const access = await resolveConsoleAccess(f.sources, subject);
  assert.equal(access.kosipaUserId, 9102);
  assert.equal(access.capabilities.has('kosipa.master.manage'), false);
});

for (const state of ['missing', 'revoked', 'inactive', 'ungrouped']) {
  test(`role monitoring survives ${state} identity without fabricating an actor or writes`, async () => {
    const f = roleWriter();
    if (state === 'missing') f.sources.kosipa.links.activeForConsoleUser = async () => null;
    if (state === 'revoked') f.sources.kosipa.links.activeForConsoleUser = async () => ({ externalUserId: 9102, status: 'revoked' });
    if (state === 'inactive' || state === 'ungrouped') f.sources.kosipa.kosipa.kosipaUser = async () => ({ id: 9102, active: state !== 'inactive', activeGroups: state === 'ungrouped' ? 0 : 1 });
    const access = await resolveConsoleAccess(f.sources, subject);
    assert.equal(access.kosipa, 'role');
    assert.equal(access.kosipaUserId, null);
    assert.equal(access.kosipaWriteUnavailable, undefined);
    assert.equal(access.capabilities.has('kosipa.master.manage'), false);
    assert.equal(access.capabilities.has('iam.kosipa.grant'), true, 'admin does not require its own command identity');
  });
}

for (const dependency of ['link', 'user', 'grant']) {
  test(`${dependency} outage retains role views but removes command and grant administration access`, async () => {
    const f = roleWriter();
    const fail = async () => { throw new Error('private database error'); };
    if (dependency === 'link') f.sources.kosipa.links.activeForConsoleUser = fail;
    if (dependency === 'user') f.sources.kosipa.kosipa.kosipaUser = fail;
    if (dependency === 'grant') f.sources.kosipa.grants.activeCapabilities = fail;
    const access = await resolveConsoleAccess(f.sources, subject);
    assert.equal(access.kosipa, 'role');
    assert.equal(access.kosipaUserId, null);
    assert.equal(access.kosipaWriteUnavailable, true);
    assert.deepEqual([...access.capabilities].filter(c => c.startsWith('kosipa.')).sort(), [...KOSIPA_CAPABILITIES].sort());
    assert.equal(access.capabilities.has('iam.kosipa.grant'), false);
  });
}

test('grant administration needs both IAM and server allowlist and a working grant store, even when unlinked', async () => {
  for (const missing of ['iam', 'allowlist', 'store']) {
    const f = roleWriter();
    if (missing === 'iam') f.sources.permissions.grantedAmong = async () => new Set();
    if (missing === 'allowlist') f.sources.kosipa.grantAdmins = new Set();
    if (missing === 'store') delete f.sources.kosipa.grants;
    const access = await resolveConsoleAccess(f.sources, subject);
    assert.equal(access.capabilities.has('iam.kosipa.grant'), false);
  }
  const f = roleWriter({ links: { async activeForConsoleUser() { return null; } }, grants: { async activeCapabilities() { throw new Error('down'); } } });
  const access = await resolveConsoleAccess(f.sources, subject);
  assert.equal(access.kosipaWriteUnavailable, true, 'even unlinked administrators must fail closed on grant lookup outages');
  assert.equal(access.capabilities.has('iam.kosipa.grant'), false);
});

test('role denial takes precedence over explicit write opt-in, existing grants and admin allowlist', async () => {
  const f = roleWriter();
  f.sources.permissions.kosipaRoleAccess = async () => 'denied';
  const access = await resolveConsoleAccess(f.sources, subject);
  assert.equal(access.kosipa, 'restricted');
  assert.equal(access.kosipaUserId, null);
  assert.equal(access.capabilities.has('iam.kosipa.grant'), false);
  assert.deepEqual(f.calls, []);
});
