/**
 * Web entry point for the KKISI Rupiah standard. The rules live in @koperasi/domain/money/rupiah; this file only
 * re-exports them and adds adapters for the integer minor units the app stores (sen, and KOSIPA's 1/10,000 "amount4").
 * Adapters convert units to an exact decimal string first; no floating point touches an amount.
 */
import {
  formatRupiah, formatRupiahAccounting, formatRupiahCompact, formatRupiahDocument, formatRupiahNumberOnly,
  rupiahFromAmount4, rupiahFromSen, type FormatRupiahOptions, type MoneyInput,
} from '@koperasi/domain/money/rupiah';

export {
  draftRupiahInput, formatRupiah, formatRupiahAccounting, formatRupiahCompact, formatRupiahDocument, formatRupiahNumberOnly,
  fromMinorUnits, parseRupiahInput, rupiahFromAmount4, rupiahFromSen, rupiahInputText, MONEY_PLACEHOLDER, RUPIAH_SYMBOL,
} from '@koperasi/domain/money/rupiah';
export type { FormatRupiahOptions, MoneyInput, ParseRupiahOptions, RupiahParseResult } from '@koperasi/domain/money/rupiah';
export { formatRupiahTerbilang } from '@koperasi/domain/money/terbilang';

type Units = number | bigint | null | undefined;
const via = (convert: (units: number | bigint) => string, format: (value: MoneyInput, options?: FormatRupiahOptions) => string) =>
  (units: Units, options?: FormatRupiahOptions): string => format(units === null || units === undefined ? null : convert(units), options);

/** Integer sen (POS, sales, returns). `formatSen(125075)` is `Rp1.250,75`. */
export const formatSen = via(rupiahFromSen, formatRupiah);
export const formatSenDocument = via(rupiahFromSen, formatRupiahDocument);
export const formatSenNumberOnly = via(rupiahFromSen, formatRupiahNumberOnly);
export const formatSenCompact = via(rupiahFromSen, formatRupiahCompact);
export const formatSenAccounting = via(rupiahFromSen, formatRupiahAccounting);

/** Integer 1/10,000 rupiah (KOSIPA payroll, loans, savings). `formatAmount4(500006666)` is `Rp50.000,6666`. */
export const formatAmount4 = via(rupiahFromAmount4, formatRupiah);
