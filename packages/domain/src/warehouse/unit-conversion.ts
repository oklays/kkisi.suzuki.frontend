import { WarehouseError } from './errors.ts';
import { MAX_QUANTITY, positiveQuantity } from './quantity.ts';

/**
 * Unit-of-measure compatibility between a Gudang item and its TOKO counterpart (spec REQ-051). The specs define NO
 * conversion factors, so none exist here: equal units convert 1:1, different units need an explicit ratio that carries
 * the approver and an evidence reference. There is no default, no inference from names, and no rounding.
 *
 * storeQuantity = gudangQuantity * numerator / denominator, and the result must be a whole number.
 */
export type UnitConversion =
  | { kind: 'IDENTICAL' }
  | { kind: 'RATIO'; numerator: number; denominator: number; approvedBy: number; approvedAt: string; evidence: string };

export const MAX_RATIO_TERM = 1000000;
const normalise = (unit: string): string => unit.trim().toLowerCase();

export function validateUnitConversion(gudangUnit: string, storeUnit: string, conversion: UnitConversion): void {
  if (typeof gudangUnit !== 'string' || typeof storeUnit !== 'string' || !normalise(gudangUnit) || !normalise(storeUnit)) throw new WarehouseError('UNIT_MISSING');
  const same = normalise(gudangUnit) === normalise(storeUnit);
  if (!conversion || (conversion.kind !== 'IDENTICAL' && conversion.kind !== 'RATIO')) throw new WarehouseError('UNIT_CONVERSION_INVALID');
  if (conversion.kind === 'IDENTICAL') {
    if (!same) throw new WarehouseError('UNIT_CONVERSION_REQUIRED');   // different units are never assumed equal
    return;
  }
  if (same) throw new WarehouseError('UNIT_CONVERSION_INVALID');      // a ratio between identical units is a data error
  const { numerator, denominator, approvedBy, approvedAt, evidence } = conversion;
  const term = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_RATIO_TERM;
  if (!term(numerator) || !term(denominator)) throw new WarehouseError('UNIT_CONVERSION_INVALID');
  if (!Number.isSafeInteger(approvedBy) || approvedBy <= 0 || typeof approvedAt !== 'string' || !approvedAt || typeof evidence !== 'string' || evidence.trim().length < 3) {
    throw new WarehouseError('UNIT_CONVERSION_INVALID');             // unapproved or undocumented factors are refused
  }
}

/** Exact conversion of a dispatch quantity into TOKO units. Throws UNIT_CONVERSION_INEXACT instead of rounding. */
export function convertQuantity(gudangQuantity: number, conversion: UnitConversion): number {
  const quantity = positiveQuantity(gudangQuantity);
  if (conversion.kind === 'IDENTICAL') return quantity;
  const scaled = quantity * conversion.numerator;                      // <= 2^31 * 10^6 < 2^53: exact in a double
  if (scaled % conversion.denominator !== 0) throw new WarehouseError('UNIT_CONVERSION_INEXACT');
  const result = scaled / conversion.denominator;
  if (result > MAX_QUANTITY) throw new WarehouseError('QUANTITY_OVERFLOW');
  return result;
}
