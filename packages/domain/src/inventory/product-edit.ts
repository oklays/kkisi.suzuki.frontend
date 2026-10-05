export type ProductEditErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'STOCK_LOCKED' | 'PRODUCT_CHANGED' | 'IDENTIFIER_EXISTS' | 'WRITE_NOT_CONFIGURED';
export class ProductEditError extends Error {
  readonly code: ProductEditErrorCode;
  constructor(code: ProductEditErrorCode) { super(code); this.name = 'ProductEditError'; this.code = code; }
}
export type ProductEditInput = {
  id: number; revision: string; code: string; sku: string; name: string; barcode: string; packBarcode: string; description: string;
  categoryId: number | null; brandId: number | null; unitId: number | null; packQuantity: number;
  sellingPrice: string; purchasePrice: string; discount: string; alertQty: number; active: boolean;
};
export type ProductAdjustmentInput = { id: number; revision: string; quantity: number; reason: 'Rusak' | 'Expired' | 'Hilang' | 'Penyesuaian' };
export type ProductEditSnapshot = {
  product: ProductEditInput; stock: number; locked: boolean; stockEditable: boolean;
  options: { categories: ProductEditOption[]; brands: ProductEditOption[]; units: ProductEditOption[] };
};
export type ProductEditOption = { id: number; name: string; active: boolean };
function fail(): never { throw new ProductEditError('INVALID_INPUT'); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !keys.includes(key))) return fail();
  return raw;
}
export function productId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2147483647) return fail();
  return value;
}
function integer(value: unknown, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) return fail();
  return value;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string') return fail();
  const out = value.trim();
  if (out.length > max || (required && !out) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(out)) return fail();
  return out;
}
function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return fail();
  return value;
}
function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value)) return fail();
  const [whole, fraction = ''] = value.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}
const association = (value: unknown) => value === null ? null : productId(value);
export function parseProductEdit(value: unknown): ProductEditInput {
  const r = object(value, ['id','revision','code','sku','name','barcode','packBarcode','description','categoryId','brandId','unitId','packQuantity','sellingPrice','purchasePrice','discount','alertQty','active']);
  if (typeof r.active !== 'boolean') return fail();
  const out = { id: productId(r.id), revision: revision(r.revision), code: text(r.code,100,true), sku: text(r.sku,100), name: text(r.name,100,true), barcode: text(r.barcode,100), packBarcode: text(r.packBarcode,100), description: text(r.description,5000), categoryId: association(r.categoryId), brandId: association(r.brandId), unitId: association(r.unitId), packQuantity: productId(r.packQuantity), sellingPrice: amount(r.sellingPrice), purchasePrice: amount(r.purchasePrice), discount: amount(r.discount), alertQty: integer(r.alertQty), active: r.active };
  if (BigInt(out.discount.replace('.','')) > BigInt(out.sellingPrice.replace('.',''))) return fail();
  return out;
}
export function parseProductAdjustment(value: unknown): ProductAdjustmentInput {
  const r = object(value, ['id','revision','quantity','reason']);
  if (!['Rusak','Expired','Hilang','Penyesuaian'].includes(String(r.reason))) return fail();
  return { id: productId(r.id), revision: revision(r.revision), quantity: integer(r.quantity), reason: r.reason as ProductAdjustmentInput['reason'] };
}
