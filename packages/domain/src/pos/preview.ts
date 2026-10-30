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

/** Match the existing checkout contract; previews never replace server validation. */
export const MAX_CART_QUANTITY = 9999;

export function quantityError(product: PreviewProduct, quantity: number): 'invalid' | 'stock' | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_CART_QUANTITY) return 'invalid';
  if (quantity > product.stock || product.stock <= 0) return 'stock';
  return null;
}

/** Invalid absolute input must never remove a line or silently clamp its quantity. */
export function setQuantity<Product extends PreviewProduct>(cart: PreviewCartLine<Product>[], product: Product, quantity: number): PreviewCartLine<Product>[] {
  const current = cart.find((line) => line.product.id === product.id);
  if (quantityError(product, quantity) || (!current && !hasPrice(product))) return cart;
  if (!current) return [...cart, { product, quantity }];
  if (current.quantity === quantity && current.product === product) return cart;
  return cart.map((line) => line.product.id === product.id ? { ...line, product, quantity } : line);
}

/** In-memory preview only. Retain the existing minus-at-one removal behavior. */
export function changeQuantity<Product extends PreviewProduct>(cart: PreviewCartLine<Product>[], product: Product, delta: 1 | -1): PreviewCartLine<Product>[] {
  const current = cart.find((line) => line.product.id === product.id);
  const quantity = (current?.quantity ?? 0) + delta;
  if (product.stock <= 0 || (delta === 1 && !hasPrice(product))) return cart;
  if (quantity <= 0) return cart.filter((line) => line.product.id !== product.id);
  return setQuantity(cart, product, quantity);
}

/** Sold price per unit in sen, as the legacy POS does: list price minus the nominal item discount. */
export function netPriceSen(product: PreviewProduct): number { return product.priceSen - product.discountSen; }

/** Untaxed integer-sen subtotal for display, never an authoritative transaction total (server recomputes at checkout). */
export function previewSubtotal(cart: PreviewCartLine[]): number {
  return cart.reduce((sum, line) => sum + netPriceSen(line.product) * line.quantity, 0);
}
