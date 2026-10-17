import { WarehouseError, reconcile, type ItemMapping, type MappingStatus, type Outcome, type Reconciliation, type Shipment, type ShipmentStatus } from '@koperasi/domain/warehouse';
import { WAREHOUSE_PERMISSIONS as P, type MovementTreatment, type WarehouseActor } from './ports.ts';

/**
 * Read-only Warehouse presentation use cases (checkpoint 10). They add LIST ports next to the existing aggregate ports and enforce scope exactly like
 * `readShipment`: a Gudang user sees documents of their warehouses, a branch user only documents addressed to their own branch, and a refusal looks the
 * same whether or not a document exists. Every list is bounded (LIST_LIMIT + 1 to detect truncation). Nothing here mutates anything and nothing
 * assumes a Gudang connection: the ports are satisfied today only by the synthetic preview source.
 */
export const LIST_LIMIT = 50;
export interface MappingReadRepository { list(filter: { storeCompanyId: number | null; status: MappingStatus | null }, limit: number): Promise<ItemMapping[]>; }
export interface ShipmentReadRepository { list(filter: { status: ShipmentStatus | null; destinationStoreCompanyId: number | null; sourceWarehouseIds: readonly number[] | null }, limit: number): Promise<Shipment[]>; }
export type WarehouseReadDeps = { mappings: MappingReadRepository; shipments: ShipmentReadRepository; now: () => Date; treatment?: { treatmentFor(m: { sourceWarehouseId: number; destinationStoreCompanyId: number }): MovementTreatment } };

export type MappingListView = { items: ItemMapping[]; truncated: boolean };
export async function listMappingsView(d: WarehouseReadDeps, actor: WarehouseActor, filter: { storeCompanyId?: number | null; status?: MappingStatus | null } = {}): Promise<MappingListView> {
  if (!actor.permissions.has(P.MAPPING_VIEW) && !actor.permissions.has(P.MAPPING_MANAGE)) throw new WarehouseError('FORBIDDEN');
  const storeCompanyId = actor.storeCompanyId ?? filter.storeCompanyId ?? null;   // a branch user is pinned to their own branch whatever the request says
  const rows = await d.mappings.list({ storeCompanyId, status: filter.status ?? null }, LIST_LIMIT + 1);
  return { items: rows.slice(0, LIST_LIMIT), truncated: rows.length > LIST_LIMIT };
}

export type ShipmentSummary = { sourceRef: string; sourceWarehouseId: number; destinationStoreCompanyId: number; status: ShipmentStatus; lines: number; version: number; createdAt: string; outcome: Outcome; totals: Reconciliation['totals']; hasOpenDiscrepancy: boolean; receivingPolicy: Shipment['receivingPolicy']; treatment: MovementTreatment };
const summarize = (d: WarehouseReadDeps, s: Shipment): ShipmentSummary => {
  const r = reconcile(s);
  return { sourceRef: s.sourceRef, sourceWarehouseId: s.sourceWarehouseId, destinationStoreCompanyId: s.destinationStoreCompanyId, status: s.status, lines: s.lines.length, version: s.version, createdAt: s.createdAt, outcome: r.outcome, totals: r.totals, hasOpenDiscrepancy: r.hasOpenDiscrepancy, receivingPolicy: s.receivingPolicy,
    treatment: d.treatment?.treatmentFor({ sourceWarehouseId: s.sourceWarehouseId, destinationStoreCompanyId: s.destinationStoreCompanyId }) ?? 'UNSPECIFIED' };
};
export type ShipmentListView = { items: ShipmentSummary[]; truncated: boolean };
export async function listShipmentsView(d: WarehouseReadDeps, actor: WarehouseActor, filter: { status?: ShipmentStatus | null; destinationStoreCompanyId?: number | null; onlyOpenDiscrepancy?: boolean } = {}): Promise<ShipmentListView> {
  const asWarehouse = actor.permissions.has(P.DISPATCH_VIEW), asBranch = !asWarehouse && actor.permissions.has(P.RECEIVING_VIEW) && actor.storeCompanyId !== null;
  if (!asWarehouse && !asBranch) throw new WarehouseError('FORBIDDEN');
  const rows = await d.shipments.list({ status: filter.status ?? null, destinationStoreCompanyId: asBranch ? actor.storeCompanyId : (filter.destinationStoreCompanyId ?? null), sourceWarehouseIds: asWarehouse ? [...actor.warehouseIds] : null }, LIST_LIMIT + 1);
  // Defence in depth: the repository filter is not trusted for scope.
  const scoped = rows.filter((s) => (asWarehouse ? actor.warehouseIds.has(s.sourceWarehouseId) : s.destinationStoreCompanyId === actor.storeCompanyId));
  const items = scoped.slice(0, LIST_LIMIT).map((s) => summarize(d, s)).filter((s) => !filter.onlyOpenDiscrepancy || s.hasOpenDiscrepancy || s.totals.outstanding > 0);
  return { items, truncated: rows.length > LIST_LIMIT };
}

export type WarehouseOverview = {
  mappings: Record<MappingStatus, number>; shipments: Record<ShipmentStatus, number>; outcomes: Record<Outcome, number>; openDiscrepancies: number; outstandingUnits: number; acceptedUnits: number; truncated: boolean; treatmentUnspecified: number;
};
export async function warehouseOverview(d: WarehouseReadDeps, actor: WarehouseActor): Promise<WarehouseOverview> {
  const mapRows = (actor.permissions.has(P.MAPPING_VIEW) || actor.permissions.has(P.MAPPING_MANAGE)) ? await listMappingsView(d, actor) : { items: [], truncated: false };
  const ships = await listShipmentsView(d, actor);
  const o: WarehouseOverview = { mappings: { PROPOSED: 0, CONFIRMED: 0, RETIRED: 0 }, shipments: { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, DISPATCHED: 0, CLOSED: 0, CANCELLED: 0 }, outcomes: { NOT_RECEIVED: 0, PARTIALLY_RECEIVED: 0, FULLY_RECEIVED: 0, RECEIVED_WITH_DISCREPANCY: 0 },
    openDiscrepancies: 0, outstandingUnits: 0, acceptedUnits: 0, truncated: mapRows.truncated || ships.truncated, treatmentUnspecified: 0 };
  for (const m of mapRows.items) o.mappings[m.status]++;
  for (const s of ships.items) { o.shipments[s.status]++; o.outcomes[s.outcome]++; if (s.hasOpenDiscrepancy) o.openDiscrepancies++; o.outstandingUnits += s.totals.outstanding; o.acceptedUnits += s.totals.accepted; if (s.treatment === 'UNSPECIFIED') o.treatmentUnspecified++; }
  return o;
}
