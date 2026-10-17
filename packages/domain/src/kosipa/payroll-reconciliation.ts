import { KosipaError } from './errors.ts';
import { canonicalNik } from './nik.ts';
import { amount4FromSen, parseAmount4, STORE_COLUMNS, sumAmount4, type StoreColumn } from './payroll-read.ts';

/**
 * Read-only comparison of the RECORDED store-credit deduction (TOKO_* columns of the legacy payroll matrix) with a DERIVED
 * obligation (Kredit sales of the source month minus valid Kredit returns, spec REQ-034/BR-006/BR-011). The recorded value is
 * never overwritten and the derived value is never offered as the official deduction: it is evidence for review only.
 * Unlike `storeObligations` (which refuses inconsistent input), this derivation reports every problem record so nothing is
 * silently dropped from the reconciliation.
 */

/** Which TOKO_* column belongs to which branch. NOT in the specs: established EMPIRICALLY on the 30 Sep 2026 production copy
 * (exact per-member equality for 427/448, 182/182 and 239/239 members in 2026-08; 480/480, 190/190, 250/250 in 2026-07).
 * It is injected, labelled, and awaits owner confirmation; companies outside the map are reported, not guessed. */
export type StoreColumnMap = { basis: 'EMPIRICAL_UNCONFIRMED' | 'OWNER_CONFIRMED'; byCompany: Readonly<Record<number, StoreColumn>> };
export const DEFAULT_STORE_COLUMN_MAP: StoreColumnMap = { basis: 'EMPIRICAL_UNCONFIRMED', byCompany: { 1: 'TOKO_TAMBUN', 2: 'TOKO_MJ', 3: 'TOKO_GIIC' } };

export type KreditSaleRow = { saleId: number; nik: string | null; companyId: number; grandTotal: string };
export type KreditReturnRow = { returnId: number; saleId: number; amount: string };
export type AnomalyCode = 'DUPLICATE_SALE' | 'KREDIT_SALE_INVALID_NIK' | 'UNMAPPED_COMPANY' | 'RETURN_EXCEEDS_SALE' | 'RETURN_WITHOUT_SALE' | 'RECORDED_INVALID_NIK' | 'SOURCE_TRUNCATED';
export type Anomaly = { code: AnomalyCode; count: number; amount4: number; sampleIds: number[] };
export type Derived = { nik: string; column: StoreColumn; sales4: number; returns4: number; net4: number; anomalous: boolean };

class AnomalyBook {
  private readonly map = new Map<AnomalyCode, Anomaly>();
  add(code: AnomalyCode, id: number, amount4: number): void {
    const a = this.map.get(code) ?? { code, count: 0, amount4: 0, sampleIds: [] };
    a.count += 1; a.amount4 += amount4; if (a.sampleIds.length < 10) a.sampleIds.push(id);
    this.map.set(code, a);
  }
  merge(other: Anomaly): void {
    const a = this.map.get(other.code) ?? { code: other.code, count: 0, amount4: 0, sampleIds: [] };
    a.count += other.count; a.amount4 += other.amount4; a.sampleIds = [...a.sampleIds, ...other.sampleIds].slice(0, 10);
    this.map.set(other.code, a);
  }
  list(): Anomaly[] { return [...this.map.values()].sort((a, b) => a.code.localeCompare(b.code)); }
}

export function deriveStoreObligations(sales: readonly KreditSaleRow[], returns: readonly KreditReturnRow[], map: StoreColumnMap = DEFAULT_STORE_COLUMN_MAP): { derived: Derived[]; anomalies: Anomaly[] } {
  const anomalies = new AnomalyBook();
  const included = new Map<number, { nik: string; column: StoreColumn; total4: number }>();
  const seen = new Set<number>();
  for (const sale of sales) {
    const total4 = parseAmount4(sale.grandTotal);
    if (seen.has(sale.saleId)) { anomalies.add('DUPLICATE_SALE', sale.saleId, total4); continue; }   // a duplicated row must not be summed twice
    seen.add(sale.saleId);
    const column = map.byCompany[sale.companyId];
    if (!column) { anomalies.add('UNMAPPED_COMPANY', sale.saleId, total4); continue; }
    let nik: string;
    try { nik = canonicalNik(sale.nik ?? ''); if (nik === '0') throw new KosipaError('NIK_INVALID'); } catch { anomalies.add('KREDIT_SALE_INVALID_NIK', sale.saleId, total4); continue; }
    included.set(sale.saleId, { nik, column, total4 });
  }
  const returnedBySale = new Map<number, number>();
  for (const r of returns) {
    const amount4 = parseAmount4(r.amount);
    if (!included.has(r.saleId)) { anomalies.add('RETURN_WITHOUT_SALE', r.returnId, amount4); continue; }
    returnedBySale.set(r.saleId, (returnedBySale.get(r.saleId) ?? 0) + amount4);
  }
  const out = new Map<string, Derived>();
  for (const [saleId, s] of included) {
    const returned4 = returnedBySale.get(saleId) ?? 0;
    const key = `${s.nik}|${s.column}`;
    const row = out.get(key) ?? { nik: s.nik, column: s.column, sales4: 0, returns4: 0, net4: 0, anomalous: false };
    row.sales4 += s.total4; row.returns4 += returned4;
    if (returned4 > s.total4) { row.anomalous = true; anomalies.add('RETURN_EXCEEDS_SALE', saleId, returned4 - s.total4); }
    row.net4 = row.sales4 - row.returns4;
    out.set(key, row);
  }
  return { derived: [...out.values()].sort((a, b) => a.nik.localeCompare(b.nik) || a.column.localeCompare(b.column)), anomalies: anomalies.list() };
}

export type RecordedStoreRow = { nik: string; amounts: Record<StoreColumn, string>; rows: number };
export type Difference =
  | 'MATCH' | 'RECORDED_HIGHER' | 'RECORDED_LOWER' | 'RECORDED_ONLY'
  | 'DERIVED_ONLY_MEMBER_ABSENT' | 'DERIVED_ONLY_RECORDED_ZERO' | 'NOT_COMPARABLE_ANOMALY';
export type ReconciliationRow = {
  nik: string; column: StoreColumn; recorded4: number; sales4: number; returns4: number; derivedNet4: number; difference4: number; status: Difference;
  /** Only stated when it is arithmetically exact (recorded == sales while returns exist): the legacy generator ignores returns (ANO-X01). */
  likelyCause: 'RETURN_NOT_DEDUCTED' | null; recordedRows: number;
};
export type ReconciliationSummary = {
  compared: number; counts: Record<Difference, number>; recordedTotal4: Record<StoreColumn, number>; derivedTotal4: Record<StoreColumn, number>;
};

const emptyCounts = (): Record<Difference, number> => ({ MATCH: 0, RECORDED_HIGHER: 0, RECORDED_LOWER: 0, RECORDED_ONLY: 0, DERIVED_ONLY_MEMBER_ABSENT: 0, DERIVED_ONLY_RECORDED_ZERO: 0, NOT_COMPARABLE_ANOMALY: 0 });
const zeroCols = (): Record<StoreColumn, number> => ({ TOKO_TAMBUN: 0, TOKO_MJ: 0, TOKO_GIIC: 0 });

/**
 * Compares recorded vs derived per (member, store column). A cell is listed when either side is non-zero; MATCH cells are kept
 * so totals are complete, and callers filter to differences for display. Recorded rows with an unusable NIK and derived values
 * for members absent from the period's payroll are both reported, never dropped.
 */
export function reconcileStoreCredit(recorded: readonly RecordedStoreRow[], derived: readonly Derived[], carriedAnomalies: Anomaly[] = []): { rows: ReconciliationRow[]; summary: ReconciliationSummary; anomalies: Anomaly[] } {
  const anomalies = new AnomalyBook();
  for (const carried of carriedAnomalies) anomalies.merge(carried);   // anomalies already found while deriving (kept, not recounted)
  const rec = new Map<string, { amounts: Record<StoreColumn, number>; rows: number }>();
  for (const r of recorded) {
    let nik: string;
    try { nik = canonicalNik(r.nik); } catch { anomalies.add('RECORDED_INVALID_NIK', 0, sumAmount4(STORE_COLUMNS.map((c) => parseAmount4(r.amounts[c])))); continue; }
    const cur = rec.get(nik) ?? { amounts: zeroCols(), rows: 0 };
    for (const c of STORE_COLUMNS) cur.amounts[c] += parseAmount4(r.amounts[c]);
    cur.rows += r.rows; rec.set(nik, cur);
  }
  const der = new Map(derived.map((d) => [`${d.nik}|${d.column}`, d]));
  const keys = new Set<string>();
  for (const [nik, r] of rec) for (const c of STORE_COLUMNS) if (r.amounts[c] !== 0) keys.add(`${nik}|${c}`);
  for (const d of derived) if (d.net4 !== 0 || d.sales4 !== 0 || d.anomalous) keys.add(`${d.nik}|${d.column}`);
  const rows: ReconciliationRow[] = [];
  const counts = emptyCounts(), recordedTotal4 = zeroCols(), derivedTotal4 = zeroCols();
  for (const key of [...keys].sort()) {
    const [nik, column] = key.split('|') as [string, StoreColumn];
    const r = rec.get(nik), d = der.get(key);
    const recorded4 = r?.amounts[column] ?? 0, net4 = d?.net4 ?? 0, sales4 = d?.sales4 ?? 0, returns4 = d?.returns4 ?? 0;
    let status: Difference;
    if (d?.anomalous) status = 'NOT_COMPARABLE_ANOMALY';
    else if (recorded4 === net4) status = 'MATCH';
    else if (!d || (sales4 === 0 && returns4 === 0)) status = 'RECORDED_ONLY';
    else if (recorded4 === 0) status = r ? 'DERIVED_ONLY_RECORDED_ZERO' : 'DERIVED_ONLY_MEMBER_ABSENT';
    else status = recorded4 > net4 ? 'RECORDED_HIGHER' : 'RECORDED_LOWER';
    counts[status] += 1;
    recordedTotal4[column] += recorded4; if (!d?.anomalous) derivedTotal4[column] += net4;
    rows.push({ nik, column, recorded4, sales4, returns4, derivedNet4: net4, difference4: recorded4 - net4, status, likelyCause: status !== 'MATCH' && returns4 > 0 && recorded4 === sales4 ? 'RETURN_NOT_DEDUCTED' : null, recordedRows: r?.rows ?? 0 });
  }
  return { rows, summary: { compared: rows.length, counts, recordedTotal4, derivedTotal4 }, anomalies: anomalies.list() };
}

export const isDifference = (s: Difference): boolean => s !== 'MATCH';
export { amount4FromSen };
