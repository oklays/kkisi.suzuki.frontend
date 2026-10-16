import { KosipaError } from './errors.ts';
import { canonicalNik } from './nik.ts';

/**
 * Store (TOKO) Kredit obligations for payroll and member settlement (spec REQ-034, BR-006, BR-011).
 * One function for every consumer so payroll, resignation settlement and reports cannot disagree.
 */

/** Payroll period M deducts TOKO Kredit of calendar month M-1 (legacy process_simulasi). `toExclusive` = first day of M. */
export function payrollStoreWindow(year: number, month: number): { from: string; toExclusive: string } {
  if (!Number.isInteger(year) || year < 2000 || year > 2999 || !Number.isInteger(month) || month < 1 || month > 12) throw new KosipaError('PERIOD_INVALID');
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const iso = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
  return { from: iso(prev.y, prev.m), toExclusive: iso(year, month) };
}

export type KreditSale = { saleId: number; nik: string; companyId: number; saleDate: string; grandTotalSen: number; paymentType: string; status: string };
export type KreditReturn = { saleId: number; amountSen: number };
export type StoreObligation = { nik: string; companyId: number; salesSen: number; returnsSen: number; netSen: number };

/**
 * Σ Final Kredit sales in [from, toExclusive) − Σ returns of exactly those sales, per member and branch. Returns of sales
 * outside the window never reduce this window (a later period cannot silently re-open a finalised deduction).
 */
export function storeObligations(sales: readonly KreditSale[], returns: readonly KreditReturn[], window: { from: string; toExclusive: string }): StoreObligation[] {
  const included = new Map<number, KreditSale>();
  for (const sale of sales) {
    if (sale.paymentType !== 'Kredit' || sale.status !== 'Final') continue;
    if (sale.saleDate < window.from || sale.saleDate >= window.toExclusive) continue;
    if (!Number.isSafeInteger(sale.grandTotalSen) || sale.grandTotalSen < 0) throw new KosipaError('AMOUNT_INVALID');
    if (included.has(sale.saleId)) throw new KosipaError('DUPLICATE_SALE');
    included.set(sale.saleId, sale);
  }
  const returnedBySale = new Map<number, number>();
  for (const ret of returns) {
    if (!included.has(ret.saleId)) continue;
    if (!Number.isSafeInteger(ret.amountSen) || ret.amountSen < 0) throw new KosipaError('AMOUNT_INVALID');
    returnedBySale.set(ret.saleId, (returnedBySale.get(ret.saleId) ?? 0) + ret.amountSen);
  }
  const out = new Map<string, StoreObligation>();
  for (const sale of included.values()) {
    const returned = returnedBySale.get(sale.saleId) ?? 0;
    if (returned > sale.grandTotalSen) throw new KosipaError('RETURN_EXCEEDS_SALE');
    const nik = canonicalNik(sale.nik);
    const key = `${nik}|${sale.companyId}`;
    const row = out.get(key) ?? { nik, companyId: sale.companyId, salesSen: 0, returnsSen: 0, netSen: 0 };
    row.salesSen += sale.grandTotalSen; row.returnsSen += returned; row.netSen = row.salesSen - row.returnsSen;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => a.nik.localeCompare(b.nik) || a.companyId - b.companyId);
}
