import assert from 'node:assert/strict';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { exportLoanReportCsv, exportPayrollReportCsv, exportDataQualityCsv, WindowThrottle, EXPORT_MAX_BYTES } from '../src/kosipa/report-export.ts';
import { makeReportWorld, bucket, header, aggregate } from './helpers/report-fakes.mjs';

const code = async (p) => { try { await p; return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e?.stack ?? e)); return e.code; } };
const NOW = () => new Date('2026-10-17T05:00:00Z');
const actor = (...caps) => ({ userId: 7, capabilities: new Set(caps), requestId: 'r1' });
const EXP = 'kosipa.report.export';
const LOANX = actor('kosipa.loan.view', EXP), PAYX = actor('kosipa.payroll.view', EXP), BOTHX = actor('kosipa.loan.view', 'kosipa.payroll.view', EXP);
const mk = (w, extra = {}) => { const events = []; return { events, deps: { reader: w.reader, audit: { async append(e) { events.push(e); } }, now: NOW, ...extra } }; };
const rows = (csv) => csv.trimEnd().split('\r\n');

test('export needs the export grant AND the report\'s own view grant: neither implies the other, and nothing is audited or read first', async () => {
  const w = makeReportWorld(); const { deps, events } = mk(w);
  assert.equal(await code(exportLoanReportCsv(deps, actor('kosipa.loan.view'), {})), 'FORBIDDEN', 'viewing is not exporting');
  assert.equal(await code(exportLoanReportCsv(deps, actor(EXP), {})), 'FORBIDDEN', 'the export grant alone shows nothing');
  assert.equal(await code(exportLoanReportCsv(deps, actor(EXP, 'kosipa.payroll.view'), {})), 'FORBIDDEN', 'the other report\'s grant does not help');
  assert.equal(await code(exportPayrollReportCsv(deps, LOANX, {})), 'FORBIDDEN');
  assert.equal(await code(exportDataQualityCsv(deps, actor(EXP, 'kosipa.member.view'))), 'FORBIDDEN');
  assert.equal(await code(exportDataQualityCsv(deps, actor('kosipa.loan.view', 'kosipa.payroll.view'))), 'FORBIDDEN');
  assert.equal(w.calls.length, 0); assert.equal(events.length, 0);
});

test('invalid filters are refused before the rate limit, the audit and any read', async () => {
  const w = makeReportWorld(); const { deps, events } = mk(w, { throttle: new WindowThrottle(1, 60000) });
  for (const bad of ['26', "2026' OR 1=1", '3000', 'abcd']) assert.equal(await code(exportLoanReportCsv(deps, LOANX, { tahun: bad })), 'PERIOD_INVALID', bad);
  assert.equal(await code(exportPayrollReportCsv(deps, PAYX, { tahun: '1' })), 'PERIOD_INVALID');
  assert.equal(w.calls.length, 0); assert.equal(events.length, 0);
  assert.deepEqual(deps.throttle.consume(7), { allowed: true }, 'refused requests did not consume the user\'s allowance');
});

test('the export is audited BEFORE the first read (opaque subject, no data); an audit failure stops everything', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-03', 'APPROVED', 'LUNAS', 1, '100.00')] }); const order = [];
  const deps = { reader: new Proxy(w.reader, { get: (t, k) => (...a) => { order.push(`read:${String(k)}`); return t[k](...a); } }), audit: { async append(e) { order.push(`audit:${e.action}:${e.subjectId}:${e.outcome}`); } }, now: NOW };
  await exportLoanReportCsv(deps, LOANX, {}); assert.equal(order[0], 'audit:kosipa.report.export:report:loan:success');
  order.length = 0; await exportPayrollReportCsv(deps, PAYX, {}); assert.equal(order[0], 'audit:kosipa.report.export:report:payroll:success');
  order.length = 0; await exportDataQualityCsv(deps, BOTHX); assert.equal(order[0], 'audit:kosipa.report.export:report:quality:success');
  const f = makeReportWorld();
  await assert.rejects(exportLoanReportCsv({ reader: f.reader, audit: { async append() { throw new Error('console db down'); } }, now: NOW }, LOANX, {}), /console db down/);
  assert.equal(f.calls.length, 0, 'no financial row was read when the export could not be audited');
});

test('rate limit: the allowance is per user and per window; a refusal is audited as denied and reads nothing', async () => {
  let t = 0; const throttle = new WindowThrottle(2, 60_000, () => t); const w = makeReportWorld(); const { deps, events } = mk(w, { throttle });
  await exportLoanReportCsv(deps, LOANX, {}); await exportLoanReportCsv(deps, LOANX, {});
  const calls = w.calls.length;
  assert.equal(await code(exportLoanReportCsv(deps, LOANX, {})), 'EXPORT_RATE_LIMITED');
  assert.equal(w.calls.length, calls, 'nothing was read for the refused export');
  assert.deepEqual(events.at(-1).outcome, 'denied'); assert.equal(events.at(-1).detail.reason, 'rate_limited');
  await exportLoanReportCsv(deps, { ...LOANX, userId: 8 }, {});   // another user is unaffected
  t = 61_000; await exportLoanReportCsv(deps, LOANX, {});          // the window has passed
  assert.deepEqual(new WindowThrottle(1, 1000, () => 0).consume(1), { allowed: true });
  const th = new WindowThrottle(1, 90_000, () => 10_000); th.consume(1); assert.deepEqual(th.consume(1), { allowed: false, retryAfterSec: 90 });
});

test('loan CSV: exact decimals (sub-sen kept), unusable dates labelled, official balance stated as unavailable, deterministic', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-03', 'APPROVED', 'BELUM LUNAS', 2, '2000000.25'), bucket('2026-03', 'REJECTED', 'BELUM LUNAS', 1, '300000.00'), bucket('ZERO', 'REJECTED', 'LUNAS', 1, '500000.00'), bucket('IMPLAUSIBLE', null, null, 1, '1.00')] });
  const f = await exportLoanReportCsv(mk(w).deps, LOANX, {});
  assert.equal(f.filename, 'laporan-pinjaman-2026.csv'); assert.equal(f.contentType, 'text/csv; charset=utf-8');
  const r = rows(f.body);
  assert.ok(r.some((l) => l.startsWith('saldo_resmi,"TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED)')));
  assert.ok(r.includes('BULAN,2026-03,APPROVED,BELUM LUNAS,2,2000000.25'));
  assert.ok(r.includes('TANGGAL_TIDAK_DAPAT_DIPAKAI,ZERO,,,1,500000.00'), 'unusable-date rows carry no status columns and are not placed in a month');
  assert.ok(r.includes('TANGGAL_TIDAK_DAPAT_DIPAKAI,IMPLAUSIBLE,,,1,1.00')); assert.equal(f.rows, 4);
  assert.equal((await exportLoanReportCsv(mk(w).deps, LOANX, {})).body, f.body, 'same input, same bytes');
});

test('formula injection: statuses and references from the legacy data can never execute in a spreadsheet', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-03', '=HYPERLINK("http://evil","x")', '+cmd|calc', 1, '1.00')], headers: [header('=2+5', { group: '@SUM(1)' })], aggregates: [aggregate('=2+5')] });
  const loan = (await exportLoanReportCsv(mk(w).deps, LOANX, {})).body; assert.ok(loan.includes(`'=HYPERLINK`) && loan.includes(`'+cmd`), loan);
  const pay = (await exportPayrollReportCsv(mk(w).deps, PAYX, {})).body;
  assert.ok(pay.includes(`'=2+5`) && pay.includes(`'@SUM(1)`), pay);
  for (const body of [loan, pay]) for (const line of rows(body)) for (const cell of line.split(',')) assert.doesNotMatch(cell.replace(/^"/, ''), /^[=+@]/, `unneutralised cell in: ${line}`);
});

test('payroll CSV: recorded figures exact, unknown period and review-only comparison labelled, header/detail difference kept', async () => {
  const headers = [header('A', { headerTotal: '1000.0000' }), header('B', { periodMonth: null, headerTotal: '5.0000' })];
  const w = makeReportWorld({ headers, aggregates: [aggregate('A', { rowsTotal: '1000.0000' }), aggregate('B', { rowsTotal: '1000.0000', rowCount: 1, distinctNik: 1, componentTotals: { TOKO_TAMBUN: '1000.0000' } })] });
  const f = await exportPayrollReportCsv(mk(w).deps, PAYX, {}); const r = rows(f.body);
  assert.ok(r.some((l) => l.startsWith('perbandingan_toko,hanya untuk ditinjau')));
  const a = r.find((l) => l.includes(',A,')); const b = r.find((l) => l.includes(',B,'));
  assert.ok(a.startsWith('2026-08,YA,A,ANGGOTA,APPROVED,2,2,1000.00,1000.00,0.00,'), a);
  assert.ok(b.startsWith('UNKNOWN,TIDAK,B,'), b); assert.ok(b.includes(',5.00,1000.00,-995.00,HEADER_TOTAL_MISMATCH'), b);
  assert.equal(f.rows, 2);
});

test('data-quality CSV: a failed, truncated or restricted scan is never written as zero; no NIK or member data appears', async () => {
  const w = makeReportWorld({ dupRefs: [{ docNo: 'D1', count: 2, statusCombinations: 2 }], rowTotals: { rows: 10, totalDiffersFromComponents: 7, totalDiffersByHalfSenOrMore: 2, maxDifference: '0.0100', totalWithoutComponents: 1, sample: [{ docNo: 'A', nik: '00100', total: '5.0000', componentSum: '4.0000' }] },
    dupNik: [{ docNo: 'A', nik: '00100', count: 2 }], allHeaders: [header('A')], allAggregates: [aggregate('A')] });
  w.failures.add('installmentDateProblems'); w.failures.add('installmentDocs');
  const f = await exportDataQualityCsv(mk(w).deps, BOTHX); const r = rows(f.body);
  const line = (name) => r.find((l) => l.includes(name));
  assert.ok(line('tanggal jatuh tempo angsuran tidak valid').includes('CONFIRMED,GAGAL_BACA,,,,'), 'failed scan: empty count, not 0');
  assert.ok(line('angsuran tanpa dokumen pinjaman').includes('POTENTIAL,GAGAL_BACA,,,,'));
  assert.ok(line('nomor dokumen pinjaman ganda').includes('CONFIRMED,OK,1,,D1,'), 'successful scan: the count and the reference');
  assert.ok(line('(>= setengah sen)').startsWith('PAYROLL,total baris berbeda dari jumlah komponen (>= setengah sen),CONFIRMED,OK,2,'));
  assert.ok(line('tingkat sub-sen').includes('EXPECTED_PRECISION,OK,5,'), 'sub-sen = 7 - 2 = 5 is classified as expected precision');
  assert.ok(line('pemetaan cabang').includes('UNVERIFIED,BELUM_DIVERIFIKASI'));
  assert.ok(!f.body.includes('00100'), 'no NIK in any export');
  const loanOnly = await exportDataQualityCsv(mk(makeReportWorld()).deps, LOANX);
  assert.ok(loanOnly.body.split('\r\n').some((l) => l.startsWith('PAYROLL,') && l.includes('DIBATASI,,,,')), 'a section the user may not read is marked restricted, not zero');
});

test('large results are refused with an explicit limit, never truncated silently or streamed unbounded', async () => {
  const many = Array.from({ length: 600 }, (_, i) => bucket(`2026-${String((i % 12) + 1).padStart(2, '0')}`, `S${i}`, 'LUNAS', 1, '1.00'));
  assert.equal(await code(exportLoanReportCsv(mk(makeReportWorld({ loanBuckets: many })).deps, LOANX, {})), 'EXPORT_TOO_LARGE', 'the statement LIMIT was reached: the result may be incomplete');
  const wide = Array.from({ length: 599 }, (_, i) => bucket(`2026-${String((i % 12) + 1).padStart(2, '0')}`, `S${i}`.padEnd(2000, 'x'), 'LUNAS', 1, '1.00'));
  assert.equal(await code(exportLoanReportCsv(mk(makeReportWorld({ loanBuckets: wide })).deps, LOANX, {})), 'EXPORT_TOO_LARGE', `larger than ${EXPORT_MAX_BYTES} bytes`);
});

test('malformed stored amounts abort the export with a data error, never a silent zero or a partial file', async () => {
  const w = makeReportWorld({ loanBuckets: [bucket('2026-01', 'APPROVED', 'LUNAS', 1, 'oops')] });
  assert.equal(await code(exportLoanReportCsv(mk(w).deps, LOANX, {})), 'AMOUNT_INVALID');
});

test('a result with more rows than the export cap is refused even when the reader did not hit its own limit', async () => {
  const w = makeReportWorld(); const hs = Array.from({ length: 5001 }, (_, i) => header(`H${i}`));
  w.reader.payrollHeadersForYear = async () => hs; w.reader.payrollAggregates = async () => [];
  assert.equal(await code(exportPayrollReportCsv(mk(w).deps, PAYX, {})), 'EXPORT_TOO_LARGE');
});

test('the limiter is in-memory per instance: two instances each grant the full budget (effective limit = budget x instances), and a restart empties it — the documented reason a shared limiter is required before running more than one process', () => {
  let t = 0; const a = new WindowThrottle(2, 60_000, () => t), b = new WindowThrottle(2, 60_000, () => t);
  assert.deepEqual([a.consume(7).allowed, a.consume(7).allowed, a.consume(7).allowed], [true, true, false], 'instance A: 2 allowed, 3rd refused');
  assert.deepEqual([b.consume(7).allowed, b.consume(7).allowed, b.consume(7).allowed], [true, true, false], 'instance B starts with an empty window for the SAME user');
  const restarted = new WindowThrottle(2, 60_000, () => t); assert.equal(restarted.consume(7).allowed, true, 'a restart forgets earlier exports');
  t = 61_000; assert.equal(a.consume(7).allowed, true, 'the window slides: the budget returns after windowMs');
});

test('a refused or failed export attempt still consumes the user\'s own budget only (users do not share a window)', () => {
  let t = 0; const th = new WindowThrottle(1, 60_000, () => t);
  assert.equal(th.consume(1).allowed, true); assert.equal(th.consume(1).allowed, false); assert.equal(th.consume(2).allowed, true, 'another user is unaffected');
});
