import { WarehouseError } from './errors.ts';
import { nonNegativeQuantity, positiveQuantity } from './quantity.ts';
import { reconcile } from './reconciliation.ts';

/**
 * Gudang -> TOKO shipment aggregate (spec REQ-052, BR-013). Pure state transitions: every function returns a NEW
 * shipment (version + 1, one history entry) or throws WarehouseError. Nothing here touches a database, a clock or stock;
 * all times are ISO strings supplied by the caller. Quantity only: no valuation and no accounting treatment (that choice
 * is a future owner decision and is deliberately absent from this model).
 *
 * Quantities after dispatch are in TOKO units. The Gudang-unit quantity is kept for traceability and converted exactly once,
 * when the dispatch lines are built from confirmed item mappings.
 */
export type ShipmentStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'DISPATCHED' | 'CLOSED' | 'CANCELLED';
export const TERMINAL_STATUSES: readonly ShipmentStatus[] = ['CLOSED', 'CANCELLED'];

/** Explicit, required policy: BR-013 says "receive once"; the owner now allows several partial receipts where approved. */
export type ReceivingPolicy = { allowMultipleReceipts: boolean };

export type ShipmentLine = {
  lineNo: number;
  gudangItemId: number; storeItemId: number; mappingRef: string;
  gudangQuantity: number; gudangUnit: string;
  expectedQuantity: number; storeUnit: string;      // TOKO units, exactly converted
};

export type RejectionReason = 'DAMAGED' | 'REJECTED';
export type ReceiptLine = { lineNo: number; acceptedQuantity: number; rejectedQuantity: number; rejectedReason: RejectionReason | null };
export type ReceiptEvent = { eventKey: string; actorUserId: number; requestId: string; at: string; lines: ReceiptLine[]; payload: string };

export type ResolutionTarget = 'OUTSTANDING' | 'REJECTED';
export type ResolutionKind = 'SHORT_CLOSED' | 'RETURNED_TO_SOURCE' | 'WRITTEN_OFF';
export type Resolution = { resolutionKey: string; lineNo: number; target: ResolutionTarget; kind: ResolutionKind; quantity: number; reason: string; actorUserId: number; requestId: string; at: string; payload: string };

export type HistoryType = 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'DISPATCHED' | 'CANCELLED' | 'RECEIPT_RECORDED' | 'DISCREPANCY_RESOLVED' | 'CLOSED';
export type HistoryEntry = { seq: number; type: HistoryType; actorUserId: number; requestId: string; at: string; ref: string | null };

export type Shipment = {
  /** Stable external identity of the Gudang document, e.g. `gudang:dispatch:123`. Unique per destination. */
  sourceRef: string;
  sourceWarehouseId: number;
  destinationStoreCompanyId: number;
  /** Canonical content of the lines at creation: lets a replay of the same document be told from a conflicting one. */
  fingerprint: string;
  idempotencyKey: string;
  receivingPolicy: ReceivingPolicy;
  status: ShipmentStatus;
  makerUserId: number;
  lines: ShipmentLine[];
  receipts: ReceiptEvent[];
  resolutions: Resolution[];
  history: HistoryEntry[];
  version: number;
  createdAt: string;
};

export type Actor = { userId: number; requestId: string; at: string };

const KEY = /^[A-Za-z0-9_.:-]{8,80}$/;
const REF = /^[a-z][a-z0-9_.:-]{2,78}[a-z0-9]$/i;
const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const text = (s: unknown, min: number, max: number): string => {
  const clean = typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  if (clean.length < min || clean.length > max) throw new WarehouseError('REASON_REQUIRED');
  return clean;
};
function assertActor(a: Actor): void {
  if (!a || !id(a.userId) || typeof a.requestId !== 'string' || !a.requestId || typeof a.at !== 'string' || !a.at) throw new WarehouseError('INVALID_REFERENCE');
}
const assertOpen = (s: Shipment) => { if (TERMINAL_STATUSES.includes(s.status)) throw new WarehouseError('TERMINAL_STATE'); };

function next(s: Shipment, patch: Partial<Shipment>, type: HistoryType, actor: Actor, ref: string | null = null): Shipment {
  const entry: HistoryEntry = { seq: s.history.length + 1, type, actorUserId: actor.userId, requestId: actor.requestId, at: actor.at, ref };
  return { ...s, ...patch, history: [...s.history, entry], version: s.version + 1 };
}

/** Canonical, order-independent description of the lines; equal fingerprints mean the same document content. */
export function lineFingerprint(lines: readonly ShipmentLine[]): string {
  return JSON.stringify([...lines].sort((a, b) => a.lineNo - b.lineNo).map((l) => [l.lineNo, l.gudangItemId, l.storeItemId, l.mappingRef, l.gudangQuantity, l.gudangUnit, l.expectedQuantity, l.storeUnit]));
}

export type CreateShipmentInput = {
  sourceRef: string; sourceWarehouseId: number; destinationStoreCompanyId: number; idempotencyKey: string;
  receivingPolicy: ReceivingPolicy; lines: readonly ShipmentLine[];
};

export function createShipment(input: CreateShipmentInput, actor: Actor): Shipment {
  assertActor(actor);
  if (typeof input.sourceRef !== 'string' || !REF.test(input.sourceRef)) throw new WarehouseError('INVALID_REFERENCE');
  if (!id(input.sourceWarehouseId) || !id(input.destinationStoreCompanyId)) throw new WarehouseError('INVALID_REFERENCE');
  if (typeof input.idempotencyKey !== 'string' || !KEY.test(input.idempotencyKey)) throw new WarehouseError('INVALID_REFERENCE');
  if (!input.receivingPolicy || typeof input.receivingPolicy.allowMultipleReceipts !== 'boolean') throw new WarehouseError('POLICY_REQUIRED');   // no default
  if (!input.lines || input.lines.length === 0) throw new WarehouseError('NO_LINES');
  const seenLine = new Set<number>(), seenItem = new Set<number>();
  const lines = input.lines.map((l) => {
    if (!id(l.lineNo) || !id(l.gudangItemId) || !id(l.storeItemId) || typeof l.mappingRef !== 'string' || !l.mappingRef) throw new WarehouseError('INVALID_REFERENCE');
    if (!l.gudangUnit?.trim() || !l.storeUnit?.trim()) throw new WarehouseError('UNIT_MISSING');
    if (seenLine.has(l.lineNo) || seenItem.has(l.gudangItemId)) throw new WarehouseError('DUPLICATE_LINE');
    seenLine.add(l.lineNo); seenItem.add(l.gudangItemId);
    return { ...l, gudangQuantity: positiveQuantity(l.gudangQuantity), expectedQuantity: positiveQuantity(l.expectedQuantity) };
  });
  const base: Shipment = {
    sourceRef: input.sourceRef, sourceWarehouseId: input.sourceWarehouseId, destinationStoreCompanyId: input.destinationStoreCompanyId,
    fingerprint: lineFingerprint(lines), idempotencyKey: input.idempotencyKey, receivingPolicy: { allowMultipleReceipts: input.receivingPolicy.allowMultipleReceipts },
    status: 'DRAFT', makerUserId: actor.userId, lines, receipts: [], resolutions: [], history: [], version: 0, createdAt: actor.at,
  };
  return next(base, {}, 'CREATED', actor);
}

/** Lifecycle: DRAFT -> SUBMITTED -> APPROVED (checker != maker) -> DISPATCHED (in transit; receiving opens). */
export function submitShipment(s: Shipment, actor: Actor): Shipment {
  assertActor(actor); assertOpen(s);
  if (s.status !== 'DRAFT') throw new WarehouseError('INVALID_TRANSITION');
  return next(s, { status: 'SUBMITTED' }, 'SUBMITTED', actor);
}
export function approveShipment(s: Shipment, actor: Actor): Shipment {
  assertActor(actor); assertOpen(s);
  if (s.status !== 'SUBMITTED') throw new WarehouseError('INVALID_TRANSITION');
  if (actor.userId === s.makerUserId) throw new WarehouseError('MAKER_CHECKER');
  return next(s, { status: 'APPROVED' }, 'APPROVED', actor);
}
export function dispatchShipment(s: Shipment, actor: Actor): Shipment {
  assertActor(actor); assertOpen(s);
  if (s.status !== 'APPROVED') throw new WarehouseError('INVALID_TRANSITION');
  return next(s, { status: 'DISPATCHED' }, 'DISPATCHED', actor);
}
/** Cancelling is only possible before anything was received; after that the shipment must be closed through reconciliation. */
export function cancelShipment(s: Shipment, actor: Actor, reason: string): Shipment {
  assertActor(actor); assertOpen(s);
  if (s.receipts.length > 0) throw new WarehouseError('INVALID_TRANSITION');
  text(reason, 3, 200);
  return next(s, { status: 'CANCELLED' }, 'CANCELLED', actor);
}

// ---------------------------------------------------------------------------------------------------------------- receiving

export type ReceiptInput = {
  eventKey: string; actorCompanyId: number;
  lines: readonly { lineNo: number; acceptedQuantity: number; rejectedQuantity?: number; rejectedReason?: RejectionReason | null }[];
};

const canonicalReceipt = (lines: readonly ReceiptLine[]) => JSON.stringify([...lines].sort((a, b) => a.lineNo - b.lineNo).map((l) => [l.lineNo, l.acceptedQuantity, l.rejectedQuantity, l.rejectedReason]));

/**
 * Records one receiving event. Rules: shipment must be DISPATCHED (terminal states are immutable); the actor's branch must be
 * the destination; accepted + rejected per line may never exceed that line's outstanding quantity (no exception process);
 * a repeated eventKey with the same content is a replay (no change), with different content a conflict; without
 * allowMultipleReceipts a second event is refused. Rejected/damaged units never become stock.
 */
export function applyReceipt(s: Shipment, input: ReceiptInput, actor: Actor): { shipment: Shipment; replayed: boolean } {
  assertActor(actor);
  if (typeof input.eventKey !== 'string' || !KEY.test(input.eventKey)) throw new WarehouseError('INVALID_REFERENCE');
  if (!input.lines || input.lines.length === 0) throw new WarehouseError('NO_LINES');
  const lines: ReceiptLine[] = input.lines.map((l) => {
    const acceptedQuantity = nonNegativeQuantity(l.acceptedQuantity), rejectedQuantity = nonNegativeQuantity(l.rejectedQuantity ?? 0);
    if (acceptedQuantity + rejectedQuantity === 0) throw new WarehouseError('ZERO_QUANTITY');
    if (rejectedQuantity > 0 && l.rejectedReason !== 'DAMAGED' && l.rejectedReason !== 'REJECTED') throw new WarehouseError('REJECTION_REASON_REQUIRED');
    return { lineNo: l.lineNo, acceptedQuantity, rejectedQuantity, rejectedReason: rejectedQuantity > 0 ? (l.rejectedReason as RejectionReason) : null };
  });
  if (new Set(lines.map((l) => l.lineNo)).size !== lines.length) throw new WarehouseError('DUPLICATE_LINE');
  const payload = canonicalReceipt(lines);
  const existing = s.receipts.find((r) => r.eventKey === input.eventKey);
  if (existing) {
    if (existing.payload !== payload) throw new WarehouseError('IDEMPOTENCY_CONFLICT');
    return { shipment: s, replayed: true };                      // checked BEFORE state rules: a retry after close is still a replay
  }
  assertOpen(s);
  if (s.status !== 'DISPATCHED') throw new WarehouseError('WRONG_STATE');
  if (input.actorCompanyId !== s.destinationStoreCompanyId) throw new WarehouseError('CROSS_BRANCH');
  if (!s.receivingPolicy.allowMultipleReceipts && s.receipts.length > 0) throw new WarehouseError('DUPLICATE_RECEIPT');
  const view = new Map(reconcile(s).lines.map((l) => [l.lineNo, l]));
  for (const l of lines) {
    const current = view.get(l.lineNo);
    if (!current) throw new WarehouseError('LINE_NOT_FOUND');
    if (l.acceptedQuantity + l.rejectedQuantity > current.outstandingQuantity) throw new WarehouseError('RECEIVE_EXCEEDS_OUTSTANDING');
  }
  const event: ReceiptEvent = { eventKey: input.eventKey, actorUserId: actor.userId, requestId: actor.requestId, at: actor.at, lines, payload };
  return { shipment: next(s, { receipts: [...s.receipts, event] }, 'RECEIPT_RECORDED', actor, input.eventKey), replayed: false };
}

// ------------------------------------------------------------------------------------------------------------- discrepancies

export type ResolutionInput = { resolutionKey: string; lineNo: number; target: ResolutionTarget; kind: ResolutionKind; quantity: number; reason: string };
const ALLOWED_KIND: Record<ResolutionTarget, readonly ResolutionKind[]> = { OUTSTANDING: ['SHORT_CLOSED'], REJECTED: ['RETURNED_TO_SOURCE', 'WRITTEN_OFF'] };

/**
 * Explicit handling of a shortage (SHORT_CLOSED: the missing units will not arrive) or of rejected/damaged units (returned
 * or written off). The shipment can only be closed once every discrepancy has been handled this way: nothing is ever
 * assumed received or lost silently. This records a quantity decision only; it creates no accounting entry.
 */
export function resolveDiscrepancy(s: Shipment, input: ResolutionInput, actor: Actor): { shipment: Shipment; replayed: boolean } {
  assertActor(actor);
  if (typeof input.resolutionKey !== 'string' || !KEY.test(input.resolutionKey)) throw new WarehouseError('INVALID_REFERENCE');
  if (!ALLOWED_KIND[input.target]?.includes(input.kind)) throw new WarehouseError('INVALID_TRANSITION');
  const quantity = positiveQuantity(input.quantity);
  const reason = text(input.reason, 3, 200);
  const payload = JSON.stringify([input.lineNo, input.target, input.kind, quantity, reason]);
  const existing = s.resolutions.find((r) => r.resolutionKey === input.resolutionKey);
  if (existing) {
    if (existing.payload !== payload) throw new WarehouseError('IDEMPOTENCY_CONFLICT');
    return { shipment: s, replayed: true };
  }
  assertOpen(s);
  if (s.status !== 'DISPATCHED') throw new WarehouseError('WRONG_STATE');
  const line = reconcile(s).lines.find((l) => l.lineNo === input.lineNo);
  if (!line) throw new WarehouseError('LINE_NOT_FOUND');
  const unresolved = input.target === 'OUTSTANDING' ? line.outstandingQuantity : line.unresolvedRejectedQuantity;
  if (quantity > unresolved) throw new WarehouseError('RESOLUTION_EXCEEDS_UNRESOLVED');
  const resolution: Resolution = { resolutionKey: input.resolutionKey, lineNo: input.lineNo, target: input.target, kind: input.kind, quantity, reason, actorUserId: actor.userId, requestId: actor.requestId, at: actor.at, payload };
  return { shipment: next(s, { resolutions: [...s.resolutions, resolution] }, 'DISCREPANCY_RESOLVED', actor, input.resolutionKey), replayed: false };
}

/** Terminal. Refused while any quantity is still expected or any rejected quantity is unhandled. */
export function closeShipment(s: Shipment, actor: Actor): Shipment {
  assertActor(actor); assertOpen(s);
  if (s.status !== 'DISPATCHED') throw new WarehouseError('WRONG_STATE');
  const r = reconcile(s);
  if (r.lines.some((l) => l.outstandingQuantity > 0)) throw new WarehouseError('OUTSTANDING_QUANTITY');
  if (r.lines.some((l) => l.unresolvedRejectedQuantity > 0)) throw new WarehouseError('UNRESOLVED_REJECTED');
  return next(s, { status: 'CLOSED' }, 'CLOSED', actor);
}
