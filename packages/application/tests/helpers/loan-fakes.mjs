import { classifyLoanProduct, loanProduct, parseAmount4 } from '@koperasi/domain/kosipa';

// Synthetic in-memory LoanReader: same filters, deterministic ordering and keyset rules the SQL adapter must follow; records every call.
const fmt2 = (units) => { const a = Math.abs(units); return `${units < 0 ? '-' : ''}${Math.floor(a / 10000)}.${String(a % 10000).padStart(4, '0').slice(0, 2)}`; };
export const loanHdr = (id, over = {}) => ({ id, docNo: `PIN${String(id).padStart(6, '0')}`, docDate: '2026-01-10', type: 'PINJAMAN REGULAR', method: 'Flat', rate: '1', nik: '00100', name: `SYNTH ${id}`, financier: 'KOPERASI', docStatus: 'APPROVED', disbursement: 'APPROVED', repayment: 'BELUM LUNAS',
  planPrincipal: '1200000.00', actualPrincipal: '0.00', planInstallment: '110000.00', actualInstallment: '0.00', planMonths: 12, actualMonths: 0, startDate: '2026-02-01', endDate: '2027-01-01', disbursedDate: '2026-01-15', disbursedAmount: '1200000.00',
  adminFee: '0.00', insuranceFee: '0.00', totalDeduction: '0.00', totalReceived: '1200000.00', settlementStatus: null, settlementDate: null, settlementTotal: '0.00', rollOver: 'NO', ...over });
export const inst = (id, docNo, no, over = {}) => ({ id, docNo, installmentNo: no, dueRaw: '2026-03-25', paidRaw: null, principal: '100000.00', interest: '10000.00', total: '110000.00', status: 'Belum Bayar', type: null, blocked: 0, rollOver: 0, cicilanDocNo: null, ...over });

const ACTIVE = (h) => h.docStatus === 'APPROVED' && h.disbursement === 'APPROVED' && h.repayment === 'BELUM LUNAS';
const searchHit = (s, h, docs) => s.nikKeys ? s.nikKeys.includes(h.nik) : s.docNoPrefix ? docs.some((d) => (d ?? '').toLowerCase().startsWith(s.docNoPrefix.toLowerCase())) : (h.name ?? '').toLowerCase().includes(s.nameLike.replace(/\\/g, '').toLowerCase());
const inMonth = (raw, p) => String(raw ?? '').startsWith(`${p.year}-${String(p.month).padStart(2, '0')}`);

/** `settlements` extend a header with pelunasan fields (settlement: 1, remark, settledOn, method, status, settledPrincipal, settledAdmin, settledPenalty). */
export function makeLoanWorld({ headers = [], installments = [], rollovers = [] } = {}) {
  const calls = []; const failures = new Set();
  const rec = (name, ...a) => { calls.push([name, ...a]); if (failures.has(name)) throw new Error('timeout 1969'); };
  const reader = {
    async listLoans(q, limit) {
      rec('listLoans', q, limit);
      const seg = (h) => !q.segment || !q.product || (loanProduct(q.product)?.segmentBy === 'type' ? h.type : h.financier) === q.segment;
      const keep = (h) => (!q.docStatus || h.docStatus === q.docStatus) && (!q.disbursement || h.disbursement === q.disbursement) && (!q.repayment || h.repayment === q.repayment) && (q.afterId === null || h.id < q.afterId) && (!q.period || inMonth(h.docDate, q.period))
        && (!q.product || classifyLoanProduct(h.type, h.financier) === q.product) && seg(h) && (!q.search || searchHit(q.search, h, [h.docNo]));
      return headers.filter(keep).sort((a, b) => b.id - a.id).slice(0, limit).map((h) => ({ ...h }));
    },
    async portfolioGroups() {
      rec('portfolioGroups');
      const groups = new Map();
      for (const h of headers) {
        const key = JSON.stringify([h.type, h.financier, h.docStatus, h.disbursement, h.repayment]);
        const g = groups.get(key) ?? { type: h.type, financier: h.financier, docStatus: h.docStatus, disbursement: h.disbursement, repayment: h.repayment, documents: 0, units: 0, latestDocDate: null };
        g.documents += 1; g.units += parseAmount4(h.planPrincipal); if (h.docDate && /^\d{4}/.test(h.docDate) && !h.docDate.startsWith('0000') && (!g.latestDocDate || h.docDate > g.latestDocDate)) g.latestDocDate = h.docDate;
        groups.set(key, g);
      }
      return [...groups.values()].map(({ units, ...g }) => ({ ...g, planPrincipal: fmt2(units) }));
    },
    async unpaidSchedule(product) {
      rec('unpaidSchedule', product);
      return headers.filter((h) => ACTIVE(h) && (!product || classifyLoanProduct(h.type, h.financier) === product)).flatMap((h) => {
        const rs = installments.filter((i) => i.docNo === h.docNo && i.status === 'Belum Bayar');
        return rs.length ? [{ docNo: h.docNo, type: h.type, financier: h.financier, principal: fmt2(rs.reduce((t, r) => t + parseAmount4(r.principal), 0)), total: fmt2(rs.reduce((t, r) => t + parseAmount4(r.total), 0)) }] : [];
      });
    },
    async listSettlements(q, limit) {
      rec('listSettlements', q, limit);
      return settled(q).filter((h) => q.afterId === null || h.id < q.afterId).sort((a, b) => b.id - a.id).slice(0, limit).map(settlementRow);
    },
    async settlementSummary(q) {
      rec('settlementSummary', q);
      const out = new Map();
      for (const h of settled(q)) { const r = out.get(h.remark ?? null) ?? { remark: h.remark ?? null, documents: 0, p: 0, a: 0, n: 0 }; r.documents += 1; r.p += parseAmount4(h.settledPrincipal ?? '0'); r.a += parseAmount4(h.settledAdmin ?? '0'); r.n += parseAmount4(h.settledPenalty ?? '0'); out.set(r.remark, r); }
      return [...out.values()].map((r) => ({ remark: r.remark, documents: r.documents, principal: fmt2(r.p), adminFee: fmt2(r.a), penalty: fmt2(r.n) }));
    },
    async listRollovers(q, limit) {
      rec('listRollovers', q, limit);
      return rollovers.filter((r) => (q.afterId === null || r.id < q.afterId) && (!q.search || searchHit(q.search, r, [r.newDocNo, r.oldDocNo]))).sort((a, b) => b.id - a.id).slice(0, limit).map((r) => ({ ...r }));
    },
    async rolloverLinks(docNo, limit) { rec('rolloverLinks', docNo, limit); return rollovers.filter((r) => r.newDocNo === docNo || r.oldDocNo === docNo).sort((a, b) => a.id - b.id).slice(0, limit).map((r) => ({ ...r })); },
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
  function settled(q) {
    return headers.filter((h) => h.settlement === 1 && h.remark !== 'ROLLOVER' && h.remark != null && (!q.product || classifyLoanProduct(h.type, h.financier) === q.product) && (!q.remark || h.remark === q.remark)
      && (!q.period || inMonth(h.settledOn, q.period)) && (!q.search || searchHit(q.search, h, [h.docNo])));
  }
  function settlementRow(h) {
    return { id: h.id, docNo: h.docNo, settledOn: h.settledOn ?? null, nik: h.nik, name: h.name, type: h.type, financier: h.financier, remark: h.remark, method: h.method ?? null, status: h.status ?? null,
      planPrincipal: h.planPrincipal, principal: h.settledPrincipal ?? '0.00', adminFee: h.settledAdmin ?? '0.00', penalty: h.settledPenalty ?? '0.00' };
  }
  return { reader, calls, failures, named: (n) => calls.filter((c) => c[0] === n) };
}
