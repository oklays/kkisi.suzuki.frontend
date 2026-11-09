import { formatRupiah, formatRupiahCompact, rupiahFromAmount4, rupiahFromSen } from '@koperasi/domain/money/rupiah';

// Display helpers over the shared Rupiah standard (packages/domain/src/money/rupiah.ts). Amounts travel as exact integers in
// 1/10,000 Rupiah ("amount4") or as decimal strings; no float arithmetic ever touches money. `null` means "not available" and is
// shown as such — it is never turned into Rp0.

export const NOT_AVAILABLE = 'Tidak tersedia';

export const rupiah4 = (a4: number | null | undefined): string => (a4 === null || a4 === undefined ? NOT_AVAILABLE : formatRupiah(rupiahFromAmount4(a4)));
export const rupiahSen = (sen: number | null | undefined): string => (sen === null || sen === undefined ? NOT_AVAILABLE : formatRupiah(rupiahFromSen(sen)));
export const rupiahDec = (value: string | null | undefined): string => (value === null || value === undefined ? NOT_AVAILABLE : formatRupiah(value));
/** Space-constrained summaries only (cards, chips): `Rp2,5 juta`. The exact figure is shown wherever detail is read. */
export const compact4 = (a4: number | null | undefined): string => (a4 === null || a4 === undefined ? NOT_AVAILABLE : formatRupiahCompact(rupiahFromAmount4(a4)));
export const compactSen = (sen: number | null | undefined): string => (sen === null || sen === undefined ? NOT_AVAILABLE : formatRupiahCompact(rupiahFromSen(sen)));

/** Exact decimal string ("1250000.00") -> integer sen. Throws on anything that is not a plain decimal. */
export function senOf(decimal: string): number {
  const m = /^(-?)(\d+)(?:\.(\d{1,2})\d*)?$/.exec(decimal.trim());
  if (!m) throw new RangeError('INVALID_DECIMAL');
  const sen = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(sen)) throw new RangeError('INVALID_DECIMAL');
  return m[1] ? -sen : sen;
}

/** "Rp150.000", "150000", "150.000" -> 150000 (whole Rupiah). null when the text is not a whole Rupiah amount. */
export function parseWholeRupiah(text: string): number | null {
  const t = text.trim().replace(/^Rp\s*/i, '');
  if (!/^(?:\d{1,15}|\d{1,3}(?:\.\d{3}){1,4})$/.test(t)) return null;
  const n = Number(t.replace(/\./g, ''));
  return Number.isSafeInteger(n) ? n : null;
}
