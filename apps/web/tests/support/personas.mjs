// TEST-ONLY persona fixtures for the staging RBAC/UAT matrix (checkpoint 11). Personas are TESTING roles built from the approved system's own vocabulary
// (legacy permission slugs, branch-chooser rule role <= 2, KOSIPA menu grants through an identity link, the export allow-list, the Warehouse preview flag).
// They are NOT production role assignments and no real user, role id or group of the cooperative appears here. Where the approved system defines no mapping
// (Warehouse Operator / Supervisor), the persona says so instead of inventing one.
import { resolveConsoleAccess } from '@koperasi/application/console/capabilities';
import { visibleNavigation } from '@koperasi/domain/console/navigation';
import { postLoginLanding } from '@koperasi/domain/console/capabilities';
import { deployedNavigation } from '../../src/features/console/navigation.ts';
import { handleLogin } from '../../src/infrastructure/auth/handlers/login.ts';
import { handleLoanList } from '../../src/infrastructure/console/loan-handlers.ts';
import { handlePayrollList } from '../../src/infrastructure/console/payroll-handlers.ts';
import { handleLoanReport, handleLoanReportExport, handlePayrollReportExport } from '../../src/infrastructure/console/report-handlers.ts';
import { handleMemberSavings } from '../../src/infrastructure/console/savings-handlers.ts';
import { makeWorld, makeRequest, cookieOf, bodyOf } from '../helpers/auth-fakes.mjs';
import { makeLoanWorld } from '../../../../packages/application/tests/helpers/loan-fakes.mjs';
import { makePayrollWorld } from '../../../../packages/application/tests/helpers/payroll-fakes.mjs';
import { makeReportWorld } from '../../../../packages/application/tests/helpers/report-fakes.mjs';
import { makeSavingsWorld } from '../../../../packages/application/tests/helpers/savings-fakes.mjs';

export const MENU = { member: 'anggota/anggota_c', savings: 'anggota/trans_simpanan_c', loan: 'anggota/trans_pinjaman_c', payroll: 'payroll/matrix_c', credit: 'anggota/trans_toko_c' };
const ALL_KOSIPA = Object.values(MENU);
const TOKO_ALL = ['sales_add', 'sales_view', 'sales_payment_view', 'sales_return_view', 'sales_return_add', 'items_view', 'items_add', 'items_edit', 'inventory_so', 'inventory_view'];

/** roleId <= 2 is the legacy branch chooser (canSwitchBranch). `slugs` are legacy db_permissions slugs; `menus` are the KOSIPA controllers of the LINKED KOSIPA account's groups. */
export const PERSONAS = [
  { id: 'console-admin', name: 'Console Administrator', userId: 11, roleId: 1, slugs: [...TOKO_ALL, 'users_edit'], link: null, exportAllowed: false, basis: 'users_edit + branch chooser (iam.link.manage) with every TOKO permission; deliberately NOT linked to KOSIPA' },
  { id: 'kosipa-admin', name: 'KOSIPA Administrator', userId: 12, roleId: 2, slugs: ['sales_view', 'items_view'], link: { menus: ALL_KOSIPA }, exportAllowed: true, basis: 'active identity link whose KOSIPA groups open all five controllers; on the export allow-list (E1)' },
  { id: 'kosipa-staff', name: 'KOSIPA Operational Staff', userId: 13, roleId: 5, slugs: [], link: { menus: [MENU.member, MENU.savings, MENU.loan] }, exportAllowed: false, basis: 'active link; member directory, savings and loans controllers only (no payroll); not on the allow-list' },
  { id: 'toko-cashier', name: 'TOKO Cashier', userId: 14, roleId: 4, slugs: ['sales_add'], link: null, exportAllowed: false, basis: 'sales_add only (the cashier-focused landing rule)' },
  { id: 'toko-supervisor', name: 'TOKO Supervisor', userId: 15, roleId: 3, slugs: ['sales_add', 'sales_view', 'sales_payment_view', 'sales_return_view', 'sales_return_add', 'items_view', 'items_edit', 'inventory_so'], link: null, exportAllowed: false, basis: 'branch-bound (role 3, no chooser): sales, payments, returns, product edit, stock opname' },
  { id: 'warehouse-operator', name: 'Warehouse Operator', userId: 16, roleId: 4, slugs: [], link: null, exportAllowed: false, basis: 'NO MAPPING DEFINED: no console permission or role grants warehouse.dispatch.* / toko.receiving.* yet (application-layer permissions only); persona holds no console permission' },
  { id: 'warehouse-supervisor', name: 'Warehouse Supervisor', userId: 17, roleId: 2, slugs: ['inventory_view', 'inventory_so'], link: null, exportAllowed: false, basis: 'NO MAPPING DEFINED for supervision; closest existing capability = global warehouse master (inventory_view + branch chooser), which is what the preview flag builds on' },
  { id: 'auditor', name: 'Read-only Auditor', userId: 18, roleId: 2, slugs: ['sales_view', 'sales_return_view', 'items_view', 'inventory_view'], link: { menus: ALL_KOSIPA }, exportAllowed: false, basis: 'view permissions only (no add/edit/create/payment), linked with all KOSIPA view controllers, not on the allow-list' },
];

export const ENDPOINTS = ['loan list', 'payroll list', 'loan report', 'member savings', 'loan export', 'payroll export'];

const permissionsOf = (persona) => ({ async grantedAmong(roleId, slugs) { return roleId === persona.roleId ? new Set(slugs.filter((s) => persona.slugs.includes(s))) : new Set(); } });
const kosipaPorts = (persona, calls) => ({
  links: { async activeForConsoleUser(id) { calls.push(id); return persona.link ? { id: 1, consoleUserId: id, externalUserId: 100 + id, status: 'active' } : null; } },
  kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: persona.link?.menus.length ? 1 : 0 }; }, async allowedMenuUrls() { return persona.link?.menus ?? []; } },
});

/** Capabilities, visible navigation and landing for a persona, through the real resolver and the real navigation registry. */
export async function evaluatePersona(persona, { warehousePreview = true, exportEnabled = true, kosipaEnabled = true } = {}) {
  const linkCalls = [];
  const access = await resolveConsoleAccess({
    permissions: permissionsOf(persona), features: { warehousePreview },
    kosipa: kosipaEnabled ? { ...kosipaPorts(persona, linkCalls), exportPolicy: { enabled: exportEnabled, allowedUserIds: new Set(persona.exportAllowed ? [persona.userId] : []) } } : null,
  }, { userId: persona.userId, roleId: persona.roleId, canSwitchBranch: persona.roleId <= 2 });
  const nav = visibleNavigation(deployedNavigation(true), access.capabilities).flatMap((g) => g.items.map((i) => i.id));
  return { capabilities: [...access.capabilities].sort(), kosipa: access.kosipa, nav, landing: postLoginLanding({ capabilities: access.capabilities, consoleEnabled: true }), linkCalls };
}

export async function signIn(persona) {
  const world = makeWorld(); world.addUser({ id: persona.userId, roleId: persona.roleId, username: persona.id.replace(/-/g, '_'), companyId: 1 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: persona.id.replace(/-/g, '_'), password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), token: (await bodyOf(r)).csrfToken, status: r.status };
}

/** Status of each protected KOSIPA endpoint for a signed-in persona; `touched` says whether ANY reader was consulted (it must stay false for every denial). */
export async function apiMatrix(persona, { enabled = true, auditFails = false, session = null, extraHeaders = {}, query = '' } = {}) {
  const s = session ?? await signIn(persona);
  const lw = makeLoanWorld(), pw = makePayrollWorld(), rw = makeReportWorld(), sw = makeSavingsWorld();
  const audit = [], linkCalls = [];
  const ports = { ...kosipaPorts(persona, linkCalls), audit: { async append(e) { if (auditFails) throw new Error('audit store down'); audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'),
    loans: lw.reader, payroll: pw.reader, reports: rw.reader, savings: sw.savings, members: sw.members,
    exportPolicy: { enabled: true, allowedUserIds: new Set(persona.exportAllowed ? [persona.userId] : []) } };
  const deps = { enabled, permissions: permissionsOf(persona), ports };
  const get = (path) => makeRequest(path + query, { cookie: s.cookie, headers: extraHeaders });
  const calls = {
    'loan list': () => handleLoanList(s.world.services, get('/api/kosipa/loans'), deps),
    'payroll list': () => handlePayrollList(s.world.services, get('/api/kosipa/payroll'), deps),
    'loan report': () => handleLoanReport(s.world.services, get('/api/kosipa/reports/loans'), deps),
    'member savings': () => handleMemberSavings(s.world.services, get('/api/kosipa/savings/9001'), '9001', deps),
    'loan export': () => handleLoanReportExport(s.world.services, get('/api/kosipa/reports/loans/export'), deps),
    'payroll export': () => handlePayrollReportExport(s.world.services, get('/api/kosipa/reports/payroll/export'), deps),
  };
  const out = {};
  for (const [name, call] of Object.entries(calls)) out[name] = (await call()).status;
  const touchedBy = { loans: lw.calls.length, payroll: pw.calls.length, reports: rw.calls.length, savings: sw.calls.length };
  const touched = touchedBy.loans + touchedBy.payroll + touchedBy.reports + touchedBy.savings;
  return { statuses: out, touched, touchedBy, audit, linkCalls };
}
