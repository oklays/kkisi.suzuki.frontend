import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConsoleAccess } from '../src/console/resolve-capabilities.usecase.ts';

const permissions = { async grantedAmong() { return new Set(['sales_view']); } };
const kosipa = (menus, { linked = true, fail = false } = {}) => ({
  links: { async activeForConsoleUser() { if (fail) throw new Error('console db down'); return linked ? { id: 1, consoleUserId: 7, externalUserId: 9, status: 'active' } : null; } },
  kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
});
const subject = (userId = 7) => ({ userId, roleId: 4, canSwitchBranch: false });
const POLICY = (ids, enabled = true) => ({ enabled, allowedUserIds: new Set(ids) });

test('export is granted only by the explicit deployment policy, only to a linked account that already holds a KOSIPA grant', async () => {
  const menus = ['anggota/anggota_c', 'anggota/trans_pinjaman_c'];
  assert.ok((await resolveConsoleAccess({ permissions, kosipa: { ...kosipa(menus), exportPolicy: POLICY([7]) } }, subject())).capabilities.has('kosipa.report.export'));
  const no = async (src, s = subject()) => assert.ok(!(await resolveConsoleAccess({ permissions, kosipa: src }, s)).capabilities.has('kosipa.report.export'));
  await no({ ...kosipa(menus), exportPolicy: POLICY([8]) });                    // another user on the list
  await no({ ...kosipa(menus), exportPolicy: POLICY([7], false) });             // feature flag off
  await no({ ...kosipa(menus) });                                               // no policy at all
  await no({ ...kosipa(menus, { linked: false }), exportPolicy: POLICY([7]) }); // not linked
  await no({ ...kosipa([]), exportPolicy: POLICY([7]) });                       // linked but no KOSIPA grant: nothing to export
  await no({ ...kosipa(menus, { fail: true }), exportPolicy: POLICY([7]) });    // identity store down: fail closed
  assert.ok((await resolveConsoleAccess({ permissions, kosipa: { ...kosipa(menus), exportPolicy: POLICY([7]) } }, subject())).capabilities.has('toko.sales.view'), 'TOKO capabilities are unaffected');
});

test('the export grant never adds a view grant', async () => {
  const caps = (await resolveConsoleAccess({ permissions, kosipa: { ...kosipa(['anggota/anggota_c']), exportPolicy: POLICY([7]) } }, subject())).capabilities;
  assert.ok(caps.has('kosipa.report.export') && caps.has('kosipa.member.view'));
  for (const view of ['kosipa.loan.view', 'kosipa.payroll.view', 'kosipa.savings.view']) assert.ok(!caps.has(view), view);
});
