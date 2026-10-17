// Synthetic in-memory ReportReader: returns what the SQL adapter must return (already bounded), records calls, can fail per method.
export const bucket = (b, docStatus, repayment, count, planPrincipal) => ({ bucket: b, docStatus, repayment, count, planPrincipal });
export const header = (docNo, over = {}) => ({ id: 1, docNo, group: 'ANGGOTA', status: 'APPROVED', periodYear: '2026', periodMonth: '08', periodDate: '2026-08-31', docDate: null, cashDate: null, headerTotal: '1000.0000', cashTotal: null, createdBy: null, updatedBy: null, ...over });
export const aggregate = (docNo, over = {}) => ({ docNo, rowCount: 2, distinctNik: 2, rowsTotal: '1000.0000', potonganToko: '600.0000', componentTotals: { TOKO_TAMBUN: '600.0000', PPOB: '400.0000' }, ...over });
const zeroDates = { total: 10, zero: 2, missing: 1, implausible: 3 };

export function makeReportWorld(data = {}) {
  const calls = []; const failures = new Set();
  const d = { loanYears: [2026, 2025], loanBuckets: [], payrollYears: [2026, 2025], headers: [], aggregates: [], dupRefs: [], conflicts: { counts: { rejectedSettled: 0, rejectedDisbursed: 0, settledNotApproved: 0, disbursedNotApproved: 0 }, sample: [] },
    loanDates: zeroDates, instDates: zeroDates, instDocs: [], loanDocs: [], allHeaders: [], allAggregates: [], rowTotals: { rows: 0, totalDiffersFromComponents: 0, totalDiffersByHalfSenOrMore: 0, maxDifference: '0.0000', totalWithoutComponents: 0, sample: [] }, dupNik: [], ...data };
  const r = (name, value) => async (...args) => { calls.push([name, ...args]); if (failures.has(name)) throw new Error('timeout 1969'); return typeof value === 'function' ? value(...args) : value; };
  const reader = {
    loanYears: r('loanYears', d.loanYears), loanBuckets: r('loanBuckets', () => d.loanBuckets), payrollYears: r('payrollYears', d.payrollYears),
    payrollHeadersForYear: r('payrollHeadersForYear', (year, limit) => d.headers.filter((h) => h.periodYear === String(year)).slice(0, limit)),
    payrollAggregates: r('payrollAggregates', (docNos) => d.aggregates.filter((a) => docNos.includes(a.docNo))),
    duplicateLoanRefs: r('duplicateLoanRefs', (cap) => d.dupRefs.slice(0, cap)), loanStatusConflicts: r('loanStatusConflicts', (n) => ({ counts: d.conflicts.counts, sample: d.conflicts.sample.slice(0, n) })),
    loanDateProblems: r('loanDateProblems', d.loanDates), installmentDateProblems: r('installmentDateProblems', d.instDates),
    installmentDocs: r('installmentDocs', (cap) => d.instDocs.slice(0, cap)), loanDocs: r('loanDocs', (cap) => d.loanDocs.slice(0, cap)),
    payrollHeadersAll: r('payrollHeadersAll', (cap) => d.allHeaders.slice(0, cap)), payrollAggregatesAll: r('payrollAggregatesAll', (cap) => d.allAggregates.slice(0, cap)),
    payrollRowTotals: r('payrollRowTotals', d.rowTotals), duplicateBatchNik: r('duplicateBatchNik', (cap) => d.dupNik.slice(0, cap)),
  };
  return { reader, calls, failures, named: (n) => calls.filter((c) => c[0] === n) };
}
