import { parseAmount4 } from '@koperasi/domain/kosipa';

// Synthetic in-memory SavingsReader + member directory with the keyset/filter semantics the SQL adapter must follow; records calls.
const fmt2 = (units) => { const a = Math.abs(units); return `${units < 0 ? '-' : ''}${Math.floor(a / 10000)}.${String(a % 10000).padStart(4, '0').slice(0, 2)}`; };
export const mv = (id, docNo, over = {}) => ({ id, docNo, nik: '00100', type: 'SIMPANAN WAJIB', credit: '100000.00', cashCredit: '0.00', debit: '0.00', interest: '0.00', detailStatus: null, remark: null, ...over });
export const hd = (docNo, over = {}) => ({ docNo, headerCount: 1, header: { docDate: '2026-05-01', status: 'APPROVED', kind: 'TRANSFER' }, ...over });

export function makeSavingsWorld({ movements = [], headers = [], members = [{ id: 9001, nik: '00100', name: 'SYNTH A', group: 'ANGGOTA', status: 'AKTIVE' }] } = {}) {
  const calls = []; const failures = new Set(); const rec = (n, ...a) => { calls.push([n, ...a]); if (failures.has(n)) throw new Error('timeout 1969'); };
  const savings = {
    async typeSummary(nikKeys) {
      rec('typeSummary', nikKeys); const by = new Map();
      for (const r of movements.filter((m) => nikKeys.includes(m.nik))) {
        const h = headers.filter((x) => x.docNo === r.docNo); const status = h.length === 0 ? 'MISSING_HEADER' : h.length > 1 ? 'AMBIGUOUS' : h[0].header.status;
        const k = `${r.type}|${status}`; const cur = by.get(k) ?? { type: r.type, headerStatus: status, c: 0, d: 0, i: 0, rows: 0 };
        cur.c += parseAmount4(r.credit) + parseAmount4(r.cashCredit); cur.d += parseAmount4(r.debit); cur.i += parseAmount4(r.interest); cur.rows++; by.set(k, cur);
      }
      return [...by.values()].map((v) => ({ type: v.type, headerStatus: v.headerStatus, credit: fmt2(v.c), debit: fmt2(v.d), interest: fmt2(v.i), rows: v.rows }));
    },
    async movements(nikKeys, type, beforeId, limit) {
      rec('movements', nikKeys, type, beforeId, limit);
      return movements.filter((m) => nikKeys.includes(m.nik) && (!type || m.type === type) && (beforeId === null || m.id < beforeId)).sort((a, b) => b.id - a.id).slice(0, limit).map((m) => { const r = { ...m }; delete r.nik; return r; });
    },
    async headersByDocNo(docNos) { rec('headersByDocNo', docNos); return docNos.map((d) => { const hs = headers.filter((h) => h.docNo === d); return { docNo: d, headerCount: hs.length, header: hs[0] ? { ...hs[0].header } : null }; }); },
  };
  const memberRows = new Map(members.map((m) => [m.id, m]));
  const memberReader = { async member(id) { rec('member', id); const m = memberRows.get(id); return m ? { ...m, exitOn: null, joinedOn: null, division: null, section: null, phone: null, email: null, bankAccount: null, bankName: null, limitTokoSen: 0, gajiMinusSen: 0, limitPpobSen: 0 } : null; } };
  return { savings, members: memberReader, calls, failures, named: (n) => calls.filter((c) => c[0] === n) };
}
