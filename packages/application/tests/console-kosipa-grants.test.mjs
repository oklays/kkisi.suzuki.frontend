import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsoleError } from '@koperasi/domain/console/identity-link';
import { decideKosipaGrant, listKosipaGrants, requestKosipaGrant, revokeKosipaGrant } from '../src/console/kosipa-grants.ts';
import { resolveConsoleAccess } from '../src/console/resolve-capabilities.usecase.ts';

const admin = (userId) => ({ userId, capabilities: new Set(['iam.link.manage', 'iam.kosipa.grant']), requestId: 'r' });
const A = admin(1), C = admin(3);
const T0 = new Date('2026-10-30T03:00:00Z');

/** In-memory store with the same conditional-update semantics as console_kosipa_grant. */
function world() {
  const grants = []; const audit = []; const clock = { now: T0 };
  const links = new Map([[2, { consoleUserId: 2 }], [1, { consoleUserId: 1 }], [3, { consoleUserId: 3 }]]);
  // Current role of each console user (1: super admin, 3: admin, 2 and 4: branch staff) and each role's permissions.
  const roles = new Map([[1, 1], [2, 3], [3, 2], [4, 3]]);
  const roleSlugs = new Map([[1, new Set(['users_edit'])], [2, new Set(['users_edit'])], [3, new Set(['users_edit'])]]);
  const store = {
    async activeCapabilities(u) { return grants.filter((g) => g.consoleUserId === u && g.status === 'active').map((g) => g.capability); },
    async find(id) { return grants.find((g) => g.id === id) ?? null; },
    async openFor(u, c, now) {
      for (const g of grants) if (g.status === 'pending' && g.expiresAt <= now) g.status = 'expired';
      return grants.find((g) => g.consoleUserId === u && g.capability === c && ['pending', 'active'].includes(g.status)) ?? null;
    },
    async listOpen() { return grants.filter((g) => ['pending', 'active'].includes(g.status)); },
    async request(r) {
      if (r.requestedBy === r.consoleUserId) throw new ConsoleError('SELF_GRANT');
      if (grants.some((g) => g.consoleUserId === r.consoleUserId && g.capability === r.capability && ['pending', 'active'].includes(g.status))) throw new ConsoleError('ALREADY_GRANTED');
      grants.push({ id: grants.length + 1, status: 'pending', ...r, decidedBy: null }); return grants.length;
    },
    async decide(id, to, by, at) {
      const g = grants.find((x) => x.id === id && x.status === 'pending' && x.consoleUserId !== by && (to === 'rejected' || (x.expiresAt > at && x.requestedBy !== by)));
      if (!g) return false; g.status = to; g.decidedBy = by; return true;
    },
    async revoke(id) { const g = grants.find((x) => x.id === id && x.status === 'active'); if (!g) return false; g.status = 'revoked'; return true; },
  };
  const ports = {
    grants: store, links: { async activeForConsoleUser(u) { return links.get(u) ?? null; } },
    consoleUsers: { async consoleUser(id) { return [1, 2, 3, 4].includes(id) ? { id, active: id !== 4, roleId: roles.get(id) } : null; } },
    audit: { async append(e) { audit.push(e); } }, now: () => clock.now, grantAdmins: new Set([1, 3]),
    // Current legacy role permissions (db_roles_permission), read at approval time.
    permissions: { async grantedAmong(roleId, slugs) { return new Set(slugs.filter((s) => roleSlugs.get(roleId)?.has(s))); } },
  };
  return { ports, grants, audit, links, clock, roles, roleSlugs };
}
const ask = (w, actor = A, input = {}) => requestKosipaGrant(w.ports, actor, { consoleUserId: 2, capability: 'kosipa.master.manage', reason: 'admin master data', ...input });

test('request: administrators only; grantable capability; reason; another active, linked user; nothing is granted yet', async () => {
  const w = world();
  await assert.rejects(ask(w, { ...A, capabilities: new Set(['iam.link.manage']) }), { code: 'FORBIDDEN' }, 'iam.link.manage alone is not enough');
  await assert.rejects(ask(w, A, { capability: 'kosipa.loan.disburse' }), { code: 'CAPABILITY_NOT_GRANTABLE' });
  await assert.rejects(ask(w, A, { reason: 'x' }), { code: 'REASON_REQUIRED' });
  await assert.rejects(ask(w, A, { consoleUserId: 1 }), { code: 'SELF_GRANT' });
  await assert.rejects(ask(w, A, { consoleUserId: 4 }), { code: 'CONSOLE_USER_INACTIVE' });
  await assert.rejects(ask(w, A, { consoleUserId: 9 }), { code: 'CONSOLE_USER_NOT_FOUND' });
  w.links.delete(2);
  await assert.rejects(ask(w), { code: 'NOT_LINKED' });
  w.links.set(2, { consoleUserId: 2 });
  assert.deepEqual(await ask(w), { id: 1, status: 'pending' });
  assert.deepEqual(await w.ports.grants.activeCapabilities(2), [], 'a pending request grants nothing');
  await assert.rejects(ask(w, C), { code: 'ALREADY_GRANTED' }, 'one open request per user + capability');
});

test('approval needs a second administrator; duplicate, self and beneficiary approvals are refused; all audited', async () => {
  const w = world();
  await ask(w);
  await assert.rejects(decideKosipaGrant(w.ports, A, { grantId: 1, decision: 'approve' }), { code: 'SELF_APPROVAL' });
  await assert.rejects(decideKosipaGrant(w.ports, { ...admin(2) }, { grantId: 1, decision: 'approve' }), { code: 'SELF_GRANT' });
  await assert.rejects(decideKosipaGrant(w.ports, { ...C, capabilities: new Set(['iam.link.manage']) }, { grantId: 1, decision: 'approve' }), { code: 'FORBIDDEN' });
  assert.deepEqual(await decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { id: 1, status: 'active' });
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { code: 'GRANT_NOT_PENDING' }, 'duplicate approval');
  assert.deepEqual(await w.ports.grants.activeCapabilities(2), ['kosipa.master.manage']);
  await revokeKosipaGrant(w.ports, A, { grantId: 1, reason: 'pindah tugas' });
  await assert.rejects(revokeKosipaGrant(w.ports, A, { grantId: 1, reason: 'pindah tugas' }), { code: 'GRANT_NOT_ACTIVE' });
  assert.deepEqual(w.audit.map((e) => `${e.action}:${e.outcome}`), ['kosipa.grant.request:success', 'kosipa.grant.denied:denied', 'kosipa.grant.denied:denied', 'kosipa.grant.denied:denied', 'kosipa.grant.approve:success', 'kosipa.grant.denied:denied', 'kosipa.grant.revoke:success', 'kosipa.grant.denied:denied']);
  assert.ok(w.audit.every((e) => !JSON.stringify(e.detail ?? {}).match(/admin master|pindah/)), 'reasons stay in the grant row');
});

test('stale approvals are refused: expired request, requester no longer an administrator, link revoked; rejection still works', async () => {
  const w = world();
  await ask(w);
  w.clock.now = new Date(T0.getTime() + 24 * 3600_000);
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { code: 'GRANT_REQUEST_EXPIRED' });
  assert.deepEqual(await ask(w, A), { id: 2, status: 'pending' }, 'an expired request no longer blocks a new one');
  w.ports.grantAdmins = new Set([3]);
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 2, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' });
  w.ports.grantAdmins = new Set([1, 3]); w.links.delete(2);
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 2, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' });
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 2, decision: 'reject', note: '' }), { code: 'REASON_REQUIRED' });
  assert.deepEqual(await decideKosipaGrant(w.ports, A, { grantId: 2, decision: 'reject', note: 'dibatalkan pengaju' }), { id: 2, status: 'rejected' });
  assert.equal((await listKosipaGrants(w.ports, C)).length, 0);
});

test('authorization changes after the request invalidate it: requester demoted, role permission removed, role unknown; rejection still works', async () => {
  const w = world();
  await ask(w);
  // The requester (user 1) is moved to a branch role (role 3 > 2: no branch chooser, so no iam.link.manage) while the request is pending.
  w.roles.set(1, 3);
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' }, 'demoted requester');
  w.roles.set(1, 1);
  // users_edit is withdrawn from the requester's role.
  w.roleSlugs.set(1, new Set());
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' }, 'role lost users_edit');
  w.roleSlugs.set(1, new Set(['users_edit']));
  // The directory cannot tell the role: fail closed.
  w.roles.delete(1);
  await assert.rejects(decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' }, 'unknown role');
  w.roles.set(1, 1);
  assert.deepEqual(await w.ports.grants.activeCapabilities(2), [], 'none of the refused approvals granted anything');
  assert.deepEqual(await decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), { id: 1, status: 'active' }, 'restored authority -> approvable again');
  // In another pending request whose requester was demoted, rejection still works (refusing access is always allowed).
  const v = world();
  await ask(v);
  v.roles.set(1, 3);
  await assert.rejects(decideKosipaGrant(v.ports, C, { grantId: 1, decision: 'approve' }), { code: 'GRANT_REQUEST_STALE' });
  assert.deepEqual(await decideKosipaGrant(v.ports, C, { grantId: 1, decision: 'reject', note: 'pengaju tidak berwenang lagi' }), { id: 1, status: 'rejected' });
  const denied = w.audit.filter((e) => e.action === 'kosipa.grant.denied').map((e) => e.detail?.code);
  assert.deepEqual(denied, ['GRANT_REQUEST_STALE', 'GRANT_REQUEST_STALE', 'GRANT_REQUEST_STALE'], 'every refused approval is audited');
});

test('two administrators approving the same request at once: exactly one succeeds', async () => {
  const w = world();
  await ask(w);
  w.ports.grantAdmins = new Set([1, 3, 5]);
  const results = await Promise.allSettled([decideKosipaGrant(w.ports, C, { grantId: 1, decision: 'approve' }), decideKosipaGrant(w.ports, admin(5), { grantId: 1, decision: 'approve' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'GRANT_NOT_PENDING');
});

const permissions = (slugs) => ({ async grantedAmong(_r, list) { return new Set(list.filter((s) => slugs.includes(s))); } });
const kosipaFor = (grants, { urls = ['master/anggota_c'], linked = true } = {}) => ({
  links: { async activeForConsoleUser() { return linked ? { externalUserId: 9 } : null; } },
  kosipa: { async kosipaUser(id) { return { id, active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return urls; } },
  grants,
});

test('console access: a link (even to every legacy menu) gives zero write capabilities; an active grant adds exactly one', async () => {
  const none = { async activeCapabilities() { return []; } };
  const linkOnly = await resolveConsoleAccess({ permissions: permissions([]), kosipa: kosipaFor(none, { urls: ['master/anggota_c', 'master/lokasi_c', 'pinjaman/pinjaman_c', 'payroll/matrix_c'] }) }, { userId: 2, roleId: 4, canSwitchBranch: false });
  assert.ok(![...linkOnly.capabilities].some((c) => /\.(manage|create|update|status|approve|disburse|prepare|reverse|settle|decide)$/.test(c)), [...linkOnly.capabilities].join());
  assert.equal(linkOnly.kosipaUserId, 9);
  const granted = { async activeCapabilities() { return ['kosipa.master.manage', 'kosipa.loan.disburse', 'made.up']; } };
  const withGrant = await resolveConsoleAccess({ permissions: permissions([]), kosipa: kosipaFor(granted) }, { userId: 2, roleId: 4, canSwitchBranch: false });
  assert.ok(withGrant.capabilities.has('kosipa.master.manage'));
  assert.ok(!withGrant.capabilities.has('kosipa.loan.disburse'), 'a stored grant without its view capability is inert');
  const unlinked = await resolveConsoleAccess({ permissions: permissions([]), kosipa: kosipaFor(granted, { linked: false }) }, { userId: 2, roleId: 4, canSwitchBranch: false });
  assert.ok(!unlinked.capabilities.has('kosipa.master.manage'), 'revoking the identity link removes the write capability on the next request');
});

test('console access: grant store failure fails closed for ALL KOSIPA capabilities; grant administration needs the allow-list', async () => {
  const down = { async activeCapabilities() { throw new Error('down'); } };
  const access = await resolveConsoleAccess({ permissions: permissions(['users_edit']), kosipa: kosipaFor(down) }, { userId: 2, roleId: 1, canSwitchBranch: true });
  assert.equal(access.kosipa, 'unavailable'); assert.equal(access.kosipaUserId, null);
  assert.ok(![...access.capabilities].some((c) => c.startsWith('kosipa.')));
  const none = { async activeCapabilities() { return []; } };
  const notListed = await resolveConsoleAccess({ permissions: permissions(['users_edit']), kosipa: { ...kosipaFor(none), grantAdmins: new Set([5]) } }, { userId: 2, roleId: 1, canSwitchBranch: true });
  assert.ok(notListed.capabilities.has('iam.link.manage') && !notListed.capabilities.has('iam.kosipa.grant'));
  const listed = await resolveConsoleAccess({ permissions: permissions(['users_edit']), kosipa: { ...kosipaFor(none), grantAdmins: new Set([2]) } }, { userId: 2, roleId: 1, canSwitchBranch: true });
  assert.ok(listed.capabilities.has('iam.kosipa.grant'));
  const branchStaff = await resolveConsoleAccess({ permissions: permissions(['users_edit']), kosipa: { ...kosipaFor(none), grantAdmins: new Set([2]) } }, { userId: 2, roleId: 4, canSwitchBranch: false });
  assert.ok(!branchStaff.capabilities.has('iam.kosipa.grant'), 'allow-listed id without iam.link.manage gets nothing');
});
