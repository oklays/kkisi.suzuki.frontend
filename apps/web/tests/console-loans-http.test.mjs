import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import * as loanHandlers from '../src/infrastructure/console/loan-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { makeLoanWorld, loanHdr, inst } from '../../../packages/application/tests/helpers/loan-fakes.mjs';

const { handleLoanList, handleLoanDetail } = loanHandlers;
const MENUS = { member: 'anggota/anggota_c', loan: 'anggota/trans_pinjaman_c', payroll: 'payroll/matrix_c' };

async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
function ports(lw, { menus = [MENUS.member, MENUS.loan], linked = true, audit = [] } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return linked ? { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' } : null; } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), loans: lw.reader,
  } };
}
const world = () => makeLoanWorld({ headers: [loanHdr(1, { name: 'SYNTH A' }), loanHdr(2, { nik: '00200', name: 'SYNTH B', docStatus: 'REJECTED', disbursement: 'OPEN', repayment: 'LUNAS' })], installments: Array.from({ length: 12 }, (_, i) => inst(100 + i, 'PIN000001', i + 1)) });
const get = (path, cookie) => makeRequest(path, { cookie });

test('flag off 404, anonymous 401, no services 503 — before any loan read or audit', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const lw = world(); const p = ports(lw);
  const call = (req, deps = {}) => handleLoanList(w.services, req, { enabled: true, permissions, ports: p.value, ...deps });
  assert.equal((await call(get('/api/kosipa/loans', cookie), { enabled: false })).status, 404);
  assert.equal((await call(get('/api/kosipa/loans', undefined))).status, 401);
  assert.equal((await call(get('/api/kosipa/loans', cookie), { ports: null })).status, 503);
  assert.equal(lw.calls.length, 0); assert.equal(p.audit.length, 0);
});

test('capabilities are resolved server-side: unlinked, ungranted or member-less accounts get 403 with nothing read', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  for (const opts of [{ linked: false }, { menus: [MENUS.member] }, { menus: [MENUS.loan] }, { menus: [MENUS.payroll] }, { menus: [] }]) {
    const lw = world(); const p = ports(lw, opts);
    const r = await handleLoanDetail(w.services, get('/api/kosipa/loans/PIN000001', cookie), 'PIN000001', { enabled: true, permissions, ports: p.value });
    assert.equal(r.status, 403, JSON.stringify(opts)); assert.equal(lw.calls.length, 0); assert.equal(p.audit.length, 0);
  }
});

test('list and detail: 200 with the documented shape, no-store, official balance never present', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const lw = world(); const p = ports(lw); const deps = { enabled: true, permissions, ports: p.value };
  const list = await handleLoanList(w.services, get('/api/kosipa/loans?status=REJECTED&bayar=LUNAS', cookie), deps);
  assert.equal(list.status, 200); assert.equal(list.headers.get('cache-control'), 'no-store');
  const lb = await bodyOf(list); assert.deepEqual(lb.items.map((i) => i.header.docNo), ['PIN000002']); assert.deepEqual(lb.items[0].statusFlags, ['REJECTED_BUT_SETTLED']);
  const detail = await handleLoanDetail(w.services, get('/api/kosipa/loans/PIN000001', cookie), 'PIN000001', deps);
  assert.equal(detail.status, 200); const db = await bodyOf(detail);
  assert.equal(db.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.equal(db.schedule.rows.length, 12); assert.ok(!/outstanding|saldo_resmi/i.test(JSON.stringify(Object.keys(db))));
  assert.deepEqual(p.audit.map((a) => [a.action, a.subjectId]), [['kosipa.loan.list.view', 'loan:list'], ['kosipa.loan.detail.view', 'loan:PIN000001']]);
});

test('malformed input 400 before any query; unknown loan 404; a stored value that cannot be parsed is 502 (never a silent zero); outage 503 with a code only', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const lw = world(); const p = ports(lw); const deps = { enabled: true, permissions, ports: p.value };
  for (const q of ['status=DROP', 'cair=Z', 'bayar=x', 'after=-1', 'after=9;']) assert.equal((await handleLoanList(w.services, get(`/api/kosipa/loans?${q}`, cookie), deps)).status, 400, q);
  assert.equal((await handleLoanDetail(w.services, get('/x', cookie), "x'--", deps)).status, 400);
  assert.equal((await handleLoanDetail(w.services, get('/x?after=%27', cookie), 'PIN000001', deps)).status, 400);
  assert.equal(lw.named('listLoans').length, 0); assert.equal(lw.named('loanHeaders').length, 0);
  assert.equal((await handleLoanDetail(w.services, get('/x', cookie), 'PIN999999', deps)).status, 404);
  const bad = makeLoanWorld({ headers: [loanHdr(1, { planPrincipal: 'oops' })] });
  assert.equal((await handleLoanDetail(w.services, get('/x', cookie), 'PIN000001', { enabled: true, permissions, ports: ports(bad).value })).status, 502);
  lw.failures.add('listLoans'); const out = await handleLoanList(w.services, get('/api/kosipa/loans', cookie), deps);
  assert.equal(out.status, 503); assert.equal(JSON.stringify(await bodyOf(out)), '{"error":"KOSIPA_UNAVAILABLE"}');
  assert.deepEqual(Object.keys(loanHandlers).sort(), ['handleLoanDetail', 'handleLoanList'], 'GET handlers only');
});
