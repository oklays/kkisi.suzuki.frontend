import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import * as reportHandlers from '../src/infrastructure/console/report-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { makeReportWorld, bucket, header, aggregate } from '../../../packages/application/tests/helpers/report-fakes.mjs';

const { handleLoanReport, handlePayrollReport, handleDataQuality } = reportHandlers;
const MENUS = { member: 'anggota/anggota_c', loan: 'anggota/trans_pinjaman_c', payroll: 'payroll/matrix_c', savings: 'simpanan/kas_anggota_c' };
async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
function ports(rw, { menus = [MENUS.member, MENUS.loan, MENUS.payroll], linked = true, audit = [] } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return linked ? { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' } : null; } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), reports: rw.reader,
  } };
}
const world = () => makeReportWorld({ loanBuckets: [bucket('2026-03', 'APPROVED', 'BELUM LUNAS', 2, '2000000.00')], headers: [header('A')], aggregates: [aggregate('A')] });
const get = (path, cookie) => makeRequest(path, { cookie });

test('flag off 404, anonymous 401, no services 503, all before any report read or audit', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw);
  for (const handler of [handleLoanReport, handlePayrollReport, handleDataQuality]) {
    const call = (req, deps = {}) => handler(w.services, req, { enabled: true, permissions, ports: p.value, ...deps });
    assert.equal((await call(get('/x', cookie), { enabled: false })).status, 404); assert.equal((await call(get('/x', undefined))).status, 401); assert.equal((await call(get('/x', cookie), { ports: null })).status, 503);
  }
  assert.equal(rw.calls.length, 0); assert.equal(p.audit.length, 0);
});

test('each report is gated by its own server-side grant; unlinked or ungranted accounts get 403 and nothing is read', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const cases = [[handleLoanReport, { menus: [MENUS.member, MENUS.payroll] }], [handlePayrollReport, { menus: [MENUS.member, MENUS.loan] }], [handleDataQuality, { menus: [MENUS.member, MENUS.savings] }], [handleLoanReport, { linked: false }], [handleDataQuality, { menus: [] }]];
  for (const [handler, opts] of cases) {
    const rw = world(); const p = ports(rw, opts);
    const r = await handler(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value });
    assert.equal(r.status, 403, JSON.stringify(opts)); assert.equal(rw.calls.length, 0); assert.equal(p.audit.length, 0);
  }
});

test('200 with the documented shapes; official balance unavailable; data quality is split by grant; audit subjects are opaque', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw); const deps = { enabled: true, permissions, ports: p.value };
  const loans = await bodyOf(await handleLoanReport(w.services, get('/x?tahun=2026', cookie), deps)); assert.equal(loans.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.equal(loans.report.months[0].bucket, '2026-03');
  const payroll = await bodyOf(await handlePayrollReport(w.services, get('/x', cookie), deps)); assert.equal(payroll.periods[0].period, '2026-08');
  const dq = await handleDataQuality(w.services, get('/x', cookie), deps); assert.equal(dq.status, 200); assert.equal(dq.headers.get('cache-control'), 'no-store');
  const body = await bodyOf(dq); assert.equal(body.branchMapping.state, 'UNVERIFIED'); assert.notEqual(body.loans, 'restricted'); assert.notEqual(body.payroll, 'restricted');
  const loanOnly = ports(world(), { menus: [MENUS.member, MENUS.loan] }); const lo = await bodyOf(await handleDataQuality(w.services, get('/x', cookie), { enabled: true, permissions, ports: loanOnly.value })); assert.equal(lo.payroll, 'restricted');
  assert.deepEqual(p.audit.map((a) => [a.action, a.subjectId]), [['kosipa.report.loan.view', 'report:loan'], ['kosipa.report.payroll.view', 'report:payroll'], ['kosipa.report.quality.view', 'report:quality']]);
});

test('invalid year 400 before any read; database outage 503 with a code only; malformed stored data 502; GET handlers only', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw); const deps = { enabled: true, permissions, ports: p.value };
  for (const q of ['tahun=26', "tahun=2026'--", 'tahun=3000']) assert.equal((await handleLoanReport(w.services, get(`/x?${q}`, cookie), deps)).status, 400, q);
  assert.equal((await handlePayrollReport(w.services, get('/x?tahun=abcd', cookie), deps)).status, 400); assert.equal(rw.named('loanBuckets').length, 0);
  rw.failures.add('loanYears'); const out = await handleLoanReport(w.services, get('/x', cookie), deps); assert.equal(out.status, 503); assert.equal(JSON.stringify(await bodyOf(out)), '{"error":"KOSIPA_UNAVAILABLE"}');
  const bad = makeReportWorld({ loanBuckets: [bucket('2026-01', 'APPROVED', 'LUNAS', 1, 'oops')] });
  assert.equal((await handleLoanReport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(bad).value })).status, 502);
  assert.deepEqual(Object.keys(reportHandlers).sort(), ['handleDataQuality', 'handleDataQualityExport', 'handleLoanReport', 'handleLoanReportExport', 'handleMembershipReport', 'handleMembershipReportExport', 'handlePayrollReport', 'handlePayrollReportExport', 'handleSavingsMovementExport', 'handleSavingsMovementReport']);
});
