import { parseAmount4 } from '@koperasi/domain/kosipa';

// Synthetic in-memory LoanReader: same filters, deterministic ordering and keyset rules the SQL adapter must follow; records every call.
const fmt2 = (units) => { const a = Math.abs(units); return `${units < 0 ? '-' : ''}${Math.floor(a / 10000)}.${String(a % 10000).padStart(4, '0').slice(0, 2)}`; };
export const loanHdr = (id, over = {}) => ({ id, docNo: `PIN${String(id).padStart(6, '0')}`, docDate: '2026-01-10', type: 'PINJAMAN REGULAR', method: 'Flat', rate: '1', nik: '00100', name: `SYNTH ${id}`, docStatus: 'APPROVED', disbursement: 'APPROVED', repayment: 'BELUM LUNAS',
  planPrincipal: '1200000.00', actualPrincipal: '0.00', planInstallment: '110000.00', actualInstallment: '0.00', planMonths: 12, actualMonths: 0, startDate: '2026-02-01', endDate: '2027-01-01', disbursedDate: '2026-01-15', disbursedAmount: '1200000.00',
  adminFee: '0.00', insuranceFee: '0.00', totalDeduction: '0.00', totalReceived: '1200000.00', settlementStatus: null, settlementDate: null, settlementTotal: '0.00', rollOver: 'NO', ...over });
export const inst = (id, docNo, no, over = {}) => ({ id, docNo, installmentNo: no, dueRaw: '2026-03-25', paidRaw: null, principal: '100000.00', interest: '10000.00', total: '110000.00', status: 'Belum Bayar', type: null, blocked: 0, rollOver: 0, cicilanDocNo: null, ...over });

export function makeLoanWorld({ headers = [], installments = [] } = {}) {
  const calls = []; const failures = new Set();
  const rec = (name, ...a) => { calls.push([name, ...a]); if (failures.has(name)) throw new Error('timeout 1969'); };
  const reader = {
    async listLoans(q, limit) {
      rec('listLoans', q, limit);
      const keep = (h) => (!q.docStatus || h.docStatus === q.docStatus) && (!q.disbursement || h.disbursement === q.disbursement) && (!q.repayment || h.repayment === q.repayment) && (q.afterId === null || h.id < q.afterId) && (!q.period || String(h.docDate).startsWith(`${q.period.year}-${String(q.period.month).padStart(2, '0')}`))
        && (!q.search || (q.search.nikKeys ? q.search.nikKeys.includes(h.nik) : q.search.docNoPrefix ? h.docNo.toLowerCase().startsWith(q.search.docNoPrefix.toLowerCase()) : (h.name ?? '').toLowerCase().includes(q.search.nameLike.replace(/\\/g, '').toLowerCase())));
      return headers.filter(keep).sort((a, b) => b.id - a.id).slice(0, limit).map((h) => ({ ...h }));
    },
    async loanHeaders(docNo, limit) { rec('loanHeaders', docNo, limit); return headers.filter((h) => h.docNo === docNo).sort((a, b) => a.id - b.id).slice(0, limit).map((h) => ({ ...h })); },
    async scheduleAggregate(docNo) {
      rec('scheduleAggregate', docNo);
      const rs = installments.filter((i) => i.docNo === docNo); const sum = (f, pick = () => true) => rs.filter(pick).reduce((t, r) => t + parseAmount4(f(r)), 0);
      const nos = rs.map((r) => r.installmentNo ?? 0); const due = (r) => r.dueRaw;
      const paid = (r) => r.status === 'Bayar', unpaid = (r) => r.status === 'Belum Bayar';
      return { rows: rs.length, distinctNo: new Set(nos).size, minNo: nos.length ? Math.min(...nos) : null, maxNo: nos.length ? Math.max(...nos) : null,
        principalSum: fmt2(sum((r) => r.principal)), interestSum: fmt2(sum((r) => r.interest)), totalSum: fmt2(sum((r) => r.total)),
        paidRows: rs.filter(paid).length, unpaidRows: rs.filter(unpaid).length, otherStatusRows: rs.filter((r) => !paid(r) && !unpaid(r)).length,
        paidPrincipal: fmt2(sum((r) => r.principal, paid)), unpaidPrincipal: fmt2(sum((r) => r.principal, unpaid)), unpaidTotal: fmt2(sum((r) => r.total, unpaid)),
        zeroDue: rs.filter((r) => String(due(r)).startsWith('0000')).length, missingDue: rs.filter((r) => due(r) === null).length,
        implausibleDue: rs.filter((r) => due(r) && !String(due(r)).startsWith('0000') && (Number(String(due(r)).slice(0, 4)) < 1990 || Number(String(due(r)).slice(0, 4)) > 2100)).length,
        componentMismatch: rs.filter((r) => parseAmount4(r.total) !== parseAmount4(r.principal) + parseAmount4(r.interest)).length, paidWithoutPaidDate: rs.filter((r) => paid(r) && (r.paidRaw === null || String(r.paidRaw).startsWith('0000'))).length };
    },
    async scheduleRows(docNo, after, limit) {
      rec('scheduleRows', docNo, after, limit);
      const key = (r) => [r.installmentNo ?? 0, r.id];
      return installments.filter((i) => i.docNo === docNo && (after === null || key(i)[0] > after.no || (key(i)[0] === after.no && i.id > after.id))).sort((a, b) => key(a)[0] - key(b)[0] || a.id - b.id).slice(0, limit)
        .map((i) => { const r = { ...i }; delete r.docNo; return r; });
    },
  };
  return { reader, calls, failures, named: (n) => calls.filter((c) => c[0] === n) };
}
