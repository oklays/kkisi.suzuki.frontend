import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { listLoans, readLoan } from '../src/kosipa/loans.ts';
import { makeLoanWorld, loanHdr, inst } from './helpers/loan-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e?.stack ?? e)); return e.code; } };
const NOW = () => new Date('2026-10-17T05:00:00Z');
const actor = (caps = ['kosipa.loan.view']) => ({ userId: 7, capabilities: new Set(caps), requestId: 'req-1' });
const mk = (world) => { const events = []; return { events, deps: { reader: world.reader, audit: { async append(e) { events.push(e); } }, now: NOW } }; };
const fullSchedule = (docNo, n = 12, startId = 1000) => Array.from({ length: n }, (_, i) => inst(startId + i, docNo, i + 1, { dueRaw: `2026-${String(3 + i).padStart(2, '0')}-25`.replace(/^2026-(1[3-9]|[2-9]\d)/, (m, mm) => `2027-${String(Number(mm) - 12).padStart(2, '0')}`) }));

test('capability is required BEFORE anything is audited or read; other KOSIPA grants do not imply loans', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1)] }); const { deps, events } = mk(w);
  for (const none of [actor([]), actor(['kosipa.member.view', 'kosipa.payroll.view'])]) {
    assert.equal(await code(listLoans(deps, none, {})), 'FORBIDDEN');
    assert.equal(await code(readLoan(deps, none, { docNo: 'PIN000001' })), 'FORBIDDEN');
  }
  assert.equal(w.calls.length, 0); assert.equal(events.length, 0);
});

test('audit is written BEFORE the first read, with opaque subjects; an audit failure stops the read', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1)] }); const order = [];
  const deps = { reader: new Proxy(w.reader, { get: (t, k) => (typeof t[k] === 'function' ? (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } : t[k]) }), audit: { async append(e) { order.push(`audit:${e.action}:${e.subjectId}`); } }, now: NOW };
  await listLoans(deps, actor(), { q: '00100' }); assert.equal(order[0], 'audit:kosipa.loan.list.view:loan:list');
  order.length = 0; await readLoan(deps, actor(), { docNo: 'PIN000001' }); assert.equal(order[0], 'audit:kosipa.loan.detail.view:loan:PIN000001');
  const { deps: ok, events } = mk(w); await listLoans(ok, actor(), { q: '00100' });
  assert.ok(!JSON.stringify(events).includes('00100'), 'a searched NIK never reaches the audit record');
  const failing = makeLoanWorld({ headers: [loanHdr(1)] });
  await assert.rejects(readLoan({ reader: failing.reader, audit: { async append() { throw new Error('console db down'); } }, now: NOW }, actor(), { docNo: 'PIN000001' }), /console db down/);
  assert.equal(failing.calls.length, 0);
});

test('list: filters applied, newest first, keyset paging without overlap or gaps, malformed input refused before any query', async () => {
  const headers = Array.from({ length: 60 }, (_, i) => loanHdr(i + 1, { docStatus: i % 3 ? 'APPROVED' : 'REJECTED', repayment: i % 2 ? 'LUNAS' : 'BELUM LUNAS', nik: i % 5 ? '00100' : '00200' }));
  const w = makeLoanWorld({ headers }); const { deps } = mk(w);
  const p1 = await listLoans(deps, actor(), {}); assert.equal(p1.items.length, 25); assert.equal(p1.items[0].header.id, 60); assert.equal(p1.nextCursor, 36);
  const p2 = await listLoans(deps, actor(), { after: String(p1.nextCursor) }); const p3 = await listLoans(deps, actor(), { after: String(p2.nextCursor) });
  assert.deepEqual([...p1.items, ...p2.items, ...p3.items].map((i) => i.header.id), Array.from({ length: 60 }, (_, i) => 60 - i)); assert.equal(p3.nextCursor, null);
  assert.equal(w.named('listLoans').at(-1)[2], 26, 'one extra row, never unbounded');
  const f = await listLoans(deps, actor(), { status: 'REJECTED', bayar: 'LUNAS', q: '00200' });
  assert.ok(f.filterActive && f.items.length > 0 && f.items.every((i) => i.header.docStatus === 'REJECTED' && i.header.repayment === 'LUNAS' && i.header.nik === '00200'));
  const before = w.calls.length;
  for (const bad of [{ status: "X' OR 1=1" }, { cair: 'Z' }, { after: '-1' }, { after: '9;' }]) assert.ok(['FILTER_INVALID', 'CURSOR_INVALID'].includes(await code(listLoans(deps, actor(), bad))));
  assert.equal(w.calls.length, before);
});

test('list: the document-date month filters loans; zero / invalid dates never match a month; a bad period is refused before any query', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1, { docDate: '2026-03-10' }), loanHdr(2, { docDate: '2026-04-01' }), loanHdr(3, { docDate: '0000-00-00' }), loanHdr(4, { docDate: '9999-12-10' })] }); const { deps } = mk(w);
  assert.deepEqual((await listLoans(deps, actor(), { periode: '2026-03' })).items.map((i) => i.header.id), [1]);
  const before = w.named('listLoans').length;
  assert.equal(await code(listLoans(deps, actor(), { periode: '0000-00' })), 'PERIOD_INVALID');
  assert.equal(w.named('listLoans').length, before, 'the refused request never reached the reader');
});

test('list: contradictory status combinations are flagged as recorded, not corrected; zero/invalid dates classified', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1, { docStatus: 'REJECTED', disbursement: 'OPEN', repayment: 'LUNAS' }), loanHdr(2, { docDate: '0000-00-00', endDate: '9999-12-10' })] });
  const page = await listLoans(mk(w).deps, actor(), {});
  const by = Object.fromEntries(page.items.map((i) => [i.header.id, i]));
  assert.deepEqual(by[1].statusFlags, ['REJECTED_BUT_SETTLED']); assert.equal(by[1].header.repayment, 'LUNAS', 'the recorded value is untouched');
  assert.deepEqual([by[2].docDate.kind, by[2].endDate.kind], ['zero', 'invalid']);
});

test('detail: header + integrity + bounded schedule pages; recorded sums exact; official balance never stated', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1)], installments: fullSchedule('PIN000001') }); const { deps } = mk(w);
  const d = await readLoan(deps, actor(), { docNo: 'PIN000001' });
  assert.equal(d.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED'); assert.equal('outstanding' in d, false);
  assert.equal(d.schedule.state, 'ok'); assert.deepEqual(d.schedule.integrity.issues, []);
  assert.equal(d.schedule.integrity.recorded.principal4, 1200000 * 10000); assert.equal(d.schedule.rows.length, 12); assert.equal(d.schedule.nextCursor, null);
  assert.equal(w.named('scheduleRows')[0][3], 61, 'page size + 1');
  assert.equal(await readLoan(deps, actor(), { docNo: 'PIN999999' }), null);
});

test('detail: large schedules page by (installment no, id) with no overlap; the aggregate is computed in the reader, rows are never loaded whole', async () => {
  const rows = Array.from({ length: 180 }, (_, i) => inst(5000 + i, 'PIN000001', i + 1, { principal: '1.00', interest: '0.00', total: '1.00' }));
  const w = makeLoanWorld({ headers: [loanHdr(1, { planPrincipal: '180.00', planMonths: 180 })], installments: rows }); const { deps } = mk(w);
  const seen = []; let after;
  for (let i = 0; i < 6; i++) { const d = await readLoan(deps, actor(), { docNo: 'PIN000001', after }); assert.ok(d.schedule.rows.length <= 60); seen.push(...d.schedule.rows.map((r) => r.id)); after = d.schedule.nextCursor ?? undefined; if (!after) break; }
  assert.deepEqual(seen, rows.map((r) => r.id)); assert.equal(await code(readLoan(deps, actor(), { docNo: 'PIN000001', after: "1.2'--" })), 'CURSOR_INVALID');
});

test('detail: anomalies are named, never repaired — zero/9999 dates, duplicate numbers, missing schedule, duplicate headers, settled with unpaid rows', async () => {
  const sched = [inst(1, 'PIN000001', 1, { dueRaw: '0000-00-00' }), inst(2, 'PIN000001', 1, { dueRaw: '9999-12-10', total: '999.00' }), inst(3, 'PIN000001', 2, { dueRaw: null, status: 'Bayar', paidRaw: '0000-00-00' })];
  const w = makeLoanWorld({ headers: [loanHdr(1, { repayment: 'LUNAS' }), loanHdr(2, { docNo: 'PIN000001', docStatus: 'REJECTED' }), loanHdr(3, { docNo: 'PIN000003' })], installments: sched }); const { deps } = mk(w);
  const d = await readLoan(deps, actor(), { docNo: 'PIN000001' });
  assert.equal(d.headerCount, 2); assert.equal(d.otherHeaders.length, 1); assert.equal(d.otherHeaders[0].header.docStatus, 'REJECTED');
  const issues = d.schedule.integrity.issues;
  for (const i of ['DUPLICATE_HEADER', 'DUPLICATE_INSTALLMENT_NUMBERS', 'DUE_DATES_UNUSABLE', 'PRINCIPAL_SUM_DIFFERS_FROM_PLAN', 'ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS', 'ROW_TOTAL_DIFFERS_FROM_PRINCIPAL_PLUS_INTEREST', 'SETTLED_WITH_UNPAID_ROWS']) assert.ok(issues.includes(i), i);
  assert.equal(d.schedule.integrity.paidRowsWithoutPaidDate, 1); assert.ok(!issues.includes('PAID_ROW_WITHOUT_PAID_DATE'));
  assert.deepEqual(d.schedule.integrity.dueDates, { zero: 1, missing: 1, implausible: 1 });
  assert.deepEqual(d.schedule.rows.map((r) => r.due.kind), ['zero', 'invalid', 'missing'], 'every row is returned, with labelled dates');
  const none = await readLoan(deps, actor(), { docNo: 'PIN000003' }); assert.deepEqual(none.schedule.integrity.issues, ['SCHEDULE_ABSENT']);
});

test('outages are contained: the header still renders while the schedule is explicitly unavailable; a list outage propagates to the caller (503)', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1)], installments: fullSchedule('PIN000001') }); const { deps } = mk(w);
  w.failures.add('scheduleAggregate');
  const d = await readLoan(deps, actor(), { docNo: 'PIN000001' });
  assert.equal(d.loan.header.docNo, 'PIN000001'); assert.deepEqual(d.schedule, { state: 'unavailable', reason: 'READ_FAILED' });
  w.failures.clear(); w.failures.add('listLoans'); await assert.rejects(listLoans(deps, actor(), {}), /timeout/);
  w.failures.clear(); w.failures.add('loanHeaders'); await assert.rejects(readLoan(deps, actor(), { docNo: 'PIN000001' }), /timeout/);
});

test('a stored amount that cannot be parsed is surfaced as an error, not silently treated as zero', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1, { planPrincipal: 'oops' })] });
  assert.equal(await code(readLoan(mk(w).deps, actor(), { docNo: 'PIN000001' })), 'AMOUNT_INVALID');
});

test('the reader contract has no write capability', () => {
  const w = makeLoanWorld(); assert.deepEqual(Object.keys(w.reader).sort(), ['listLoans', 'loanHeaders', 'scheduleAggregate', 'scheduleRows']);
});

test('an installment amount that cannot be parsed is surfaced as AMOUNT_INVALID, not hidden as "unavailable" or treated as zero', async () => {
  const w = makeLoanWorld({ headers: [loanHdr(1)], installments: [inst(1, 'PIN000001', 1, { principal: 'oops' })] });
  assert.equal(await code(readLoan(mk(w).deps, actor(), { docNo: 'PIN000001' })), 'AMOUNT_INVALID');
});
