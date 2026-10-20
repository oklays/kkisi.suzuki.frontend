import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PERSONAS, ENDPOINTS, evaluatePersona, apiMatrix, signIn } from './support/personas.mjs';
import { renderPersonaMatrix } from './support/render-persona-matrix.mjs';

// Staging RBAC / UAT matrix (checkpoint 11): the oracle below is written by hand from the capability rules, independently of the resolver under test.
const P = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));
const KOSIPA_VIEWS = ['kosipa.loan.view', 'kosipa.member.view', 'kosipa.payroll.view', 'kosipa.savings.view', 'kosipa.store-credit.view'];
const EXPECT = {
  'console-admin': { caps: ['iam.link.manage', 'toko.inventory.so', 'toko.inventory.view', 'toko.inventory.warehouse', 'toko.pos.checkout', 'toko.products.create', 'toko.products.edit', 'toko.products.view', 'toko.returns.create', 'toko.returns.view', 'toko.sales.payments', 'toko.sales.view', 'warehouse.preview.view'], kosipa: 'unlinked', landing: '/console',
    nav: ['dashboard', 'toko-pos', 'toko-sales', 'toko-returns', 'toko-products', 'warehouse-inventory', 'warehouse-preview', 'warehouse-distribution', 'warehouse-mapping', 'warehouse-receiving', 'settings-identity'], api: [403, 403, 403, 403, 403, 403] },
  'kosipa-admin': { caps: [...KOSIPA_VIEWS, 'kosipa.report.export', 'toko.products.view', 'toko.sales.view'].sort(), kosipa: 'linked', landing: '/console',
    nav: ['dashboard', 'kosipa-overview', 'kosipa-members', 'kosipa-savings', 'kosipa-loans', 'kosipa-payroll', 'kosipa-reports', 'kosipa-report-members', 'kosipa-report-savings', 'kosipa-report-loans', 'kosipa-report-payroll', 'kosipa-report-quality', 'toko-sales', 'toko-products'], api: [200, 200, 200, 200, 200, 200] },
  'kosipa-staff': { caps: ['kosipa.loan.view', 'kosipa.member.view', 'kosipa.savings.view', 'kosipa.store-credit.view'].filter((c) => c !== 'kosipa.store-credit.view'), kosipa: 'linked', landing: '/console',
    nav: ['dashboard', 'kosipa-overview', 'kosipa-members', 'kosipa-savings', 'kosipa-loans', 'kosipa-reports', 'kosipa-report-members', 'kosipa-report-savings', 'kosipa-report-loans', 'kosipa-report-quality'], api: [200, 403, 200, 200, 403, 403] },
  'toko-cashier': { caps: ['toko.pos.checkout'], kosipa: 'unlinked', landing: '/pos', nav: ['dashboard', 'toko-pos'], api: [403, 403, 403, 403, 403, 403] },
  'toko-supervisor': { caps: ['toko.inventory.so', 'toko.inventory.view', 'toko.pos.checkout', 'toko.products.edit', 'toko.products.view', 'toko.returns.create', 'toko.returns.view', 'toko.sales.payments', 'toko.sales.view'], kosipa: 'unlinked', landing: '/console',
    nav: ['dashboard', 'toko-pos', 'toko-sales', 'toko-returns', 'toko-products', 'warehouse-inventory'], api: [403, 403, 403, 403, 403, 403] },
  'warehouse-operator': { caps: [], kosipa: 'unlinked', landing: '/console', nav: ['dashboard'], api: [403, 403, 403, 403, 403, 403] },
  'warehouse-supervisor': { caps: ['toko.inventory.so', 'toko.inventory.view', 'toko.inventory.warehouse', 'warehouse.preview.view'], kosipa: 'unlinked', landing: '/console',
    nav: ['dashboard', 'warehouse-inventory', 'warehouse-preview', 'warehouse-distribution', 'warehouse-mapping', 'warehouse-receiving'], api: [403, 403, 403, 403, 403, 403] },
  auditor: { caps: [...KOSIPA_VIEWS, 'toko.inventory.view', 'toko.inventory.warehouse', 'toko.products.view', 'toko.returns.view', 'toko.sales.view', 'warehouse.preview.view'].sort(), kosipa: 'linked', landing: '/console',
    nav: ['dashboard', 'kosipa-overview', 'kosipa-members', 'kosipa-savings', 'kosipa-loans', 'kosipa-payroll', 'kosipa-reports', 'kosipa-report-members', 'kosipa-report-savings', 'kosipa-report-loans', 'kosipa-report-payroll', 'kosipa-report-quality', 'toko-sales', 'toko-returns', 'toko-products', 'warehouse-inventory', 'warehouse-preview', 'warehouse-distribution', 'warehouse-mapping', 'warehouse-receiving'], api: [200, 200, 200, 200, 403, 403] },
};
// kosipa-staff's controllers include trans_simpanan + trans_pinjaman + anggota but NOT trans_toko_c, so store-credit is absent (explicit above).

test('menu visibility, capabilities and landing page of every persona match the oracle (Warehouse preview flag ON)', async () => {
  assert.deepEqual(PERSONAS.map((p) => p.id).sort(), Object.keys(EXPECT).sort());
  for (const p of PERSONAS) {
    const r = await evaluatePersona(p); const e = EXPECT[p.id];
    assert.deepEqual(r.capabilities, [...e.caps].sort(), `${p.id} capabilities`); assert.deepEqual(r.nav, e.nav, `${p.id} navigation`); assert.equal(r.landing, e.landing, `${p.id} landing`); assert.equal(r.kosipa, e.kosipa, `${p.id} kosipa state`);
  }
});

test('protected API access per persona: allowed where the capability exists, 403 elsewhere, and a denial never reaches a reader or the audit log', async () => {
  for (const p of PERSONAS) {
    const r = await apiMatrix(p); const e = EXPECT[p.id];
    assert.deepEqual(ENDPOINTS.map((n) => r.statuses[n]), e.api, `${p.id} API statuses`);
    if (e.api.every((s) => s === 403)) { assert.equal(r.touched, 0, `${p.id}: no reader consulted`); assert.equal(r.audit.length, 0, `${p.id}: nothing audited for a denial that precedes the read`); }
  }
});

test('identity-link enforcement: roles and permissions alone never open KOSIPA; a revoked link or a link whose KOSIPA account has no controllers is 403 everywhere', async () => {
  for (const p of [P['console-admin'], P['toko-supervisor'], { ...P['kosipa-admin'], link: null }, { ...P['kosipa-admin'], link: { menus: [] } }]) {
    const r = await apiMatrix(p); assert.deepEqual(ENDPOINTS.map((n) => r.statuses[n]), [403, 403, 403, 403, 403, 403], p.name); assert.equal(r.touched, 0);
  }
});

test('administration of identity links needs users_edit AND the branch chooser: a branch-bound supervisor holding users_edit still cannot manage links', async () => {
  const bound = { ...P['toko-supervisor'], slugs: [...P['toko-supervisor'].slugs, 'users_edit'] };
  assert.equal((await evaluatePersona(bound)).capabilities.includes('iam.link.manage'), false, 'role 3 + users_edit');
  assert.equal((await evaluatePersona({ ...P['kosipa-admin'], slugs: ['users_edit'] })).capabilities.includes('iam.link.manage'), true, 'role 2 + users_edit (the chooser)');
  assert.equal((await evaluatePersona({ ...P['console-admin'], slugs: P['console-admin'].slugs.filter((s) => s !== 'users_edit') })).capabilities.includes('iam.link.manage'), false, 'chooser without users_edit');
});

test('member / identity isolation: only the SESSION user is resolved to a KOSIPA account; client-supplied identities are ignored', async () => {
  const p = P['kosipa-staff'];
  const r = await apiMatrix(p, { extraHeaders: { 'x-console-user-id': '12', 'x-user-id': '12' }, query: '?userId=12&consoleUserId=12&externalUserId=112' });
  assert.deepEqual(ENDPOINTS.map((n) => r.statuses[n]), EXPECT['kosipa-staff'].api); assert.ok(r.linkCalls.length >= 1);
  assert.deepEqual([...new Set(r.linkCalls)], [p.userId], 'every link lookup used the authenticated user id only');
  assert.ok(r.audit.every((a) => a.actorUserId === p.userId), 'audit actor is the session user');
});

test('export permission: a view capability never implies export; only the allow-listed linked persona exports, and the flag removes it for everyone', async () => {
  for (const p of PERSONAS) {
    const on = await evaluatePersona(p); const off = await evaluatePersona(p, { exportEnabled: false });
    assert.equal(on.capabilities.includes('kosipa.report.export'), p.id === 'kosipa-admin', `${p.id} export (policy on)`);
    assert.equal(off.capabilities.includes('kosipa.report.export'), false, `${p.id} export (policy off)`);
  }
  assert.ok(PERSONAS.filter((p) => p.link?.menus.length).length >= 3 && !(await evaluatePersona(P.auditor)).capabilities.includes('kosipa.report.export'), 'the auditor sees every report but cannot export');
});

test('audit failure behaviour (owner decision A4 applied): with the audit store down, ALL six endpoints answer 503 and nothing is read — the payroll list included', async () => {
  const r = await apiMatrix(P['kosipa-admin'], { auditFails: true });
  assert.deepEqual(ENDPOINTS.map((n) => r.statuses[n]), [503, 503, 503, 503, 503, 503]);
  assert.deepEqual(r.touchedBy, { loans: 0, payroll: 0, reports: 0, savings: 0 }, 'audit-before-read everywhere');
  assert.equal(r.audit.length, 0);
});

test('A4 over HTTP: an allowed payroll list writes exactly one kosipa.payroll.list.view record for the session user before the read', async () => {
  const r = await apiMatrix(P['kosipa-admin']);
  const list = r.audit.filter((a) => a.action === 'kosipa.payroll.list.view');
  assert.equal(list.length, 1); assert.equal(list[0].actorUserId, P['kosipa-admin'].userId); assert.equal(list[0].subjectId, 'payroll:list');
  const denied = await apiMatrix(P['kosipa-staff']);
  assert.equal(denied.statuses['payroll list'], 403); assert.equal(denied.audit.filter((a) => a.action === 'kosipa.payroll.list.view').length, 0, 'a denial is not recorded as an access');
});

test('feature-flag behaviour: KOSIPA API flag off is 404 for every persona; Warehouse preview flag off removes the capability and its four menu entries; KOSIPA off removes only KOSIPA', async () => {
  for (const p of PERSONAS) {
    const r = await apiMatrix(p, { enabled: false }); assert.deepEqual(ENDPOINTS.map((n) => r.statuses[n]), [404, 404, 404, 404, 404, 404], p.id); assert.equal(r.touched, 0);
    const noWh = await evaluatePersona(p, { warehousePreview: false });
    assert.equal(noWh.capabilities.includes('warehouse.preview.view'), false, `${p.id} preview capability`); assert.ok(!noWh.nav.some((id) => id.startsWith('warehouse-') && id !== 'warehouse-inventory'), `${p.id} preview menu`);
    const noKosipa = await evaluatePersona(p, { kosipaEnabled: false });
    assert.equal(noKosipa.kosipa, 'disabled'); assert.ok(!noKosipa.capabilities.some((c) => c.startsWith('kosipa.')), `${p.id} kosipa capability`);
    assert.deepEqual(noKosipa.capabilities.filter((c) => c.startsWith('toko.')), (await evaluatePersona(p)).capabilities.filter((c) => c.startsWith('toko.')), `${p.id}: TOKO untouched by the KOSIPA flag`);
  }
});

test('warehouse access isolation: no persona reaches Warehouse screens through KOSIPA or TOKO-branch rights; only the global warehouse master (branch chooser + inventory_view) does, and Operator/Supervisor have no defined mapping', async () => {
  for (const p of PERSONAS) {
    const caps = (await evaluatePersona(p)).capabilities;
    assert.equal(caps.includes('warehouse.preview.view'), caps.includes('toko.inventory.warehouse'), `${p.id}: preview implies the global warehouse capability`);
    if (p.roleId > 2) assert.equal(caps.includes('toko.inventory.warehouse'), false, `${p.id}: a branch-bound role never gets the global warehouse master`);
  }
  assert.match(P['warehouse-operator'].basis, /NO MAPPING DEFINED/); assert.match(P['warehouse-supervisor'].basis, /NO MAPPING DEFINED/);
});

test('company / branch isolation: every persona is bound to its session branch; only the branch chooser (role <= 2) can change it, and a refused attempt changes nothing', async () => {
  const { handleCompany } = await import('../src/infrastructure/auth/handlers/company.ts');
  const { makeRequest } = await import('./helpers/auth-fakes.mjs');
  for (const p of PERSONAS) {
    if (!p.slugs.includes('sales_add')) continue;   // the branch switch itself is gated by sales_add in this build; personas without it never reach the question
    const s = await signIn(p); assert.equal(s.status, 200, p.id);
    const row = () => [...s.world.sessions.rows.values()][0];
    assert.equal(row().companyId, 1);
    const r = await handleCompany(s.world.services, makeRequest('/api/auth/company', { method: 'POST', cookie: s.cookie, token: s.token, body: { companyId: 2 } }));
    if (p.roleId <= 2) { assert.equal(r.status, 200, p.id); assert.equal(row().companyId, 2); } else { assert.equal(r.status, 403, `${p.id}: branch-bound`); assert.equal(row().companyId, 1, `${p.id}: unchanged`); }
  }
});

test('the matrix embedded in the staging document equals what the code produces (no drift)', async () => {
  const doc = readFileSync(new URL('../../../docs/superpowers/specs/unified-console-kosipa-warehouse/staging-rbac-uat-matrix.md', import.meta.url), 'utf8');
  const m = /<!-- persona-matrix:begin -->\n([\s\S]*?)\n<!-- persona-matrix:end -->/.exec(doc);
  assert.ok(m, 'markers present'); assert.equal(m[1].trim(), (await renderPersonaMatrix()).trim());
});
