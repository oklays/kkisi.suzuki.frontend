// Integration tests against the isolated synthetic stack (integration/stack.mjs). Run: pnpm --filter @koperasi/mobile-kkisi test:integration
// Nothing here can reach a real database: the DSNs come only from apps/mobile_kkisi/.local/stack.json.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'mysql2/promise';
import { loadConfig, writerUrl } from '../../integration/stack.mjs';
import { MEMBERS, TEST_PASSWORD, seed } from '../../integration/seed.mjs';
import { authDeps, readerDb } from '../../src/server/container.ts';
import { login, verifyPin, resolveMember, logout, pendingPinSession } from '../../src/server/auth/auth-service.ts';
import { MemberMutationService, MysqlCommandLedgerStore } from '../../src/server/writers/member-mutations.ts';
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

test('WS-03 integration: feature flags default to disabled; controlled writer records idempotent intake rows with least privilege', async () => {
  const sid = await fullLogin(A.nik, A.pin);
  const member = await resolveMember(deps, sid);
  const authConn = await createConnection({ host: '127.0.0.1', port: cfg.port, user: 'mobile_auth', password: cfg.authPassword, database: 'kkisi_member_auth' });
  const writerConn = await createConnection(writerUrl(cfg));
  try {
    const ledger = new MysqlCommandLedgerStore(authConn);
    // 1. Default flags (all false): mutations are blocked on the server
    const disabledSvc = new MemberMutationService({
      flags: { enableLoanApplication: false, enableDeductionChange: false, enableStoreCheckout: false, enablePpob: false, enableMemberFavouritesWrite: false },
      secrets: deps.secrets,
      store: deps.store,
      ledger,
      readerDb: db,
      writerDb: writerConn,
      companyId: 1,
    });
    const blocked = await disabledSvc.execute(member, {
      kind: 'loan_application', idempotencyKey: 'idem-loan-disabled-0001', productId: 1, amountRp: 5_000_000, months: 12, purpose: 'Biaya sekolah',
    });
    assert.deepEqual(blocked, { ok: false, status: 403, code: 'FEATURE_DISABLED', feature: 'ENABLE_LOAN_APPLICATION' });

    // 2. Controlled writer mode: loan_application, deduction_change, favourite_toggle are recorded idempotently
    const enabledSvc = new MemberMutationService({
      flags: { enableLoanApplication: true, enableDeductionChange: true, enableStoreCheckout: true, enablePpob: true, enableMemberFavouritesWrite: true },
      secrets: deps.secrets,
      store: deps.store,
      ledger,
      readerDb: db,
      writerDb: writerConn,
      companyId: 1,
    });
    const loanCmd = { kind: 'loan_application', idempotencyKey: 'idem-loan-enabled-0001', productId: 1, amountRp: 6_000_000, months: 12, purpose: 'Renovasi atap' };
    const created = await enabledSvc.execute(member, loanCmd);
    assert.equal(created.ok, true);
    assert.equal(created.status, 201);
    assert.equal(created.replayed, false);
    assert.match(created.docNo, /^PGJ-MBL-/);

    // Replay with the same Idempotency-Key returns 200 replayed: true without inserting a second row
    const replayed = await enabledSvc.execute(member, loanCmd);
    assert.equal(replayed.ok, true);
    assert.equal(replayed.status, 200);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.docNo, created.docNo);

    // Replay with the same Idempotency-Key but modified amountRp returns 409 IDEMPOTENCY_CONFLICT
    const conflict = await enabledSvc.execute(member, { ...loanCmd, amountRp: 7_000_000 });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.code, 'IDEMPOTENCY_CONFLICT');

    const [loanRows] = await root.query('SELECT doc_no, doc_status, total_pinjaman, is_online FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [created.docNo]);
    assert.equal(loanRows.length, 1, 'exactly one intake row inserted');
    assert.equal(loanRows[0].doc_status, 'OPEN');

    // Deduction change intake
    const dedRes = await enabledSvc.execute(member, {
      kind: 'deduction_change', idempotencyKey: 'idem-deduction-00001', savingsType: 'SIMPANAN WAJIB', requestedRp: 150_000, consent: true,
    });
    assert.equal(dedRes.ok, true);
    assert.equal(dedRes.status, 201);

    // Store checkout and PPOB still fail closed (503) even if flags are passed true because upstream contracts are absent
    const storeRes = await enabledSvc.execute(member, {
      kind: 'store_checkout', idempotencyKey: 'idem-checkout-000001', items: [{ id: 1, quantity: 2 }], payment: 'kredit',
    });
    assert.equal(storeRes.code, 'UPSTREAM_WRITER_UNAVAILABLE');
    const ppobRes = await enabledSvc.execute(member, {
      kind: 'ppob', idempotencyKey: 'idem-ppob-0000000001', serviceId: 'pulsa', account: '081234567890',
    });
    assert.equal(ppobRes.code, 'PROVIDER_UNAVAILABLE');

    // Least privilege: mobile_writer cannot touch trans_pinjaman or users
    await assert.rejects(writerConn.query("UPDATE users SET pin = '0000' WHERE id = 101"));
    await assert.rejects(writerConn.query("DELETE FROM trans_pinjaman WHERE id = 1"));
  } finally {
    await authConn.end();
    await writerConn.end();
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

test('P0 integration: writer is exactly-once under double submit, caps open applications under parallel load, reconciles PENDING', async () => {
  await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
  const sid = await fullLogin(B.nik, B.pin);
  const member = await resolveMember(deps, sid);
  const authConn = await createConnection({ host: '127.0.0.1', port: cfg.port, user: 'mobile_auth', password: cfg.authPassword, database: 'kkisi_member_auth' });
  const writerConn = await createConnection(writerUrl(cfg));
  const openRows = async () => (await root.query("SELECT doc_no FROM trans_pinjaman_pengajuan WHERE nik_kar = ? AND doc_status = 'OPEN'", [B.nik]))[0];
  try {
    const ledger = new MysqlCommandLedgerStore(authConn);
    const svc = new MemberMutationService({
      flags: { enableLoanApplication: true, enableDeductionChange: true, enableStoreCheckout: false, enablePpob: false, enableMemberFavouritesWrite: false },
      secrets: deps.secrets, store: deps.store, ledger, readerDb: db, writerDb: writerConn, companyId: 1, leaseRetryMs: 100,
    });
    const before = (await openRows()).length;
    const loan = (key, amountRp = 5_000_000) => ({ kind: 'loan_application', idempotencyKey: key, productId: 1, amountRp, months: 12, purpose: 'Uji paralel' });

    // 1. Unknown fields never reach the writer
    const forged = await svc.execute(member, { ...loan('idem-p0-forged-000001'), doc_status: 'POSTING' });
    assert.deepEqual([forged.status, forged.code, forged.field], [400, 'FIELD_NOT_ALLOWED', 'doc_status']);

    // 2. Double submit of the same key: one insert, the other request replays it
    const [x, y] = await Promise.all([svc.execute(member, loan('idem-p0-double-000001')), svc.execute(member, loan('idem-p0-double-000001'))]);
    assert.deepEqual([x.ok, y.ok], [true, true]);
    assert.deepEqual([x.status, y.status].sort(), [200, 201]);
    assert.equal(x.docNo, y.docNo);
    const [dup] = await root.query('SELECT COUNT(*) AS n FROM trans_pinjaman_pengajuan WHERE doc_no = ?', [x.docNo]);
    assert.equal(Number(dup[0].n), 1, 'exactly one intake row');

    // 3. Parallel submits with DIFFERENT keys cannot exceed the open-application limit (3)
    const burst = await Promise.all([2, 3, 4, 5].map((i) => svc.execute(member, loan(`idem-p0-burst-00000${i}`, 5_000_000 + i))));
    const open = (await openRows()).length;
    assert.ok(open <= Math.max(3, before), `open applications ${open} must not exceed the limit`);
    assert.ok(burst.some((r) => r.code === 'OPEN_APPLICATION_LIMIT'), 'the excess is refused');
    const [refusedLedger] = await authConn.query("SELECT COUNT(*) AS n FROM member_command_ledger WHERE member_id = ? AND status = 'PENDING'", [B.memberId]);
    assert.equal(Number(refusedLedger[0].n), 0, 'refused commands release their reservation');

    // 4. A PENDING reservation whose business row exists (crash after insert) is reconciled, never written twice
    await root.query("DELETE FROM trans_pinjaman_pengajuan WHERE nik_kar = ?", [B.nik]);
    const crashKey = 'idem-p0-crash-0000001';
    const planned = 'PGJ-MBL-20260101-ABCDEF';   // planned on an earlier day: reconciliation must use the reserved number
    const crashCmd = loan(crashKey);
    const { payloadHashOf } = await import('../../src/server/writers/member-mutations.ts');
    await ledger.reserve({ memberId: B.memberId, kind: 'loan_application', key: crashKey, nik: B.nik, payloadHash: payloadHashOf(crashCmd), docNo: planned, now: new Date() });
    await root.query("INSERT INTO trans_pinjaman_pengajuan (doc_no, doc_status, nik_kar, total_pinjaman, lama_angsuran) VALUES (?, 'OPEN', ?, 5000000, 12)", [planned, B.nik]);
    const reconciled = await svc.execute(member, crashCmd);
    assert.deepEqual([reconciled.ok, reconciled.status, reconciled.replayed, reconciled.docNo], [true, 200, true, planned]);
    const [after] = await root.query('SELECT COUNT(*) AS n FROM trans_pinjaman_pengajuan WHERE nik_kar = ?', [B.nik]);
    assert.equal(Number(after[0].n), 1);

    // 5. A PENDING reservation with NO business row is taken over and written once, under its reserved doc_no
    const lostKey = 'idem-p0-lost-00000001';
    const lostCmd = loan(lostKey, 6_000_000);
    const lostDoc = 'PGJ-MBL-20260101-123456';
    await ledger.reserve({ memberId: B.memberId, kind: 'loan_application', key: lostKey, nik: B.nik, payloadHash: payloadHashOf(lostCmd), docNo: lostDoc, now: new Date() });
    const retaken = await svc.execute(member, lostCmd);
    assert.deepEqual([retaken.ok, retaken.status, retaken.docNo], [true, 201, lostDoc]);
    const [ledgerRow] = await authConn.query('SELECT status, result_doc_no FROM member_command_ledger WHERE member_id = ? AND idempotency_key = ?', [B.memberId, lostKey]);
    assert.deepEqual([ledgerRow[0].status, ledgerRow[0].result_doc_no], ['RECORDED', lostDoc]);
    const [lease] = await authConn.query('SELECT COUNT(*) AS n FROM member_write_lease WHERE member_id = ?', [B.memberId]);
    assert.equal(Number(lease[0].n), 0, 'the lease is released after every command');
  } finally {
    await authConn.end();
    await writerConn.end();
    await root.query('DELETE FROM kkisi_member_auth.member_auth_throttle');
  }
});

test('P0 integration: the reader sees only the member read views, never the legacy schema or other columns', async () => {
  const reader = readerDb();
  await assert.rejects(reader.query('SELECT id FROM kkisi_mobile_legacy.users LIMIT 1'), 'no grant on the legacy schema');
  await assert.rejects(reader.query('SELECT ktp FROM users LIMIT 1'), 'users view exposes login columns only');
  await assert.rejects(reader.query("INSERT INTO trans_pinjaman_pengajuan (doc_no) VALUES ('X')"), 'SELECT only');
  const [r] = await reader.query('SELECT COUNT(*) AS n FROM m_anggota');
  assert.ok(Number(r[0].n) > 0, 'member data is readable through the view');
});
