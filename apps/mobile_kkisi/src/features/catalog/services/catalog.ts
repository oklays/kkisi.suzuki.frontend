// Catalog query parsing (pure). Only a closed set of sort keys and a bounded search string ever reach the reader.
export const CATALOG_PAGE = 24;
export const CATALOG_MAX = 240;
export type CatalogSort = 'name' | 'price-low' | 'price-high';
export type CatalogParams = { q: string; category: string | null; sort: CatalogSort; shown: number };

export function parseCatalogParams(params: Record<string, string | string[] | undefined>): CatalogParams {
  const one = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '');
  const q = one('q').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60);
  const sort = (['name', 'price-low', 'price-high'] as const).find((s) => s === one('urut')) ?? 'name';
  const n = Number(one('n'));
  const shown = Number.isInteger(n) && n >= CATALOG_PAGE ? Math.min(CATALOG_MAX, Math.ceil(n / CATALOG_PAGE) * CATALOG_PAGE) : CATALOG_PAGE;
  const category = one('kategori').trim().slice(0, 100) || null;
  return { q: q.length >= 2 ? q : '', category, sort, shown };
}

export type CartLine = { id: number; quantity: number };
/** Cart sent by the browser for pricing: at most 50 distinct items, quantities 1-99. Prices are never taken from the client. */
export function parseCartIds(raw: string | null): CartLine[] {
  if (!raw) return [];
  const out = new Map<number, number>();
  for (const part of raw.split(',').slice(0, 50)) {
    const [id, qty] = part.split(':').map(Number);
    if (Number.isSafeInteger(id) && id > 0 && Number.isInteger(qty) && qty >= 1 && qty <= 99) out.set(id, qty);
  }
  return [...out].map(([id, quantity]) => ({ id, quantity }));
}
