import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb, readerSettings } from '../../../server/container.ts';
import { readCatalog, readCatalogCategories, readCatalogItems } from '../../../server/kosipa/store.reader.ts';
import type { CatalogParams, CartLine } from './catalog.ts';

export async function getCatalog(p: CatalogParams) {
  await requireMember();
  return attempt(async () => readCatalog(readerDb(), { companyId: readerSettings().catalogCompanyId, q: p.q, category: p.category, sort: p.sort, limit: p.shown, offset: 0 }));
}

export const getCategories = cache(async () => {
  await requireMember();
  return attempt(async () => readCatalogCategories(readerDb(), readerSettings().catalogCompanyId));
});

/** Current prices for a cart; unknown, inactive or price-less items are reported back, never priced by the client. */
export async function priceCart(lines: CartLine[]) {
  await requireMember();
  const items = await readCatalogItems(readerDb(), readerSettings().catalogCompanyId, lines.map((l) => l.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  return lines.map((l) => ({ ...l, item: byId.get(l.id) ?? null }));
}
