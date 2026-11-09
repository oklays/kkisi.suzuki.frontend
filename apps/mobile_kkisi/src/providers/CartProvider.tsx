'use client';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { storageStore, useIsClient, useStore } from '../hooks/browser-store';

// Shopping cart of the current tab session (sessionStorage): catalog ids and quantities plus the display fields of the catalog
// row. Not personal data; prices shown here are re-read from the server at checkout. Cleared on logout.
export type CartItem = { id: number; name: string; category: string; unit: string; price: string; quantity: number };
const MAX_ITEMS = 50;
const EMPTY: CartItem[] = [];

const valid = (x: unknown): x is CartItem => !!x && typeof x === 'object' && Number.isSafeInteger((x as CartItem).id) && (x as CartItem).id > 0
  && Number.isInteger((x as CartItem).quantity) && (x as CartItem).quantity >= 1 && (x as CartItem).quantity <= 99 && /^\d+(\.\d{1,2})?$/.test(String((x as CartItem).price))
  && typeof (x as CartItem).name === 'string';
const cartStore = storageStore<CartItem[]>('session', 'kkisi:cart', (raw) => (Array.isArray(raw) ? raw.filter(valid).slice(0, MAX_ITEMS) : EMPTY), EMPTY);

type Ctx = { items: CartItem[]; ready: boolean; setQuantity: (item: Omit<CartItem, 'quantity'>, quantity: number) => void; clear: () => void };
const CartCtx = createContext<Ctx>({ items: EMPTY, ready: false, setQuantity: () => {}, clear: () => {} });

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useStore(cartStore);
  const ready = useIsClient();
  const setQuantity = useCallback((item: Omit<CartItem, 'quantity'>, quantity: number) => {
    const list = cartStore.get();
    const q = Math.max(0, Math.min(99, quantity));
    const product = { id: item.id, name: item.name, category: item.category, unit: item.unit, price: item.price };
    const next = q === 0 ? list.filter((x) => x.id !== item.id)
      : list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? { ...product, quantity: q } : x))
        : [...list, { ...product, quantity: q }].slice(0, MAX_ITEMS);
    cartStore.set(next);
  }, []);
  const clear = useCallback(() => cartStore.set(null), []);
  const value = useMemo(() => ({ items, ready, setQuantity, clear }), [items, ready, setQuantity, clear]);
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export const useCart = () => useContext(CartCtx);
export const clearStoredCart = () => cartStore.set(null);
