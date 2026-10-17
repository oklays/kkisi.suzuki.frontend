import { RepositoryConflict, type ItemCatalog, type MappingRepository, type ShipmentRepository } from '@koperasi/application/warehouse';
import type { MappingReadRepository, ShipmentReadRepository } from '@koperasi/application/warehouse';
import type { ItemFacts, ItemMapping, Shipment } from '@koperasi/domain/warehouse';

/**
 * In-memory implementation of the Warehouse ports with the REAL contracts (unique keys, compare-and-set on version, scoped lists). It is the
 * only Warehouse "source" that exists in this application: it backs the clearly labelled SYNTHETIC preview and the tests. It is not a Gudang
 * adapter and never connects to anything. A real adapter (local rehearsal: `warehouse-store.repository.ts`; production: not approved) implements the same ports.
 */
const clone = <T>(v: T): T => structuredClone(v);

export class MemoryWarehouseStore implements MappingRepository, MappingReadRepository, ShipmentRepository, ShipmentReadRepository, ItemCatalog {
  private readonly mappings = new Map<string, ItemMapping>();
  private readonly shipments = new Map<string, Shipment>();
  private readonly gudang = new Map<number, ItemFacts>();
  private readonly store = new Map<string, ItemFacts & { companyId: number }>();
  private key(ref: string, dest: number) { return `${dest}|${ref}`; }

  seedGudangItem(item: ItemFacts) { this.gudang.set(item.id, clone(item)); }
  seedStoreItem(companyId: number, item: ItemFacts) { this.store.set(`${companyId}:${item.id}`, { ...clone(item), companyId }); }

  // MappingRepository
  async listForBranch(company: number) { return [...this.mappings.values()].filter((m) => m.storeCompanyId === company).map(clone); }
  async find(ref: string): Promise<ItemMapping | null>;
  async find(ref: string, destination: number): Promise<Shipment | null>;
  async find(ref: string, destination?: number): Promise<ItemMapping | Shipment | null> {
    if (destination === undefined) { const m = this.mappings.get(ref); return m ? clone(m) : null; }
    const s = this.shipments.get(this.key(ref, destination)); return s ? clone(s) : null;
  }
  async insert(entity: ItemMapping | Shipment): Promise<void> {
    if ('sourceRef' in entity) { const k = this.key(entity.sourceRef, entity.destinationStoreCompanyId); if (this.shipments.has(k)) throw new RepositoryConflict('ALREADY_EXISTS'); this.shipments.set(k, clone(entity)); return; }
    for (const other of this.mappings.values()) {
      if (other.status === 'RETIRED' || other.storeCompanyId !== entity.storeCompanyId) continue;
      if (other.gudangItemId === entity.gudangItemId || other.storeItemId === entity.storeItemId || other.ref === entity.ref) throw new RepositoryConflict('ALREADY_EXISTS');
    }
    this.mappings.set(entity.ref, clone(entity));
  }
  async update(m: ItemMapping, expectedStatus: ItemMapping['status']) { const cur = this.mappings.get(m.ref); if (!cur || cur.status !== expectedStatus) return false; this.mappings.set(m.ref, clone(m)); return true; }
  async list(filter: { storeCompanyId: number | null; status: ItemMapping['status'] | null } | { status: Shipment['status'] | null; destinationStoreCompanyId: number | null; sourceWarehouseIds: readonly number[] | null }, limit: number): Promise<never[]> {
    if ('storeCompanyId' in filter) return [...this.mappings.values()].filter((m) => (filter.storeCompanyId === null || m.storeCompanyId === filter.storeCompanyId) && (filter.status === null || m.status === filter.status))
      .sort((a, b) => a.storeCompanyId - b.storeCompanyId || a.gudangItemId - b.gudangItemId).slice(0, limit).map(clone) as never[];
    return [...this.shipments.values()].filter((s) => (filter.status === null || s.status === filter.status) && (filter.destinationStoreCompanyId === null || s.destinationStoreCompanyId === filter.destinationStoreCompanyId) && (filter.sourceWarehouseIds === null || filter.sourceWarehouseIds.includes(s.sourceWarehouseId)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.sourceRef.localeCompare(b.sourceRef)).slice(0, limit).map(clone) as never[];
  }

  // ShipmentRepository (save / open-mapping check)
  async save(s: Shipment, expectedVersion: number) { const k = this.key(s.sourceRef, s.destinationStoreCompanyId), cur = this.shipments.get(k); if (!cur || cur.version !== expectedVersion) throw new RepositoryConflict('VERSION_CONFLICT'); this.shipments.set(k, clone(s)); }
  async hasOpenShipmentForMapping(ref: string) { return [...this.shipments.values()].some((s) => s.status !== 'CLOSED' && s.status !== 'CANCELLED' && s.lines.some((l) => l.mappingRef === ref)); }

  // ItemCatalog
  async gudangItems(ids: readonly number[]) { return new Map(ids.filter((id) => this.gudang.has(id)).map((id) => [id, clone(this.gudang.get(id) as ItemFacts)])); }
  async storeItems(company: number, ids: readonly number[]) { return new Map(ids.filter((id) => this.store.has(`${company}:${id}`)).map((id) => [id, clone(this.store.get(`${company}:${id}`) as ItemFacts)])); }
  async storeItemsByIdentifiers(company: number, q: { barcode: string | null; code: string }) {
    const norm = (x: string | null | undefined) => (x ?? '').trim().toLowerCase();
    return [...this.store.values()].filter((i) => i.companyId === company && ((norm(q.barcode) && norm(i.barcode) === norm(q.barcode)) || (norm(q.code) && norm(i.code) === norm(q.code)))).map(clone);
  }
}
