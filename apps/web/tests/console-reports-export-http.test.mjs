import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleLoanReportExport, handlePayrollReportExport, handleDataQualityExport } from '../src/infrastructure/console/report-handlers.ts';
import { WindowThrottle } from '../../../packages/application/src/kosipa/report-export.ts';
import { makeWorld, makeRequest, cookieOf } from './helpers/auth-fakes.mjs';
import { makeReportWorld, bucket, header, aggregate } from '../../../packages/application/tests/helpers/report-fakes.mjs';

const MENUS = { member: 'anggota/anggota_c', loan: 'anggota/trans_pinjaman_c', payroll: 'payroll/matrix_c' };
async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
function ports(rw, { menus = [MENUS.member, MENUS.loan, MENUS.payroll], exportPolicy = { enabled: true, allowedUserIds: new Set([4]) }, audit = [], throttle } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' }; } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), reports: rw.reader, exportPolicy: exportPolicy ?? undefined, exportThrottle: throttle,
  } };
}
const world = () => makeReportWorld({ loanBuckets: [bucket('2026-03', 'APPROVED', 'BELUM LUNAS', 2, '2000000.25')], headers: [header('A')], aggregates: [aggregate('A')] });
const get = (path, cookie, headers = {}) => makeRequest(path, { cookie, headers });

test('flag off 404, anonymous 401, no services 503, cross-site navigation 403: all before any audit or read', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw);
  for (const handler of [handleLoanReportExport, handlePayrollReportExport, handleDataQualityExport]) {
    const call = (req, deps = {}) => handler(w.services, req, { enabled: true, permissions, ports: p.value, ...deps });
    assert.equal((await call(get('/x', cookie), { enabled: false })).status, 404); assert.equal((await call(get('/x', undefined))).status, 401); assert.equal((await call(get('/x', cookie), { ports: null })).status, 503);
    assert.equal((await call(get('/x', cookie, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  }
  assert.equal(rw.calls.length, 0); assert.equal(p.audit.length, 0);
});

test('view without export is 403; export without view is 403; a user outside the allow-list or with the flag off is 403 — nothing audited or read', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const cases = [{ exportPolicy: { enabled: true, allowedUserIds: new Set([99]) } }, { exportPolicy: { enabled: false, allowedUserIds: new Set([4]) } }, { exportPolicy: null }, { menus: [MENUS.member, MENUS.payroll] }, { menus: [MENUS.member] }];
  for (const opts of cases) {
    const rw = world(); const p = ports(rw, opts);
    const r = await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value });
    assert.equal(r.status, 403, JSON.stringify(opts)); assert.equal(rw.calls.length, 0); assert.equal(p.audit.length, 0);
  }
  const rw = world(); const p = ports(rw, { menus: [MENUS.member, MENUS.loan] });   // loan view + export is not payroll export
  assert.equal((await handlePayrollReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value })).status, 403);
});

test('an allowed export is a no-store, nosniff, attachment CSV with exact figures and an opaque audit record', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw); const deps = { enabled: true, permissions, ports: p.value };
  const r = await handleLoanReportExport(w.services, get('/x?tahun=2026', cookie), deps);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8'); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="laporan-pinjaman-2026.csv"');
  const body = await r.text(); assert.equal(String(new TextEncoder().encode(body).length), r.headers.get('content-length')); assert.ok(body.includes('BULAN,2026-03,APPROVED,BELUM LUNAS,2,2000000.25'));
  assert.equal((await (await handlePayrollReportExport(w.services, get('/x', cookie), deps)).text()).includes(',A,ANGGOTA,APPROVED,2,2,1000.00,1000.00,0.00,'), true);
  assert.equal((await handleDataQualityExport(w.services, get('/x', cookie), deps)).status, 200);
  assert.deepEqual(p.audit.map((a) => [a.action, a.subjectId, a.outcome]), [['kosipa.report.export', 'report:loan', 'success'], ['kosipa.report.export', 'report:payroll', 'success'], ['kosipa.report.export', 'report:quality', 'success']]);
  assert.ok(!JSON.stringify(p.audit).includes('2000000'), 'no figure in the audit record');
});

test('invalid year 400, rate limit 429 with Retry-After, too large 413, outage 503 code-only, malformed data 502', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const rw = world(); const p = ports(rw, { throttle: new WindowThrottle(1, 60_000) }); const deps = { enabled: true, permissions, ports: p.value };
  assert.equal((await handleLoanReportExport(w.services, get('/x?tahun=26', cookie), deps)).status, 400);
  assert.equal((await handleLoanReportExport(w.services, get('/x', cookie), deps)).status, 200);
  const limited = await handleLoanReportExport(w.services, get('/x', cookie), deps); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(p.audit.at(-1).outcome, 'denied');
  const big = makeReportWorld({ loanBuckets: Array.from({ length: 600 }, (_, i) => bucket(`2026-${String((i % 12) + 1).padStart(2, '0')}`, `S${i}`, 'LUNAS', 1, '1.00')) });
  assert.equal((await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(big).value })).status, 413);
  const down = world(); down.failures.add('loanYears'); const out = await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(down).value });
  assert.equal(out.status, 503); assert.equal(await out.text(), '{"error":"KOSIPA_UNAVAILABLE"}');
  const bad = makeReportWorld({ loanBuckets: [bucket('2026-01', 'APPROVED', 'LUNAS', 1, 'oops')] });
  assert.equal((await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(bad).value })).status, 502);
});

test('an audit failure means no data is read and no file is produced (503, code only)', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw);
  p.value.audit = { async append() { throw new Error('console db down'); } };
  const r = await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value });
  assert.equal(r.status, 503); assert.equal(await r.text(), '{"error":"KOSIPA_UNAVAILABLE"}'); assert.equal(rw.calls.length, 0);
});
