import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRoleConfig, parseRoleBundle, renderRoleConfigReport } from '../src/console/role-config.ts';

// Synthetic configuration only (no real role, group or user): it exercises the evaluation rules the console uses at runtime.
const NAV = [
  { id: 'toko-pos', section: 'toko', label: 'POS', href: '/pos', order: 1, anyOf: ['toko.pos.checkout'], readiness: 'available' },
  { id: 'toko-products', section: 'toko', label: 'P', href: '/products', order: 2, anyOf: ['toko.products.view'], readiness: 'available' },
  { id: 'kosipa-members', section: 'kosipa', label: 'M', href: '/console/kosipa/anggota', order: 1, anyOf: ['kosipa.member.view'], readiness: 'available' },
  { id: 'settings-identity', section: 'settings', label: 'I', href: '/console/settings/identitas', order: 1, anyOf: ['iam.link.manage'], readiness: 'available' },
];
const h = (n) => n.toString(16).padStart(12, 'a');
const bundle = () => ({
  version: 1,
  tokoRoles: [
    { roleId: 1, name: 'SYN ADMIN', active: true, slugs: ['users_edit', 'items_view', 'inventory_view', 'sales_add'] },
    { roleId: 3, name: 'SYN SUPERVISOR', active: true, slugs: ['sales_view', 'items_view', 'items_edit', 'users_edit', 'inventory_view', 'legacy_only_slug'] },
    { roleId: 4, name: 'SYN KASIR', active: true, slugs: ['sales_add'] },
    { roleId: 7, name: 'SYN OLD', active: false, slugs: ['sales_add'] },
  ],
  branches: [{ companyId: 1, active: true }, { companyId: 2, active: false }],
  tokoUsers: [{ u: h(1), roleId: 1, companyId: 1, active: true }, { u: h(2), roleId: 3, companyId: 1, active: true }, { u: h(3), roleId: 4, companyId: 2, active: true }, { u: h(4), roleId: 7, companyId: 1, active: true }],
  kosipaGroups: [
    { groupId: 10, name: 'SYN KSP ADMIN', active: true, menus: ['anggota/anggota_c', 'anggota/trans_simpanan_c', 'anggota/trans_pinjaman_c', 'payroll/matrix_c', 'anggota/trans_toko_c'] },
    { groupId: 11, name: 'SYN TABS ONLY', active: true, menus: ['anggota/trans_pinjaman_c', 'laporan/shu_c'] },
    { groupId: 12, name: 'SYN RETIRED', active: false, menus: ['payroll/matrix_c'] },
    { groupId: 13, name: 'SYN DIRECTORY', active: true, menus: ['anggota/anggota_c'] },
  ],
  kosipaUsers: [{ u: h(5), active: true, groups: [{ groupId: 10, membershipActive: true }] }, { u: h(6), active: true, groups: [{ groupId: 13, membershipActive: true }, { groupId: 12, membershipActive: true }] }],
});

test('every real role is evaluated with the runtime rules: capabilities, chooser, landing, menu and the persona it resembles', () => {
  const r = evaluateRoleConfig(bundle(), NAV); const role = (id) => r.roles.find((x) => x.roleId === id);
  assert.deepEqual([role(1).resembles, role(1).canSwitchBranch, role(1).menu], ['Console Administrator', true, ['toko-pos', 'toko-products', 'settings-identity']]);
  assert.deepEqual([role(3).resembles, role(3).capabilities.includes('iam.link.manage'), role(3).ignoredSlugs], ['TOKO Supervisor', false, ['legacy_only_slug']]);
  assert.deepEqual([role(4).resembles, role(4).landing], ['TOKO Cashier', '/pos']);
  const group = (id) => r.groups.find((x) => x.groupId === id);
  assert.equal(group(10).resembles, 'KOSIPA Administrator (all views; export only via the allow-list)'); assert.equal(group(13).resembles, 'member directory only');
  assert.deepEqual(group(11).capabilities, [], 'loan tab without the member directory grants nothing');
});

test('configurations needing attention are reported as findings, with counts only; Warehouse roles are never invented', () => {
  const r = evaluateRoleConfig(bundle(), NAV); const codes = r.findings.map((f) => f.code);
  for (const c of ['INACTIVE_ROLE_HAS_USERS', 'USERS_EDIT_WITHOUT_CHOOSER', 'INVENTORY_VIEW_BRANCH_BOUND', 'USERS_ON_INACTIVE_BRANCH', 'TABS_WITHOUT_DIRECTORY', 'MENUS_FROM_INACTIVE_GROUPS', 'NO_WAREHOUSE_ROLE_MAPPING', 'KOSIPA_MENUS_NOT_IN_CONSOLE']) assert.ok(codes.includes(c), c);
  assert.match(r.findings.find((f) => f.code === 'MENUS_FROM_INACTIVE_GROUPS').message, /^1 active account/);
  const text = renderRoleConfigReport(r);
  assert.match(text, /Warehouse Operator: \*\*no real configuration possible\*\* \(W5\)/); assert.doesNotMatch(text, new RegExp(h(1)), 'no pseudonym is printed');
  assert.match(text, /KOSIPA Operational Staff: \*\*no real configuration\*\*/);
});

test('the bundle intake refuses user-identifying fields and non-pseudonymous ids', () => {
  assert.equal(parseRoleBundle(bundle()).ok, true);
  const withName = bundle(); withName.tokoUsers[0].username = 'someone';
  assert.match(parseRoleBundle(withName).error, /user-identifying/);
  const rawId = bundle(); rawId.tokoUsers[0].u = '42';
  assert.match(parseRoleBundle(rawId).error, /pseudonym/);
  assert.match(parseRoleBundle({ version: 2 }).error, /version-1/);
});
