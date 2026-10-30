import { changeQuantity } from '@koperasi/domain/pos/preview';
import type { PosProduct, PreviewCartLine } from './types.ts';

/** Called with an order allocated when the action starts, before any async lookup. */
export function addCartProduct(cart: PreviewCartLine[], product: PosProduct, order: number): PreviewCartLine[] {
  const next: PreviewCartLine[] = changeQuantity(cart, product, 1);
  if (next === cart) return cart;
  return next.map(line => line.product.id === product.id
    ? { ...line, lastAdded: Math.max(line.lastAdded ?? 0, order) }
    : line);
}

/** Sort a copy: checkout retains its existing canonical insertion sequence. */
export function cartDisplayOrder(cart: PreviewCartLine[]): PreviewCartLine[] {
  return [...cart].sort((a, b) => (b.lastAdded ?? 0) - (a.lastAdded ?? 0));
}
