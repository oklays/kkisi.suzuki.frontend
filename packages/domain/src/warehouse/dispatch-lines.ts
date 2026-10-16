import { WarehouseError } from './errors.ts';
import { resolveMapping, type ItemFacts, type ItemMapping } from './item-mapping.ts';
import { convertQuantity } from './unit-conversion.ts';
import { positiveQuantity } from './quantity.ts';
import type { ShipmentLine } from './shipment.ts';

/**
 * Builds the shipment lines from a Gudang dispatch document by resolving every item through a CONFIRMED mapping and
 * converting its quantity exactly once into TOKO units. Fails the whole document on the first problem (unknown, unmapped,
 * unconfirmed, retired, ambiguous or inactive item; inexact conversion; zero quantity; the same item twice): a dispatch
 * is never partially accepted.
 */
export type RawDispatchLine = { gudangItemId: number; quantity: number };
export type ItemLookup = { gudangItem(id: number): ItemFacts | null; storeItem(storeCompanyId: number, id: number): ItemFacts | null };

export function buildShipmentLines(raw: readonly RawDispatchLine[], storeCompanyId: number, book: readonly ItemMapping[], items: ItemLookup): ShipmentLine[] {
  if (!raw || raw.length === 0) throw new WarehouseError('NO_LINES');
  const seen = new Set<number>();
  return raw.map((r, index) => {
    if (seen.has(r.gudangItemId)) throw new WarehouseError('DUPLICATE_LINE');
    seen.add(r.gudangItemId);
    const quantity = positiveQuantity(r.quantity);
    // Resolve through the book first: the TOKO item to look up is the one the (single, live) mapping names, never an id guess.
    const live = book.filter((m) => m.gudangItemId === r.gudangItemId && m.storeCompanyId === storeCompanyId && m.status !== 'RETIRED');
    const mapping = resolveMapping(book, r.gudangItemId, storeCompanyId, {
      gudangItem: items.gudangItem(r.gudangItemId),
      storeItem: live.length === 1 ? items.storeItem(storeCompanyId, live[0].storeItemId) : null,
    });
    return {
      lineNo: index + 1, gudangItemId: mapping.gudangItemId, storeItemId: mapping.storeItemId, mappingRef: mapping.ref,
      gudangQuantity: quantity, gudangUnit: mapping.gudangUnit, expectedQuantity: convertQuantity(quantity, mapping.conversion), storeUnit: mapping.storeUnit,
    };
  });
}
