import { fail, object, productId, integer, text, amount } from './product-validation.ts';
import type { ProductEditOption } from './product-edit.ts';

// Mirrors legacy items/add (Items_model::verify_and_save) using existing db_items/db_stockentry columns only.
export const productTypes = ['Produk Jadi', 'PPOB'] as const;
export type ProductType = typeof productTypes[number];
export type ProductTaxType = 'Inclusive' | 'Exclusive';
export type ProductCreateInput = {
  code: string; sku: string; name: string; barcode: string; packBarcode: string; description: string; type: ProductType;
  categoryId: number; brandId: number | null; unitId: number; packQuantity: number; consignment: boolean;
  basePrice: string; taxId: number; taxType: ProductTaxType; sellingPrice: string; discount: string;
  openingStock: number; alertQty: number; expiryDate: string | null; active: boolean;
};
export type ProductTaxOption = { id: number; name: string; rate: string };
export type ProductCreateOptions = { categories: ProductEditOption[]; brands: ProductEditOption[]; units: ProductEditOption[]; taxes: ProductTaxOption[]; codePrefix: string };
export type ProductCreateResult = { id: number; code: string; name: string; stock: number };
export type ProductPricing = { purchasePrice: string; profitMargin: string; discountPercent: string };

const ZERO = BigInt(0), TWO = BigInt(2), HUNDRED = BigInt(100), SCALE = BigInt(10000);
const cents = (value: string) => BigInt(value.replace('.', ''));
function format(hundredths: bigint): string {
  const sign = hundredths < ZERO ? '-' : '', abs = hundredths < ZERO ? -hundredths : hundredths;
  return `${sign}${abs / HUNDRED}.${String(abs % HUNDRED).padStart(2, '0')}`;
}
// Rounded half away from zero, like legacy toFixed(2) for the values the form produces.
function ratio(numerator: bigint, denominator: bigint): bigint {
  if (denominator === ZERO) return ZERO;
  const negative = numerator < ZERO, abs = negative ? -numerator : numerator;
  const out = (abs * TWO + denominator) / (denominator * TWO);
  return negative ? -out : out;
}
/** Legacy calculate_purchase_price: Inclusive keeps the base price, Exclusive adds the tax rate. */
export function purchasePriceFor(basePrice: string, taxRate: string, taxType: ProductTaxType): string {
  const base = cents(amount(basePrice));
  return format(taxType === 'Inclusive' ? base : base + ratio(base * cents(amount(taxRate)), SCALE));
}
/** Legacy calculate_profit_margin / calculate_diskon_persen, computed from the final saved amounts. */
export function productPricing(input: Pick<ProductCreateInput, 'basePrice' | 'taxType' | 'sellingPrice' | 'discount'>, taxRate: string): ProductPricing {
  const purchasePrice = purchasePriceFor(input.basePrice, taxRate, input.taxType), purchase = cents(purchasePrice), selling = cents(input.sellingPrice);
  return { purchasePrice, profitMargin: format(ratio((selling - purchase) * SCALE, purchase)), discountPercent: format(ratio(cents(input.discount) * SCALE, selling)) };
}
function date(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '2000-01-01') return fail();
  return value;
}
export function parseProductCreate(value: unknown): ProductCreateInput {
  const r = object(value, ['code','sku','name','barcode','packBarcode','description','type','categoryId','brandId','unitId','packQuantity','consignment','basePrice','taxId','taxType','sellingPrice','discount','openingStock','alertQty','expiryDate','active']);
  if (typeof r.active !== 'boolean' || typeof r.consignment !== 'boolean') return fail();
  if (!productTypes.includes(r.type as ProductType) || !['Inclusive', 'Exclusive'].includes(String(r.taxType))) return fail();
  const out: ProductCreateInput = {
    code: text(r.code, 100), sku: text(r.sku, 100), name: text(r.name, 100, true), barcode: text(r.barcode, 100, true), packBarcode: text(r.packBarcode, 100),
    description: text(r.description, 5000), type: r.type as ProductType, categoryId: productId(r.categoryId), brandId: r.brandId === null ? null : productId(r.brandId),
    unitId: productId(r.unitId), packQuantity: productId(r.packQuantity), consignment: r.consignment, basePrice: amount(r.basePrice), taxId: productId(r.taxId),
    taxType: r.taxType as ProductTaxType, sellingPrice: amount(r.sellingPrice), discount: amount(r.discount), openingStock: integer(r.openingStock),
    alertQty: integer(r.alertQty), expiryDate: date(r.expiryDate), active: r.active,
  };
  // SALDOPPOB is the reserved PPOB balance item; PPOB stock is managed by PPOB transactions, as in the editor.
  if ([out.barcode, out.packBarcode].some(code => code.toUpperCase() === 'SALDOPPOB')) return fail();
  if (out.packBarcode && out.packBarcode.toUpperCase() === out.barcode.toUpperCase()) return fail();
  if (out.type === 'PPOB' && out.openingStock !== 0) return fail();
  if (cents(out.discount) > cents(out.sellingPrice)) return fail();
  return out;
}
