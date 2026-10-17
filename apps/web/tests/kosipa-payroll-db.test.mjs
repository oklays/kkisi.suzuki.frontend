import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaPayrollReader } from '../src/infrastructure/repositories/kosipa-payroll.repository.ts';
import { listPayrollBatches, readPayrollBatch, readPayrollMember, readStoreReconciliation, loadMemberPayrollHistory } from '@koperasi/application/kosipa/payroll';
import { KosipaError } from '@koperasi/domain/kosipa';

// Opt-in: runs the real SQL adapter against the SYNTHETIC schema kkisi_e2e_legacy (seeded by scripts/e2e-seed.mjs) through the
// SELECT-only e2e account. It never touches kkisi_staging or any production database.
//   KOSIPA_PAYROLL_DB_TEST=1 node --experimental-strip-types --env-file=.env.e2e --test tests/kosipa-payroll-db.test.mjs
const ON = process.env.KOSIPA_PAYROLL_DB_TEST === '1';
const RP = (n) => n * 10000;
const ALL = new Set(['kosipa.payroll.view', 'kosipa.loan.view', 'kosipa.store-credit.view', 'kosipa.member.view']);
const actor = { userId: 1, capabilities: ALL, requestId: 'db-test' };

test('synthetic schema: the full payroll read path over the real SQL adapter', { skip: !ON }, async () => {
  const url = new URL(process.env.E2E_READ_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.equal(url.pathname, '/kkisi_e2e_legacy'); assert.equal(decodeURIComponent(url.username), 'kkisi_e2e_read');
  const db = new PrismaClient({ datasourceUrl: process.env.E2E_READ_URL });
  const events = [];
  const deps = { reader: new PrismaKosipaPayrollReader(db), audit: { async append(e) { events.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z') };
  try {
    // ---- batch list: newest first, filters, zero dates classified not guessed, unknown status flagged
    const all = await listPayrollBatches(deps, actor, {});
    assert.deepEqual(all.items.map((i) => i.header.docNo), ['POTSYN202605A', 'POTSYN202606A', 'POTSYN202607A', 'POTSYN202608B', 'POTSYN202608A']);
    const july = all.items.find((i) => i.header.docNo === 'POTSYN202607A');
    assert.equal(july.periodDate.kind, 'zero'); assert.equal(july.headerTotal4, 500006666, 'sub-sen header total is exact');
    assert.equal(all.items.find((i) => i.header.docNo === 'POTSYN202605A').status, 'UNKNOWN');
    const filtered = await listPayrollBatches(deps, actor, { periode: '2026-08', status: 'OPEN' });
    assert.deepEqual(filtered.items.map((i) => i.header.docNo), ['POTSYN202608B']);
    const paged = await listPayrollBatches(deps, actor, { periode: '2026-08' });
    assert.deepEqual(paged.items.map((i) => i.header.docNo), ['POTSYN202608B', 'POTSYN202608A']);

    // ---- batch detail: aggregates computed in SQL once, per-row figures untouched, salary never read
    const a = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202608A' });
    assert.deepEqual([a.rowCount, a.distinctNik, a.integrity.issues], [2, 2, []]);
    assert.equal(a.integrity.rowsTotal4, RP(250000));
    assert.equal(a.totals.tokoSubtotalMatches, true);
    assert.ok(!JSON.stringify(a).includes('12345678'), 'gaji_payroll never leaves the adapter');
    const c = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202607A' });
    assert.ok(c.integrity.issues.includes('DUPLICATE_NIK_ROWS') && c.integrity.issues.includes('PERIOD_DATE_INVALID'));
    assert.equal(c.rowCount, 2); assert.equal(c.distinctNik, 1, 'duplicates are counted once per NIK and flagged, not merged');
    const d = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202606A' });
    assert.ok(d.integrity.issues.includes('NO_ROWS'));
    const e = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202605A' });
    assert.ok(e.integrity.issues.includes('HEADER_TOTAL_MISMATCH') && e.integrity.issues.includes('STATUS_UNKNOWN'));
    assert.equal(await readPayrollBatch(deps, actor, { docNo: 'POTSYN999999' }), null);
    const nameSearch = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202608A', q: 'kontrak' });
    assert.deepEqual(nameSearch.rows.map((r) => r.nik), ['S9002']);
    const nikSearch = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202608A', q: 'S9001' });
    assert.deepEqual(nikSearch.rows.map((r) => r.nik), ['S9001']);
    const likeAbuse = await readPayrollBatch(deps, actor, { docNo: 'POTSYN202608A', q: '%%' });
    assert.equal(likeAbuse.rows.length, 0, 'wildcards typed by a user are literal');

    // ---- member in batch: isolation, orphan parent, zero/9999 dates, loan gate
    const m = await readPayrollMember(deps, actor, { docNo: 'POTSYN202608A', nik: 'S9001' });
    assert.equal(m.rows.length, 1); assert.equal(m.rows[0].breakdown.recordedTotal4, RP(150000));
    assert.equal(m.installments.state, 'ok');
    assert.deepEqual(m.installments.data.items.map((i) => [i.loanDocNo, i.parent]), [['PINSYN9001', 'PRESENT'], ['PINSYN-ORPH', 'MISSING']], 'only installments due in the batch month; the orphan parent is reported, not dropped');
    assert.deepEqual([m.installments.data.quality.zeroDue, m.installments.data.quality.implausibleDue, m.installments.data.quality.total], [1, 1, 4]);
    assert.equal(await readPayrollMember(deps, actor, { docNo: 'POTSYN202608B', nik: 'S9002' }), null, 'a member who is not in this batch is not found');
    assert.equal((await readPayrollMember(deps, { ...actor, capabilities: new Set(['kosipa.payroll.view']) }, { docNo: 'POTSYN202608A', nik: 'S9001' })).installments.state, 'restricted');
    assert.equal((await readPayrollMember(deps, actor, { docNo: 'POTSYN202607A', nik: 'S9001' })).installments.reason, 'PERIOD_DATE_UNUSABLE');

    // ---- reconciliation: period level, net of the Kredit return, unmapped branch and absent member surfaced
    const r = await readStoreReconciliation(deps, actor, { docNo: 'POTSYN202608A' });
    assert.equal(r.state, 'ok');
    assert.deepEqual(r.data.batches.map((b) => b.docNo), ['POTSYN202608A', 'POTSYN202608B']);
    const cells = Object.fromEntries(r.data.rows.map((x) => [`${x.nik}|${x.column}`, x]));
    assert.equal(cells['S9002|TOKO_TAMBUN'].status, 'RECORDED_HIGHER'); assert.equal(cells['S9002|TOKO_TAMBUN'].difference4, RP(20000)); assert.equal(cells['S9002|TOKO_TAMBUN'].likelyCause, 'RETURN_NOT_DEDUCTED');
    assert.equal(cells['S9003|TOKO_GIIC'].status, 'DERIVED_ONLY_MEMBER_ABSENT');
    assert.equal(cells['S9001|TOKO_TAMBUN'], undefined, 'matching cells are not listed');
    assert.ok(r.data.anomalies.some((x) => x.code === 'UNMAPPED_COMPANY' && x.amount4 === RP(5000)));
    assert.equal(r.data.summary.recordedTotal4.TOKO_TAMBUN, RP(200000));
    assert.equal(r.data.summary.derivedTotal4.TOKO_TAMBUN, RP(180000));

    // ---- member history (bounded, headers looked up separately)
    const h = await loadMemberPayrollHistory(deps.reader, 'S9001');
    assert.deepEqual(h.map((x) => x.docNo), ['POTSYN202607A', 'POTSYN202607A', 'POTSYN202608B', 'POTSYN202608A']);
    assert.equal(h.find((x) => x.docNo === 'POTSYN202608A').header.state, 'OK');

    // ---- audit happened first and carries no NIK
    assert.ok(events.length >= 8); assert.ok(!JSON.stringify(events).includes('S9001'));

    // ---- the account cannot write, and bad input is refused before SQL
    await assert.rejects(db.$executeRawUnsafe(`DELETE FROM trans_potongan_matrix WHERE id = 9001`), /denied|command/i);
    await assert.rejects(listPayrollBatches(deps, actor, { periode: "2026-08' OR 1=1 --" }), (x) => x instanceof KosipaError);
  } finally { await db.$disconnect(); }
});

test('synthetic schema: the statement time cap is enforced by the server and a timeout becomes an explicit unavailable state', { skip: !ON }, async () => {
  const db = new PrismaClient({ datasourceUrl: process.env.E2E_READ_URL });
  try {
    await assert.rejects(db.$queryRaw`SET STATEMENT max_statement_time=0.05 FOR SELECT SLEEP(2) AS x`.then((r) => { if (r[0].x === 1) throw new Error('interrupted'); return r; }), /interrupt|timeout|max_statement_time/i);
    const real = new PrismaKosipaPayrollReader(db);
    const timedOut = Object.assign(Object.create(real), { kreditSales: async () => { await db.$queryRaw`SET STATEMENT max_statement_time=0.05 FOR SELECT SLEEP(2) AS x`.then((r) => { if (r[0].x === 1) throw new Error('interrupted by max_statement_time'); }); return { rows: [], truncated: false }; } });
    const out = await readStoreReconciliation({ reader: timedOut, audit: { async append() {} }, now: () => new Date('2026-10-17T05:00:00Z') }, actor, { docNo: 'POTSYN202608A' });
    assert.deepEqual([out.state, out.reason], ['unavailable', 'READ_FAILED']);
  } finally { await db.$disconnect(); }
});
