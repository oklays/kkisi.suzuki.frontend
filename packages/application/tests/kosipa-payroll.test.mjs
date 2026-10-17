import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { listPayrollBatches, readPayrollBatch, readPayrollMember, readStoreReconciliation, loadMemberPayrollHistory, SOURCE_ROW_CAP } from '../src/kosipa/payroll.ts';
import { makePayrollWorld, hdr, mrow, sale } from './helpers/payroll-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e?.stack ?? e)); return e.code; } };
const RP = (n) => n * 10000;
const NOW = () => new Date('2026-10-17T05:00:00Z');
const caps = (...c) => new Set(c);
const ALL = caps('kosipa.payroll.view', 'kosipa.loan.view', 'kosipa.store-credit.view', 'kosipa.member.view');
const actor = (capabilities = ALL) => ({ userId: 7, capabilities, requestId: 'req-1' });
const mk = (world, extra = {}) => { const events = []; return { events, deps: { reader: world.reader, audit: { async append(e) { events.push(e); } }, now: NOW, ...extra } }; };

const T = (n) => `${n}.0000`;
function world(over = {}) {
  const A = hdr(5, { docNo: 'POT202608001', group: 'ANGGOTA' }), B = hdr(6, { docNo: 'POT202608002', group: 'BMP', status: 'OPEN' }), JULY = hdr(4, { docNo: 'POT202607001', periodMonth: '07', periodDate: '2026-07-31' });
  return makePayrollWorld({
    headers: [JULY, A, B],
    rows: [
      mrow(101, 'POT202608001', '00100', { TOKO_TAMBUN: T(100000), potongan_toko: T(100000), total_potongan: T(150000), PPOB: T(50000) }),
      mrow(102, 'POT202608001', '00200', { TOKO_TAMBUN: T(100000), potongan_toko: T(100000), total_potongan: T(100000) }),
      mrow(103, 'POT202608002', '00100', { TOKO_MJ: T(40000), potongan_toko: T(40000), total_potongan: T(40000) }),     // same member, second batch of the period
      mrow(104, 'POT202608001', '00300', { SIMPANAN_WAJIB: T(250000), total_potongan: '250000.3333' }),                     // total != component sum (the 35 legacy rows)
      mrow(90, 'POT202607001', '00100', { TOKO_TAMBUN: T(1), potongan_toko: T(1), total_potongan: T(1) }),
    ],
    sales: [sale(1, '00100', 1, 100000), sale(2, '00200', 1, 80000), sale(3, '00200', 1, 20000), sale(4, '00100', 2, 40000), sale(5, '00900', 3, 30000)],
    returns: [{ returnId: 1, saleId: 3, amount: '20000.00' }],
    installments: [
      { id: 1, nik: '00100', loanDocNo: 'PIN1', installmentNo: 3, dueRaw: '2026-08-25', principal: T(100000), interest: T(5000), total: T(105000), status: 'Belum Bayar', type: null },
      { id: 2, nik: '00100', loanDocNo: 'PIN-ORPHAN', installmentNo: 1, dueRaw: '2026-08-26', principal: T(1), interest: T(0), total: T(1), status: 'Belum Bayar', type: null },
      { id: 3, nik: '00100', loanDocNo: 'PIN1', installmentNo: 2, dueRaw: '0000-00-00', principal: T(1), interest: T(0), total: T(1), status: 'Belum Bayar', type: null },
      { id: 4, nik: '00100', loanDocNo: 'PIN1', installmentNo: 9, dueRaw: '9999-12-10', principal: T(1), interest: T(0), total: T(1), status: 'Belum Bayar', type: null },
      { id: 5, nik: '00200', loanDocNo: 'PIN2', installmentNo: 1, dueRaw: '2026-08-25', principal: T(1), interest: T(0), total: T(1), status: 'Bayar', type: 'PAYROLL' },
    ],
    loans: ['PIN1', 'PIN2'], ...over,
  });
}

// ------------------------------------------------------------------------------------------------- authorization
test('every entry point needs its capability BEFORE anything is audited or read (fail closed)', async () => {
  const w = world(); const { deps, events } = mk(w);
  const none = actor(caps());
  assert.equal(await code(listPayrollBatches(deps, none, {})), 'FORBIDDEN');
  assert.equal(await code(readPayrollBatch(deps, none, { docNo: 'POT202608001' })), 'FORBIDDEN');
  assert.equal(await code(readPayrollMember(deps, none, { docNo: 'POT202608001', nik: '00100' })), 'FORBIDDEN');
  assert.equal(await code(readStoreReconciliation(deps, none, { docNo: 'POT202608001' })), 'FORBIDDEN');
  assert.equal(await code(readStoreReconciliation(deps, actor(caps('kosipa.payroll.view')), { docNo: 'POT202608001' })), 'FORBIDDEN', 'reconciliation also exposes Kredit sales: it needs the store-credit grant');
  assert.equal(await code(readStoreReconciliation(deps, actor(caps('kosipa.store-credit.view')), { docNo: 'POT202608001' })), 'FORBIDDEN');
  assert.equal(await code(listPayrollBatches(deps, actor(caps('kosipa.member.view', 'kosipa.loan.view')), {})), 'FORBIDDEN', 'other KOSIPA grants do not imply payroll');
  assert.equal(w.calls.length, 0, 'not one database read happened'); assert.equal(events.length, 0, 'and nothing was audited');
});

test('sensitive reads are audited BEFORE any data is read, with opaque subjects only; an audit failure stops the read', async () => {
  const w = world(); const order = [];
  const deps = { reader: new Proxy(w.reader, { get: (t, k) => (typeof t[k] === 'function' ? (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } : t[k]) }), audit: { async append(e) { order.push(`audit:${e.action}`); } }, now: NOW };
  await readPayrollBatch(deps, actor(), { docNo: 'POT202608001' });
  assert.equal(order[0], 'audit:kosipa.payroll.batch.view');
  order.length = 0; await readPayrollMember(deps, actor(), { docNo: 'POT202608001', nik: '00100' });
  assert.equal(order[0], 'audit:kosipa.payroll.member.view');
  order.length = 0; await readStoreReconciliation(deps, actor(), { docNo: 'POT202608001' });
  assert.equal(order[0], 'audit:kosipa.payroll.reconcile');
  const { deps: ok, events } = mk(w);
  await readPayrollMember(ok, actor(), { docNo: 'POT202608001', nik: '00100' });
  assert.deepEqual(events.map((e) => [e.action, e.subjectType, e.subjectId, e.outcome]), [['kosipa.payroll.member.view', 'payroll', 'payroll:POT202608001', 'success']]);
  assert.ok(!JSON.stringify(events).includes('00100'), 'the NIK never reaches the audit record');
  const failing = makePayrollWorld({ headers: [hdr(5, { docNo: 'POT202608001' })] });
  const fail = { reader: failing.reader, audit: { async append() { throw new Error('console db down'); } }, now: NOW };
  await assert.rejects(readPayrollBatch(fail, actor(), { docNo: 'POT202608001' }), /console db down/);
  assert.equal(failing.calls.length, 0, 'no financial row was read when the audit could not be written');
});

// ------------------------------------------------------------------------------------------------- batch list
test('batch list: period, status and group filters are applied; newest first; keyset pagination by primary key without overlap or gaps', async () => {
  const headers = Array.from({ length: 60 }, (_, i) => hdr(i + 1, { docNo: `POT2026${String(i + 1).padStart(6, '0')}`, periodMonth: i % 2 ? '08' : '09', status: i % 3 ? 'APPROVED' : 'OPEN', group: i % 5 ? 'BMP' : 'ANGGOTA' }));
  const w = makePayrollWorld({ headers }); const { deps } = mk(w);
  const p1 = await listPayrollBatches(deps, actor(), {});
  assert.equal(p1.items.length, 25); assert.equal(p1.items[0].header.id, 60); assert.equal(p1.nextCursor, 36);
  const p2 = await listPayrollBatches(deps, actor(), { after: String(p1.nextCursor) });
  const p3 = await listPayrollBatches(deps, actor(), { after: String(p2.nextCursor) });
  const ids = [...p1.items, ...p2.items, ...p3.items].map((i) => i.header.id);
  assert.deepEqual(ids, Array.from({ length: 60 }, (_, i) => 60 - i), 'every batch exactly once, in order');
  assert.equal(p3.nextCursor, null);
  const filtered = await listPayrollBatches(deps, actor(), { periode: '2026-08', status: 'OPEN', grup: 'ANGGOTA' });
  assert.ok(filtered.items.length > 0 && filtered.items.every((i) => i.header.periodMonth === '08' && i.status === 'OPEN' && i.header.group === 'ANGGOTA'));
  assert.deepEqual(w.named('listBatches').at(-1)[1], { period: { year: 2026, month: 8 }, status: 'OPEN', group: 'ANGGOTA', afterId: null }, 'the reader receives validated values only');
  assert.equal(w.named('listBatches').at(-1)[2], 26, 'one extra row is requested to detect the next page; never unbounded');
});

test('batch list: malformed filters are refused before any query; zero/invalid period dates are classified, not guessed', async () => {
  const w = world(); const { deps } = mk(w);
  for (const bad of [{ periode: '2026-13' }, { status: "OPEN' OR 1=1 --" }, { grup: 'X' }, { after: '-5' }, { after: '1;DROP' }]) assert.ok(['PERIOD_INVALID', 'FILTER_INVALID', 'CURSOR_INVALID'].includes(await code(listPayrollBatches(deps, actor(), bad))), JSON.stringify(bad));
  assert.equal(w.calls.length, 0);
  const odd = makePayrollWorld({ headers: [hdr(1, { periodDate: '0000-00-00', cashDate: '9999-12-10', status: 'REVIEW' }), hdr(2, { periodDate: null, cashDate: null })] });
  const page = await listPayrollBatches(mk(odd).deps, actor(), {});
  assert.deepEqual(page.items.map((i) => [i.periodDate.kind, i.cashDate.kind, i.status]), [['missing', 'missing', 'APPROVED'], ['zero', 'invalid', 'UNKNOWN']]);
});

// ------------------------------------------------------------------------------------------------- batch detail
test('batch detail: header, integrity checks, component totals with groups, paged member rows; recorded figures untouched', async () => {
  const w = world({ headers: [hdr(5, { docNo: 'POT202608001', headerTotal: '500000.3333' }), hdr(6, { docNo: 'POT202608002', status: 'OPEN' })] });
  const { deps } = mk(w);
  const d = await readPayrollBatch(deps, actor(), { docNo: 'POT202608001' });
  assert.deepEqual([d.rowCount, d.distinctNik, d.integrity.issues], [3, 3, []], 'header total equals the row sum including the sub-sen fraction');
  assert.equal(d.integrity.rowsTotal4, 150000 * 10000 + 100000 * 10000 + 2500003333);
  assert.deepEqual(d.totals.groups.map((g) => [g.group, g.amount4]), [['toko', RP(200000)], ['ppob', RP(50000)], ['simpanan', RP(250000)]]);
  assert.equal(d.totals.tokoSubtotalMatches, true);
  assert.deepEqual(d.rows.map((r) => [r.nik, r.total4]), [['00100', RP(150000)], ['00200', RP(100000)], ['00300', 2500003333]]);
  assert.equal(await readPayrollBatch(deps, actor(), { docNo: 'POT999999' }), null);
});

test('batch detail: integrity problems are listed, never repaired (header total mismatch, no rows, duplicate NIK rows, unknown status)', async () => {
  const w = makePayrollWorld({
    headers: [hdr(1, { docNo: 'POT000001', headerTotal: '999.0000', status: 'WEIRD' }), hdr(2, { docNo: 'POT000002' }), hdr(3, { docNo: 'POT000003', headerTotal: T(20) })],
    rows: [mrow(1, 'POT000001', '1', { total_potongan: T(10) }), mrow(3, 'POT000003', '7', { total_potongan: T(10) }), mrow(4, 'POT000003', '7', { total_potongan: T(10) })],
  });
  const { deps } = mk(w);
  assert.deepEqual((await readPayrollBatch(deps, actor(), { docNo: 'POT000001' })).integrity.issues, ['STATUS_UNKNOWN', 'HEADER_TOTAL_MISMATCH']);
  assert.deepEqual((await readPayrollBatch(deps, actor(), { docNo: 'POT000002' })).integrity.issues, ['NO_ROWS', 'HEADER_TOTAL_MISSING']);
  const dup = await readPayrollBatch(deps, actor(), { docNo: 'POT000003' });
  assert.deepEqual(dup.integrity.issues, ['DUPLICATE_NIK_ROWS']);
  assert.equal(dup.rows.length, 2, 'both duplicate rows stay visible: they are not merged or hidden');
  assert.equal(dup.integrity.rowsTotal4, RP(20), 'and the total counts each exactly once');
});

test('batch detail: large batch is served in bounded keyset pages (50 rows) in a stable order; member filter by NIK (zero-padded form) or name', async () => {
  const rows = Array.from({ length: 130 }, (_, i) => mrow(1000 + i, 'POT202608001', String(10000 + i), { total_potongan: T(i + 1) }));
  const w = makePayrollWorld({ headers: [hdr(5, { docNo: 'POT202608001' })], rows }); const { deps } = mk(w);
  const p1 = await readPayrollBatch(deps, actor(), { docNo: 'POT202608001' });
  assert.equal(p1.rows.length, 50); assert.equal(p1.nextCursor, 1049);
  const p2 = await readPayrollBatch(deps, actor(), { docNo: 'POT202608001', after: String(p1.nextCursor) });
  const p3 = await readPayrollBatch(deps, actor(), { docNo: 'POT202608001', after: String(p2.nextCursor) });
  assert.deepEqual([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id), rows.map((r) => r.id), 'no gaps, no overlap');
  assert.equal(p3.nextCursor, null);
  assert.equal(w.named('batchRows')[0][4], 51, 'page size + 1 is the most a single query can return');
  const byNik = await readPayrollBatch(deps, actor(), { docNo: 'POT202608001', q: '10005' });
  assert.deepEqual(byNik.rows.map((r) => r.nik), ['10005']); assert.equal(byNik.filterActive, true);
  assert.equal(w.named('batchRows').at(-1)[2].nikKeys[0], '10005');
  const byName = await readPayrollBatch(deps, actor(), { docNo: 'POT202608001', q: 'SYNTH 1000' });
  assert.ok(byName.rows.length > 0 && byName.rows.every((r) => r.name.includes('SYNTH 1000')));
  assert.equal(await code(readPayrollBatch(deps, actor(), { docNo: 'POT202608001', after: 'x' })), 'CURSOR_INVALID');
  assert.equal(await code(readPayrollBatch(deps, actor(), { docNo: "POT'; DROP TABLE x;--" })), 'DOC_NO_INVALID');
});

// ------------------------------------------------------------------------------------------------- member isolation
test('member in batch: exact (batch, NIK) lookup; another member, another batch or a manipulated NIK yields nothing', async () => {
  const w = world(); const { deps } = mk(w);
  const m = await readPayrollMember(deps, actor(), { docNo: 'POT202608001', nik: '00100' });
  assert.deepEqual([m.nik, m.rows.length, m.duplicateRows], ['00100', 1, false]);
  assert.deepEqual(m.rows[0].breakdown.components.map((c) => c.column), ['TOKO_TAMBUN', 'PPOB']);
  assert.equal(await readPayrollMember(deps, actor(), { docNo: 'POT202608001', nik: '00999' }), null, 'a member who is not in this batch is not found');
  assert.equal(await readPayrollMember(deps, actor(), { docNo: 'POT202607001', nik: '00200' }), null, 'nor in another period');
  for (const bad of ["100' OR '1'='1", '00100;', '', '../../etc', 42, null]) assert.equal(await code(readPayrollMember(deps, actor(), { docNo: 'POT202608001', nik: bad })), 'NIK_INVALID', String(bad));
  assert.equal(w.named('memberRows').every(([, , keys]) => keys.every((k) => /^[0-9A-Za-z]+$/.test(k))), true);
  assert.equal(await readPayrollMember(deps, actor(), { docNo: 'POT999999', nik: '00100' }), null);
});

test('member in batch: salary is never selected, and a duplicated member row is shown as separate rows with a flag', async () => {
  const w = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT000001' })], rows: [mrow(1, 'POT000001', '55', { total_potongan: T(10), PPOB: T(10) }), mrow(2, 'POT000001', '55', { total_potongan: T(5), PPOB: T(5) })] });
  const m = await readPayrollMember(mk(w).deps, actor(), { docNo: 'POT000001', nik: '55' });
  assert.equal(m.duplicateRows, true); assert.deepEqual(m.rows.map((r) => r.breakdown.recordedTotal4), [RP(10), RP(5)]);
  assert.ok(!JSON.stringify(m).includes('gaji'), 'no salary field anywhere in the view model');
});

test('installment references: only the batch month, zero/implausible due dates reported (not guessed), missing loan parents flagged, summary of data quality', async () => {
  const { deps } = mk(world());
  const m = await readPayrollMember(deps, actor(), { docNo: 'POT202608001', nik: '00100' });
  assert.equal(m.installments.state, 'ok');
  const { window, items, orphanParents, quality, truncated } = m.installments.data;
  assert.deepEqual(window, { from: '2026-08-01', toExclusive: '2026-09-01' });
  assert.deepEqual(items.map((i) => [i.loanDocNo, i.due.kind, i.parent]), [['PIN1', 'date', 'PRESENT'], ['PIN-ORPHAN', 'date', 'MISSING']], 'zero and 9999 due dates cannot belong to a month and are not placed in one');
  assert.equal(orphanParents, 1); assert.equal(truncated, false);
  assert.deepEqual(quality, { total: 4, unpaid: 4, zeroDue: 1, missingDue: 0, implausibleDue: 1 });
  assert.equal(items[0].total4, RP(105000));
});

test('installment references: loan grant required, unusable period date -> unavailable, a failing read stays inside its own section, skewed members stay bounded', async () => {
  const w = world(); const { deps } = mk(w);
  assert.deepEqual((await readPayrollMember(deps, actor(caps('kosipa.payroll.view')), { docNo: 'POT202608001', nik: '00100' })).installments, { state: 'restricted' });
  assert.equal(w.named('memberInstallments').length, 0, 'loan data is not queried without the loan grant');
  const zeroPeriod = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT000001', periodDate: '0000-00-00' })], rows: [mrow(1, 'POT000001', '9')] });
  assert.deepEqual((await readPayrollMember(mk(zeroPeriod).deps, actor(), { docNo: 'POT000001', nik: '9' })).installments, { state: 'unavailable', reason: 'PERIOD_DATE_UNUSABLE' });
  const broken = world(); const brokenReader = { ...broken.reader, async memberInstallments() { throw new Error('timeout 1969'); } };
  const m = await readPayrollMember({ reader: brokenReader, audit: { async append() {} }, now: NOW }, actor(), { docNo: 'POT202608001', nik: '00100' });
  assert.deepEqual(m.installments, { state: 'unavailable', reason: 'READ_FAILED' }); assert.equal(m.rows.length, 1, 'recorded payroll still shown');
  const heavy = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT000001' })], rows: [mrow(1, 'POT000001', '7')], installments: Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, nik: '7', loanDocNo: `PIN${i % 100}`, installmentNo: i, dueRaw: '2026-08-15', principal: T(1), interest: T(0), total: T(1), status: 'Belum Bayar', type: null })), loans: [] });
  const h = await readPayrollMember(mk(heavy).deps, actor(), { docNo: 'POT000001', nik: '7' });
  assert.equal(h.installments.data.items.length, 50); assert.equal(h.installments.data.truncated, true); assert.equal(heavy.named('memberInstallments')[0][3], 51);
});

// ------------------------------------------------------------------------------------------------- member history
test('member history: bounded, newest first, header looked up separately so MISSING/AMBIGUOUS headers surface and no join can duplicate rows', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => mrow(i + 1, i === 3 ? 'POT-ORPHAN' : 'POT202608001', '00100', { total_potongan: T(i + 1) }));
  const w = makePayrollWorld({ headers: [hdr(5, { docNo: 'POT202608001' }), hdr(6, { docNo: 'POT202608001' })], rows });   // the same doc_no twice
  const h = await loadMemberPayrollHistory(w.reader, '00100', 500);
  assert.equal(h.length, 24, 'the caller cannot ask for more than the bound');
  assert.equal(w.named('memberHistory')[0][3], 24);
  assert.deepEqual(h.slice(0, 2).map((r) => r.id), [40, 39]);
  assert.equal(h.find((r) => r.docNo === 'POT202608001').header.state, 'AMBIGUOUS');
  assert.equal(h.find((r) => r.docNo === 'POT-ORPHAN') === undefined, true, 'row 4 is older than the bound (this is a bounded view)');
  const small = await loadMemberPayrollHistory(makePayrollWorld({ headers: [], rows: [mrow(1, 'POT-X', '9')] }).reader, '9');
  assert.equal(small[0].header.state, 'MISSING');
});

// ------------------------------------------------------------------------------------------------- reconciliation
test('reconciliation: period-level, recorded vs derived (net of returns), differences listed, return effect named only when exact, recorded values untouched', async () => {
  const w = world(); const { deps, events } = mk(w);
  const r = await readStoreReconciliation(deps, actor(), { docNo: 'POT202608001' });
  assert.equal(r.state, 'ok');
  const d = r.data;
  assert.equal(d.period, '2026-08'); assert.deepEqual(d.window, { from: '2026-07-01', toExclusive: '2026-08-01' }, 'source month = previous calendar month (BR-006)');
  assert.deepEqual(d.batches.map((b) => [b.docNo, b.status]), [['POT202608001', 'APPROVED'], ['POT202608002', 'OPEN']], 'every batch of the period takes part');
  assert.deepEqual(d.comparability, { reviewOnly: true, reasons: ['STORE_COLUMN_MAP_UNCONFIRMED', 'OPEN_BATCH_IN_PERIOD'], mapBasis: 'EMPIRICAL_UNCONFIRMED' });
  const cells = Object.fromEntries(d.rows.map((x) => [`${x.nik}|${x.column}`, x]));
  assert.equal(cells['100|TOKO_TAMBUN'], undefined, 'matching cells are counted, not listed');
  assert.deepEqual([cells['200|TOKO_TAMBUN'].status, cells['200|TOKO_TAMBUN'].difference4, cells['200|TOKO_TAMBUN'].likelyCause], ['RECORDED_HIGHER', RP(20000), 'RETURN_NOT_DEDUCTED']);
  assert.deepEqual([cells['900|TOKO_GIIC'].status, cells['900|TOKO_GIIC'].recorded4], ['DERIVED_ONLY_MEMBER_ABSENT', 0], 'Kredit sales of a member with no payroll row in the period are surfaced');
  assert.equal(d.summary.counts.MATCH, 2, 'member 100 in batch A (TAMBUN) and in batch B (MJ) both match');
  assert.equal(d.summary.recordedTotal4.TOKO_TAMBUN, RP(200000), 'recorded totals are the stored figures, summed across both batches');
  assert.ok(!d.anomalies.some((a) => a.code === 'UNMAPPED_COMPANY'));
  assert.equal(events[0].action, 'kosipa.payroll.reconcile');
  const all = await readStoreReconciliation(deps, actor(), { docNo: 'POT202608001', all: true });
  assert.ok(all.data.rows.length > d.rows.length && all.data.rows.some((x) => x.status === 'MATCH'));
  assert.equal(w.named('kreditSales')[0][2], SOURCE_ROW_CAP);
});

test('reconciliation: keyset paging over a large difference list, deterministic order, no overlap', async () => {
  const n = 130;
  const rows = Array.from({ length: n }, (_, i) => mrow(i + 1, 'POT202608001', String(20000 + i), { TOKO_TAMBUN: T(100), potongan_toko: T(100), total_potongan: T(100) }));
  const w = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT202608001' })], rows, sales: [] }); const { deps } = mk(w);
  const seen = []; let after;
  for (let i = 0; i < 5; i++) { const r = await readStoreReconciliation(deps, actor(), { docNo: 'POT202608001', after }); assert.equal(r.data.rows.length <= 50, true); seen.push(...r.data.rows.map((x) => `${x.nik}|${x.column}`)); after = r.data.nextCursor ?? undefined; if (!after) break; }
  assert.equal(seen.length, n); assert.equal(new Set(seen).size, n); assert.deepEqual(seen, [...seen].sort());
  assert.equal(await code(readStoreReconciliation(deps, actor(), { docNo: 'POT202608001', after: "1'; DROP" })), 'CURSOR_INVALID');
});

test('reconciliation: unavailable (never invented) when the period is unusable, there are no recorded rows, or the source was truncated; outages are contained', async () => {
  const zero = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT000001', periodDate: '0000-00-00' })] });
  assert.equal((await readStoreReconciliation(mk(zero).deps, actor(), { docNo: 'POT000001' })).reason, 'PERIOD_UNUSABLE');
  const mismatch = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT000001', periodMonth: '07' })] });   // date says Aug, text columns say Jul
  assert.equal((await readStoreReconciliation(mk(mismatch).deps, actor(), { docNo: 'POT000001' })).reason, 'PERIOD_UNUSABLE', 'conflicting period fields are not resolved by guessing');
  assert.equal(mismatch.named('periodRecordedStore').length, 0);
  const empty = makePayrollWorld({ headers: [hdr(1, { docNo: 'POT000001' })] });
  assert.equal((await readStoreReconciliation(mk(empty).deps, actor(), { docNo: 'POT000001' })).reason, 'NO_RECORDED_ROWS');
  const truncated = world({ salesCap: true });
  assert.equal((await readStoreReconciliation(mk(truncated).deps, actor(), { docNo: 'POT202608001' })).reason, 'SOURCE_TRUNCATED');
  const down = world(); down.failures.add('kreditSales');
  const out = await readStoreReconciliation(mk(down).deps, actor(), { docNo: 'POT202608001' });
  assert.deepEqual([out.state, out.reason], ['unavailable', 'READ_FAILED']);
  assert.equal(await readStoreReconciliation(mk(world()).deps, actor(), { docNo: 'POT999999' }), null);
});

test('reconciliation: a confirmed column map is honoured and an unmapped branch is reported, not dropped', async () => {
  const w = world({ sales: [sale(1, '00100', 1, 100000), sale(2, '00100', 7, 5000)], returns: [] });
  const confirmed = { basis: 'OWNER_CONFIRMED', byCompany: { 1: 'TOKO_TAMBUN', 2: 'TOKO_MJ', 3: 'TOKO_GIIC' } };
  const r = await readStoreReconciliation(mk(w, { storeColumnMap: confirmed }).deps, actor(), { docNo: 'POT202608001' });
  assert.deepEqual(r.data.comparability.reasons, ['OPEN_BATCH_IN_PERIOD']);
  assert.deepEqual(r.data.anomalies.map((a) => [a.code, a.count, a.amount4]), [['UNMAPPED_COMPANY', 1, RP(5000)]]);
});

// ------------------------------------------------------------------------------------------------- no writes
test('the reader contract has no write capability and the use cases only call read methods', async () => {
  const w = world(); const { deps } = mk(w);
  await listPayrollBatches(deps, actor(), {}); await readPayrollBatch(deps, actor(), { docNo: 'POT202608001' });
  await readPayrollMember(deps, actor(), { docNo: 'POT202608001', nik: '00100' }); await readStoreReconciliation(deps, actor(), { docNo: 'POT202608001' });
  const names = new Set(w.calls.map((c) => c[0]));
  for (const n of names) assert.ok(!/^(insert|update|delete|save|approve|post|generate|create|settle|set)/i.test(n), n);
  assert.deepEqual(Object.keys(w.reader).filter((n) => /^(insert|update|delete|save|approve|post|generate|create|settle|write|set)/i.test(n)), []);
});

// --------------------------------------------------------------------------------------- batch list audit (owner decision A4, checkpoint 12)
test('A4: the batch list is audited BEFORE the read, once per request, with an opaque subject and no period value, amount or member data', async () => {
  const w = makePayrollWorld({ headers: [hdr(5, { docNo: 'POT202608001', headerTotal: '12345678.9000' })] }); const order = [];
  const deps = { reader: new Proxy(w.reader, { get: (t, k) => (typeof t[k] === 'function' ? (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } : t[k]) }), audit: { async append(e) { order.push(e); } }, now: NOW };
  await listPayrollBatches(deps, actor(), { periode: '2026-08', status: 'APPROVED' });
  assert.equal(typeof order[0], 'object', 'the audit record comes first'); assert.equal(order[1], 'read:listBatches');
  assert.equal(order.filter((x) => typeof x === 'object').length, 1, 'exactly one audit event per list request (no nested duplicate)');
  const e = order[0];
  assert.deepEqual({ action: e.action, subjectType: e.subjectType, subjectId: e.subjectId, outcome: e.outcome, actorUserId: e.actorUserId, requestId: e.requestId, detail: e.detail }, { action: 'kosipa.payroll.list.view', subjectType: 'payroll', subjectId: 'payroll:list', outcome: 'success', actorUserId: 7, requestId: 'req-1', detail: { filters: 2, paged: 0 } });
  assert.ok(e.occurredAt instanceof Date);
  assert.doesNotMatch(JSON.stringify({ ...e, occurredAt: undefined }), /2026|12345678|POT2026|APPROVED/, 'no period, total, document number or status value in the audit record');
});

test('A4: audit failure stops the list (fail closed, nothing read); denial and invalid filters are neither audited nor read', async () => {
  const w = makePayrollWorld({ headers: [hdr(5)] });
  await assert.rejects(listPayrollBatches({ reader: w.reader, audit: { async append() { throw new Error('console db down'); } }, now: NOW }, actor(), {}), /console db down/);
  assert.equal(w.calls.length, 0, 'no batch header was read without an audit record');
  const { deps, events } = mk(w);
  assert.equal(await code(listPayrollBatches(deps, actor(caps('kosipa.member.view')), {})), 'FORBIDDEN');
  assert.equal(await code(listPayrollBatches(deps, actor(), { periode: '2026-13' })), 'PERIOD_INVALID');
  assert.equal(await code(listPayrollBatches(deps, actor(), { after: 'abc' })), 'CURSOR_INVALID');
  assert.deepEqual([w.calls.length, events.length], [0, 0]);
});

test('A4: every page is audited as a later page; an unexpected database error after a successful audit propagates (the authorised access stays recorded)', async () => {
  const headers = Array.from({ length: 30 }, (_, i) => hdr(i + 1, { docNo: `POT2026${String(i + 1).padStart(6, '0')}` }));
  const w = makePayrollWorld({ headers }); const { deps, events } = mk(w);
  const p1 = await listPayrollBatches(deps, actor(), {}); await listPayrollBatches(deps, actor(), { after: String(p1.nextCursor) });
  assert.deepEqual(events.map((e) => e.detail), [{ filters: 0, paged: 0 }, { filters: 0, paged: 1 }]);
  w.failures.add('listBatches');
  await assert.rejects(listPayrollBatches(deps, actor(), {}), /timeout 1969/);
  assert.equal(events.length, 3, 'the attempt was audited before the failing read');
});
