export type SalesSource = 'pos' | 'nonpos' | 'all';
export type SalesHistoryQuery = {
  from: string; to: string; source: SalesSource; salesStatus: string; paymentStatus: string;
  paymentType: string; createdBy: string; registerId: number | null; q: string;
  page: number; pageSize: number; sort: 'newest' | 'oldest';
};

export class SalesHistoryError extends Error {
  readonly code: 'INVALID_INPUT' | 'NOT_FOUND' | 'UNAVAILABLE';
  constructor(code: 'INVALID_INPUT' | 'NOT_FOUND' | 'UNAVAILABLE', message: string = code) {
    super(message);
    this.name = 'SalesHistoryError';
    this.code = code;
  }
}

const invalid = (hint = 'Periksa nilai filter. Gunakan satu nilai untuk setiap filter.'): never => { throw new SalesHistoryError('INVALID_INPUT', hint); };
const allowed = new Set(['from', 'to', 'source', 'salesStatus', 'paymentStatus', 'paymentType', 'createdBy', 'registerId', 'q', 'page', 'pageSize', 'sort']);
const ymd = /^\d{4}-\d{2}-\d{2}$/;
export interface SalesQueryParams { keys(): Iterable<string>; getAll(name: string): readonly string[] }

function validDate(value: string): boolean {
  if (!ymd.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function jakartaDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function optional(params: SalesQueryParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) invalid();
  return values[0];
}

function text(value: string | undefined, max: number, fallback: string): string {
  const result = (value ?? fallback).trim();
  if (result.length > max || /[\u0000-\u001f\u007f]/.test(result)) invalid(`Isi filter maksimal ${max} karakter tanpa karakter kontrol.`);
  return result;
}

function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) invalid();
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) invalid();
  return result;
}

export function parseSalesHistoryQuery(params: SalesQueryParams, now = new Date()): SalesHistoryQuery {
  for (const key of new Set(params.keys())) if (!allowed.has(key)) invalid('Tautan berisi filter yang tidak dikenal. Terapkan kembali filter atau reset pencarian.');
  const today = jakartaDate(now);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const from = optional(params, 'from') ?? defaultFrom;
  const to = optional(params, 'to') ?? today;
  if (!validDate(from) || !validDate(to)) invalid('Isi tanggal awal dan akhir yang valid.');
  if (from > to) invalid('Tanggal awal harus sebelum atau sama dengan tanggal akhir.');
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > 93) invalid('Rentang tanggal maksimal 93 hari. Persempit periode pencarian.');

  const source = text(optional(params, 'source'), 8, 'pos');
  if (!['pos', 'nonpos', 'all'].includes(source)) invalid();
  const pageSize = integer(optional(params, 'pageSize'), 25, 1, 100);
  const page = integer(optional(params, 'page'), 1, 1, 1_000_001);
  if ((page - 1) * pageSize > 100_000) invalid();
  const sort = text(optional(params, 'sort'), 8, 'newest');
  if (sort !== 'newest' && sort !== 'oldest') invalid();
  const registerValue = optional(params, 'registerId');
  const registerId = registerValue === undefined || registerValue === '' ? null : integer(registerValue, 0, 1, 2_147_483_647);
  const q = text(optional(params, 'q'), 100, '');
  return {
    from, to, source: source as SalesSource, salesStatus: text(optional(params, 'salesStatus'), 50, 'Final'),
    paymentStatus: text(optional(params, 'paymentStatus'), 50, 'all'),
    paymentType: text(optional(params, 'paymentType'), 50, 'all'),
    createdBy: text(optional(params, 'createdBy'), 100, ''), registerId, q,
    page, pageSize, sort: sort as 'newest' | 'oldest',
  };
}

export function escapeSqlLike(value: string): string {
  return value.replace(/[!%_]/g, (char) => `!${char}`);
}

export type ReprintFacts = {
  source: 'pos' | 'nonpos'; salesStatus: string; paymentStatus: string; paymentType: string;
  recordStatus: number; returnBit: string | null; hasItems: boolean; lineCount: number; itemCount: number;
  validMoney: boolean; grandTotalSen: number | null; paidSen: number | null; subtotalSen: number | null;
  lineTotalSen: number | null; discountSen: number | null; otherChargesSen: number | null;
  hasAmbiguousTax: boolean; activePaymentCount: number; paymentTypeMatches: boolean;
};

const methods = new Set(['Cash', 'QRIS', 'Kredit']);

/** The existing POS stores change in charge fields and ROUND(grand_total) in round_off.
 * Recognize those encodings without adding them to, or subtracting them from, the saved total.
 */
export function hasAmbiguousLegacyTotals(input: {
  paymentType: string; grandTotalSen: number | null; paidSen: number | null;
  otherChargesInputSen: number | null; otherChargesTaxId: number; roundOffSen: number | null;
}): boolean {
  const change = input.paymentType === 'Cash' && input.paidSen !== null && input.grandTotalSen !== null
    ? input.paidSen - input.grandTotalSen : 0;
  const charge = input.otherChargesInputSen;
  const knownCharge = charge === null || charge === 0 || (input.paymentType === 'Cash' && change >= 0 && charge === change);
  const roundedTotal = input.grandTotalSen === null ? null : Math.floor((input.grandTotalSen + 50) / 100) * 100;
  const knownRoundOff = input.roundOffSen === 0 || (roundedTotal !== null && Number.isSafeInteger(roundedTotal) && input.roundOffSen === roundedTotal);
  return input.otherChargesTaxId !== 0 || !knownCharge || !knownRoundOff;
}

export function evaluateReprintEligibility(facts: ReprintFacts): { allowed: boolean; reasons: string[] } {
  const reasons = new Set<string>();
  if (facts.source !== 'pos') reasons.add('NON_POS');
  if (facts.salesStatus !== 'Final') reasons.add('NON_FINAL');
  if (facts.recordStatus !== 1) reasons.add('INACTIVE_RECORD');
  // '1' = sales return raised. Returns never change the saved sale (they live in db_salesreturn), so the original
  // receipt stays exact; any other legacy marker is unknown and stays blocked.
  if (facts.returnBit !== '0' && facts.returnBit !== '1') reasons.add('RETURN_UNSUPPORTED');
  if (!methods.has(facts.paymentType)) reasons.add('PAYMENT_METHOD_UNSUPPORTED');
  if (!['Paid', 'Dibayar'].includes(facts.paymentStatus)) reasons.add('PAYMENT_NOT_SETTLED');
  if (!facts.hasItems || facts.lineCount === 0 || facts.itemCount !== facts.lineCount) reasons.add('ITEMS_MISSING');
  if (facts.lineCount > 200) reasons.add('PRINT_TOO_LARGE');
  const amounts = [facts.grandTotalSen, facts.paidSen, facts.subtotalSen, facts.lineTotalSen, facts.discountSen, facts.otherChargesSen];
  if (!facts.validMoney || amounts.some((amount) => amount === null || !Number.isSafeInteger(amount) || amount < 0)
    || (facts.grandTotalSen ?? 0) <= 0 || (facts.paidSen ?? 0) < (facts.grandTotalSen ?? 0)) reasons.add('INVALID_SAVED_AMOUNT');
  if (facts.activePaymentCount !== 1 || !facts.paymentTypeMatches) reasons.add('PAYMENT_DATA_UNSUPPORTED');
  if (facts.hasAmbiguousTax || facts.lineTotalSen !== facts.subtotalSen
    || (facts.subtotalSen ?? -1) - (facts.discountSen ?? 0) !== facts.grandTotalSen) reasons.add('LEGACY_TOTALS_UNSUPPORTED');
  if (facts.paymentType === 'Cash') {
    const change = (facts.paidSen ?? 0) - (facts.grandTotalSen ?? 0);
    if (facts.otherChargesSen !== 0 && facts.otherChargesSen !== change) reasons.add('LEGACY_TOTALS_UNSUPPORTED');
  } else if (facts.otherChargesSen !== 0 || facts.paidSen !== facts.grandTotalSen) {
    reasons.add('LEGACY_TOTALS_UNSUPPORTED');
  }
  return { allowed: reasons.size === 0, reasons: [...reasons] };
}
