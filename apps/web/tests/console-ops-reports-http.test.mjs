import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleMembershipReport, handleSavingsMovementReport, handleMembershipReportExport, handleSavingsMovementExport } from '../src/infrastructure/console/report-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { makeReportWorld } from '../../../packages/application/tests/helpers/report-fakes.mjs';

const MENUS = { member: 'anggota/anggota_c', savings: 'simpanan/kas_anggota_c', loan: 'anggota/trans_pinjaman_c' };
async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
const calls = [];
const ops = {
  async membershipCounts() { calls.push('counts'); return [{ status: 'AKTIVE', employment: 'TETAP', members: 2, withExitDate: 0, exitDateBeforeToday: 0, withoutNik: 0 }]; },
  async membershipGroups() { calls.push('groups'); return [{ group: 'ANGGOTA', members: 2 }]; },
  async savingsDocAggregates() { calls.push('aggs'); return [{ docNo: 'A', type: 'WAJIB', rows: 1, credit: '10.50', debit: '0.00', interest: '0.00' }]; },
  async savingsHeaders() { calls.push('hdrs'); return [{ docNo: 'A', docDate: '2026-05-01', status: 'APPROVED' }]; },
};
function ports({ menus = [MENUS.member, MENUS.savings], exportAllowed = true, audit = [] } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' }; } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), reports: makeReportWorld().reader, opsReports: ops,
    exportPolicy: exportAllowed ? { enabled: true, allowedUserIds: new Set([4]) } : undefined,
  } };
}
const get = (cookie) => makeRequest('/x', { cookie });

test('view endpoints need their own grant; exports need export AND view; nothing is read for a refused request', async () => {
  const { world: w, cookie, permissions } = await signedIn(); calls.length = 0;
  const only = (menus, exportAllowed) => ports({ menus, exportAllowed }).value;
  const d = (v) => ({ enabled: true, permissions, ports: v });
  assert.equal((await handleMembershipReport(w.services, get(cookie), d(only([MENUS.savings], true)))).status, 403);
  assert.equal((await handleSavingsMovementReport(w.services, get(cookie), d(only([MENUS.member], true)))).status, 403);
  assert.equal((await handleMembershipReportExport(w.services, get(cookie), d(only([MENUS.member], false)))).status, 403, 'view without export');
  assert.equal((await handleSavingsMovementExport(w.services, get(cookie), d(only([MENUS.member], true)))).status, 403, 'export without the savings view grant');
  assert.equal(calls.length, 0);
});

test('membership and savings movement: JSON views and CSV exports with the documented shapes and audit', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const p = ports(); const deps = { enabled: true, permissions, ports: p.value };
  const m = await bodyOf(await handleMembershipReport(w.services, get(cookie), deps)); assert.deepEqual([m.state, m.data.total], ['ok', 2]);
  const s = await bodyOf(await handleSavingsMovementReport(w.services, makeRequest('/x?tahun=2026', { cookie }), deps)); assert.deepEqual([s.state, s.data.lines[0].bucket, s.data.lines[0].posted4.credit], ['ok', '2026-05', 105000]);
  const mc = await handleMembershipReportExport(w.services, get(cookie), deps); assert.equal(mc.status, 200); assert.equal(mc.headers.get('content-disposition'), 'attachment; filename="ringkasan-keanggotaan.csv"'); assert.ok((await mc.text()).includes('STATUS,AKTIVE,TETAP,YA,2,0,0,0'));
  const sc = await handleSavingsMovementExport(w.services, makeRequest('/x?tahun=2026', { cookie }), deps); assert.equal(sc.headers.get('content-disposition'), 'attachment; filename="ringkasan-mutasi-simpanan-2026.csv"'); assert.ok((await sc.text()).includes('BULAN,2026-05,WAJIB,1,10.50,0.00,0.00,0.00,0.00,0'));
  assert.deepEqual(p.audit.map((a) => [a.action, a.subjectId]), [['kosipa.report.membership.view', 'report:membership'], ['kosipa.report.savings.view', 'report:savings'], ['kosipa.report.export', 'report:membership'], ['kosipa.report.export', 'report:savings']]);
  assert.equal((await handleSavingsMovementReport(w.services, makeRequest('/x?tahun=26', { cookie }), deps)).status, 400);
  assert.equal((await handleSavingsMovementExport(w.services, makeRequest('/x?tahun=26', { cookie }), deps)).status, 400);
});

test('an unavailable source is explicit in the view and an error (not a file) in the export', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const p = ports();
  p.value.opsReports = { ...ops, async membershipCounts() { throw new Error('timeout'); } };
  const deps = { enabled: true, permissions, ports: p.value };
  assert.deepEqual(await bodyOf(await handleMembershipReport(w.services, get(cookie), deps)), { state: 'unavailable', reason: 'READ_FAILED' });
  const r = await handleMembershipReportExport(w.services, get(cookie), deps); assert.equal(r.status, 503); assert.equal(r.headers.get('content-type')?.startsWith('application/json'), true);
});
