import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compact4, NOT_AVAILABLE, parseWholeRupiah, rupiah4, rupiahDec, rupiahSen, senOf } from '../../src/lib/utils/money.ts';
import { businessMonth, dayLabel, monthLong, titleCase } from '../../src/lib/utils/dates.ts';
import { buildActiveDeductions, buildMovements, buildSavingsSummary } from '../../src/features/savings/services/savings.ts';
import { buildLoanProducts, installmentStatus, installmentWindow, loanHistoryStatus, simulateLoan } from '../../src/features/loans/services/loans.ts';
import { buildStoreCredit } from '../../src/features/store-credit/services/store-credit.ts';
import { applyTxFilter, buildTransactions, parseTxFilter } from '../../src/features/transactions/services/transactions.ts';
import { parseCartIds, parseCatalogParams } from '../../src/features/catalog/services/catalog.ts';
import { validateDeductionChange } from '../../src/features/deductions/services/deduction-change.ts';
import { buildShuYears } from '../../src/features/shu/services/shu.ts';
import { activeNav } from '../../src/lib/navigation/routes.ts';
import { ppobService, normaliseAccount } from '../../src/features/ppob/services/ppob.ts';
import { buildActiveLoan } from '../../src/features/loans/services/loans.ts';
import { buildDeductionPeriods } from '../../src/features/deductions/services/deductions.ts';
import { PAYROLL_COMPONENT_COLUMNS } from '@koperasi/domain/kosipa';

test('money: exact id-ID formatting, missing is never zero', () => {
  assert.equal(rupiah4(12_500_000_000), 'Rp1.250.000');
  assert.equal(rupiahSen(129_166_600), 'Rp1.291.666');
  assert.equal(rupiahDec('1250000.50'), 'Rp1.250.000,50');
  assert.equal(compact4(25_000_000_000), 'Rp2,5 juta');
  for (const f of [rupiah4, rupiahSen, rupiahDec, compact4]) assert.equal(f(null), NOT_AVAILABLE);
  assert.equal(senOf('0.10'), 10); assert.equal(senOf('1990000.0000'), 199_000_000); assert.equal(senOf('-5.5'), -550);
  assert.throws(() => senOf('1e5'));
  assert.equal(parseWholeRupiah('Rp150.000'), 150000); assert.equal(parseWholeRupiah('150000'), 150000);
  assert.equal(parseWholeRupiah('150.00'), null); assert.equal(parseWholeRupiah('15,000'), null); assert.equal(parseWholeRupiah('-1'), null);
});

test('dates: Jakarta business month and legacy dates', () => {
  assert.equal(businessMonth(new Date('2026-10-31T17:30:00Z')).key, '2026-11', '00:30 WIB on 1 Nov is November');
  assert.deepEqual(businessMonth(new Date('2026-12-15T00:00:00Z'), 1), { key: '2027-01', start: '2027-01-01', endExclusive: '2027-02-01' });
  assert.equal(dayLabel('2026-11-05'), '5 Nov 2026');
  assert.equal(dayLabel('0000-00-00'), 'Tanggal tidak tercatat');
  assert.equal(monthLong('2026-10'), 'Oktober 2026');
  assert.equal(titleCase('KASBON 1X POT'), 'Kasbon 1x Pot');
  assert.equal(titleCase('PBS'), 'PBS');
});

test('savings: only APPROVED movements are summed; pending and unverified kept apart', () => {
  const s = buildSavingsSummary([
    { type: 'SIMPANAN SUKARELA', headerStatus: 'APPROVED', credit: '700000.00', debit: '100000.00', interest: '0.00', rows: 6 },
    { type: 'SIMPANAN SUKARELA', headerStatus: 'OPEN', credit: '50000.00', debit: '0.00', interest: '0.00', rows: 1 },
    { type: 'SIMPANAN WAJIB', headerStatus: 'APPROVED', credit: '1500000.00', debit: '0.00', interest: '0.00', rows: 5 },
    { type: 'PBS', headerStatus: 'MISSING_HEADER', credit: '999.00', debit: '0.00', interest: '0.00', rows: 1 },
  ]);
  assert.deepEqual(s.types.map((t) => t.type), ['SIMPANAN WAJIB', 'SIMPANAN SUKARELA', 'PBS']);
  assert.equal(s.totalRecorded4, 2_100_000 * 10_000);
  assert.equal(s.types[1].pending4, 50_000 * 10_000);
  assert.equal(s.hasUnverified, true);
  const m = buildMovements([{ id: 2, docNo: 'D1', type: 'SIMPANAN SUKARELA', credit: '0.00', cashCredit: '0.00', debit: '100000.00', interest: '0.00', detailStatus: 'APPROVED', remark: null }],
    [{ docNo: 'D1', headerCount: 1, header: { docDate: '2026-09-25', status: 'APPROVED', kind: 'PENARIKAN' } }]);
  assert.equal(m[0].direction, 'out'); assert.equal(m[0].state, 'POSTED'); assert.equal(m[0].amount4, -100_000 * 10_000);
  assert.equal(buildMovements([{ ...m[0], id: 3, docNo: 'D9', credit: '1.00', cashCredit: '0.00', debit: '0.00', interest: '0.00', detailStatus: null, remark: null }], [])[0].state, 'UNVERIFIED');
  const d = buildActiveDeductions([
    { id: 9, type: 'SIMPANAN WAJIB', payroll: '150000.00', previous: '100000.00', status: 1, periodStart: '2026-12-01', periodEnd: null },
    { id: 3, type: 'SIMPANAN WAJIB', payroll: '100000.00', previous: '0.00', status: 1, periodStart: null, periodEnd: null },
    { id: 2, type: 'PBS', payroll: '25000.00', previous: '0.00', status: 0, periodStart: null, periodEnd: null },
  ]);
  assert.deepEqual(d.map((x) => [x.type, x.monthlySen]), [['SIMPANAN WAJIB', 15_000_000]], 'latest active row per type; inactive rows ignored');
});

test('loans: installment status words, window, history status, simulation from the master', () => {
  assert.equal(installmentStatus('Bayar', '2026-10', '2026-11'), 'paid');
  assert.equal(installmentStatus('Belum Bayar', '2026-11', '2026-11'), 'waiting');
  assert.equal(installmentStatus('Belum Bayar', '2026-09', '2026-11'), 'overdue');
  assert.equal(installmentStatus('Belum Bayar', '2026-12', '2026-11'), 'scheduled');
  const items = [1, 2, 3, 4].map((no) => ({ id: no, no, month: '', total4: 0, principal4: 0, interest4: 0, status: no <= 2 ? 'paid' : no === 3 ? 'waiting' : 'scheduled' }));
  assert.deepEqual(installmentWindow(items).map((i) => i.no), [2, 3, 4]);
  assert.equal(loanHistoryStatus({ docStatus: 'REJECTED', disbursement: 'OPEN', repayment: 'BELUM LUNAS' }).label, 'Ditolak');
  const products = buildLoanProducts([{ id: 1, name: 'PINJAMAN REGULAR', minAmount: '1000000.00', maxAmount: '50000000.00', minMonths: 6, maxMonths: 60, ratePercent: '1', method: 'Flat' },
    { id: 2, name: 'DANA X', minAmount: '1.00', maxAmount: '2.00', minMonths: 1, maxMonths: 1, ratePercent: 'abc', method: null }]);
  const ok = simulateLoan(products, { productId: 1, amountRp: 25_000_000, months: 24 });
  assert.equal(ok.ok, true); assert.equal(ok.interestSen, 25_000_000); assert.equal(ok.firstInstallmentSen, 129_166_600); assert.equal(ok.totalSen, 3_100_000_000);
  assert.equal(simulateLoan(products, { productId: 1, amountRp: 60_000_000, months: 24 }).field, 'amount');
  assert.equal(simulateLoan(products, { productId: 1, amountRp: 5_000_000, months: 3 }).field, 'months');
  assert.equal(simulateLoan(products, { productId: 2, amountRp: 1, months: 1 }).field, 'rate', 'unknown rate is never guessed');
});

test('store credit: POS rule (gaji_minus first), never negative usage, ineligible members', () => {
  const p = { id: 1, nik: '10234', name: 'X', status: 'AKTIVE', employment: 'TETAP', exitOn: null, limitToko: '5000000.00', gajiMinus: '0.00' };
  const c = buildStoreCredit(p, { spent: '550000.00', returned: '50000.00' }, new Date('2026-11-09T00:00:00Z'));
  assert.deepEqual([c.limitSen, c.usedSen, c.remainingSen, c.usedPercent], [500_000_000, 50_000_000, 450_000_000, 10]);
  assert.equal(buildStoreCredit({ ...p, gajiMinus: '2000000.00' }, { spent: '0', returned: '0' }, new Date()).limitSen, 200_000_000);
  assert.equal(buildStoreCredit(p, { spent: '10.00', returned: '50.00' }, new Date()).usedSen, 0);
  assert.equal(buildStoreCredit({ ...p, status: 'RESIGN' }, { spent: '0', returned: '0' }, new Date()).eligible, false);
  assert.equal(buildStoreCredit({ ...p, employment: 'KONTRAK', exitOn: '2026-01-01' }, { spent: '0', returned: '0' }, new Date('2026-11-09')).reason, 'MEMBER_EXPIRED');
});

test('transactions: merge, status mapping, URL filters', () => {
  const tx = buildTransactions(
    [{ id: 1, code: 'S1', date: '2026-11-05', total: '200000.00', status: 'Final', paymentType: 'Kredit', store: 'TOKO S-MART TB II', companyId: 1, ppob: false, ppobType: null }],
    [{ id: 7, code: 'O7', date: '2026-11-06', amount: '102000.00', status: 'pending', paymentStatus: 'paid', ppob: true, ppobType: 'PLN', inProcess: true }],
  );
  assert.deepEqual(tx.map((t) => [t.kind, t.status]), [['PPOB', 'Diproses'], ['Pesanan Toko', 'Selesai']]);
  assert.equal(applyTxFilter(tx, parseTxFilter({ jenis: 'PPOB' })).length, 1);
  assert.equal(applyTxFilter(tx, parseTxFilter({ periode: 'Okt 2026' })).length, 0);
});

test('catalog params, cart ids, deduction rules, SHU, navigation, PPOB validation', () => {
  assert.deepEqual(parseCatalogParams({ q: 'b', urut: 'DROP', n: '9999' }), { q: '', category: null, sort: 'name', shown: 240 });
  assert.equal(parseCatalogParams({ n: '30' }).shown, 48);
  assert.deepEqual(parseCartIds('1:2,1:3,x:1,5:0,6:100,7:99'), [{ id: 1, quantity: 3 }, { id: 7, quantity: 99 }]);
  const wajib = { type: 'SIMPANAN WAJIB', label: 'Simpanan Wajib', monthlySen: 10_000_000 };
  assert.match(validateDeductionChange(wajib, '100.000'), /lebih besar/);
  assert.equal(validateDeductionChange(wajib, 'Rp150.000'), null);
  assert.match(validateDeductionChange({ ...wajib, type: 'SIMPANAN SUKARELA' }, '100.000'), /sama/);
  assert.equal(validateDeductionChange({ ...wajib, type: 'SIMPANAN SUKARELA' }, '25.000'), null, 'sukarela may go down');
  const shu = buildShuYears([{ docNo: 'A', year: '2024', values: { jasa_simpanan: '1', jasa_transaksi_usaha: '2', total_shu: '3', total_shu_pembulatan: '3', jasa_simpanan_sukarela: '0', pembulatan_sukarela: '0', pendapatan_shu: '3' } },
    { docNo: 'B', year: '2025', values: { jasa_simpanan: '310000', jasa_transaksi_usaha: '125000', total_shu: '435000', total_shu_pembulatan: '435000', jasa_simpanan_sukarela: '40000', pembulatan_sukarela: '40000', pendapatan_shu: '475000' } }]);
  assert.deepEqual(shu.map((y) => y.year), ['2025', '2024']);
  assert.equal(activeNav('/simpanan'), '/beranda'); assert.equal(activeNav('/transaksi'), '/transaksi'); assert.equal(activeNav('/unknown'), '/beranda');
  assert.ok(ppobService('pulsa').pattern.test(normaliseAccount('0812-3456 7890')));
  assert.ok(!ppobService('token').pattern.test('1234'));
});

test('WS-04 financial reconciliation: Anuitas vs Flat loan schedule, schedule integrity issues, and payroll sub-sen precision', () => {
  // 1. Anuitas simulation and invariant: sum(principalSen + interestSen) == totalSen
  const products = buildLoanProducts([
    { id: 1, name: 'PINJAMAN ANUITAS', minAmount: '1000000.00', maxAmount: '50000000.00', minMonths: 6, maxMonths: 60, ratePercent: '1.5', method: 'Anuitas' },
  ]);
  const sim = simulateLoan(products, { productId: 1, amountRp: 12_000_000, months: 12 });
  assert.equal(sim.ok, true);
  assert.equal(sim.method, 'Anuitas');
  assert.equal(sim.rateBp, 150);
  assert.equal(sim.principalSen + sim.interestSen, sim.firstInstallmentSen);

  // 2. Schedule integrity issues surfaced from @koperasi/domain assessSchedule (zero due dates, implausible year 9999, count mismatch)
  const header = {
    id: 10, docNo: 'PJ-ERR-1', docDate: '2026-01-01', type: 'PINJAMAN REGULAR', method: 'Flat', rate: '1.00', nik: '10234', name: 'UJI', financier: 'KOPERASI',
    docStatus: 'APPROVED', disbursement: 'APPROVED', repayment: 'BELUM LUNAS',
    planPrincipal: '12000000.00', actualPrincipal: '0.00', planInstallment: '1120000.00', actualInstallment: '0.00',
    planMonths: 12, actualMonths: 0, startDate: '2026-01-25', endDate: '2026-12-25', disbursedDate: '2026-01-05', disbursedAmount: '12000000.00',
    adminFee: '0.00', insuranceFee: '0.00', totalDeduction: '0.00', totalReceived: '12000000.00',
    settlementStatus: null, settlementDate: null, settlementTotal: '0.00', rollOver: 'NO',
  };
  const aggregate = {
    rows: 10, distinctNo: 10, minNo: 1, maxNo: 10,
    principalSum: '10000000.00', interestSum: '1200000.00', totalSum: '11200000.00',
    paidRows: 5, unpaidRows: 5, otherStatusRows: 0,
    paidPrincipal: '5000000.00', unpaidPrincipal: '5000000.00', unpaidTotal: '5600000.00',
    zeroDue: 1, missingDue: 0, implausibleDue: 1, componentMismatch: 0, paidWithoutPaidDate: 1,
  };
  const active = buildActiveLoan(header, aggregate, [
    { id: 1, installmentNo: 6, dueRaw: '0000-00-00', paidRaw: null, principal: '1000000.00', interest: '120000.00', total: '1120000.00', status: 'Belum Bayar', type: 'PAYROLL', blocked: 0, rollOver: 0, cicilanDocNo: '0' },
    { id: 2, installmentNo: 7, dueRaw: '9999-12-10', paidRaw: null, principal: '1000000.00', interest: '120000.00', total: '1120000.00', status: 'Belum Bayar', type: 'PAYROLL', blocked: 0, rollOver: 0, cicilanDocNo: '0' },
  ], '2026-11');
  assert.ok(active.scheduleIssues.includes('ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS'));
  assert.ok(active.scheduleIssues.includes('PRINCIPAL_SUM_DIFFERS_FROM_PLAN'));
  assert.ok(active.scheduleIssues.includes('DUE_DATES_UNUSABLE'));
  assert.equal(active.installments[0].month, 'Tanggal tidak tercatat');
  assert.equal(active.installments[1].month, 'Tanggal tidak tercatat');

  // 3. Payroll matrix reconciliation with 4-decimal sub-sen amounts (e.g. 0.1000 Rp = 1000 in amount4)
  const zeroAmounts = Object.fromEntries([...PAYROLL_COMPONENT_COLUMNS, 'total_potongan', 'potongan_toko'].map((c) => [c, '0.0000']));
  const rowAmounts = {
    ...zeroAmounts,
    SIMPANAN_WAJIB: '100000.0000',
    SIMPANAN_SUKARELA: '50000.1000',
    PIUTANG_DANA_KOP: '500000.0000',
    TOKO_TAMBUN: '250000.0000',
    potongan_toko: '250000.0000',
    total_potongan: '900000.1000',
  };
  const payrollRows = [{ id: 1, docNo: 'POT-202610', total: rowAmounts.total_potongan, toko: { TOKO_TAMBUN: '250000.0000', TOKO_MJ: '0.0000', TOKO_GIIC: '0.0000' }, amounts: rowAmounts }];
  const appHistory = [{ id: 1, docNo: 'POT-202610', header: { state: 'OK', period: '2026-10', status: 'APPROVED' }, total4: 9_000_001_000, toko4: 2_500_000_000 }];
  const periods = buildDeductionPeriods(appHistory, payrollRows);
  assert.equal(periods[0].status.label, 'Selesai');
  assert.equal(periods[0].total4, 9_000_001_000);
  assert.equal(periods[0].totalMatches, true);
  assert.equal(periods[0].components.find((c) => c.key === 'SIMPANAN_SUKARELA')?.amount4, 500_001_000);
});
