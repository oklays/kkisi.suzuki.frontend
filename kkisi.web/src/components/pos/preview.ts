import type { PosCategory, PosProduct, PreviewCartLine } from "@/application/pos/contracts";

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

export function catalogCategories(products: readonly PosProduct[]): PosCategory[] {
  return Array.from(new Map(products.map((product) => [product.categoryId, {
    id: product.categoryId, name: product.categoryName,
  }])).values());
}

export function filterProducts(products: readonly PosProduct[], query: string, categoryId: string | null): PosProduct[] {
  const search = query.trim().toLowerCase();
  return products.filter((product) =>
    (categoryId === null || product.categoryId === categoryId) &&
    [product.name, product.code, product.barcode ?? ""].some((value) => value.toLowerCase().includes(search)),
  );
}

/** In-memory preview only. Server stock validation belongs to the future use case. */
export function changeQuantity(cart: PreviewCartLine[], product: PosProduct, delta: 1 | -1): PreviewCartLine[] {
  const current = cart.find((line) => line.product.id === product.id);
  const quantity = (current?.quantity ?? 0) + delta;
  if (quantity > product.stock || product.stock <= 0) return cart;
  if (quantity <= 0) return cart.filter((line) => line.product.id !== product.id);
  if (!current) return [...cart, { product, quantity }];
  return cart.map((line) => line.product.id === product.id ? { product, quantity } : line);
}

/** Untaxed fixture subtotal, never an authoritative transaction total. */
export function previewSubtotal(cart: PreviewCartLine[]): number {
  return cart.reduce((sum, line) => sum + line.product.unitPriceRp * line.quantity, 0);
}

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
export function formatRupiah(value: number): string { return rupiah.format(value); }
