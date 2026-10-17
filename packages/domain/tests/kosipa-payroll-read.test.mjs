import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KosipaError, parseAmount4, amount4FromSen, sumAmount4, classifyLegacyDate, parsePayrollPeriod, periodColumns, periodSourceWindow, parseBatchListQuery, parseCursor, parseDocNo, parseMemberFilter,
  PAYROLL_COMPONENT_COLUMNS, STORE_COLUMNS, componentGroup, describeRow, assessBatch, deriveStoreObligations, reconcileStoreCredit, payrollStoreWindow,
} from '../src/kosipa/index.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e)); return e.code; } };
const RP = (n) => n * 10000;

test('amounts: exact 4-decimal integers; sub-sen fractions are preserved, never rounded; malformed input refused', () => {
  assert.equal(parseAmount4('1234.5600'), 12345600);
  assert.equal(parseAmount4('0.3333'), 3333, 'a fraction of a sen survives (14% of recorded totals have them)');
  assert.equal(parseAmount4('114064479.0000'), 1140644790000);
  assert.equal(parseAmount4('-5.5'), -55000, 'recorded negatives exist (2 rows) and are shown as recorded');
  assert.equal(parseAmount4('0'), 0);
  for (const bad of ['', 'abc', '1,5', '1.23456', null, undefined, '1e5', '--1', '123456789012345.00']) assert.equal(code(() => parseAmount4(bad)), 'AMOUNT_INVALID', String(bad));
  assert.equal(amount4FromSen(150), 15000);
  assert.equal(sumAmount4([1, 2, 3]), 6);
  assert.equal(code(() => sumAmount4([Number.MAX_SAFE_INTEGER, 5])), 'AMOUNT_INVALID');
});

test('legacy dates: zero, missing, impossible and absurd values are classified explicitly; real dates pass; nothing is guessed', () => {
  assert.deepEqual(classifyLegacyDate('2026-08-31'), { kind: 'date', iso: '2026-08-31' });
  assert.deepEqual(classifyLegacyDate('2026-08-31 00:00:00'), { kind: 'date', iso: '2026-08-31' });
  assert.deepEqual(classifyLegacyDate('0000-00-00'), { kind: 'zero' });
  assert.deepEqual(classifyLegacyDate('0000-00-00 00:00:00'), { kind: 'zero' });
  for (const missing of [null, undefined, '', '  ']) assert.deepEqual(classifyLegacyDate(missing), { kind: 'missing' });
  assert.deepEqual(classifyLegacyDate('9999-12-10'), { kind: 'invalid', raw: '9999-12-10' }, 'the one 9999 due date in the data');
  assert.equal(classifyLegacyDate('2026-02-30').kind, 'invalid');
  assert.equal(classifyLegacyDate('2026-13-01').kind, 'invalid');
  assert.equal(classifyLegacyDate('1899-01-01').kind, 'invalid');
  assert.equal(classifyLegacyDate('tomorrow').kind, 'invalid');
  assert.equal(classifyLegacyDate('2026-02-29').kind, 'invalid', '2026 is not a leap year');
  assert.equal(classifyLegacyDate('2028-02-29').kind, 'date');
});

test('period, status, group, cursor, document and member filters are validated; unknown values are refused, never passed on', () => {
  assert.deepEqual(parsePayrollPeriod('2026-08'), { year: 2026, month: 8 });
  assert.deepEqual(periodColumns({ year: 2026, month: 8 }), { year: '2026', month: '08' });
  for (const bad of ['2026-8', '2026-13', '2026-00', '1999-12', '2101-01', 'x', '', null, 20260801, '2026-08-01']) assert.equal(code(() => parsePayrollPeriod(bad)), 'PERIOD_INVALID', String(bad));
  assert.deepEqual(periodSourceWindow({ year: 2026, month: 8 }), { from: '2026-07-01', toExclusive: '2026-08-01' });
  assert.deepEqual(periodSourceWindow({ year: 2026, month: 1 }), { from: '2025-12-01', toExclusive: '2026-01-01' });
  assert.deepEqual(periodSourceWindow({ year: 2026, month: 8 }), payrollStoreWindow(2026, 8), 'one window rule, shared with the Checkpoint 2 domain');
  const q = parseBatchListQuery({ periode: '2026-08', status: 'APPROVED', grup: 'BMP', after: '120' });
  assert.deepEqual(q, { period: { year: 2026, month: 8 }, status: 'APPROVED', group: 'BMP', afterId: 120 });
  assert.deepEqual(parseBatchListQuery({}), { period: null, status: null, group: null, afterId: null });
  assert.deepEqual(parseBatchListQuery({ status: '', grup: '' }), { period: null, status: null, group: null, afterId: null });
  assert.equal(code(() => parseBatchListQuery({ status: "APPROVED' OR 1=1" })), 'FILTER_INVALID');
  assert.equal(code(() => parseBatchListQuery({ status: 'approved' })), 'FILTER_INVALID');
  assert.equal(code(() => parseBatchListQuery({ grup: 'ADMIN' })), 'FILTER_INVALID');
  assert.equal(code(() => parseBatchListQuery({ periode: '2026-08; DROP' })), 'PERIOD_INVALID');
  for (const bad of ['0', '-1', '1.5', '12345678901', 'abc', '1 OR 1']) assert.equal(code(() => parseCursor(bad)), 'CURSOR_INVALID', bad);
  assert.equal(parseCursor(undefined), null); assert.equal(parseCursor(''), null);
  assert.equal(parseDocNo('POT20260800001'), 'POT20260800001');
  for (const bad of ['', 'POT', "POT2026' OR '1", '../etc', 'a'.repeat(31), 42, null]) assert.equal(code(() => parseDocNo(bad)), 'DOC_NO_INVALID', String(bad));
  assert.deepEqual(parseMemberFilter('00123'), { nikKeys: ['00123', '123'], nameLike: null });
  assert.deepEqual(parseMemberFilter('Budi 50%'), { nikKeys: null, nameLike: 'Budi 50\\%' });
  assert.equal(parseMemberFilter('a'), null); assert.equal(parseMemberFilter(undefined), null);
});

test('component catalog: 59 unique columns; salary, the recorded total and the redundant TOKO subtotal are NOT components', () => {
  assert.equal(PAYROLL_COMPONENT_COLUMNS.length, 59);
  assert.equal(new Set(PAYROLL_COMPONENT_COLUMNS).size, 59);
  for (const forbidden of ['gaji_payroll', 'total_potongan', 'potongan_toko', 'id', 'nik_kar', 'nama', 'periode']) assert.ok(!PAYROLL_COMPONENT_COLUMNS.includes(forbidden), forbidden);
  for (const c of PAYROLL_COMPONENT_COLUMNS) assert.match(c, /^[A-Za-z0-9_]+$/, 'every column is a safe identifier (they are interpolated into SQL from this list only)');
  for (const c of STORE_COLUMNS) assert.ok(PAYROLL_COMPONENT_COLUMNS.includes(c));
  assert.deepEqual(['TOKO_MJ', 'PPOB', 'PIUTANG_BANK_BSM', 'JASA_PIUTANG_DANA_KOP', 'KASBON_1X_POT', 'SIMPANAN_WAJIB', 'jasa_SIMPANAN_SUKARELA', 'PBS', 'POTONGAN_SEPEDA', 'GAJI_MINUS'].map(componentGroup),
    ['toko', 'ppob', 'piutang', 'piutang', 'kasbon', 'simpanan', 'simpanan', 'simpanan', 'lainnya', 'lainnya'], 'groups follow names/DDL comments only; the rest stays unclassified');
});

const row = (over = {}) => ({ total_potongan: '1500000.0000', TOKO_TAMBUN: '200000.0000', TOKO_MJ: '0.0000', TOKO_GIIC: '0.0000', potongan_toko: '200000.0000', PPOB: '50000.0000', SIMPANAN_WAJIB: '250000.0000', PIUTANG_BANK_BSM: '1000000.0000', ...over });
test('row breakdown: non-zero components, group totals, sum check against the recorded total, redundant TOKO subtotal not double counted', () => {
  const r = describeRow(row());
  assert.deepEqual(r.components.map((c) => c.column), ['SIMPANAN_WAJIB', 'TOKO_TAMBUN', 'PPOB', 'PIUTANG_BANK_BSM'], 'fixed catalog order (DDL order), zeros hidden');
  assert.equal(r.componentSum4, RP(1500000)); assert.equal(r.recordedTotal4, RP(1500000));
  assert.equal(r.sumMatchesTotal, true); assert.equal(r.tokoSubtotalMatches, true);
  assert.deepEqual(r.groups.map((g) => [g.group, g.amount4]), [['toko', RP(200000)], ['ppob', RP(50000)], ['piutang', RP(1000000)], ['simpanan', RP(250000)]]);
  const bad = describeRow(row({ total_potongan: '1499999.9999' }));
  assert.equal(bad.sumMatchesTotal, false); assert.equal(bad.differenceFromTotal4, -1, 'the 35 inconsistent legacy rows are shown as recorded, with the difference, not "fixed"');
  assert.equal(describeRow(row({ potongan_toko: '1.0000' })).tokoSubtotalMatches, false);
  assert.equal(describeRow({ total_potongan: '0.0000' }).tokoSubtotalMatches, null);
  assert.equal(describeRow(row({ total_potongan: '1500000.3333', SIMPANAN_WAJIB: '250000.3333' })).sumMatchesTotal, true, 'sub-sen precision compares exactly');
  assert.equal(code(() => describeRow({ total_potongan: 'x' })), 'AMOUNT_INVALID');
});

const header = (over = {}) => ({ id: 1, docNo: 'POT20260800001', group: 'ANGGOTA', status: 'APPROVED', periodYear: '2026', periodMonth: '08', periodDate: '2026-08-31', docDate: '2026-09-28', cashDate: '2026-09-30', headerTotal: '3000000.0000', cashTotal: null, createdBy: 'x', updatedBy: 'y', ...over });
test('batch integrity: every anomaly measured in the data is detected and listed; nothing is repaired', () => {
  const ok = assessBatch(header(), { rowCount: 3, distinctNik: 3, rowsTotal: '3000000.0000' });
  assert.deepEqual([ok.issues, ok.status, ok.differenceFrom4], [[], 'APPROVED', 0]);
  assert.deepEqual(assessBatch(header(), { rowCount: 3, distinctNik: 3, rowsTotal: '2999000.0000' }).issues, ['HEADER_TOTAL_MISMATCH']);
  assert.equal(assessBatch(header(), { rowCount: 3, distinctNik: 3, rowsTotal: '2999000.0000' }).differenceFrom4, RP(1000));
  assert.deepEqual(assessBatch(header(), { rowCount: 3, distinctNik: 3, rowsTotal: '3000000.0049' }).issues, [], 'below half a sen is not a mismatch');
  assert.deepEqual(assessBatch(header(), { rowCount: 0, distinctNik: 0, rowsTotal: '0' }).issues, ['NO_ROWS'], 'the 3 headers without rows');
  assert.deepEqual(assessBatch(header(), { rowCount: 4, distinctNik: 3, rowsTotal: '3000000' }).issues, ['DUPLICATE_NIK_ROWS'], 'the 4 duplicated (batch, NIK) pairs');
  assert.deepEqual(assessBatch(header({ status: 'REVIEW' }), { rowCount: 1, distinctNik: 1, rowsTotal: '3000000' }).issues, ['STATUS_UNKNOWN']);
  assert.equal(assessBatch(header({ status: 'REVIEW' }), { rowCount: 1, distinctNik: 1, rowsTotal: '3000000' }).status, 'UNKNOWN');
  assert.deepEqual(assessBatch(header({ headerTotal: null }), { rowCount: 1, distinctNik: 1, rowsTotal: '1' }).issues, ['HEADER_TOTAL_MISSING']);
  assert.deepEqual(assessBatch(header({ periodDate: '0000-00-00' }), { rowCount: 1, distinctNik: 1, rowsTotal: '3000000' }).issues, ['PERIOD_DATE_INVALID']);
  assert.deepEqual(assessBatch(header({ periodMonth: '07' }), { rowCount: 1, distinctNik: 1, rowsTotal: '3000000' }).issues, ['PERIOD_COLUMNS_MISMATCH']);
  assert.deepEqual(assessBatch(header({ cashDate: '0000-00-00' }), { rowCount: 1, distinctNik: 1, rowsTotal: '3000000' }).cashDate, { kind: 'zero' }, 'a zero cash date (5 headers) is shown as such, not as a date');
  const many = assessBatch(header({ status: null, headerTotal: null }), { rowCount: 0, distinctNik: 0, rowsTotal: '0' });
  assert.deepEqual(many.issues, ['STATUS_UNKNOWN', 'NO_ROWS', 'HEADER_TOTAL_MISSING']);
});

// ------------------------------------------------------------------------------------------------- store-credit derivation
const sale = (saleId, nik, companyId, total) => ({ saleId, nik, companyId, grandTotal: `${total}.00` });
test('derivation: Kredit sales per member and branch column, net of returns; duplicates, bad NIKs and unmapped branches are reported, never summed or dropped silently', () => {
  const { derived, anomalies } = deriveStoreObligations(
    [sale(1, '00123', 1, 100000), sale(2, '123', 1, 50000), sale(3, '00123', 2, 70000), sale(2, '123', 1, 50000), sale(4, '', 1, 999), sale(5, '0', 1, 888), sale(6, null, 3, 777), sale(7, '00123', 9, 555)],
    [{ returnId: 10, saleId: 1, amount: '30000.00' }, { returnId: 11, saleId: 1, amount: '10000.00' }, { returnId: 12, saleId: 99, amount: '5.00' }],
  );
  assert.deepEqual(derived.map((d) => [d.nik, d.column, d.sales4, d.returns4, d.net4, d.anomalous]), [
    ['123', 'TOKO_MJ', RP(70000), 0, RP(70000), false],
    ['123', 'TOKO_TAMBUN', RP(150000), RP(40000), RP(110000), false],
  ], 'canonical NIK merges 00123 and 123; sale 2 counted once');
  assert.deepEqual(anomalies.map((a) => [a.code, a.count, a.amount4]), [
    ['DUPLICATE_SALE', 1, RP(50000)], ['KREDIT_SALE_INVALID_NIK', 3, RP(999 + 888 + 777)], ['RETURN_WITHOUT_SALE', 1, RP(5)], ['UNMAPPED_COMPANY', 1, RP(555)],
  ]);
});

test('derivation: a return larger than its sale makes that cell NOT comparable instead of producing a negative or clamped figure', () => {
  const { derived, anomalies } = deriveStoreObligations([sale(1, '10', 1, 1000)], [{ returnId: 1, saleId: 1, amount: '1500.00' }]);
  assert.equal(derived[0].anomalous, true);
  assert.deepEqual(anomalies.map((a) => [a.code, a.amount4]), [['RETURN_EXCEEDS_SALE', RP(500)]]);
});

const rec = (nik, t = '0', m = '0', g = '0', rows = 1) => ({ nik, amounts: { TOKO_TAMBUN: t, TOKO_MJ: m, TOKO_GIIC: g }, rows });
test('reconciliation: recorded vs derived per cell with explicit status; recorded value is never altered; return effect named only when arithmetically exact', () => {
  const { derived } = deriveStoreObligations(
    [sale(1, '100', 1, 100000), sale(2, '200', 1, 80000), sale(3, '300', 1, 60000), sale(4, '400', 2, 40000), sale(5, '500', 3, 30000), sale(6, '600', 1, 20000)],
    [{ returnId: 1, saleId: 2, amount: '30000.00' }, { returnId: 2, saleId: 3, amount: '10000.00' }],
  );
  const { rows, summary } = reconcileStoreCredit([
    rec('100', '100000.0000'),                 // matches
    rec('200', '80000.0000'),                  // recorded ignores the 30,000 return -> RECORDED_HIGHER, cause stated
    rec('300', '40000.0000'),                  // recorded lower than net 50,000, not explained by a return -> no cause
    rec('700', '1234.5600'),                   // recorded, no sales at all -> RECORDED_ONLY
    rec('500', '0', '0', '0'),                 // member in the period but column zero -> DERIVED_ONLY_RECORDED_ZERO
    rec('400', '0', '40000.0000', '0'),        // matches in the MJ column
  ], derived);
  const by = (nik) => rows.filter((r) => r.nik === nik);
  assert.deepEqual(by('100').map((r) => [r.column, r.status]), [['TOKO_TAMBUN', 'MATCH']]);
  assert.deepEqual(by('200').map((r) => [r.status, r.difference4, r.likelyCause]), [['RECORDED_HIGHER', RP(30000), 'RETURN_NOT_DEDUCTED']]);
  assert.deepEqual(by('300').map((r) => [r.status, r.difference4, r.likelyCause]), [['RECORDED_LOWER', -RP(10000), null]], 'no cause is guessed');
  assert.deepEqual(by('700').map((r) => [r.status, r.recorded4, r.derivedNet4]), [['RECORDED_ONLY', 12345600, 0]], 'sub-sen recorded value preserved');
  assert.deepEqual(by('500').map((r) => r.status), ['DERIVED_ONLY_RECORDED_ZERO']);
  assert.deepEqual(by('600').map((r) => r.status), ['DERIVED_ONLY_MEMBER_ABSENT'], 'a member with Kredit sales but no payroll row in the period is surfaced');
  assert.deepEqual(by('400').map((r) => [r.column, r.status]), [['TOKO_MJ', 'MATCH']]);
  assert.equal(summary.compared, rows.length);
  assert.deepEqual(summary.counts, { MATCH: 2, RECORDED_HIGHER: 1, RECORDED_LOWER: 1, RECORDED_ONLY: 1, DERIVED_ONLY_MEMBER_ABSENT: 1, DERIVED_ONLY_RECORDED_ZERO: 1, NOT_COMPARABLE_ANOMALY: 0 });
  assert.equal(summary.recordedTotal4.TOKO_TAMBUN, RP(100000 + 80000 + 40000) + 12345600, 'recorded totals are the legacy values, untouched');
  assert.deepEqual(rows.map((r) => `${r.nik}|${r.column}`), [...rows.map((r) => `${r.nik}|${r.column}`)].sort(), 'deterministic order');
});

test('reconciliation: duplicate recorded rows (several batches or duplicated NIK rows) are summed and flagged, unusable NIKs are reported, anomalies from derivation are carried', () => {
  const { derived, anomalies } = deriveStoreObligations([sale(1, '10', 1, 1000), sale(2, '11', 1, 500)], [{ returnId: 1, saleId: 2, amount: '800.00' }]);
  const out = reconcileStoreCredit([rec('0010', '600.0000', '0', '0', 1), rec('10', '400.0000', '0', '0', 2), rec('', '5.0000'), rec('x y', '1.0000')], derived, anomalies);
  const ten = out.rows.find((r) => r.nik === '10');
  assert.deepEqual([ten.recorded4, ten.recordedRows, ten.status], [RP(1000), 3, 'MATCH'], 'two batches / duplicate rows add up, and the row count shows it');
  assert.deepEqual(out.anomalies.map((a) => [a.code, a.count]), [['RECORDED_INVALID_NIK', 2], ['RETURN_EXCEEDS_SALE', 1]]);
  assert.equal(out.rows.find((r) => r.nik === '11').status, 'NOT_COMPARABLE_ANOMALY');
  assert.equal(out.summary.derivedTotal4.TOKO_TAMBUN, RP(1000), 'anomalous cells stay out of the derived total');
});

test('skewed data: a member with 700,000 recorded rows is aggregated exactly (no float drift, no overflow)', () => {
  const recorded = [rec('5', '123456789012.3400', '0', '0', 700000)];
  const out = reconcileStoreCredit(recorded, []);
  assert.equal(out.rows[0].recorded4, 1234567890123400); assert.ok(Number.isSafeInteger(out.rows[0].recorded4));
  assert.equal(out.rows[0].status, 'RECORDED_ONLY');
});
