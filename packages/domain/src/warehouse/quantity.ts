import { WarehouseError } from './errors.ts';

/**
 * Stock quantities in the Warehouse bounded context are whole units (safe integers). Fractional quantities are out of
 * scope until the owner defines how Gudang/TOKO count them; they are refused rather than rounded. The ceiling equals the
 * existing inventory domain's integer limit (2,147,483,647).
 */
export const MAX_QUANTITY = 2147483647;

export function nonNegativeQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new WarehouseError('INVALID_QUANTITY');
  if (value > MAX_QUANTITY) throw new WarehouseError('QUANTITY_OVERFLOW');
  return value;
}

export function positiveQuantity(value: unknown): number {
  const quantity = nonNegativeQuantity(value);
  if (quantity === 0) throw new WarehouseError('ZERO_QUANTITY');
  return quantity;
}

/** Checked addition: a sum above MAX_QUANTITY is an overflow error, never a silently wrong total. */
export function addQuantity(a: number, b: number): number {
  const sum = nonNegativeQuantity(a) + nonNegativeQuantity(b);
  if (sum > MAX_QUANTITY) throw new WarehouseError('QUANTITY_OVERFLOW');
  return sum;
}

export function sumQuantities(values: readonly number[]): number {
  return values.reduce((total, value) => addQuantity(total, value), 0);
}
