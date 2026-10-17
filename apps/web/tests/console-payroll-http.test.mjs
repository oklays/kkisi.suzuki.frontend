import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handlePayrollBatch, handlePayrollList, handlePayrollMember, handlePayrollReconciliation } from '../src/infrastructure/console/payroll-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { makePayrollWorld, hdr, mrow, sale } from '../../../packages/application/tests/helpers/payroll-fakes.mjs';

const T = (n) => `${n}.0000`;
const MENUS = { payroll: 'payroll/matrix_c', member: 'anggota/anggota_c', loan: 'anggota/trans_pinjaman_c', credit: 'anggota/trans_toko_c' };

async function signedIn() {
  const world = makeWorld();
  world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
function payrollWorld() {
  return makePayrollWorld({
    headers: [hdr(5, { docNo: 'POT202608001' })],
    rows: [mrow(101, 'POT202608001', '00100', { TOKO_TAMBUN: T(100000), potongan_toko: T(100000), total_potongan: T(100000), gaji_payroll: '98765432.0000' }), mrow(102, 'POT202608001', '00200', { TOKO_TAMBUN: T(10), potongan_toko: T(10), total_potongan: T(10) })],
    sales: [sale(1, '00100', 1, 100000)], loans: [],
  });
}
function ports(payrollWorld, { menus = Object.values(MENUS), linked = true, audit = [] } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return linked ? { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' } : null } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), payroll: payrollWorld.reader,
  } };
}
const get = (path, cookie) => makeRequest(path, { cookie });

test('flag off -> 404, anonymous -> 401, no services -> 503: all before any payroll read or audit', async () => {
  const { world, cookie, permissions } = await signedIn(); const pw = payrollWorld(); const p = ports(pw);
  const call = (req, deps = {}) => handlePayrollList(world.services, req, { enabled: true, permissions, ports: p.value, ...deps });
  assert.equal((await call(get('/api/kosipa/payroll', cookie), { enabled: false })).status, 404);
  assert.equal((await call(get('/api/kosipa/payroll', undefined))).status, 401);
  assert.equal((await call(get('/api/kosipa/payroll', cookie), { ports: null })).status, 503);
  assert.equal(pw.calls.length, 0); assert.equal(p.audit.length, 0);
});

test('capabilities come from the server-side identity link and KOSIPA menu grants: unlinked or ungranted users get 403 and nothing is read', async () => {
  const { world, cookie, permissions } = await signedIn();
  for (const opts of [{ linked: false }, { menus: [MENUS.member] }, { menus: [] }]) {
    const pw = payrollWorld(); const p = ports(pw, opts);
    const r = await handlePayrollBatch(world.services, get('/api/kosipa/payroll/POT202608001', cookie), 'POT202608001', { enabled: true, permissions, ports: p.value });
    assert.equal(r.status, 403, JSON.stringify(opts)); assert.deepEqual(await bodyOf(r), { error: 'FORBIDDEN' });
    assert.equal(pw.calls.length, 0, 'no database read'); assert.equal(p.audit.length, 0, 'and no audit for a request that was refused up front');
  }
  const pw = payrollWorld(); const p = ports(pw, { menus: [MENUS.payroll, MENUS.member, MENUS.credit] });   // payroll but no store-credit grant? both present here
  const rec = await handlePayrollReconciliation(world.services, get('/api/kosipa/payroll/POT202608001/store-reconciliation', cookie), 'POT202608001', { enabled: true, permissions, ports: p.value });
  assert.equal(rec.status, 200);
  const only = ports(payrollWorld(), { menus: [MENUS.payroll] });   // payroll without the member directory also drops the store-credit grant
  const denied = await handlePayrollReconciliation(world.services, get('/api/kosipa/payroll/POT202608001/store-reconciliation', cookie), 'POT202608001', { enabled: true, permissions, ports: only.value });
  assert.equal(denied.status, 403);
});

test('list, batch, member and reconciliation: 200 with the documented shape; salary is never in any response; responses are uncacheable', async () => {
  const { world, cookie, permissions } = await signedIn(); const pw = payrollWorld(); const p = ports(pw);
  const deps = { enabled: true, permissions, ports: p.value };
  const list = await handlePayrollList(world.services, get('/api/kosipa/payroll?periode=2026-08&status=APPROVED', cookie), deps);
  assert.equal(list.status, 200); assert.equal(list.headers.get('cache-control'), 'no-store');
  const lb = await bodyOf(list); assert.deepEqual(lb.items.map((i) => i.header.docNo), ['POT202608001']);
  const batch = await handlePayrollBatch(world.services, get('/api/kosipa/payroll/POT202608001?q=00100', cookie), 'POT202608001', deps);
  assert.equal(batch.status, 200); const bb = await bodyOf(batch); assert.deepEqual(bb.rows.map((r) => r.nik), ['00100']);
  const member = await handlePayrollMember(world.services, get('/api/kosipa/payroll/POT202608001/anggota/00100', cookie), 'POT202608001', '00100', deps);
  assert.equal(member.status, 200); const mb = await bodyOf(member); assert.equal(mb.rows[0].breakdown.recordedTotal4, 1000000000);
  const rec = await handlePayrollReconciliation(world.services, get('/api/kosipa/payroll/POT202608001/store-reconciliation?all=1', cookie), 'POT202608001', deps);
  assert.equal(rec.status, 200); const rb = await bodyOf(rec); assert.equal(rb.state, 'ok'); assert.equal(rb.data.comparability.reviewOnly, true);
  for (const b of [lb, bb, mb, rb]) assert.ok(!JSON.stringify(b).includes('98765432'), 'gaji_payroll is never exposed');
  assert.deepEqual(p.audit.map((a) => a.action), ['kosipa.payroll.list.view', 'kosipa.payroll.batch.view', 'kosipa.payroll.member.view', 'kosipa.payroll.reconcile'], 'owner decision A4: the list is audited too');
});

test('malformed input is 400 before any query; unknown batch or member is 404; only GET handlers exist', async () => {
  const { world, cookie, permissions } = await signedIn(); const pw = payrollWorld(); const p = ports(pw);
  const deps = { enabled: true, permissions, ports: p.value };
  for (const q of ['periode=2026-13', 'status=DROP', 'grup=x', 'after=-1', "after=1;DROP"]) assert.equal((await handlePayrollList(world.services, get(`/api/kosipa/payroll?${q}`, cookie), deps)).status, 400, q);
  assert.equal((await handlePayrollBatch(world.services, get('/api/kosipa/payroll/x', cookie), "x'--", deps)).status, 400);
  assert.equal((await handlePayrollMember(world.services, get('/x', cookie), 'POT202608001', "00100' OR 1=1", deps)).status, 400);
  assert.equal((await handlePayrollReconciliation(world.services, get('/x', cookie), 'POT202608001', deps)).status, 200);
  assert.equal((await handlePayrollReconciliation(world.services, get('/x?after=%27%3B', cookie), 'POT202608001', deps)).status, 400);
  assert.equal(pw.calls.filter((c) => ['listBatches'].includes(c[0])).length, 0, 'invalid filters never reached the reader');
  assert.equal((await handlePayrollBatch(world.services, get('/x', cookie), 'POT999999', deps)).status, 404);
  assert.equal((await handlePayrollMember(world.services, get('/x', cookie), 'POT202608001', '00999', deps)).status, 404, 'a member who is not in the batch');
  const mod = await import('../src/infrastructure/console/payroll-handlers.ts');
  assert.deepEqual(Object.keys(mod).sort(), ['handlePayrollBatch', 'handlePayrollList', 'handlePayrollMember', 'handlePayrollReconciliation']);
});

test('a database outage is 503 with a code only; no database detail in the body', async () => {
  const { world, cookie, permissions } = await signedIn(); const pw = payrollWorld(); const p = ports(pw);
  pw.failures.add('listBatches');
  const r = await handlePayrollList(world.services, get('/api/kosipa/payroll', cookie), { enabled: true, permissions, ports: p.value });
  assert.equal(r.status, 503); const text = JSON.stringify(await bodyOf(r)); assert.equal(text, '{"error":"KOSIPA_UNAVAILABLE"}');
});
