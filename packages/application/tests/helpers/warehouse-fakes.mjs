import { RepositoryConflict } from '../../src/warehouse/ports.ts';

// Synthetic in-memory repositories that emulate the REAL contracts (unique keys, compare-and-set), not just storage:
// a fake that accepted everything would prove nothing about duplicate/concurrent handling. No database, no network.
const clone = (v) => structuredClone(v);

export function makeWarehouseWorld({ gudang = [], store = [] } = {}) {
  const mappings = new Map(), shipments = new Map();
  const log = { shipmentInserts: 0, shipmentSaves: 0, saveAttempts: 0 };
  const hooks = { beforeSave: null };                       // (shipment, expectedVersion, repo) => void | Promise<void>: simulate another writer
  const key = (ref, dest) => `${dest}|${ref}`;

  const mappingRepo = {
    async listForBranch(company) { return [...mappings.values()].filter((m) => m.storeCompanyId === company).map(clone); },
    async find(ref) { const m = mappings.get(ref); return m ? clone(m) : null; },
    async insert(m) {
      for (const other of mappings.values()) {
        if (other.status === 'RETIRED' || other.storeCompanyId !== m.storeCompanyId) continue;
        if (other.gudangItemId === m.gudangItemId || other.storeItemId === m.storeItemId || other.ref === m.ref) throw new RepositoryConflict('ALREADY_EXISTS');
      }
      mappings.set(m.ref, clone(m));
    },
    async update(m, expectedStatus) { const cur = mappings.get(m.ref); if (!cur || cur.status !== expectedStatus) return false; mappings.set(m.ref, clone(m)); return true; },
  };
  const shipmentRepo = {
    async find(ref, dest) { const s = shipments.get(key(ref, dest)); return s ? clone(s) : null; },
    async insert(s) { const k = key(s.sourceRef, s.destinationStoreCompanyId); if (shipments.has(k)) throw new RepositoryConflict('ALREADY_EXISTS'); shipments.set(k, clone(s)); log.shipmentInserts++; },
    async save(s, expectedVersion) {
      log.saveAttempts++;
      if (hooks.beforeSave) await hooks.beforeSave(s, expectedVersion, shipmentRepo);
      const k = key(s.sourceRef, s.destinationStoreCompanyId), cur = shipments.get(k);
      if (!cur || cur.version !== expectedVersion) throw new RepositoryConflict('VERSION_CONFLICT');
      shipments.set(k, clone(s)); log.shipmentSaves++;
    },
    async hasOpenShipmentForMapping(ref) { return [...shipments.values()].some((s) => s.status !== 'CLOSED' && s.status !== 'CANCELLED' && s.lines.some((l) => l.mappingRef === ref)); },
  };
  const g = new Map(gudang.map((i) => [i.id, i])), st = new Map(store.map((i) => [i.companyId + ':' + i.id, i]));
  const items = {
    async gudangItems(ids) { return new Map(ids.filter((id) => g.has(id)).map((id) => [id, clone(g.get(id))])); },
    async storeItems(company, ids) { return new Map(ids.filter((id) => st.has(company + ':' + id)).map((id) => [id, clone(st.get(company + ':' + id))])); },
    async storeItemsByIdentifiers(company, { barcode, code }) {
      const norm = (x) => (x ?? '').trim().toLowerCase();
      return [...st.values()].filter((i) => i.companyId === company && ((norm(barcode) && norm(i.barcode) === norm(barcode)) || (norm(code) && norm(i.code) === norm(code)))).map(clone);
    },
  };
  let tick = 0;
  const deps = { mappings: mappingRepo, shipments: shipmentRepo, items, now: () => new Date(Date.UTC(2026, 9, 16, 5, 0, tick++)) };
  return { deps, mappings, shipments, log, hooks, gudangItems: g, storeItems: st };
}

export const PERM = {
  mapping: 'warehouse.mapping.manage', create: 'warehouse.dispatch.create', approve: 'warehouse.dispatch.approve', release: 'warehouse.dispatch.release', view: 'warehouse.dispatch.view',
  receive: 'toko.receiving.create', resolve: 'toko.receiving.resolve', receivingView: 'toko.receiving.view',
};
export const actor = (userId, perms, { storeCompanyId = null, warehouseIds = [] } = {}) => ({ userId, requestId: `req-${userId}`, permissions: new Set(perms), storeCompanyId, warehouseIds: new Set(warehouseIds) });
