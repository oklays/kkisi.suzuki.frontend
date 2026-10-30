import { MONEY_PLACEHOLDER, type MoneyInput } from './rupiah.ts';

/**
 * Indonesian number-to-words ("terbilang") for Rupiah, computed from exact decimal digits with BigInt, never from a
 * floating-point value. Use it only where a formal document or workflow asks for the amount in words.
 *
 *   1000 -> "Seribu rupiah" · 12500 -> "Dua belas ribu lima ratus rupiah" · 1000.50 -> "Seribu rupiah lima puluh sen"
 *   0 -> "Nol rupiah" · -1000 -> "Minus seribu rupiah"
 *
 * Supports up to 999 kuintiliun (< 10^21) and at most two decimals (sen). Anything else throws a RangeError, or returns
 * `fallback` when one is given, so a wrong monetary statement can never be printed.
 */
export interface TerbilangOptions {
  /** Capitalise the first letter (formal documents). Default true. */
  capitalize?: boolean;
  /** Text for null / undefined. Default the shared money placeholder. */
  placeholder?: string;
  /** Returned instead of throwing when the amount is outside the supported range or precision. */
  fallback?: string;
}

const ONES = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
const SCALES = ['', 'ribu', 'juta', 'miliar', 'triliun', 'kuadriliun', 'kuintiliun'];

/** 1..999 */
function hundreds(n: number): string {
  const words: string[] = [];
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (hundred === 1) words.push('seratus');
  else if (hundred > 1) words.push(`${ONES[hundred]} ratus`);
  if (rest > 0 && rest < 12) words.push(ONES[rest]);
  else if (rest >= 12 && rest < 20) words.push(`${ONES[rest - 10]} belas`);
  else if (rest >= 20) {
    words.push(`${ONES[Math.floor(rest / 10)]} puluh`);
    if (rest % 10) words.push(ONES[rest % 10]);
  }
  return words.join(' ');
}

function wholeWords(whole: bigint): string {
  if (whole === BigInt(0)) return ONES[0];
  const groups: number[] = [];
  const thousand = BigInt(1000);
  for (let rest = whole; rest > BigInt(0); rest /= thousand) groups.push(Number(rest % thousand));
  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const value = groups[index];
    if (value === 0) continue;
    // "seribu", but "satu juta" / "satu miliar".
    words.push(index === 1 && value === 1 ? 'seribu' : `${hundreds(value)}${SCALES[index] ? ` ${SCALES[index]}` : ''}`);
  }
  return words.join(' ');
}

export function formatRupiahTerbilang(value: MoneyInput, options: TerbilangOptions = {}): string {
  if (value === null || value === undefined) return options.placeholder ?? MONEY_PLACEHOLDER;
  try {
    const text = typeof value === 'bigint' ? value.toString() : typeof value === 'number' ? numberText(value) : value.trim();
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) throw new RangeError('Invalid Rupiah amount for terbilang');
    const whole = BigInt(match[2]);
    const fraction = (match[3] ?? '').replace(/0+$/, '');
    if (fraction.length > 2) throw new RangeError('Terbilang supports at most two decimals (sen)');
    if (whole >= BigInt(`1${'0'.repeat(SCALES.length * 3)}`)) throw new RangeError('Amount is beyond the supported terbilang range');
    const sen = Number(fraction.padEnd(2, '0'));
    const parts: string[] = [];
    // 0,50 reads "lima puluh sen"; a bare "nol rupiah" in front of it would be redundant.
    if (whole > BigInt(0) || sen === 0) parts.push(`${wholeWords(whole)} rupiah`);
    if (sen > 0) parts.push(`${hundreds(sen)} sen`);
    const negative = match[1] === '-' && (whole > BigInt(0) || sen > 0);
    const sentence = `${negative ? 'minus ' : ''}${parts.join(' ')}`;
    return options.capitalize === false ? sentence : sentence.charAt(0).toUpperCase() + sentence.slice(1);
  } catch (error) {
    if (options.fallback !== undefined && error instanceof RangeError) return options.fallback;
    throw error;
  }
}

function numberText(value: number): string {
  if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)) || /e/i.test(String(value))) {
    throw new RangeError('Invalid Rupiah amount for terbilang; pass a decimal string or bigint');
  }
  return String(value);
}
