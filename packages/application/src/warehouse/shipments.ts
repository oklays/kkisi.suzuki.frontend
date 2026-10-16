import {
  WarehouseError, applyReceipt, approveShipment, buildShipmentLines, cancelShipment, closeShipment, createShipment, dispatchShipment, reconcile, resolveDiscrepancy, stockIntents, submitShipment,
  type ItemFacts, type RawDispatchLine, type ReceiptInput, type ReceivingPolicy, type Reconciliation, type ResolutionInput, type Shipment, type StockIntent,
} from '@koperasi/domain/warehouse';
import { MAX_SAVE_ATTEMPTS, RepositoryConflict, WAREHOUSE_PERMISSIONS as P, type MovementTreatment, type WarehouseActor, type WarehouseDeps } from './ports.ts';

const iso = (d: WarehouseDeps) => d.now().toISOString();
const domainActor = (a: WarehouseActor, d: WarehouseDeps) => ({ userId: a.userId, requestId: a.requestId, at: iso(d) });
const allow = (a: WarehouseActor, permission: string) => { if (!a.permissions.has(permission)) throw new WarehouseError('FORBIDDEN'); };
const inWarehouse = (a: WarehouseActor, warehouseId: number) => { if (!a.warehouseIds.has(warehouseId)) throw new WarehouseError('FORBIDDEN'); };
const treatmentOf = (d: WarehouseDeps, s: Shipment): MovementTreatment => d.treatment?.treatmentFor({ sourceWarehouseId: s.sourceWarehouseId, destinationStoreCompanyId: s.destinationStoreCompanyId }) ?? 'UNSPECIFIED';

export type ShipmentView = { shipment: Shipment; reconciliation: Reconciliation; treatment: MovementTreatment };
const view = (d: WarehouseDeps, shipment: Shipment): ShipmentView => ({ shipment, reconciliation: reconcile(shipment), treatment: treatmentOf(d, shipment) });

// ---------------------------------------------------------------------------------------------------------- Gudang side

export type RegisterDispatchInput = {
  sourceRef: string; sourceWarehouseId: number; destinationStoreCompanyId: number; idempotencyKey: string;
  receivingPolicy: ReceivingPolicy; lines: readonly RawDispatchLine[];
};

/**
 * Registers a Gudang dispatch for a branch. Idempotent: the same document (same sourceRef, destination, key and content) returns
 * the stored shipment; the same sourceRef with different content or key is a conflict. Never partially accepted: any unmapped,
 * unconfirmed, inactive or inexactly convertible line rejects the whole document.
 */
export async function registerDispatch(d: WarehouseDeps, actor: WarehouseActor, input: RegisterDispatchInput): Promise<{ shipment: Shipment; replayed: boolean }> {
  allow(actor, P.DISPATCH_CREATE);
  inWarehouse(actor, input.sourceWarehouseId);
  const book = await d.mappings.listForBranch(input.destinationStoreCompanyId);
  const gudangItems = await d.items.gudangItems(input.lines.map((l) => l.gudangItemId));
  const storeItems = await d.items.storeItems(input.destinationStoreCompanyId, book.map((m) => m.storeItemId));
  const lines = buildShipmentLines(input.lines, input.destinationStoreCompanyId, book, {
    gudangItem: (id) => gudangItems.get(id) ?? null,
    storeItem: (_company, id) => (storeItems.get(id) as ItemFacts | undefined) ?? null,
  });
  const created = createShipment({ ...input, lines }, domainActor(actor, d));
  const same = (s: Shipment) => {
    if (s.fingerprint !== created.fingerprint || s.idempotencyKey !== created.idempotencyKey || s.sourceWarehouseId !== created.sourceWarehouseId
      || s.receivingPolicy.allowMultipleReceipts !== created.receivingPolicy.allowMultipleReceipts) throw new WarehouseError('DUPLICATE_DOCUMENT');
    return { shipment: s, replayed: true };
  };
  const existing = await d.shipments.find(input.sourceRef, input.destinationStoreCompanyId);
  if (existing) return same(existing);
  try { await d.shipments.insert(created); return { shipment: created, replayed: false }; }
  catch (error) {
    if (!(error instanceof RepositoryConflict)) throw error;
    const winner = await d.shipments.find(input.sourceRef, input.destinationStoreCompanyId);   // a concurrent registration won the unique key
    if (!winner) throw new WarehouseError('CONCURRENT_MODIFICATION');
    return same(winner);
  }
}

/**
 * Loads, transforms and saves one shipment with optimistic concurrency. `change` returns `unchanged: true` for an idempotent
 * replay (nothing is written). On a version conflict the shipment is reloaded and the same change re-evaluated, so a retry that
 * races with its own first attempt becomes a replay instead of a duplicate.
 */
async function mutate<T>(d: WarehouseDeps, sourceRef: string, destination: number, change: (current: Shipment) => { shipment: Shipment; unchanged: boolean; extra: T }): Promise<{ shipment: Shipment; replayed: boolean; extra: T }> {
  for (let attempt = 1; attempt <= MAX_SAVE_ATTEMPTS; attempt++) {
    const current = await d.shipments.find(sourceRef, destination);
    if (!current) throw new WarehouseError('NOT_FOUND');
    const out = change(current);
    if (out.unchanged) return { shipment: out.shipment, replayed: true, extra: out.extra };
    try { await d.shipments.save(out.shipment, current.version); return { shipment: out.shipment, replayed: false, extra: out.extra }; }
    catch (error) { if (!(error instanceof RepositoryConflict) || error.code !== 'VERSION_CONFLICT') throw error; }
  }
  throw new WarehouseError('CONCURRENT_MODIFICATION');
}

export type LifecycleAction = 'submit' | 'approve' | 'dispatch' | 'cancel';
const LIFECYCLE_PERMISSION: Record<LifecycleAction, string> = { submit: P.DISPATCH_CREATE, approve: P.DISPATCH_APPROVE, dispatch: P.DISPATCH_RELEASE, cancel: P.DISPATCH_CREATE };

export async function advanceDispatch(d: WarehouseDeps, actor: WarehouseActor, input: { sourceRef: string; destinationStoreCompanyId: number; action: LifecycleAction; reason?: string }): Promise<ShipmentView> {
  const permission = LIFECYCLE_PERMISSION[input.action];
  if (!permission) throw new WarehouseError('INVALID_TRANSITION');
  allow(actor, permission);
  const out = await mutate(d, input.sourceRef, input.destinationStoreCompanyId, (s) => {
    inWarehouse(actor, s.sourceWarehouseId);
    const a = domainActor(actor, d);
    const shipment = input.action === 'submit' ? submitShipment(s, a) : input.action === 'approve' ? approveShipment(s, a) : input.action === 'dispatch' ? dispatchShipment(s, a) : cancelShipment(s, a, input.reason ?? '');
    return { shipment, unchanged: false, extra: null };
  });
  return view(d, out.shipment);
}

// ------------------------------------------------------------------------------------------------------------ TOKO side

export type ReceiveInput = { sourceRef: string; eventKey: string; lines: ReceiptInput['lines'] };
export type ReceiveResult = ShipmentView & { replayed: boolean; intents: StockIntent[] };

/**
 * The mapping snapshot on each shipment line must still agree with the mapping book: mapping present, CONFIRMED, naming the
 * same items and branch, and the TOKO item still active. Lines never change after creation, so checking the first loaded copy
 * is enough even when the save is retried. Any disagreement rejects the event (no silent re-mapping).
 */
async function assertMappingsConsistent(d: WarehouseDeps, s: Shipment): Promise<void> {
  const storeItems = await d.items.storeItems(s.destinationStoreCompanyId, s.lines.map((l) => l.storeItemId));
  for (const line of s.lines) {
    const mapping = await d.mappings.find(line.mappingRef);
    if (!mapping) throw new WarehouseError('MAPPING_NOT_FOUND');
    if (mapping.status === 'RETIRED') throw new WarehouseError('MAPPING_RETIRED');
    if (mapping.status !== 'CONFIRMED') throw new WarehouseError('MAPPING_NOT_CONFIRMED');
    if (mapping.storeCompanyId !== s.destinationStoreCompanyId || mapping.gudangItemId !== line.gudangItemId || mapping.storeItemId !== line.storeItemId) throw new WarehouseError('MAPPING_INCONSISTENT');
    const item = storeItems.get(line.storeItemId);
    if (!item) throw new WarehouseError('ITEM_NOT_FOUND');
    if (!item.active) throw new WarehouseError('ITEM_INACTIVE');
  }
}

/**
 * Records a receiving event for the ACTOR's own branch (the shipment is looked up by the session branch, so another branch's
 * document is simply not found). Returns the reconciliation and the quantity intents of THIS event, identical on a replay, so
 * a downstream writer that applies each intent key once can never double-post. No stock is changed here.
 */
export async function receiveShipment(d: WarehouseDeps, actor: WarehouseActor, input: ReceiveInput): Promise<ReceiveResult> {
  allow(actor, P.RECEIVE);
  const branch = actor.storeCompanyId;
  if (branch === null) throw new WarehouseError('FORBIDDEN');
  const first = await d.shipments.find(input.sourceRef, branch);
  if (!first) throw new WarehouseError('NOT_FOUND');
  if (!first.receipts.some((r) => r.eventKey === input.eventKey)) await assertMappingsConsistent(d, first);   // a replay needs no re-check
  const out = await mutate(d, input.sourceRef, branch, (s) => {
    const result = applyReceipt(s, { eventKey: input.eventKey, actorCompanyId: branch, lines: input.lines }, domainActor(actor, d));
    return { shipment: result.shipment, unchanged: result.replayed, extra: null };
  });
  const intents = stockIntents(out.shipment).filter((i) => i.eventKey === input.eventKey);
  return { ...view(d, out.shipment), replayed: out.replayed, intents };
}

/** Explicit handling of a shortage or of rejected/damaged units (quantity decision only; no accounting entry). Idempotent by key. */
export async function resolveShipmentDiscrepancy(d: WarehouseDeps, actor: WarehouseActor, input: { sourceRef: string } & ResolutionInput): Promise<ShipmentView & { replayed: boolean }> {
  allow(actor, P.RESOLVE);
  if (actor.storeCompanyId === null) throw new WarehouseError('FORBIDDEN');
  const { sourceRef, ...resolution } = input;
  const out = await mutate(d, sourceRef, actor.storeCompanyId, (s) => {
    const result = resolveDiscrepancy(s, resolution, domainActor(actor, d));
    return { shipment: result.shipment, unchanged: result.replayed, extra: null };
  });
  return { ...view(d, out.shipment), replayed: out.replayed };
}

/** Terminal. Refused while anything is still expected or any rejected quantity is unhandled. A retry on an already CLOSED shipment is a no-op. */
export async function closeShipmentForBranch(d: WarehouseDeps, actor: WarehouseActor, input: { sourceRef: string }): Promise<ShipmentView & { replayed: boolean }> {
  allow(actor, P.RESOLVE);
  if (actor.storeCompanyId === null) throw new WarehouseError('FORBIDDEN');
  const out = await mutate(d, input.sourceRef, actor.storeCompanyId, (s) => (s.status === 'CLOSED'
    ? { shipment: s, unchanged: true, extra: null }
    : { shipment: closeShipment(s, domainActor(actor, d)), unchanged: false, extra: null }));
  return { ...view(d, out.shipment), replayed: out.replayed };
}

/** Read for the destination branch (receiving view) or for the source warehouse scope (dispatch view). */
export async function readShipment(d: WarehouseDeps, actor: WarehouseActor, input: { sourceRef: string; destinationStoreCompanyId: number }): Promise<ShipmentView> {
  const asBranch = actor.permissions.has(P.RECEIVING_VIEW) && actor.storeCompanyId === input.destinationStoreCompanyId;
  const shipment = await d.shipments.find(input.sourceRef, input.destinationStoreCompanyId);
  const asWarehouse = actor.permissions.has(P.DISPATCH_VIEW) && shipment !== null && actor.warehouseIds.has(shipment.sourceWarehouseId);
  if (!asBranch && !asWarehouse) throw new WarehouseError('FORBIDDEN');   // same answer whether or not the document exists
  if (!shipment) throw new WarehouseError('NOT_FOUND');
  return view(d, shipment);
}
