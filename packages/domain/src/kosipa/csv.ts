import { KosipaError } from './errors.ts';

/**
 * Safe CSV writer for report exports (RFC 4180 quoting, CRLF). Two guarantees that matter for financial exports:
 *  1. FORMULA INJECTION: every text cell that a spreadsheet could read as a formula (leading `=`, `+`, `-`, `@`, TAB, CR, LF, or one of
 *     those after leading spaces) is prefixed with an apostrophe, so data such as a name or a document number can never execute.
 *  2. EXACT NUMBERS: amounts are written from exact decimal TEXT (`{ decimal }`, validated), never from floating point, and are the only
 *     cells that may start with `-`. Sub-sen precision is preserved (up to 4 decimals).
 */
export type CsvCell = string | number | null | { decimal: string };
const DECIMAL = /^-?\d{1,18}(\.\d{1,4})?$/;

export function neutralizeFormula(text: string): string {
  const cleaned = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  return /^[ ]*[=+\-@\t\r\n]/.test(cleaned) ? `'${cleaned}` : cleaned;
}

export function csvCell(cell: CsvCell): string {
  let text: string;
  if (cell === null) return '';
  if (typeof cell === 'number') { if (!Number.isSafeInteger(cell)) throw new KosipaError('AMOUNT_INVALID'); text = String(cell); }
  else if (typeof cell === 'object') { if (!DECIMAL.test(cell.decimal)) throw new KosipaError('AMOUNT_INVALID'); text = cell.decimal; }
  else text = neutralizeFormula(cell);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export const csvLine = (cells: readonly CsvCell[]): string => cells.map(csvCell).join(',');
export const csvDocument = (lines: readonly (readonly CsvCell[])[]): string => `${lines.map(csvLine).join('\r\n')}\r\n`;

/** amount4 (integer 1/10,000 rupiah) -> exact decimal text with at least 2 decimals, e.g. 500006666 -> "50000.6666", 1500000000 -> "150000.00". */
export function amount4ToDecimal(units: number): { decimal: string } {
  if (!Number.isSafeInteger(units)) throw new KosipaError('AMOUNT_INVALID');
  const abs = Math.abs(units);
  let frac = String(abs % 10000).padStart(4, '0').replace(/0+$/, '');
  if (frac.length < 2) frac = frac.padEnd(2, '0');
  return { decimal: `${units < 0 ? '-' : ''}${Math.floor(abs / 10000)}.${frac}` };
}
