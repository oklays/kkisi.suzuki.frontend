import { fail, object, productId, integer, text, amount } from './product-validation.ts';
export { ProductEditError, type ProductEditErrorCode } from './product-edit-error.ts';
export { productId } from './product-validation.ts';
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
function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return fail();
  return value;
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
