import type { ReactNode } from 'react';
import {
  formatRupiah, formatRupiahAccounting, formatRupiahCompact, formatRupiahDocument, formatRupiahNumberOnly,
  rupiahFromAmount4, rupiahFromSen, type MoneyInput,
} from './format.ts';
import './money.css';

export type CurrencyVariant = 'standard' | 'document' | 'accounting' | 'compact' | 'number';
export type CurrencyUnit = 'rupiah' | 'sen' | 'amount4';

export interface CurrencyTextProps {
  /** Exact amount: decimal string / bigint / number, or integer minor units when `unit` says so. null / undefined show the placeholder. */
  value: MoneyInput;
  /** `rupiah` (default) is a decimal amount; `sen` is integer 1/100; `amount4` is KOSIPA's integer 1/10,000. */
  unit?: CurrencyUnit;
  /**
   * standard `Rp1.250.000` · document `Rp1.250.000,00` · accounting `(Rp1.250.000,00)` · number `1.250.000` (put "Rp" in the column header)
   * · compact `Rp1,25 juta` (dashboard summaries only; the exact amount stays available to every reader).
   */
  variant?: CurrencyVariant;
  placeholder?: string;
  className?: string;
  /** Rendered instead of the amount text when the value is unusable. Defaults to a visible "Nominal tidak valid". */
  invalid?: ReactNode;
}

function toDecimal(value: MoneyInput, unit: CurrencyUnit): MoneyInput {
  if (value === null || value === undefined || unit === 'rupiah') return value;
  if (typeof value === 'string') throw new RangeError('Minor units must be a number or bigint');
  return unit === 'sen' ? rupiahFromSen(value) : rupiahFromAmount4(value);
}

const FORMATTERS = {
  standard: formatRupiah, document: formatRupiahDocument, accounting: formatRupiahAccounting, compact: formatRupiahCompact, number: formatRupiahNumberOnly,
} as const;

/**
 * The one way to show a Rupiah amount in JSX: right-alignable (`.money`), tabular, never wrapped. Negatives carry a
 * minus sign (or parentheses), not just a colour. Compact figures expose the exact amount in a tooltip and to screen readers.
 */
export function CurrencyText({ value, unit = 'rupiah', variant = 'standard', placeholder, className, invalid }: CurrencyTextProps) {
  const classes = `money${variant === 'compact' ? ' money-compact' : ''}${className ? ` ${className}` : ''}`;
  let text: string;
  let exact: string | null = null;
  try {
    const decimal = toDecimal(value, unit);
    text = FORMATTERS[variant](decimal, { placeholder });
    if (variant === 'compact' && decimal !== null && decimal !== undefined) exact = formatRupiah(decimal);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return <span className={`${classes} money-invalid`} role="img" aria-label="Nominal tidak valid">{invalid ?? 'Nominal tidak valid'}</span>;
  }
  const negative = text.startsWith('-') || text.startsWith('(');
  if (exact === null || exact === text) return <span className={classes} data-negative={negative || undefined}>{text}</span>;
  return <span className={classes} data-negative={negative || undefined} title={exact}><span aria-hidden="true">{text}</span><span className="sr-only">{exact}</span></span>;
}
