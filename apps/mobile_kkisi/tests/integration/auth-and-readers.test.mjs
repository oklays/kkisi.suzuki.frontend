// Integration tests against the isolated synthetic stack (integration/stack.mjs). Run: pnpm --filter @koperasi/mobile-kkisi test:integration
// Nothing here can reach a real database: the DSNs come only from apps/mobile_kkisi/.local/stack.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'mysql2/promise';
import { NonceCache, parseIntakeKeys, verifyIntakeRequest } from '@koperasi/application/member-intake/signature';
import { loadConfig, writerUrl } from '../../integration/stack.mjs';
import { MEMBERS, TEST_PASSWORD, seed } from '../../integration/seed.mjs';
import { authDeps, readerDb } from '../../src/server/container.ts';
import { login, verifyPin, resolveMember, logout, pendingPinSession } from '../../src/server/auth/auth-service.ts';
import { MemberMutationService, MysqlCommandLedgerStore } from '../../src/server/writers/member-mutations.ts';
import { HttpMemberIntakeClient } from '../../src/server/writers/intake-client.ts';
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

test('WS-01 integration: duplicate active NIK fails closed; unique active + historical RESIGN resolves; shadow PIN stored in MariaDB', async () => {
  assert.deepEqual(await login(deps, { identity: MEMBERS.duplicateNik.nik, password: TEST_PASSWORD }, null), { ok: false, code: 'NOT_A_MEMBER' });
  const r = await login(deps, { identity: MEMBERS.resignedAndActive.nik, password: TEST_PASSWORD }, null);
  assert.equal(r.ok, true);
  const p = await verifyPin(deps, r.sid, MEMBERS.resignedAndActive.pin);
  assert.equal(p.ok, true);
  const m = await resolveMember(deps, p.sid);
  assert.equal(m.memberId, MEMBERS.resignedAndActive.memberId, 'unique AKTIVE row selected over historical RESIGN row');
  const [cred] = await root.query('SELECT hash_scheme, pin_hash FROM kkisi_member_auth.member_pin_credentials WHERE user_id = ?', [MEMBERS.resignedAndActive.userId]);
  assert.equal(cred.length, 1);
  assert.equal(cred[0].hash_scheme, 'scrypt-p');
  assert.match(cred[0].pin_hash, /^\$scrypt-p\$/);
});

/** Stub of apps/web POST /api/internal/member-requests: verifies the signature with the SHARED verifier and replays by (member, client key). */
async function intakeStub(keys) {
  const calls = [];
  const docs = new Map();
  const nonces = new NonceCache();
  const server = createServer((req, res) => {
    let text = '';
    req.on('data', (c) => { text += c; });
    req.on('end', () => {
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const v = verifyIntakeRequest(keys, req.headers['x-kkisi-intake'] ?? null, { method: req.method, path: req.url, body: text }, new Date(), nonces);
      if (!v.ok) return send(401, { error: 'UNAUTHORIZED' });
      const body = JSON.parse(text);
      calls.push(body);
      if (body.purpose === 'limit') return send(409, { error: 'REQUEST_OPEN_LIMIT' });
      if (body.purpose === 'boom') return send(503, { error: 'UNAVAILABLE' });
      const key = `${body.member.memberId}|${body.clientKey}`;
      const hash = JSON.stringify({ ...body, clientKey: undefined });
      const seen = docs.get(key);
      if (seen && seen.hash !== hash) return send(409, { error: 'IDEMPOTENCY_CONFLICT' });
      const docNo = seen?.docNo ?? `${body.kind === 'loan' ? 'PGJ-MBL' : 'PPS-MBL'}-20261110-${String(docs.size + 1).padStart(6, '0')}`;
      docs.set(key, { hash, docNo });
      setTimeout(() => send(seen ? 200 : 201, { ok: true, replayed: Boolean(seen), docNo, status: 'OPEN', type: body.kind, summary: { status: 'OPEN' } }), 150);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, close: () => new Promise((r) => server.close(r)) };
}

test('P1 integration: loan / deduction go to the apps/web intake channel with the SESSION identity; replays, conflicts, refusals and outages map cleanly', async () => {
  await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
  const sid = await fullLogin(A.nik, A.pin);
  const member = await resolveMember(deps, sid);
  const keys = parseIntakeKeys(`k1:${Buffer.alloc(32, 5).toString('base64')}`);
  const stub = await intakeStub(keys);
  const authConn = await createConnection({ host: '127.0.0.1', port: cfg.port, user: 'mobile_auth', password: cfg.authPassword, database: 'kkisi_member_auth' });
  const writerConn = await createConnection(writerUrl(cfg));
  try {
    const flags = { enableLoanApplication: true, enableDeductionChange: true, enableStoreCheckout: true, enablePpob: true, enableMemberFavouritesWrite: true };
    const service = (intake, f = flags) => new MemberMutationService({ flags: f, secrets: deps.secrets, store: deps.store, ledger: new MysqlCommandLedgerStore(authConn), readerDb: db, writerDb: writerConn, intake, companyId: 1, leaseRetryMs: 100 });
    const svc = service(new HttpMemberIntakeClient({ baseUrl: stub.url, keys }));
    const loan = (key, extra = {}) => ({ kind: 'loan_application', idempotencyKey: key, productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Biaya sekolah', ...extra });

    // Flags off: nothing is sent
    const off = await service(null, { ...flags, enableLoanApplication: false }).execute(member, loan('idem-p1-off-00000001'));
    assert.deepEqual([off.status, off.code], [403, 'FEATURE_DISABLED']);

    // Created, then replayed with the same key; the identity sent is the session's, never the body's
    const created = await svc.execute(member, loan('idem-p1-loan-0000001'));
    assert.deepEqual([created.ok, created.status, created.replayed], [true, 201, false]);
    assert.match(created.docNo, /^PGJ-MBL-/);
    assert.deepEqual(stub.calls[0].member, { memberId: A.memberId, userId: A.userId, nik: A.nik });
    assert.deepEqual(Object.keys(stub.calls[0]).sort(), ['amountRp', 'clientKey', 'kind', 'member', 'months', 'productId', 'purpose']);
    const replayed = await svc.execute(member, loan('idem-p1-loan-0000001'));
    assert.deepEqual([replayed.status, replayed.replayed, replayed.docNo], [200, true, created.docNo]);
    const conflict = await svc.execute(member, loan('idem-p1-loan-0000001', { amountRp: 6_000_000 }));
    assert.deepEqual([conflict.status, conflict.code], [409, 'IDEMPOTENCY_CONFLICT']);

    // A double tap waits on the member lease and replays the first result
    const [x, y] = await Promise.all([svc.execute(member, loan('idem-p1-loan-double01')), svc.execute(member, loan('idem-p1-loan-double01'))]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal(x.docNo, y.docNo);

    // Refusal mapping, upstream outage, unreachable channel, PWA-side validation never calls apps/web
    const limit = await svc.execute(member, loan('idem-p1-loan-limit001', { purpose: 'limit' }));
    assert.deepEqual([limit.status, limit.code], [409, 'OPEN_APPLICATION_LIMIT']);
    const boom = await svc.execute(member, loan('idem-p1-loan-boom0001', { purpose: 'boom' }));
    assert.deepEqual([boom.status, boom.code], [503, 'UPSTREAM_WRITER_UNAVAILABLE']);
    const down = await service(new HttpMemberIntakeClient({ baseUrl: 'http://127.0.0.1:9', keys, timeoutMs: 500 })).execute(member, loan('idem-p1-loan-down0001'));
    assert.deepEqual([down.status, down.code], [503, 'UPSTREAM_WRITER_UNAVAILABLE']);
    const before = stub.calls.length;
    const tooBig = await svc.execute(member, loan('idem-p1-loan-big00001', { amountRp: 900_000_000 }));
    assert.deepEqual([tooBig.status, tooBig.code, stub.calls.length], [422, 'INVALID_INPUT', before]);
    const wrongKey = await service(new HttpMemberIntakeClient({ baseUrl: stub.url, keys: parseIntakeKeys(`k1:${Buffer.alloc(32, 6).toString('base64')}`) })).execute(member, loan('idem-p1-loan-key00001'));
    assert.deepEqual([wrongKey.status, wrongKey.code], [503, 'UPSTREAM_WRITER_UNAVAILABLE'], 'a signature refusal is an outage for the member, never a business answer');

    // Deduction change through the same channel
    const ded = await svc.execute(member, { kind: 'deduction_change', idempotencyKey: 'idem-p1-ded-00000001', savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000, consent: true });
    assert.deepEqual([ded.status, stub.calls.at(-1).kind, stub.calls.at(-1).requestedRp], [201, 'deduction', 150_000]);

    // (more than 10 writes in this test: the member write throttle must be reset, it is working as designed)
    await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
    // Checkout and PPOB still fail closed; the PWA writer has no grant on the intake tables any more
    assert.equal((await svc.execute(member, { kind: 'store_checkout', idempotencyKey: 'idem-checkout-000001', items: [{ id: 1, quantity: 2 }], payment: 'kredit' })).code, 'UPSTREAM_WRITER_UNAVAILABLE');
    assert.equal((await svc.execute(member, { kind: 'ppob', idempotencyKey: 'idem-ppob-0000000001', serviceId: 'pulsa', account: '081234567890' })).code, 'PROVIDER_UNAVAILABLE');
    await assert.rejects(writerConn.query("INSERT INTO trans_pinjaman_pengajuan (doc_no) VALUES ('X')"));
    await assert.rejects(writerConn.query("INSERT INTO trans_simpanan_pengajuan (doc_no, status_notif) VALUES ('X', 0)"));
    await assert.rejects(writerConn.query("UPDATE users SET pin = '0000' WHERE id = 101"));
  } finally {
    await stub.close();
    await authConn.end();
    await writerConn.end();
    await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
  }
});

test('P0 integration: throttleHit is atomic on MariaDB (parallel attempts are each counted once)', async () => {
  const policy = { now: new Date(), windowMs: 15 * 60_000, lockMs: 15 * 60_000, limit: 10 };
  const results = await Promise.all(Array.from({ length: 20 }, () => deps.store.throttleHit('p0-parallel-hit', policy)));
  const final = await deps.store.throttleGet('p0-parallel-hit');
  assert.equal(final.failures, 20, 'no lost update');
  assert.equal(new Set(results.map((r) => r.failures)).size >= 1, true);
  assert.ok(final.lockedUntil > policy.now, 'locked once the limit is reached');
  const fresh = await deps.store.throttleHit('p0-parallel-hit', { ...policy, now: new Date(Date.now() + 16 * 60_000) });
  assert.deepEqual([fresh.failures, fresh.lockedUntil], [1, null], 'an old window starts over');
  await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
});

test('P0 integration: the reader sees only the member read views, never the legacy schema or other columns', async () => {
  const reader = readerDb();
  await assert.rejects(reader.query('SELECT id FROM kkisi_mobile_legacy.users LIMIT 1'), 'no grant on the legacy schema');
  await assert.rejects(reader.query('SELECT ktp FROM users LIMIT 1'), 'users view exposes login columns only');
  await assert.rejects(reader.query("INSERT INTO trans_pinjaman_pengajuan (doc_no) VALUES ('X')"), 'SELECT only');
  const [r] = await reader.query('SELECT COUNT(*) AS n FROM m_anggota');
  assert.ok(Number(r[0].n) > 0, 'member data is readable through the view');
});
