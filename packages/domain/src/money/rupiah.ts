/**
 * KKISI TB2 Rupiah presentation standard: the single place that formats, abbreviates and parses Rupiah.
 *
 * Display-only. Nothing here changes an amount, a rounding policy or a calculation; the authoritative value is always
 * the exact decimal (string / integer minor units) that the caller already holds, never the formatted text.
 * No binary floating point is applied to an amount: values are handled as decimal digit strings and BigInt.
 *
 * Format contract (locale id-ID): symbol `Rp` glued to the number, `.` thousands, `,` decimal, no trailing `,-`.
 *   Rp0 · Rp1.000 · Rp1.250.000 · Rp1.250.000,75 · -Rp1.250.000
 */
export type MoneyInput = string | number | bigint | null | undefined;

export const RUPIAH_SYMBOL = 'Rp';
/** Shown for null / undefined (a value that is not available, which is never the same thing as zero). */
export const MONEY_PLACEHOLDER = '—';

export interface FormatRupiahOptions {
  /** Text for null / undefined. Default {@link MONEY_PLACEHOLDER}. */
  placeholder?: string;
  /** Always show at least this many decimals (formal documents use 2). Default 0. */
  minFractionDigits?: number;
  /**
   * Most decimals the workflow supports. Default: unlimited, so nothing is ever rounded or truncated.
   * A value carrying more significant decimals than this throws a RangeError instead of being cut, unless `overflow` says otherwise.
   */
  maxFractionDigits?: number;
  /**
   * What to do with decimals beyond `maxFractionDigits`. `'throw'` (default) refuses; `'truncate'` cuts them off toward zero
   * (`2581645259.9063` with max 2 shows `Rp2.581.645.259,90`), an explicit display policy a workflow opts into. Truncation never
   * turns a non-zero amount into zero: such an amount keeps its exact digits (`0.0063` stays `Rp0,0063`, never `Rp0`).
   */
  overflow?: 'throw' | 'truncate';
}

interface Decimal { negative: boolean; int: string; frac: string }

function invalid(reason: string): never {
  throw new RangeError(`Invalid Rupiah amount: ${reason}`);
}

function parseDecimal(value: string | number | bigint): Decimal {
  let text: string;
  if (typeof value === 'bigint') text = value.toString();
  else if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('not a finite number');
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) invalid('outside the exact JavaScript integer range; pass a decimal string or bigint');
    text = String(value);
    if (/e/i.test(text)) invalid('exponent notation; pass a decimal string');
  } else text = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) invalid('expected a plain decimal such as "1250000.75"');
  const int = match[2].replace(/^0+(?=\d)/, '');
  const frac = match[3] ?? '';
  const isZero = /^0*$/.test(int + frac);
  return { negative: match[1] === '-' && !isZero, int, frac };
}

// The repo's TS target predates BigInt literals, so constants go through BigInt().
const pow10 = (n: number): bigint => BigInt(`1${'0'.repeat(n)}`);
const group = (int: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function fractionText(frac: string, wholeIsZero: boolean, options: FormatRupiahOptions): string {
  let significant = frac.replace(/0+$/, '');
  if (options.maxFractionDigits !== undefined && significant.length > options.maxFractionDigits) {
    if (options.overflow !== 'truncate') {
      throw new RangeError(`Rupiah amount has more than ${options.maxFractionDigits} decimals and is not rounded`);
    }
    const cut = significant.slice(0, options.maxFractionDigits).replace(/0+$/, '');
    // Never display a non-zero amount as zero: keep the exact digits instead.
    if (!(wholeIsZero && cut === '')) significant = cut;
  }
  // A real fraction reads as sen at least (",50", never ",5"); a longer exact fraction (",6666") is kept whole.
  return significant.padEnd(significant ? Math.max(2, options.minFractionDigits ?? 0) : options.minFractionDigits ?? 0, '0');
}

function render(value: MoneyInput, options: FormatRupiahOptions, symbol: boolean, negative: 'minus' | 'parentheses'): string {
  if (value === null || value === undefined) return options.placeholder ?? MONEY_PLACEHOLDER;
  const decimal = parseDecimal(value);
  const fraction = fractionText(decimal.frac, /^0*$/.test(decimal.int), options);
  const body = `${symbol ? RUPIAH_SYMBOL : ''}${group(decimal.int)}${fraction ? `,${fraction}` : ''}`;
  if (!decimal.negative) return body;
  return negative === 'parentheses' ? `(${body})` : `-${body}`;
}

/** Standard UI amount. Integers carry no decimals; a real fraction is kept exactly: `Rp1.250.000`, `Rp1.250.000,75`. */
export function formatRupiah(value: MoneyInput, options: FormatRupiahOptions = {}): string {
  return render(value, options, true, 'minus');
}

/** Same grouping without the symbol, for dense tables whose column header says `Nominal (Rp)`: `1.250.000`. */
export function formatRupiahNumberOnly(value: MoneyInput, options: FormatRupiahOptions = {}): string {
  return render(value, options, false, 'minus');
}

/**
 * Formal financial documents (invoice, receipt, statements): at least two decimals, `Rp1.250.000,00`.
 * A value that legitimately carries more decimals keeps them; it is never forced down to two.
 */
export function formatRupiahDocument(value: MoneyInput, options: FormatRupiahOptions = {}): string {
  return render(value, { ...options, minFractionDigits: Math.max(2, options.minFractionDigits ?? 2) }, true, 'minus');
}

/** Document precision with accounting-style negatives: `(Rp1.250.000,00)`. */
export function formatRupiahAccounting(value: MoneyInput, options: FormatRupiahOptions = {}): string {
  return render(value, { ...options, minFractionDigits: Math.max(2, options.minFractionDigits ?? 2) }, true, 'parentheses');
}

const COMPACT_UNITS = [
  { name: 'juta', exponent: 6 },
  { name: 'miliar', exponent: 9 },
  { name: 'triliun', exponent: 12 },
] as const;

export interface CompactRupiahOptions extends Pick<FormatRupiahOptions, 'placeholder'> {
  /** Decimals kept in the abbreviated figure. Default 2 (`Rp1,25 juta`). */
  compactFractionDigits?: number;
}

/**
 * Abbreviation for space-constrained dashboard summaries only: `Rp1,25 juta`, `Rp125,5 juta`, `Rp1,25 miliar`.
 * Below one million the full amount is shown. The figure is rounded half away from zero for display; never use it as
 * data, and give the reader the exact amount (see CurrencyText) wherever it appears.
 */
export function formatRupiahCompact(value: MoneyInput, options: CompactRupiahOptions = {}): string {
  if (value === null || value === undefined) return options.placeholder ?? MONEY_PLACEHOLDER;
  const decimal = parseDecimal(value);
  if (decimal.int.length <= 6) return formatRupiah(value, options);
  const digits = decimal.frac.length;
  const places = options.compactFractionDigits ?? 2;
  if (!Number.isInteger(places) || places < 0 || places > 6) throw new RangeError('compactFractionDigits must be 0..6');
  const numerator = BigInt(decimal.int + decimal.frac);
  const two = BigInt(2);
  let index = COMPACT_UNITS.length - 1;
  while (index > 0 && decimal.int.length <= COMPACT_UNITS[index].exponent) index--;
  const scaled = () => {
    const divisor = pow10(COMPACT_UNITS[index].exponent + digits);
    return (numerator * pow10(places) * two + divisor) / (divisor * two);
  };
  const unit = pow10(places);
  const limit = BigInt(1000) * unit;
  let rounded = scaled();
  // 999,996 juta rounds up to 1.000 juta; present it as 1 miliar instead.
  while (index < COMPACT_UNITS.length - 1 && rounded >= limit) { index++; rounded = scaled(); }
  const fraction = places ? String(rounded % unit).padStart(places, '0').replace(/0+$/, '') : '';
  const text = `${RUPIAH_SYMBOL}${group(String(rounded / unit))}${fraction ? `,${fraction}` : ''} ${COMPACT_UNITS[index].name}`;
  return decimal.negative ? `-${text}` : text;
}

/** Exact decimal Rupiah text from integer minor units: `fromMinorUnits(125075, 2)` is `"1250.75"`. */
export function fromMinorUnits(units: number | bigint, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) throw new RangeError('Invalid money scale');
  if (typeof units === 'number' && !Number.isSafeInteger(units)) invalid('minor units outside the exact integer range');
  const big = BigInt(units);
  const negative = big < BigInt(0);
  const digits = (negative ? -big : big).toString().padStart(scale + 1, '0');
  const int = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale);
  return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** Integer sen (1 Rp = 100 sen), the POS / sales unit. */
export const rupiahFromSen = (sen: number | bigint): string => fromMinorUnits(sen, 2);
/** Integer 1/10,000 rupiah ("amount4"), the KOSIPA payroll / loan / savings unit. */
export const rupiahFromAmount4 = (units: number | bigint): string => fromMinorUnits(units, 4);

export type RupiahParseErrorCode =
  | 'INVALID_CHARACTER'
  | 'MALFORMED'
  | 'AMBIGUOUS_SEPARATOR'
  | 'DECIMALS_NOT_ALLOWED'
  | 'PRECISION'
  | 'NEGATIVE_NOT_ALLOWED'
  | 'TOO_LARGE';

export type RupiahParseResult =
  | { ok: true; /** Canonical decimal such as "1250000.75"; null when the field is empty (empty is never zero). */ value: string | null }
  | { ok: false; code: RupiahParseErrorCode; message: string };

export interface ParseRupiahOptions {
  /** Default true. Whole-rupiah workflows pass false and a comma is rejected. */
  allowDecimals?: boolean;
  /** Most decimals accepted. Default 2. Extra non-zero decimals are rejected, never rounded. */
  maxFractionDigits?: number;
  /** Default false. */
  allowNegative?: boolean;
  /** Longest integer part accepted (after leading zeros). Default unlimited. */
  maxIntegerDigits?: number;
}

const FORMAT_HINT = 'Gunakan titik untuk ribuan dan koma untuk desimal, misalnya 1.250.000,75.';
const fail = (code: RupiahParseErrorCode, message: string): RupiahParseResult => ({ ok: false, code, message });

/**
 * Strict Indonesian input parser. `.` is only ever a thousands separator and `,` only ever the decimal separator, so
 * `1.250` is 1250 and `4000.50`, `1,250,000` and `1.25` are rejected as ambiguous rather than guessed.
 * Returns the canonical dot-decimal string compatible with the existing API contracts (`1.250.000,75` -> `1250000.75`).
 */
export function parseRupiahInput(input: string | null | undefined, options: ParseRupiahOptions = {}): RupiahParseResult {
  const allowDecimals = options.allowDecimals ?? true;
  const maxFraction = options.maxFractionDigits ?? 2;
  let text = (input ?? '').replace(/ /g, ' ').trim();
  let negative = false;
  const sign = /^[-−]/.exec(text);
  if (sign) { negative = true; text = text.slice(1).trim(); }
  const symbol = /^rp\.?/i.exec(text);
  if (symbol) text = text.slice(symbol[0].length).trim();
  if (!negative && /^[-−]/.test(text)) { negative = true; text = text.slice(1).trim(); }
  if (text === '' && !negative) return { ok: true, value: null };
  if (/[^0-9.,\s]/.test(text)) return fail('INVALID_CHARACTER', 'Nominal hanya boleh berisi angka, titik, dan koma.');
  if (/\s/.test(text)) return fail('MALFORMED', 'Nominal tidak boleh mengandung spasi di tengah angka.');
  if (text === '') return fail('MALFORMED', 'Nominal belum lengkap.');
  const commaParts = text.split(',');
  if (commaParts.length > 2) return fail('AMBIGUOUS_SEPARATOR', `Format nominal tidak jelas. ${FORMAT_HINT}`);
  const [intRaw, fracRaw] = commaParts;
  if (intRaw === '') return fail('MALFORMED', 'Tulis angka sebelum koma, misalnya 0,5.');
  if (fracRaw !== undefined && !/^\d+$/.test(fracRaw)) {
    return fail(/\./.test(fracRaw) ? 'AMBIGUOUS_SEPARATOR' : 'MALFORMED', /\./.test(fracRaw) ? `Format nominal tidak jelas. ${FORMAT_HINT}` : 'Angka desimal setelah koma belum lengkap.');
  }
  if (/\./.test(intRaw) ? !/^[1-9]\d{0,2}(\.\d{3})+$/.test(intRaw) : !/^\d+$/.test(intRaw)) {
    return fail('AMBIGUOUS_SEPARATOR', `Titik dipakai sebagai pemisah ribuan, bukan desimal. ${FORMAT_HINT}`);
  }
  if (fracRaw !== undefined && !allowDecimals) return fail('DECIMALS_NOT_ALLOWED', 'Nominal harus berupa rupiah bulat, tanpa koma desimal.');
  const int = intRaw.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  let frac = fracRaw ?? '';
  if (frac.length > maxFraction) {
    if (/[1-9]/.test(frac.slice(maxFraction))) {
      return fail('PRECISION', maxFraction === 0 ? 'Nominal harus berupa rupiah bulat.' : `Nominal maksimal ${maxFraction} angka di belakang koma.`);
    }
    frac = frac.slice(0, maxFraction);
  }
  if (options.maxIntegerDigits !== undefined && int.length > options.maxIntegerDigits) return fail('TOO_LARGE', 'Nominal melebihi batas yang diizinkan.');
  const isZero = /^0*$/.test(int + frac);
  if (negative && !isZero && !options.allowNegative) return fail('NEGATIVE_NOT_ALLOWED', 'Nominal tidak boleh negatif.');
  return { ok: true, value: `${negative && !isZero ? '-' : ''}${int}${frac ? `.${frac}` : ''}` };
}

export interface RupiahDraft {
  /** Text to show in the field: grouped integer part and optional `,decimals`. */
  text: string;
  /** Canonical amount for the current text, or null while the field is empty / only a sign. */
  canonical: string | null;
}

/**
 * Live-typing normaliser for monetary inputs. Lenient where `parseRupiahInput` is strict because the user is mid-edit:
 * every `.` is dropped (grouping is re-applied), only the first `,` is kept, stray characters are removed and the
 * integer / decimal lengths are capped. Paste goes through `parseRupiahInput` first so dotted decimals are never
 * silently reinterpreted.
 */
export function draftRupiahInput(raw: string, options: ParseRupiahOptions = {}): RupiahDraft {
  const allowDecimals = options.allowDecimals ?? true;
  const maxFraction = allowDecimals ? options.maxFractionDigits ?? 2 : 0;
  let source = raw.replace(/ /g, ' ');
  let negative = false;
  if (options.allowNegative && /^\s*[-−]/.test(source)) { negative = true; source = source.replace(/^\s*[-−]/, ''); }
  const commaAt = allowDecimals ? source.indexOf(',') : -1;
  const intDigits = (commaAt === -1 ? source : source.slice(0, commaAt)).replace(/\D/g, '');
  const hasComma = commaAt !== -1;
  let int = intDigits.replace(/^0+(?=\d)/, '');
  if (options.maxIntegerDigits !== undefined) int = int.slice(0, options.maxIntegerDigits);
  const frac = hasComma ? source.slice(commaAt + 1).replace(/\D/g, '').slice(0, maxFraction) : '';
  const nothing = int === '' && !hasComma;
  if (nothing) return { text: negative ? '-' : '', canonical: null };
  const shownInt = int === '' ? '0' : int;
  const text = `${negative ? '-' : ''}${group(shownInt)}${hasComma ? `,${frac}` : ''}`;
  const isZero = /^0*$/.test(shownInt + frac);
  return { text, canonical: `${negative && !isZero ? '-' : ''}${shownInt}${frac ? `.${frac}` : ''}` };
}

/** Text the input should show for an existing canonical amount (`"1250000.50"` -> `"1.250.000,50"`, decimals kept as given); empty stays empty. */
export function rupiahInputText(canonical: string | null | undefined): string {
  if (canonical === null || canonical === undefined || canonical === '') return '';
  const decimal = parseDecimal(canonical);
  return `${decimal.negative ? '-' : ''}${group(decimal.int)}${decimal.frac ? `,${decimal.frac}` : ''}`;
}
