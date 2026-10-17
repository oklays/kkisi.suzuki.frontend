import type { ItemFacts, ItemMapping, Shipment } from '@koperasi/domain/warehouse';

/**
 * Warehouse application contracts (spec TASK-062/063). These are ports only: no adapter exists yet and none opens a database
 * connection. Gudang and TOKO live in different databases, so nothing below assumes one atomic transaction across them:
 * every operation is idempotent and every write is an optimistic, single-aggregate compare-and-set.
 */

/** Raised by repositories for the two races the application must handle; everything else is an infrastructure failure. */
export class RepositoryConflict extends Error {
  readonly code: 'ALREADY_EXISTS' | 'VERSION_CONFLICT';
  constructor(code: 'ALREADY_EXISTS' | 'VERSION_CONFLICT') { super(code); this.name = 'RepositoryConflict'; this.code = code; }
}

export interface MappingRepository {
  /** Live and retired mappings of one branch (the "book" the domain validates against). */
  listForBranch(storeCompanyId: number): Promise<ItemMapping[]>;
  find(ref: string): Promise<ItemMapping | null>;
  /** Unique on (gudang item, branch) and (branch, TOKO item) among non-retired rows; a violation is RepositoryConflict('ALREADY_EXISTS'). */
  insert(mapping: ItemMapping): Promise<void>;
  /** Compare-and-set on the previous status; false when the row changed in the meantime. */
  update(mapping: ItemMapping, expectedStatus: ItemMapping['status']): Promise<boolean>;
}

export interface ShipmentRepository {
  find(sourceRef: string, destinationStoreCompanyId: number): Promise<Shipment | null>;
  /** Unique on (sourceRef, destination): RepositoryConflict('ALREADY_EXISTS') when the document is already registered. */
  insert(shipment: Shipment): Promise<void>;
  /** Compare-and-set on `version`: RepositoryConflict('VERSION_CONFLICT') when another writer saved first. */
  save(shipment: Shipment, expectedVersion: number): Promise<void>;
  /** Any shipment that is not CLOSED/CANCELLED and has a line using this mapping (a mapping in use cannot be retired). */
  hasOpenShipmentForMapping(mappingRef: string): Promise<boolean>;
}

export interface ItemCatalog {
  gudangItems(ids: readonly number[]): Promise<Map<number, ItemFacts>>;
  storeItems(storeCompanyId: number, ids: readonly number[]): Promise<Map<number, ItemFacts>>;
  /** TOKO items of a branch whose barcode or item code equals the Gudang item's (exact match only; ranking is the domain's job). */
  storeItemsByIdentifiers(storeCompanyId: number, identifiers: { barcode: string | null; code: string }): Promise<ItemFacts[]>;
}

export const WAREHOUSE_PERMISSIONS = {
  MAPPING_MANAGE: 'warehouse.mapping.manage',
  MAPPING_VIEW: 'warehouse.mapping.view',
  DISPATCH_CREATE: 'warehouse.dispatch.create',
  DISPATCH_APPROVE: 'warehouse.dispatch.approve',
  DISPATCH_RELEASE: 'warehouse.dispatch.release',
  DISPATCH_VIEW: 'warehouse.dispatch.view',
  RECEIVE: 'toko.receiving.create',
  RESOLVE: 'toko.receiving.resolve',
  RECEIVING_VIEW: 'toko.receiving.view',
} as const;
export type WarehousePermission = (typeof WAREHOUSE_PERMISSIONS)[keyof typeof WAREHOUSE_PERMISSIONS];

/**
 * Who is acting. `storeCompanyId` is the validated session branch (never client input); `warehouseIds` the Gudang scopes the
 * identity link grants. Permission names are resolved by the caller from the console capability layer when the adapters ship.
 */
export type WarehouseActor = { userId: number; requestId: string; permissions: ReadonlySet<string>; storeCompanyId: number | null; warehouseIds: ReadonlySet<number> };

/**
 * Business treatment of a Gudang -> TOKO movement. The owner has NOT decided between an internal transfer and a commercial
 * purchase/sale, so nothing here chooses: the use cases only report what the (optional, future) policy says and default to
 * UNSPECIFIED. A stock or accounting writer must refuse UNSPECIFIED. Quantities never depend on this value.
 */
export type MovementTreatment = 'UNSPECIFIED' | 'INTERNAL_TRANSFER' | 'COMMERCIAL_PURCHASE';
export interface MovementTreatmentPolicy { treatmentFor(movement: { sourceWarehouseId: number; destinationStoreCompanyId: number }): MovementTreatment; }

export type WarehouseDeps = {
  mappings: MappingRepository; shipments: ShipmentRepository; items: ItemCatalog; now: () => Date;
  treatment?: MovementTreatmentPolicy;
};

/** Bounded optimistic-concurrency retries; safe only because every operation is idempotent. */
export const MAX_SAVE_ATTEMPTS = 3;
