import { toMinorUnits } from '../money/money.ts';

export type InventoryErrorCode = 'INVALID_INPUT' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'CSRF' | 'NOT_FOUND' | 'STOCK_LOCKED' | 'STOCK_CHANGED' | 'DOCUMENT_IMMUTABLE' | 'EMPTY_DOCUMENT' | 'NAME_EXISTS' | 'REQUEST_CONFLICT' | 'WRITE_NOT_CONFIGURED' | 'INVENTORY_UNAVAILABLE';
export class InventoryError extends Error {
  readonly code: InventoryErrorCode;
  constructor(code: InventoryErrorCode) { super(code); this.name = 'InventoryError'; this.code = code; }
}
export type Warehouse = { id: number; name: string; mobile: string; email: string; status: 0 | 1 };
export type StockOpname = { id: number; docNo: string; period: string; startDate: string | null; endDate: string | null; status: 0 | 1; remarks: string; createdBy: string; managed: boolean };
export type StockOpnameLine = { itemId: number; name: string; barcode: string; systemQty: number; actualQty: number; adjustmentQty: number; purchasePrice: string; subtotal: string; note: string };
export type StockOpnameDetail = { document: StockOpname; lines: StockOpnameLine[] };
export type InventoryItem = { id: number; name: string; barcode: string; stock: number; locked: boolean };
export type StockOpnameCreate = { requestKey: string; period: string; startDate: string; endDate: string; remarks: string };
export type StockOpnameCount = { id: number; itemId: number; actualQty: number; note: string };
export type WarehouseInput = Omit<Warehouse, 'id'> & { id?: number };
const fail = (): never => { throw new InventoryError('INVALID_INPUT'); };
const int = (value: unknown, min: number, max = 2147483647): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return fail();
  return value;
};
export const inventoryId = (value: unknown): number => int(value, 1);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max: number, required = false): string => {
  if (typeof value !== 'string' || value.length > max) return fail();
  const result = value.trim();
  if (required && !result) return fail();
  return result;
};
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || value > '9999-12-31') return fail();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return fail();
  return value;
};
export function parseStockOpnameCreate(value: unknown): StockOpnameCreate {
  const v = object(value);
  if (typeof v.requestKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.requestKey)) return fail();
  const startDate = date(v.startDate), endDate = date(v.endDate);
  if (startDate > endDate) return fail();
  return { requestKey: v.requestKey.toLowerCase(), period: text(v.period, 50, true), startDate, endDate, remarks: text(v.remarks, 1000) };
}
export function parseStockOpnameCount(value: unknown): StockOpnameCount {
  const v = object(value);
  return { id: inventoryId(v.id), itemId: inventoryId(v.itemId), actualQty: int(v.actualQty, 0), note: text(v.note, 1000) };
}
export function parseWarehouse(value: unknown): WarehouseInput {
  const v = object(value), email = text(v.email, 100);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail();
  return { ...(v.id === undefined ? {} : { id: inventoryId(v.id) }), name: text(v.name, 100, true), mobile: text(v.mobile, 20), email, status: int(v.status, 0, 1) as 0 | 1 };
}
export function calculateStockCount(systemQty: number, actualQty: number, purchasePrice: string): { adjustmentQty: number; subtotal: string } {
  int(systemQty, -2147483648); int(actualQty, 0);
  const adjustmentQty = int(actualQty - systemQty, -2147483648);
  let price: number;
  try { price = toMinorUnits(purchasePrice); } catch { return fail(); }
  if (price < 0) return fail();
  // Legacy SO subtotal is the physical stock valuation; the signed difference belongs to the audit qty.
  const total = price * actualQty;
  if (!Number.isSafeInteger(total)) return fail();
  const absolute = Math.abs(total);
  const subtotal = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  // Safe integer sen can still lose a cent in legacy DOUBLE(18,2); reject before persisting an unapprovable count.
  if (Number(subtotal).toFixed(2) !== subtotal) return fail();
  return { adjustmentQty, subtotal };
}
