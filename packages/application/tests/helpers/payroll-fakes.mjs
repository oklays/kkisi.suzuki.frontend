import { parseAmount4, PAYROLL_COMPONENT_COLUMNS, STORE_COLUMNS } from '@koperasi/domain/kosipa';

// Synthetic in-memory PayrollReader: it applies the same filters, deterministic ordering and keyset rules the SQL adapter must,
// and records every call so tests can prove what was (not) read. No database, no network, no write method exists on it.
const fmt4 = (units) => { const neg = units < 0; const a = Math.abs(units); return `${neg ? '-' : ''}${Math.floor(a / 10000)}.${String(a % 10000).padStart(4, '0')}`; };
const zero = '0.0000';

export const hdr = (id, over = {}) => ({ id, docNo: `POT2026${String(id).padStart(6, '0')}`, group: 'ANGGOTA', status: 'APPROVED', periodYear: '2026', periodMonth: '08', periodDate: '2026-08-31', docDate: '2026-09-28', cashDate: '2026-09-30', headerTotal: null, cashTotal: null, createdBy: 'maker', updatedBy: 'checker', ...over });
export const mrow = (id, docNo, nik, over = {}) => ({ id, nik, name: `SYNTH ${nik}`, group: 'ANGGOTA', docNo, amounts: { total_potongan: zero, potongan_toko: zero, ...Object.fromEntries(PAYROLL_COMPONENT_COLUMNS.map((c) => [c, zero])), ...over } });
export const sale = (saleId, nik, companyId, total) => ({ saleId, nik, companyId, grandTotal: `${total}.00` });

export function makePayrollWorld({ headers = [], rows = [], sales = [], returns = [], installments = [], loans = [], salesCap = null } = {}) {
  const calls = [];
  const rec = (name, ...args) => calls.push([name, ...args]);
  const failures = new Set();
  const reader = {
    async listBatches(q, limit) {
      rec('listBatches', q, limit); if (failures.has('listBatches')) throw new Error('timeout 1969');
      return headers.filter((h) => (!q.period || (h.periodYear === String(q.period.year) && h.periodMonth === String(q.period.month).padStart(2, '0'))) && (!q.status || h.status === q.status) && (!q.group || h.group === q.group) && (q.afterId === null || h.id < q.afterId))
        .sort((a, b) => b.id - a.id).slice(0, limit).map((h) => ({ ...h }));
    },
    async batchHeader(docNo) { rec('batchHeader', docNo); if (failures.has('batchHeader')) throw new Error('down'); const h = headers.find((x) => x.docNo === docNo); return h ? { ...h } : null; },
    async batchAggregate(docNo) {
      rec('batchAggregate', docNo);
      const rs = rows.filter((r) => r.docNo === docNo);
      const sum = (col) => fmt4(rs.reduce((t, r) => t + parseAmount4(r.amounts[col]), 0));
      return { rowCount: rs.length, distinctNik: new Set(rs.map((r) => r.nik)).size, rowsTotal: sum('total_potongan'), potonganToko: sum('potongan_toko'), componentTotals: Object.fromEntries(PAYROLL_COMPONENT_COLUMNS.map((c) => [c, sum(c)])) };
    },
    async batchRows(docNo, search, afterId, limit) {
      rec('batchRows', docNo, search, afterId, limit);
      const keep = (r) => !search || (search.nikKeys ? search.nikKeys.includes(r.nik) : r.name.toLowerCase().includes(search.nameLike.replace(/\\/g, '').toLowerCase()));
      return rows.filter((r) => r.docNo === docNo && keep(r) && (afterId === null || r.id > afterId)).sort((a, b) => a.id - b.id).slice(0, limit)
        .map((r) => ({ id: r.id, nik: r.nik, name: r.name, group: r.group, total: r.amounts.total_potongan, potonganToko: r.amounts.potongan_toko, ppob: r.amounts.PPOB, toko: Object.fromEntries(STORE_COLUMNS.map((c) => [c, r.amounts[c]])) }));
    },
    async memberRows(docNo, nikKeys) { rec('memberRows', docNo, nikKeys); return rows.filter((r) => r.docNo === docNo && nikKeys.includes(r.nik)).sort((a, b) => a.id - b.id).map((r) => ({ id: r.id, nik: r.nik, name: r.name, group: r.group, amounts: { ...r.amounts } })); },
    async periodBatches(period) { rec('periodBatches', period); return headers.filter((h) => h.periodYear === String(period.year) && h.periodMonth === String(period.month).padStart(2, '0')).sort((a, b) => a.id - b.id).map((h) => ({ ...h })); },
    async periodRecordedStore(docNos) {
      rec('periodRecordedStore', docNos);
      const by = new Map();
      for (const r of rows.filter((x) => docNos.includes(x.docNo))) {
        const cur = by.get(r.nik) ?? { nik: r.nik, rows: 0, units: { TOKO_TAMBUN: 0, TOKO_MJ: 0, TOKO_GIIC: 0 } };
        for (const c of STORE_COLUMNS) cur.units[c] += parseAmount4(r.amounts[c]); cur.rows += 1; by.set(r.nik, cur);
      }
      return [...by.values()].sort((a, b) => a.nik.localeCompare(b.nik)).map((v) => ({ nik: v.nik, rows: v.rows, amounts: Object.fromEntries(STORE_COLUMNS.map((c) => [c, fmt4(v.units[c])])) }));
    },
    async kreditSales(window, cap) { rec('kreditSales', window, cap); if (failures.has('kreditSales')) throw new Error('timeout'); return { rows: sales.slice(0, cap), truncated: salesCap !== null ? true : sales.length > cap }; },
    async kreditReturns(window, cap) { rec('kreditReturns', window, cap); return { rows: returns.slice(0, cap), truncated: returns.length > cap }; },
    async memberHistory(nikKeys, beforeId, limit) {
      rec('memberHistory', nikKeys, beforeId, limit);
      return rows.filter((r) => nikKeys.includes(r.nik) && (beforeId === null || r.id < beforeId)).sort((a, b) => b.id - a.id).slice(0, limit)
        .map((r) => ({ id: r.id, docNo: r.docNo, total: r.amounts.total_potongan, toko: Object.fromEntries(STORE_COLUMNS.map((c) => [c, r.amounts[c]])) }));
    },
    async headersByDocNo(docNos) { rec('headersByDocNo', docNos); return docNos.map((docNo) => { const hs = headers.filter((h) => h.docNo === docNo); return { docNo, headerCount: hs.length, header: hs[0] ? { ...hs[0] } : null }; }); },
    async memberInstallments(nikKeys, window, limit) {
      rec('memberInstallments', nikKeys, window, limit);
      return installments.filter((i) => nikKeys.includes(i.nik) && i.dueRaw >= window.from && i.dueRaw < window.toExclusive && !String(i.dueRaw).startsWith('0000')).sort((a, b) => a.dueRaw.localeCompare(b.dueRaw) || a.id - b.id).slice(0, limit).map((i) => { const rest = { ...i }; delete rest.nik; return rest; });
    },
    async memberInstallmentSummary(nikKeys) {
      rec('memberInstallmentSummary', nikKeys);
      const mine = installments.filter((i) => nikKeys.includes(i.nik));
      return { total: mine.length, unpaid: mine.filter((i) => i.status === 'Belum Bayar').length, zeroDue: mine.filter((i) => String(i.dueRaw).startsWith('0000')).length, missingDue: mine.filter((i) => i.dueRaw === null).length, implausibleDue: mine.filter((i) => i.dueRaw && !String(i.dueRaw).startsWith('0000') && Number(String(i.dueRaw).slice(0, 4)) > 2100).length };
    },
    async loanHeadersPresent(docNos) { rec('loanHeadersPresent', docNos); return new Set(docNos.filter((d) => loans.includes(d))); },
  };
  return { reader, calls, failures, named: (n) => calls.filter((c) => c[0] === n) };
}
