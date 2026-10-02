import type { PosProduct, PreviewCartLine } from "@/application/pos/contracts";

const families: Record<string, string> = {
  minuman: "minuman", makanan: "makanan", sembako: "sembako",
  "rumah tangga": "rumah-tangga", lainnya: "lainnya",
};

export function illustrationFamily(categoryName: string): string {
  return families[categoryName.trim().toLowerCase()] ?? "lainnya";
}

export function productIllustration(product: PosProduct): string {
  let hash = 0;
  for (const character of product.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `/illustrations/${illustrationFamily(product.categoryName)}-illustration-${product.illustrationIndex ?? hash % 6 + 1}.svg`;
}

export function productImage(product: PosProduct): string {
  return product.imageUrl || productIllustration(product);
}

/** A product with no price in the DB (legacy has 38 such active items) must never be added to a cart. */
export function hasPrice(product: PosProduct): boolean { return netPriceSen(product) > 0; }

/** In-memory preview only. Server stock validation belongs to the future use case. */
export function changeQuantity(cart: PreviewCartLine[], product: PosProduct, delta: 1 | -1): PreviewCartLine[] {
  const current = cart.find((line) => line.product.id === product.id);
  const quantity = (current?.quantity ?? 0) + delta;
  if (quantity > product.stock || product.stock <= 0 || (delta === 1 && !hasPrice(product))) return cart;
  if (quantity <= 0) return cart.filter((line) => line.product.id !== product.id);
  if (!current) return [...cart, { product, quantity }];
  return cart.map((line) => line.product.id === product.id ? { product, quantity } : line);
}

/** Sold price per unit in sen, as the legacy POS does: list price minus the nominal item discount. */
export function netPriceSen(product: PosProduct): number { return product.priceSen - product.discountSen; }

/** Untaxed integer-sen subtotal for display, never an authoritative transaction total (server recomputes at checkout). */
export function previewSubtotal(cart: PreviewCartLine[]): number {
  return cart.reduce((sum, line) => sum + netPriceSen(line.product) * line.quantity, 0);
}

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const rupiahFraction = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Display only: takes integer sen, shows whole rupiah unless there is a fraction (e.g. 4000.10). */
export function formatRupiah(sen: number): string {
  return sen % 100 === 0 ? rupiah.format(sen / 100) : rupiahFraction.format(sen / 100);
}
