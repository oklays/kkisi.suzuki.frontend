import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaKosipaReportReader } from '../src/infrastructure/repositories/kosipa-report.repository.ts';
import { readLoanReport, readPayrollReport, readDataQuality } from '@koperasi/application/kosipa/reports';

// Opt-in: the real SQL report adapter against the SYNTHETIC schema kkisi_e2e_legacy (scripts/e2e-seed.mjs) through the SELECT-only e2e account.
//   KOSIPA_REPORTS_DB_TEST=1 node --experimental-strip-types --env-file=.env.e2e --test tests/kosipa-reports-db.test.mjs
const ON = process.env.KOSIPA_REPORTS_DB_TEST === '1';
const RP = (n) => Math.round(n * 10000);
const actor = { userId: 1, capabilities: new Set(['kosipa.loan.view', 'kosipa.payroll.view']), requestId: 'db-test' };

test('synthetic schema: loan report, payroll report and every data-quality diagnostic over the real SQL adapter', { skip: !ON }, async () => {
  const url = new URL(process.env.E2E_READ_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.equal(url.pathname, '/kkisi_e2e_legacy'); assert.equal(decodeURIComponent(url.username), 'kkisi_e2e_read');
  const db = new PrismaClient({ datasourceUrl: process.env.E2E_READ_URL });
  const events = []; const deps = { reader: new PrismaKosipaReportReader(db), audit: { async append(e) { events.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z') };
  try {
    // ---- loan report
    const lr = await readLoanReport(deps, actor, {});
    assert.deepEqual([lr.report.year, lr.report.years], [2026, [2026]]);
    assert.deepEqual(lr.report.months.map((m) => [m.bucket, m.count, m.plan4]), [['2026-03', 5, RP(3400000)], ['2026-08', 1, RP(12000000)]]);
    assert.deepEqual(lr.report.months[0].lines.map((l) => [l.docStatus, l.repayment, l.count, l.plan4]), [['APPROVED', 'BELUM LUNAS', 4, RP(3100000)], ['REJECTED', 'BELUM LUNAS', 1, RP(300000)]]);
    assert.deepEqual(lr.report.unusableDates.map((u) => [u.kind, u.count, u.plan4]), [['ZERO', 1, RP(500000)]], 'a zero document date is counted apart, never placed in a month');
    assert.equal(lr.officialBalance.reason, 'OFFICIAL_BALANCE_UNVERIFIED');
    assert.equal((await readLoanReport(deps, actor, { tahun: '2024' })).report.months.length, 0);
    // ---- payroll report
    const pr = await readPayrollReport(deps, actor, {});
    assert.deepEqual(pr.periods.map((p) => p.period), ['2026-08', '2026-07', '2026-06', '2026-05', '2026-04']);
    const aug = pr.periods[0]; assert.deepEqual([aug.batches.length, aug.rows, aug.rowsTotal4, aug.openBatches, aug.reconcilable], [2, 3, RP(290000), 1, true]);
    assert.deepEqual(aug.groups.map((g) => [g.group, g.amount4]), [['toko', RP(240000)], ['ppob', RP(50000)]]); assert.deepEqual(aug.toko4, { TOKO_TAMBUN: RP(200000), TOKO_MJ: RP(40000), TOKO_GIIC: 0 });
    assert.ok(pr.periods[1].batches[0].issues.includes('DUPLICATE_NIK_ROWS')); assert.ok(pr.periods[2].batches[0].issues.includes('NO_ROWS'));
    assert.ok(pr.periods[3].batches[0].issues.includes('HEADER_TOTAL_MISMATCH') && pr.periods[3].batches[0].issues.includes('STATUS_UNKNOWN'));
    assert.equal(pr.headersWithoutRows, 1); assert.ok(!JSON.stringify(pr).includes('12345678'), 'salary is never selected');
    // ---- data quality
    const q = await readDataQuality(deps, actor);
    for (const part of [...Object.values(q.loans), ...Object.values(q.payroll)]) assert.equal(part.state, 'ok');
    assert.deepEqual([q.loans.duplicateRefs.data.total, q.loans.duplicateRefs.data.conflictingStatuses, q.loans.duplicateRefs.data.sample[0].docNo], [1, 1, 'PINSYN9005']);
    assert.deepEqual(q.loans.statusConflicts.data.counts, { rejectedSettled: 1, rejectedDisbursed: 0, settledNotApproved: 0, disbursedNotApproved: 0 }); assert.equal(q.loans.statusConflicts.data.sample[0].docNo, 'PINSYN9004');
    assert.deepEqual(q.loans.loanDates.data, { total: 7, zero: 1, missing: 0, implausible: 0 });
    assert.deepEqual(q.loans.installmentDates.data, { total: 90, zero: 1, missing: 0, implausible: 1 });
    assert.deepEqual([q.loans.orphans.data.orphanDocs.sample, q.loans.orphans.data.orphanRows, q.loans.orphans.data.approvedWithoutSchedule.sample], [[{ docNo: 'PINSYN-ORPH', rows: 1 }], 1, [{ docNo: 'PINSYN9007' }]]);
    const bt = q.payroll.batchTotals.data; assert.equal(bt.checked, 6);
    assert.deepEqual(Object.fromEntries(bt.findings.sample.map((f) => [f.docNo, f.issues])), { POTSYN202607A: ['DUPLICATE_NIK_ROWS'], POTSYN202606A: ['NO_ROWS'], POTSYN202605A: ['STATUS_UNKNOWN', 'HEADER_TOTAL_MISMATCH'] });
    assert.equal(bt.rowsWithoutHeader.total, 0);
    assert.deepEqual([q.payroll.rowTotals.data.rows, q.payroll.rowTotals.data.totalDiffersFromComponents, q.payroll.rowTotals.data.totalDiffersByHalfSenOrMore, q.payroll.rowTotals.data.maxDifference, q.payroll.rowTotals.data.totalWithoutComponents], [8, 2, 2, '100.0000', 1]);
    assert.deepEqual(q.payroll.rowTotals.data.sample.map((s) => [s.nik, s.total, s.componentSum]), [['S9003', '100.0000', '0.0000'], ['S9002', '5000.0100', '5000.0000']]);
    assert.deepEqual(q.payroll.duplicateBatchNik.data.sample, [{ docNo: 'POTSYN202607A', nik: 'S9001', count: 2 }]);
    assert.deepEqual(q.branchMapping, { basis: 'EMPIRICAL_UNCONFIRMED', state: 'UNVERIFIED' });
    assert.ok(events.length === 4 && !JSON.stringify(events).includes('S900'));
    await assert.rejects(db.$executeRawUnsafe('DELETE FROM trans_pinjaman WHERE id = 9001'), /denied|command/i);
  } finally { await db.$disconnect(); }
});
