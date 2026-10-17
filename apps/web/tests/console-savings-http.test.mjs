import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import * as savingsHandlers from '../src/infrastructure/console/savings-handlers.ts';
import { makeWorld, makeRequest, bodyOf, cookieOf } from './helpers/auth-fakes.mjs';
import { makeSavingsWorld, mv, hd } from '../../../packages/application/tests/helpers/savings-fakes.mjs';

const { handleMemberSavings } = savingsHandlers;
const MENUS = { member: 'anggota/anggota_c', savings: 'simpanan/kas_anggota_c', loan: 'anggota/trans_pinjaman_c' };
async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
function ports(sw, { menus = [MENUS.member, MENUS.savings], linked = true, audit = [] } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return linked ? { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' } : null; } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), savings: sw.savings, members: sw.members,
  } };
}
const world = () => makeSavingsWorld({ movements: [mv(1, 'S1'), mv(2, 'S2', { debit: '1.00', credit: '0.00' })], headers: [hd('S1'), hd('S2', { header: { docDate: '2026-05-01', status: 'OPEN', kind: 'CASH' } })] });
const get = (path, cookie) => makeRequest(path, { cookie });

test('flag off 404, anonymous 401, no services 503, all before any savings read or audit', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const sw = world(); const p = ports(sw);
  const call = (req, deps = {}) => handleMemberSavings(w.services, req, '9001', { enabled: true, permissions, ports: p.value, ...deps });
  assert.equal((await call(get('/x', cookie), { enabled: false })).status, 404);
  assert.equal((await call(get('/x', undefined))).status, 401);
  assert.equal((await call(get('/x', cookie), { ports: null })).status, 503);
  assert.equal(sw.calls.length, 0); assert.equal(p.audit.length, 0);
});

test('capabilities are resolved server-side: unlinked, savings-only or member-less accounts get 403 with nothing read', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  for (const opts of [{ linked: false }, { menus: [MENUS.member] }, { menus: [MENUS.member, MENUS.loan] }, { menus: [MENUS.savings] }, { menus: [] }]) {
    const sw = world(); const p = ports(sw, opts);
    const r = await handleMemberSavings(w.services, get('/x', cookie), '9001', { enabled: true, permissions, ports: p.value });
    assert.equal(r.status, 403, JSON.stringify(opts)); assert.equal(sw.calls.length, 0); assert.equal(p.audit.length, 0);
  }
});

test('200 with the documented shape, no-store, official balance unavailable; 400 / 404 / 503 codes only', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const sw = world(); const p = ports(sw); const deps = { enabled: true, permissions, ports: p.value };
  const ok = await handleMemberSavings(w.services, get('/x?jenis=SIMPANAN%20WAJIB', cookie), '9001', deps);
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
  const body = await bodyOf(ok); assert.equal(body.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.deepEqual(body.ledger.data.items.map((i) => i.state), ['PENDING', 'POSTED']);
  assert.ok(!/saldo\b/i.test(JSON.stringify(Object.keys(body))), 'no balance field');
  assert.deepEqual(p.audit.map((a) => [a.action, a.subjectId]), [['kosipa.savings.view', 'member:9001']]);
  for (const [id, q] of [['0', ''], ["9;1", ''], ['9001', '?jenis=x%27--'], ['9001', '?after=-1']]) assert.equal((await handleMemberSavings(w.services, get(`/x${q}`, cookie), id, deps)).status, 400, `${id}${q}`);
  assert.equal((await handleMemberSavings(w.services, get('/x', cookie), '4242', deps)).status, 404);
  sw.failures.add('member'); const out = await handleMemberSavings(w.services, get('/x', cookie), '9001', deps);
  assert.equal(out.status, 503); assert.equal(JSON.stringify(await bodyOf(out)), '{"error":"KOSIPA_UNAVAILABLE"}');
  assert.deepEqual(Object.keys(savingsHandlers), ['handleMemberSavings'], 'GET handler only');
});
