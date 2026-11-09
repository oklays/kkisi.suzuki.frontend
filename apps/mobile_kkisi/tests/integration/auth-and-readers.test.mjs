// Integration tests against the isolated synthetic stack (integration/stack.mjs). Run: pnpm --filter @koperasi/mobile-kkisi test:integration
// Nothing here can reach a real database: the DSNs come only from apps/mobile_kkisi/.local/stack.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'mysql2/promise';
import { loadConfig } from '../../integration/stack.mjs';
import { MEMBERS, TEST_PASSWORD, seed } from '../../integration/seed.mjs';
import { authDeps, readerDb } from '../../src/server/container.ts';
import { login, verifyPin, resolveMember, logout, pendingPinSession } from '../../src/server/auth/auth-service.ts';
import { MysqlSavingsReader, readProfile, readLoans, readScheduleAggregate, readScheduleRows, readPayrollRows, readPayrollHeaders, readShu, readLoanProducts, readActiveDeductions, readLoanApplications } from '../../src/server/kosipa/member.reader.ts';
import { readCatalog, readCatalogCategories, readCatalogItems, readCreditUsage, readSales, readOrders } from '../../src/server/kosipa/store.reader.ts';
import { readFavorites, readFaqs, readNotices } from '../../src/server/kosipa/content.reader.ts';
import { buildSavingsSummary } from '../../src/features/savings/services/savings.ts';
import { buildActiveLoan, isActiveLoan } from '../../src/features/loans/services/loans.ts';
import { buildStoreCredit } from '../../src/features/store-credit/services/store-credit.ts';
import { buildShuYears } from '../../src/features/shu/services/shu.ts';
import { businessMonth } from '../../src/lib/utils/dates.ts';

const cfg = loadConfig();
const A = MEMBERS.a, B = MEMBERS.b;
let deps, db, root;

before(async () => {
  assert.ok(cfg, 'synthetic stack not running: pnpm --filter @koperasi/mobile-kkisi stack:up');
  await seed(null, cfg.rootPassword, cfg.port, 'kkisi_mobile_legacy');
  deps = { ...authDeps(), log: () => {} };
  db = readerDb();
  root = await createConnection({ host: '127.0.0.1', port: cfg.port, user: 'root', password: cfg.rootPassword, database: 'kkisi_mobile_legacy' });
});
after(async () => { await root?.end(); await deps?.verifier.close(); for (const p of globalThis.__kkisiMobilePools?.values() ?? []) await p.end().catch(() => {}); });

const fullLogin = async (identity, pin) => {
  const r = await login(deps, { identity, password: TEST_PASSWORD }, null);
  assert.equal(r.ok, true, JSON.stringify(r));
  const p = await verifyPin(deps, r.sid, pin);
  assert.equal(p.ok, true, JSON.stringify(p));
  return p.sid;
};

test('login by NIK, email and phone opens a PIN-stage session only', async () => {
  for (const identity of [A.nik, `0${A.nik}`, A.email.toUpperCase(), A.phone, `+62${A.phone.slice(1)}`]) {
    const r = await login(deps, { identity, password: TEST_PASSWORD }, null);
    assert.equal(r.ok, true, identity);
    assert.equal(await resolveMember(deps, r.sid), null, 'a PIN-stage session must not authenticate');
    assert.ok(await pendingPinSession(deps, r.sid));
  }
});

test('wrong password, unknown identity and shared phone give the same generic error', async () => {
  assert.deepEqual(await login(deps, { identity: A.nik, password: 'salah' }, null), { ok: false, code: 'INVALID_CREDENTIALS' });
  assert.deepEqual(await login(deps, { identity: '99999', password: TEST_PASSWORD }, null), { ok: false, code: 'INVALID_CREDENTIALS' });
  assert.deepEqual(await login(deps, { identity: MEMBERS.sharedPhone, password: TEST_PASSWORD }, null), { ok: false, code: 'INVALID_CREDENTIALS' });
});

test('inactive, deleted and non-member accounts are refused after a correct password', async () => {
  assert.deepEqual(await login(deps, { identity: MEMBERS.inactive.nik, password: TEST_PASSWORD }, null), { ok: false, code: 'ACCOUNT_INACTIVE' });
  assert.deepEqual(await login(deps, { identity: MEMBERS.deleted.nik, password: TEST_PASSWORD }, null), { ok: false, code: 'ACCOUNT_INACTIVE' });
  assert.deepEqual(await login(deps, { identity: MEMBERS.noMember.email, password: TEST_PASSWORD }, null), { ok: false, code: 'NOT_A_MEMBER' });
});

test('identity throttle locks after repeated failures and reports Retry-After', async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await login(deps, { identity: B.email, password: `salah-${i}` }, null);
  assert.equal(last.code, 'THROTTLED');
  assert.ok(last.retryAfterSec > 0);
  const blocked = await login(deps, { identity: B.email, password: TEST_PASSWORD }, null);
  assert.equal(blocked.code, 'THROTTLED', 'a correct password must not bypass an active lock');
  await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
});

test('PIN: wrong attempts count down, the fifth revokes the session', async () => {
  const r = await login(deps, { identity: A.nik, password: TEST_PASSWORD }, null);
  for (let i = 4; i >= 1; i--) assert.deepEqual(await verifyPin(deps, r.sid, '0000'), { ok: false, code: 'PIN_INVALID', remaining: i });
  assert.deepEqual(await verifyPin(deps, r.sid, '0000'), { ok: false, code: 'PIN_LOCKED' });
  assert.deepEqual(await verifyPin(deps, r.sid, A.pin), { ok: false, code: 'SESSION_EXPIRED' }, 'the right PIN cannot revive a locked session');
  assert.deepEqual(await verifyPin(deps, r.sid, '12ab'), { ok: false, code: 'SESSION_EXPIRED' });
});

test('correct PIN rotates the session id; the pre-PIN id is dead; logout revokes', async () => {
  const r = await login(deps, { identity: A.nik, password: TEST_PASSWORD }, null);
  const p = await verifyPin(deps, r.sid, A.pin);
  assert.equal(p.ok, true);
  assert.notEqual(p.sid, r.sid);
  assert.equal(await resolveMember(deps, r.sid), null);
  const m = await resolveMember(deps, p.sid);
  assert.equal(m.memberId, A.memberId);
  assert.deepEqual(m.nikKeys, [A.nik]);
  await logout(deps, p.sid);
  assert.equal(await resolveMember(deps, p.sid), null);
});

test('deactivating the account ends an authenticated session on the next request', async () => {
  const sid = await fullLogin(A.nik, A.pin);
  assert.ok(await resolveMember(deps, sid));
  await root.query('UPDATE users SET is_active = 0 WHERE id = ?', [A.userId]);
  try { assert.equal(await resolveMember(deps, sid), null); }
  finally { await root.query('UPDATE users SET is_active = 1 WHERE id = ?', [A.userId]); }
  assert.equal(await resolveMember(deps, sid), null, 'a revoked session stays revoked after reactivation');
});

test('forged or malformed session ids never authenticate', async () => {
  for (const sid of [null, '', 'x', 'a'.repeat(43), `${'A'.repeat(42)}!`]) assert.equal(await resolveMember(deps, sid), null);
});

test('the reader account cannot write (least privilege)', async () => {
  await assert.rejects(db.query('UPDATE users SET is_active = 1 WHERE id = 1'));
  await assert.rejects(db.query('INSERT INTO faqs (id, pertanyaan, jawaban) VALUES (99, "x", "y")'));
});

test('member scoping: profile, savings, loans and favorites never cross members (IDOR)', async () => {
  assert.equal(await readProfile(db, B.memberId, [A.nik]), null, 'member id of B with the NIK keys of A must return nothing');
  assert.equal((await readProfile(db, A.memberId, [A.nik])).name, A.name);
  const loansA = await readLoans(db, [A.nik]);
  assert.deepEqual(loansA.map((l) => l.docNo), ['PJ-UJI-0001']);
  assert.ok(!(await readSales(db, [A.nik], { limit: 50 })).some((s) => s.total === '999000.00'));
  assert.deepEqual((await readFavorites(db, A.userId)).map((f) => f.name), ['BERAS UJI 5 KG']);
  assert.deepEqual(await readFavorites(db, B.userId), []);
});

test('savings: approved movements summed per type, pending kept apart', async () => {
  const s = buildSavingsSummary(await new MysqlSavingsReader(db).typeSummary([A.nik]));
  const t = Object.fromEntries(s.types.map((x) => [x.type, x]));
  assert.equal(t['SIMPANAN WAJIB'].recorded4, 1_500_000 * 10_000);
  assert.equal(t['SIMPANAN SUKARELA'].recorded4, 750_000 * 10_000);
  assert.equal(t['SIMPANAN SUKARELA'].pending4, 50_000 * 10_000);
  assert.equal(t.PBS.recorded4, 250_000 * 10_000);
  assert.equal(s.types[0].type, 'SIMPANAN WAJIB');
  const deductions = await readActiveDeductions(db, [A.nik]);
  assert.equal(deductions.length, 2);
});

test('loan: schedule aggregate and status window for the active loan', async () => {
  const [h] = await readLoans(db, [A.nik]);
  assert.ok(isActiveLoan(h));
  const loan = buildActiveLoan(h, await readScheduleAggregate(db, h.docNo), await readScheduleRows(db, h.docNo, 120), businessMonth(new Date()).key);
  assert.equal(loan.rows, 24); assert.equal(loan.paidRows, 10); assert.equal(loan.unpaidRows, 14);
  assert.equal(loan.remainingPrincipal4, 14_000_000 * 10_000);
  assert.equal(loan.current.no, 11); assert.equal(loan.current.status, 'waiting');
  assert.equal(loan.installment4, 1_240_000 * 10_000);
  assert.deepEqual(loan.scheduleIssues, []);
  assert.equal((await readLoanApplications(db, [A.nik]))[0].status, 'OPEN');
  const products = await readLoanProducts(db);
  assert.deepEqual(products.map((p) => p.name), ['PINJAMAN REGULAR', 'KASBON']);
  assert.equal(products[0].method, 'Flat');
});

test('payroll rows, headers and SHU (published years only)', async () => {
  const rows = await readPayrollRows(db, [A.nik], 12);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amounts.total_potongan, '1990000.0000');
  const headers = await readPayrollHeaders(db, rows.map((r) => r.docNo));
  assert.ok(headers.every((h) => h.headerCount === 1 && h.header.status === 'APPROVED'));
  const shu = buildShuYears(await readShu(db, [A.nik]));
  assert.deepEqual(shu.map((y) => y.year), ['2025']);
  assert.equal(shu[0].incomeSen, 475_000 * 100);
});

test('store credit follows the POS rule (Kredit+Final this month minus returns)', async () => {
  const m = businessMonth(new Date());
  const usage = await readCreditUsage(db, A.nik, m.start, m.endExclusive);
  assert.deepEqual(usage, { spent: '550000.00', returned: '50000.00' });
  const credit = buildStoreCredit(await readProfile(db, A.memberId, [A.nik]), usage, new Date());
  assert.equal(credit.eligible, true);
  assert.equal(credit.limitSen, 5_000_000 * 100);
  assert.equal(credit.usedSen, 500_000 * 100);
  assert.equal(credit.remainingSen, 4_500_000 * 100);
  assert.equal((await readOrders(db, [A.nik], 10)).length, 1);
});

test('catalog: scope, search, sort, prices from the server', async () => {
  const all = await readCatalog(db, { companyId: 1, q: '', category: null, sort: 'name', limit: 100, offset: 0 });
  assert.equal(all.total, 31, '30 products + 1 without price; SALDOPPOB, other branch and inactive excluded');
  assert.ok(!all.items.some((i) => /SALDO PPOB|CABANG LAIN|NONAKTIF/.test(i.name)));
  const search = await readCatalog(db, { companyId: 1, q: 'beras', category: null, sort: 'name', limit: 10, offset: 0 });
  assert.deepEqual(search.items.map((i) => i.name), ['BERAS UJI 5 KG']);
  const injected = await readCatalog(db, { companyId: 1, q: "%' OR 1=1 -- ", category: null, sort: 'name', limit: 10, offset: 0 });
  assert.equal(injected.total, 0);
  const high = await readCatalog(db, { companyId: 1, q: '', category: 'MAKANAN', sort: 'price-high', limit: 3, offset: 0 });
  assert.ok(Number(high.items[0].price) >= Number(high.items[1].price));
  assert.ok((await readCatalogCategories(db, 1)).includes('MINUMAN BOTOL'));
  assert.deepEqual((await readCatalogItems(db, 1, [1, 32, 33, 999])).map((i) => i.id), [1]);
  assert.equal((await readFaqs(db)).length, 2);
  assert.equal((await readNotices(db)).length, 1);
});
