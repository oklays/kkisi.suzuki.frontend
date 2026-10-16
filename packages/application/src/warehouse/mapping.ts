import { WarehouseError, confirmMapping, proposeMapping, retireMapping, suggestCandidates, type ItemMapping, type MappingBasis, type Suggestion, type UnitConversion } from '@koperasi/domain/warehouse';
import { RepositoryConflict, WAREHOUSE_PERMISSIONS, type WarehouseActor, type WarehouseDeps } from './ports.ts';

type MappingDeps = Pick<WarehouseDeps, 'mappings' | 'shipments' | 'items' | 'now'>;
const need = (actor: WarehouseActor) => { if (!actor.permissions.has(WAREHOUSE_PERMISSIONS.MAPPING_MANAGE)) throw new WarehouseError('FORBIDDEN'); };
const stamp = (d: MappingDeps) => d.now().toISOString();
const facts = async (d: MappingDeps, gudangItemId: number, storeCompanyId: number, storeItemId: number) => ({
  gudangItem: (await d.items.gudangItems([gudangItemId])).get(gudangItemId) ?? null,
  storeItem: (await d.items.storeItems(storeCompanyId, [storeItemId])).get(storeItemId) ?? null,
});

/** Candidates only (exact barcode, then exact code; never names). Nothing is stored until propose + confirm. */
export async function suggestMappings(d: MappingDeps, actor: WarehouseActor, input: { gudangItemId: number; storeCompanyId: number }): Promise<Suggestion> {
  need(actor);
  const gudangItem = (await d.items.gudangItems([input.gudangItemId])).get(input.gudangItemId);
  if (!gudangItem) throw new WarehouseError('ITEM_NOT_FOUND');
  return suggestCandidates(gudangItem, await d.items.storeItemsByIdentifiers(input.storeCompanyId, { barcode: gudangItem.barcode, code: gudangItem.code }));
}

export async function proposeItemMapping(d: MappingDeps, actor: WarehouseActor, input: { gudangItemId: number; storeCompanyId: number; storeItemId: number; conversion: UnitConversion; basis: MappingBasis }): Promise<ItemMapping> {
  need(actor);
  const { gudangItem, storeItem } = await facts(d, input.gudangItemId, input.storeCompanyId, input.storeItemId);
  const mapping = proposeMapping({ gudangItem, storeCompanyId: input.storeCompanyId, storeItem, conversion: input.conversion, basis: input.basis, actorUserId: actor.userId, at: stamp(d) }, await d.mappings.listForBranch(input.storeCompanyId));
  try { await d.mappings.insert(mapping); }
  catch (error) { if (error instanceof RepositoryConflict) throw new WarehouseError('DUPLICATE_MAPPING'); throw error; }   // a concurrent proposal won the unique key
  return mapping;
}

export async function confirmItemMapping(d: MappingDeps, actor: WarehouseActor, input: { ref: string }): Promise<ItemMapping> {
  need(actor);
  const existing = await d.mappings.find(input.ref);
  if (!existing) throw new WarehouseError('MAPPING_NOT_FOUND');
  const confirmed = confirmMapping(existing, await facts(d, existing.gudangItemId, existing.storeCompanyId, existing.storeItemId), actor.userId, stamp(d));
  if (!(await d.mappings.update(confirmed, 'PROPOSED'))) throw new WarehouseError('CONCURRENT_MODIFICATION');
  return confirmed;
}

/** A mapping that open shipments still reference cannot be retired: receiving them must keep resolving the same item. */
export async function retireItemMapping(d: MappingDeps, actor: WarehouseActor, input: { ref: string; reason: string }): Promise<ItemMapping> {
  need(actor);
  const existing = await d.mappings.find(input.ref);
  if (!existing) throw new WarehouseError('MAPPING_NOT_FOUND');
  const retired = retireMapping(existing, actor.userId, stamp(d), input.reason);
  if (await d.shipments.hasOpenShipmentForMapping(existing.ref)) throw new WarehouseError('MAPPING_IN_USE');
  if (!(await d.mappings.update(retired, existing.status))) throw new WarehouseError('CONCURRENT_MODIFICATION');
  return retired;
}
