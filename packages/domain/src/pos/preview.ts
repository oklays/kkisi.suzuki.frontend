export type PreviewProduct = {
  id: string;
  stock: number;
  priceSen: number;
  discountSen: number;
};

export type PreviewCartLine<Product extends PreviewProduct = PreviewProduct> = {
  product: Product;
  quantity: number;
};

/** A product with no price in the DB (legacy has 38 such active items) must never be added to a cart. */
export function hasPrice(product: PreviewProduct): boolean { return netPriceSen(product) > 0; }

/** In-memory preview only. Server stock validation belongs to the future use case. */
export function changeQuantity<Product extends PreviewProduct>(cart: PreviewCartLine<Product>[], product: Product, delta: 1 | -1): PreviewCartLine<Product>[] {
  const current = cart.find((line) => line.product.id === product.id);
  const quantity = (current?.quantity ?? 0) + delta;
  if (quantity > product.stock || product.stock <= 0 || (delta === 1 && !hasPrice(product))) return cart;
  if (quantity <= 0) return cart.filter((line) => line.product.id !== product.id);
  if (!current) return [...cart, { product, quantity }];
  return cart.map((line) => line.product.id === product.id ? { product, quantity } : line);
}

/** Sold price per unit in sen, as the legacy POS does: list price minus the nominal item discount. */
export function netPriceSen(product: PreviewProduct): number { return product.priceSen - product.discountSen; }

/** Untaxed integer-sen subtotal for display, never an authoritative transaction total (server recomputes at checkout). */
export function previewSubtotal(cart: PreviewCartLine[]): number {
  return cart.reduce((sum, line) => sum + netPriceSen(line.product) * line.quantity, 0);
}
