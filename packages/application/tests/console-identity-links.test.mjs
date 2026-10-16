import assert from 'node:assert/strict';
import test from 'node:test';
import { linkIdentity, revokeIdentityLink, listIdentityLinks, resolveKosipaCapabilities } from '../src/console/identity-links.ts';
import { resolveConsoleAccess } from '../src/console/resolve-capabilities.usecase.ts';

function world() {
  const links = []; const audit = []; let seq = 0;
  const store = {
    async activeForConsoleUser(id) { return links.find((l) => l.consoleUserId === id && l.status === 'active') ?? null; },
    async activeForKosipaUser(id) { return links.find((l) => l.externalUserId === id && l.status === 'active') ?? null; },
    async find(id) { return links.find((l) => l.id === id) ?? null; },
    async listActive() { return links.filter((l) => l.status === 'active'); },
    async create(l) { const id = ++seq; links.push({ id, ...l, status: 'active', revokedBy: null, revokedAt: null }); return id; },
    async revoke(id, by, at) { const l = links.find((x) => x.id === id && x.status === 'active'); if (!l) return false; Object.assign(l, { status: 'revoked', revokedBy: by, revokedAt: at }); return true; },
  };
  const kosipaUsers = new Map([[9, { id: 9, username: 'ksp', fullName: 'K', active: true, activeGroups: 2 }], [10, { id: 10, username: 'off', fullName: 'O', active: false, activeGroups: 1 }]]);
  const ports = {
    links: store, audit: { async append(e) { audit.push(e); } },
    kosipa: { async kosipaUser(id) { return kosipaUsers.get(id) ?? null; }, async allowedMenuUrls(id) { return id === 9 ? ['anggota/anggota_c', 'simpanan/kas_anggota_c'] : []; } },
    consoleUsers: { async consoleUser(id) { return [1, 2, 3].includes(id) ? { id, active: id !== 3 } : null; } },
    now: () => new Date('2026-10-16T05:00:00Z'),
  };
  return { ports, links, audit, kosipaUsers };
}
const admin = { userId: 1, capabilities: new Set(['iam.link.manage']), requestId: 'req-1' };

test('an administrator links another console user to an active KOSIPA account; the change is audited', async () => {
  const w = world();
  assert.deepEqual(await linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 9 }), { id: 1 });
  assert.equal(w.links[0].linkedBy, 1);
  assert.deepEqual(w.audit.map((a) => [a.action, a.outcome, a.subjectId]), [['identity_link.create', 'success', 'console:2']]);
  assert.deepEqual(w.audit[0].detail, { consoleUserId: 2, kosipaUserId: 9 });
});

test('unauthorised, self, duplicate and inactive links are refused and the refusals are audited', async () => {
  const w = world();
  await assert.rejects(linkIdentity(w.ports, { ...admin, capabilities: new Set() }, { consoleUserId: 2, kosipaUserId: 9 }), { code: 'FORBIDDEN' });
  await assert.rejects(linkIdentity(w.ports, admin, { consoleUserId: 1, kosipaUserId: 9 }), { code: 'SELF_LINK' });
  await assert.rejects(linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 10 }), { code: 'KOSIPA_USER_INACTIVE' });
  await assert.rejects(linkIdentity(w.ports, admin, { consoleUserId: 3, kosipaUserId: 9 }), { code: 'CONSOLE_USER_INACTIVE' });
  await linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 9 });
  await assert.rejects(linkIdentity(w.ports, { ...admin, userId: 3 }, { consoleUserId: 2, kosipaUserId: 9 }), { code: 'CONSOLE_USER_ALREADY_LINKED' });
  assert.equal(w.links.length, 1);
  const denied = w.audit.filter((a) => a.outcome === 'denied').map((a) => a.detail.code);
  assert.deepEqual(denied, ['SELF_LINK', 'KOSIPA_USER_INACTIVE', 'CONSOLE_USER_INACTIVE', 'CONSOLE_USER_ALREADY_LINKED'], 'FORBIDDEN is refused before any lookup or write');
});

test('a failing audit write fails the link operation; a failing refusal-audit does not hide the refusal', async () => {
  const w = world(); w.ports.audit.append = async () => { throw new Error('console db down'); };
  await assert.rejects(linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 9 }), /console db down/);
  await assert.rejects(linkIdentity(w.ports, admin, { consoleUserId: 1, kosipaUserId: 9 }), { code: 'SELF_LINK' });
});

test('revocation: reason required, only once, audited; list requires the capability', async () => {
  const w = world(); await linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 9 });
  await assert.rejects(revokeIdentityLink(w.ports, admin, { linkId: 1, reason: '' }), { code: 'REASON_REQUIRED' });
  await revokeIdentityLink(w.ports, admin, { linkId: 1, reason: 'pindah tugas' });
  await assert.rejects(revokeIdentityLink(w.ports, admin, { linkId: 1, reason: 'lagi' }), { code: 'LINK_NOT_ACTIVE' });
  assert.equal(w.links[0].status, 'revoked');
  assert.deepEqual(await listIdentityLinks(w.ports, admin), []);
  await assert.rejects(listIdentityLinks(w.ports, { capabilities: new Set() }), { code: 'FORBIDDEN' });
  // A revoked pair can be linked again (history kept, only one ACTIVE link per side).
  assert.deepEqual(await linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 9 }), { id: 2 });
});

test('KOSIPA capabilities need an active link to an active KOSIPA account', async () => {
  const w = world();
  assert.deepEqual(await resolveKosipaCapabilities(w.ports, 2), { linked: false, capabilities: new Set() });
  await linkIdentity(w.ports, admin, { consoleUserId: 2, kosipaUserId: 9 });
  assert.deepEqual([...(await resolveKosipaCapabilities(w.ports, 2)).capabilities].sort(), ['kosipa.member.view', 'kosipa.savings.view']);
  w.kosipaUsers.get(9).active = false;
  assert.deepEqual(await resolveKosipaCapabilities(w.ports, 2), { linked: true, capabilities: new Set() }, 'a deactivated KOSIPA account loses access at once');
});

test('console access: TOKO survives a console-store outage; KOSIPA becomes unavailable (fail closed)', async () => {
  const permissions = { async grantedAmong() { return new Set(['sales_add', 'users_edit']); } };
  const down = { links: { async activeForConsoleUser() { throw new Error('down'); } }, kosipa: {} };
  const access = await resolveConsoleAccess({ permissions, kosipa: down }, { userId: 2, roleId: 2, canSwitchBranch: true });
  assert.equal(access.kosipa, 'unavailable');
  assert.deepEqual([...access.capabilities].sort(), ['iam.link.manage', 'toko.pos.checkout']);
  const off = await resolveConsoleAccess({ permissions, kosipa: null }, { userId: 2, roleId: 2, canSwitchBranch: false });
  assert.equal(off.kosipa, 'disabled');
  assert.deepEqual([...off.capabilities], ['toko.pos.checkout']);
  await assert.rejects(resolveConsoleAccess({ permissions: { async grantedAmong() { throw new Error('legacy down'); } }, kosipa: null }, { userId: 2, roleId: 2, canSwitchBranch: true }), /legacy down/, 'the legacy permission store itself still fails closed');
});
