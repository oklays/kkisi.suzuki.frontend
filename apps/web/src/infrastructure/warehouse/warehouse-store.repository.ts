import { Prisma, type PrismaClient } from '@prisma/client';
import { RepositoryConflict, type MappingReadRepository, type MappingRepository, type OutboxRecord, type ShipmentReadRepository, type ShipmentRepository, type StockApplier, type StockOutbox } from '@koperasi/application/warehouse';
import type { ItemMapping, MappingStatus, Shipment, ShipmentStatus, UnitConversion } from '@koperasi/domain/warehouse';

/**
 * LOCAL REHEARSAL adapter for the Warehouse persistence proposal (checkpoint 10). It is constructed only by the opt-in rehearsal tests and scripts
 * against `kkisi_warehouse_rehearsal` (see db/warehouse and scripts/setup-warehouse-rehearsal.sh). The application never builds it, no production
 * DSN for it exists, and it is not part of the 12-connection budget. It proves that the port contracts (unique keys, compare-and-set, immutable outbox
 * content, idempotent posting) hold against real database constraints; it does not make the Warehouse writable anywhere.
 */
type Num = number | bigint;
const n = (v: Num | null | undefined) => Number(v ?? 0);
const errno = (e: unknown): number | null => { const m = /\b(1062|1644|4025|3819)\b/.exec(String((e as { message?: string })?.message ?? '')); return m ? Number(m[1]) : null; };

// ------------------------------------------------------------------------------------------------------------------ mappings
type MapRow = {
  ref: string; gudang_item_id: Num; store_company_id: Num; store_item_id: Num; gudang_unit: string; store_unit: string; conv_kind: 'IDENTICAL' | 'RATIO'; conv_numerator: Num | null; conv_denominator: Num | null;
  conv_approved_by: Num | null; conv_approved_at: string | null; conv_evidence: string | null; basis: ItemMapping['basis']; status: MappingStatus; proposed_by: Num; proposed_at: string;
  confirmed_by: Num | null; confirmed_at: string | null; retired_by: Num | null; retired_at: string | null; retire_reason: string | null;
};
const toMapping = (r: MapRow): ItemMapping => ({
  ref: r.ref, gudangItemId: n(r.gudang_item_id), storeCompanyId: n(r.store_company_id), storeItemId: n(r.store_item_id), gudangUnit: r.gudang_unit, storeUnit: r.store_unit,
  conversion: (r.conv_kind === 'IDENTICAL' ? { kind: 'IDENTICAL' } : { kind: 'RATIO', numerator: n(r.conv_numerator), denominator: n(r.conv_denominator), approvedBy: n(r.conv_approved_by), approvedAt: r.conv_approved_at as string, evidence: r.conv_evidence as string }) as UnitConversion,
  basis: r.basis, status: r.status, proposedBy: n(r.proposed_by), proposedAt: r.proposed_at, confirmedBy: r.confirmed_by === null ? null : n(r.confirmed_by), confirmedAt: r.confirmed_at,
  retiredBy: r.retired_by === null ? null : n(r.retired_by), retiredAt: r.retired_at, retireReason: r.retire_reason,
});
const MAP_COLS = Prisma.raw('ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, conv_numerator, conv_denominator, conv_approved_by, conv_approved_at, conv_evidence, basis, status, proposed_by, proposed_at, confirmed_by, confirmed_at, retired_by, retired_at, retire_reason');

// ---------------------------------------------------------------------------------------------------------------- shipments
type HeadRow = { id: Num; source_ref: string; destination_store_company_id: Num; source_warehouse_id: Num; status: ShipmentStatus; maker_user_id: Num; fingerprint: string; idempotency_key: string; allow_multiple_receipts: Num; version: Num; created_at: string };

export class PrismaWarehouseStore implements MappingRepository, MappingReadRepository, ShipmentRepository, ShipmentReadRepository {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }

  // MappingRepository
  async listForBranch(storeCompanyId: number): Promise<ItemMapping[]> {
    return (await this.db.$queryRaw<MapRow[]>`SELECT ${MAP_COLS} FROM warehouse_item_map WHERE store_company_id = ${storeCompanyId} ORDER BY gudang_item_id, ref LIMIT 5000`).map(toMapping);
  }
  async find(ref: string): Promise<ItemMapping | null>;
  async find(ref: string, destination: number): Promise<Shipment | null>;
  async find(ref: string, destination?: number): Promise<ItemMapping | Shipment | null> {
    if (destination === undefined) { const r = await this.db.$queryRaw<MapRow[]>`SELECT ${MAP_COLS} FROM warehouse_item_map WHERE ref = ${ref} LIMIT 1`; return r[0] ? toMapping(r[0]) : null; }
    return this.loadShipment(this.db, ref, destination);
  }
  async insert(entity: ItemMapping | Shipment): Promise<void> {
    if ('sourceRef' in entity) return this.insertShipment(entity);
    const m = entity; const c = m.conversion;
    try {
      await this.db.$executeRaw`INSERT INTO warehouse_item_map (ref, gudang_item_id, store_company_id, store_item_id, gudang_unit, store_unit, conv_kind, conv_numerator, conv_denominator, conv_approved_by, conv_approved_at, conv_evidence, basis, status, proposed_by, proposed_at, confirmed_by, confirmed_at)
        VALUES (${m.ref}, ${m.gudangItemId}, ${m.storeCompanyId}, ${m.storeItemId}, ${m.gudangUnit}, ${m.storeUnit}, ${c.kind}, ${c.kind === 'RATIO' ? c.numerator : null}, ${c.kind === 'RATIO' ? c.denominator : null}, ${c.kind === 'RATIO' ? c.approvedBy : null},
          ${c.kind === 'RATIO' ? c.approvedAt : null}, ${c.kind === 'RATIO' ? c.evidence : null}, ${m.basis}, ${m.status}, ${m.proposedBy}, ${m.proposedAt}, ${m.confirmedBy}, ${m.confirmedAt})`;
    } catch (e) { if (errno(e) === 1062) throw new RepositoryConflict('ALREADY_EXISTS'); throw e; }
  }
  /** Compare-and-set on the previous status; the identity and conversion are immutable by trigger. */
  async update(m: ItemMapping, expectedStatus: MappingStatus): Promise<boolean> {
    const rows = await this.db.$executeRaw`UPDATE warehouse_item_map SET status = ${m.status}, confirmed_by = ${m.confirmedBy}, confirmed_at = ${m.confirmedAt}, retired_by = ${m.retiredBy}, retired_at = ${m.retiredAt}, retire_reason = ${m.retireReason}
      WHERE ref = ${m.ref} AND status = ${expectedStatus}`;
    return rows === 1;
  }
  async list(filter: { storeCompanyId: number | null; status: MappingStatus | null } | { status: ShipmentStatus | null; destinationStoreCompanyId: number | null; sourceWarehouseIds: readonly number[] | null }, limit: number): Promise<never[]> {
    if ('storeCompanyId' in filter) {
      const w: Prisma.Sql[] = []; if (filter.storeCompanyId !== null) w.push(Prisma.sql`store_company_id = ${filter.storeCompanyId}`); if (filter.status) w.push(Prisma.sql`status = ${filter.status}`);
      return (await this.db.$queryRaw<MapRow[]>`SELECT ${MAP_COLS} FROM warehouse_item_map ${w.length ? Prisma.sql`WHERE ${Prisma.join(w, ' AND ')}` : Prisma.empty} ORDER BY store_company_id, gudang_item_id, ref LIMIT ${limit}`).map(toMapping) as never[];
    }
    const w: Prisma.Sql[] = [];
    if (filter.status) w.push(Prisma.sql`status = ${filter.status}`); if (filter.destinationStoreCompanyId !== null) w.push(Prisma.sql`destination_store_company_id = ${filter.destinationStoreCompanyId}`);
    if (filter.sourceWarehouseIds !== null) { if (filter.sourceWarehouseIds.length === 0) return []; w.push(Prisma.sql`source_warehouse_id IN (${Prisma.join([...filter.sourceWarehouseIds])})`); }
    const heads = await this.db.$queryRaw<{ source_ref: string; destination_store_company_id: Num }[]>`SELECT source_ref, destination_store_company_id FROM warehouse_shipment ${w.length ? Prisma.sql`WHERE ${Prisma.join(w, ' AND ')}` : Prisma.empty} ORDER BY created_at DESC, source_ref LIMIT ${limit}`;
    const out: Shipment[] = [];
    for (const h of heads) { const s = await this.loadShipment(this.db, h.source_ref, n(h.destination_store_company_id)); if (s) out.push(s); }
    return out as never[];
  }

  // ShipmentRepository
  private async loadShipment(db: Pick<PrismaClient, '$queryRaw'>, sourceRef: string, destination: number): Promise<Shipment | null> {
    const heads = await db.$queryRaw<HeadRow[]>`SELECT id, source_ref, destination_store_company_id, source_warehouse_id, status, maker_user_id, fingerprint, idempotency_key, allow_multiple_receipts, version, created_at
      FROM warehouse_shipment WHERE source_ref = ${sourceRef} AND destination_store_company_id = ${destination} LIMIT 1`;
    const h = heads[0]; if (!h) return null;
    const id = n(h.id);
    const lines = await db.$queryRaw<{ line_no: Num; gudang_item_id: Num; store_item_id: Num; mapping_ref: string; gudang_quantity: Num; gudang_unit: string; expected_quantity: Num; store_unit: string }[]>`SELECT line_no, gudang_item_id, store_item_id, mapping_ref, gudang_quantity, gudang_unit, expected_quantity, store_unit FROM warehouse_shipment_line WHERE shipment_id = ${id} ORDER BY line_no`;
    const receipts = await db.$queryRaw<{ id: Num; event_key: string; actor_user_id: Num; request_id: string; at: string; payload: string }[]>`SELECT id, event_key, actor_user_id, request_id, at, payload FROM warehouse_receipt WHERE shipment_id = ${id} ORDER BY id`;
    const rlines = receipts.length ? await db.$queryRaw<{ receipt_id: Num; line_no: Num; accepted_quantity: Num; rejected_quantity: Num; rejected_reason: 'DAMAGED' | 'REJECTED' | null }[]>`SELECT receipt_id, line_no, accepted_quantity, rejected_quantity, rejected_reason FROM warehouse_receipt_line WHERE receipt_id IN (${Prisma.join(receipts.map((r) => n(r.id)))}) ORDER BY receipt_id, line_no` : [];
    const resolutions = await db.$queryRaw<{ resolution_key: string; line_no: Num; target: 'OUTSTANDING' | 'REJECTED'; kind: 'SHORT_CLOSED' | 'RETURNED_TO_SOURCE' | 'WRITTEN_OFF'; quantity: Num; reason: string; actor_user_id: Num; request_id: string; at: string; payload: string }[]>`SELECT resolution_key, line_no, target, kind, quantity, reason, actor_user_id, request_id, at, payload FROM warehouse_resolution WHERE shipment_id = ${id} ORDER BY id`;
    const history = await db.$queryRaw<{ seq: Num; type: Shipment['history'][number]['type']; actor_user_id: Num; request_id: string; at: string; ref: string | null }[]>`SELECT seq, type, actor_user_id, request_id, at, ref FROM warehouse_history WHERE shipment_id = ${id} ORDER BY seq`;
    return {
      sourceRef: h.source_ref, sourceWarehouseId: n(h.source_warehouse_id), destinationStoreCompanyId: n(h.destination_store_company_id), fingerprint: h.fingerprint, idempotencyKey: h.idempotency_key, receivingPolicy: { allowMultipleReceipts: n(h.allow_multiple_receipts) === 1 },
      status: h.status, makerUserId: n(h.maker_user_id), version: n(h.version), createdAt: h.created_at,
      lines: lines.map((l) => ({ lineNo: n(l.line_no), gudangItemId: n(l.gudang_item_id), storeItemId: n(l.store_item_id), mappingRef: l.mapping_ref, gudangQuantity: n(l.gudang_quantity), gudangUnit: l.gudang_unit, expectedQuantity: n(l.expected_quantity), storeUnit: l.store_unit })),
      receipts: receipts.map((r) => ({ eventKey: r.event_key, actorUserId: n(r.actor_user_id), requestId: r.request_id, at: r.at, payload: r.payload, lines: rlines.filter((l) => n(l.receipt_id) === n(r.id)).map((l) => ({ lineNo: n(l.line_no), acceptedQuantity: n(l.accepted_quantity), rejectedQuantity: n(l.rejected_quantity), rejectedReason: l.rejected_reason })) })),
      resolutions: resolutions.map((r) => ({ resolutionKey: r.resolution_key, lineNo: n(r.line_no), target: r.target, kind: r.kind, quantity: n(r.quantity), reason: r.reason, actorUserId: n(r.actor_user_id), requestId: r.request_id, at: r.at, payload: r.payload })),
      history: history.map((x) => ({ seq: n(x.seq), type: x.type, actorUserId: n(x.actor_user_id), requestId: x.request_id, at: x.at, ref: x.ref })),
    };
  }

  private async insertShipment(s: Shipment): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO warehouse_shipment (source_ref, destination_store_company_id, source_warehouse_id, status, maker_user_id, fingerprint, idempotency_key, allow_multiple_receipts, version, created_at)
          VALUES (${s.sourceRef}, ${s.destinationStoreCompanyId}, ${s.sourceWarehouseId}, ${s.status}, ${s.makerUserId}, ${s.fingerprint}, ${s.idempotencyKey}, ${s.receivingPolicy.allowMultipleReceipts ? 1 : 0}, ${s.version}, ${s.createdAt})`;
        const [row] = await tx.$queryRaw<{ id: Num }[]>`SELECT LAST_INSERT_ID() AS id`; const id = n(row.id);
        for (const l of s.lines) await tx.$executeRaw`INSERT INTO warehouse_shipment_line (shipment_id, line_no, gudang_item_id, store_item_id, mapping_ref, gudang_quantity, gudang_unit, expected_quantity, store_unit) VALUES (${id}, ${l.lineNo}, ${l.gudangItemId}, ${l.storeItemId}, ${l.mappingRef}, ${l.gudangQuantity}, ${l.gudangUnit}, ${l.expectedQuantity}, ${l.storeUnit})`;
        await this.appendEvents(tx, id, s, { receipts: new Set(), resolutions: new Set(), maxSeq: 0 });
      });
    } catch (e) { if (errno(e) === 1062) throw new RepositoryConflict('ALREADY_EXISTS'); throw e; }
  }

  /** Compare-and-set on `version` inside one transaction together with the new append-only rows: either all of them or none. */
  async save(s: Shipment, expectedVersion: number): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const heads = await tx.$queryRaw<{ id: Num; version: Num }[]>`SELECT id, version FROM warehouse_shipment WHERE source_ref = ${s.sourceRef} AND destination_store_company_id = ${s.destinationStoreCompanyId} FOR UPDATE`;
      const h = heads[0];
      if (!h || n(h.version) !== expectedVersion || s.version !== expectedVersion + 1) throw new RepositoryConflict('VERSION_CONFLICT');
      const id = n(h.id);
      const rk = await tx.$queryRaw<{ event_key: string }[]>`SELECT event_key FROM warehouse_receipt WHERE shipment_id = ${id}`;
      const xk = await tx.$queryRaw<{ resolution_key: string }[]>`SELECT resolution_key FROM warehouse_resolution WHERE shipment_id = ${id}`;
      const [mx] = await tx.$queryRaw<{ m: Num | null }[]>`SELECT MAX(seq) AS m FROM warehouse_history WHERE shipment_id = ${id}`;
      await this.appendEvents(tx, id, s, { receipts: new Set(rk.map((r) => r.event_key)), resolutions: new Set(xk.map((r) => r.resolution_key)), maxSeq: n(mx?.m) });
      const updated = await tx.$executeRaw`UPDATE warehouse_shipment SET status = ${s.status}, version = ${s.version} WHERE id = ${id} AND version = ${expectedVersion}`;
      if (updated !== 1) throw new RepositoryConflict('VERSION_CONFLICT');
    });
  }

  private async appendEvents(tx: Prisma.TransactionClient, id: number, s: Shipment, known: { receipts: Set<string>; resolutions: Set<string>; maxSeq: number }): Promise<void> {
    for (const r of s.receipts) {
      if (known.receipts.has(r.eventKey)) continue;
      await tx.$executeRaw`INSERT INTO warehouse_receipt (shipment_id, event_key, actor_user_id, request_id, at, payload) VALUES (${id}, ${r.eventKey}, ${r.actorUserId}, ${r.requestId}, ${r.at}, ${r.payload})`;
      const [row] = await tx.$queryRaw<{ id: Num }[]>`SELECT LAST_INSERT_ID() AS id`;
      for (const l of r.lines) await tx.$executeRaw`INSERT INTO warehouse_receipt_line (receipt_id, line_no, accepted_quantity, rejected_quantity, rejected_reason) VALUES (${n(row.id)}, ${l.lineNo}, ${l.acceptedQuantity}, ${l.rejectedQuantity}, ${l.rejectedReason})`;
    }
    for (const r of s.resolutions) {
      if (known.resolutions.has(r.resolutionKey)) continue;
      await tx.$executeRaw`INSERT INTO warehouse_resolution (shipment_id, resolution_key, line_no, target, kind, quantity, reason, actor_user_id, request_id, at, payload) VALUES (${id}, ${r.resolutionKey}, ${r.lineNo}, ${r.target}, ${r.kind}, ${r.quantity}, ${r.reason}, ${r.actorUserId}, ${r.requestId}, ${r.at}, ${r.payload})`;
    }
    for (const x of s.history) if (x.seq > known.maxSeq) await tx.$executeRaw`INSERT INTO warehouse_history (shipment_id, seq, type, actor_user_id, request_id, at, ref) VALUES (${id}, ${x.seq}, ${x.type}, ${x.actorUserId}, ${x.requestId}, ${x.at}, ${x.ref})`;
  }

  async hasOpenShipmentForMapping(mappingRef: string): Promise<boolean> {
    const r = await this.db.$queryRaw<{ x: Num }[]>`SELECT 1 AS x FROM warehouse_shipment s JOIN warehouse_shipment_line l ON l.shipment_id = s.id WHERE l.mapping_ref = ${mappingRef} AND s.status NOT IN ('CLOSED', 'CANCELLED') LIMIT 1`;
    return r.length > 0;
  }
}

// ------------------------------------------------------------------------------------------------------------------- outbox
type OutRow = { intent_key: string; source_ref: string; event_key: string; store_company_id: Num; store_item_id: Num; mapping_ref: string; quantity: Num; treatment: OutboxRecord['treatment']; status: OutboxRecord['status']; attempts: Num; last_error: string | null; enqueued_at: string; applied_at: string | null };
const toOutbox = (r: OutRow): OutboxRecord => ({ intentKey: r.intent_key, sourceRef: r.source_ref, eventKey: r.event_key, storeCompanyId: n(r.store_company_id), storeItemId: n(r.store_item_id), mappingRef: r.mapping_ref, quantity: n(r.quantity), treatment: r.treatment, status: r.status, attempts: n(r.attempts), lastError: r.last_error, enqueuedAt: r.enqueued_at, appliedAt: r.applied_at });
const OUT_COLS = Prisma.raw('intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, status, attempts, last_error, enqueued_at, applied_at');
const sameContent = (a: OutboxRecord, b: OutboxRecord) => a.sourceRef === b.sourceRef && a.eventKey === b.eventKey && a.storeCompanyId === b.storeCompanyId && a.storeItemId === b.storeItemId && a.mappingRef === b.mappingRef && a.quantity === b.quantity && a.treatment === b.treatment;

export class PrismaStockOutbox implements StockOutbox {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }
  async enqueue(records: readonly OutboxRecord[]): Promise<{ inserted: string[]; existing: string[]; conflicts: string[] }> {
    const inserted: string[] = [], existing: string[] = [], conflicts: string[] = [];
    await this.db.$transaction(async (tx) => {
      for (const r of records) {
        const changed = await tx.$executeRaw`INSERT IGNORE INTO warehouse_stock_outbox (intent_key, source_ref, event_key, store_company_id, store_item_id, mapping_ref, quantity, treatment, status, attempts, last_error, enqueued_at)
          VALUES (${r.intentKey}, ${r.sourceRef}, ${r.eventKey}, ${r.storeCompanyId}, ${r.storeItemId}, ${r.mappingRef}, ${r.quantity}, ${r.treatment}, 'PENDING', 0, NULL, ${r.enqueuedAt})`;
        if (changed === 1) { inserted.push(r.intentKey); continue; }
        const cur = (await tx.$queryRaw<OutRow[]>`SELECT ${OUT_COLS} FROM warehouse_stock_outbox WHERE intent_key = ${r.intentKey}`)[0];
        if (cur && sameContent(toOutbox(cur), r)) existing.push(r.intentKey); else conflicts.push(r.intentKey);   // never overwritten
      }
    });
    return { inserted, existing, conflicts };
  }
  async pending(limit: number): Promise<OutboxRecord[]> {
    return (await this.db.$queryRaw<OutRow[]>`SELECT ${OUT_COLS} FROM warehouse_stock_outbox WHERE status = 'PENDING' ORDER BY enqueued_at, intent_key LIMIT ${limit}`).map(toOutbox);
  }
  async markApplied(intentKey: string, at: string): Promise<boolean> {
    return (await this.db.$executeRaw`UPDATE warehouse_stock_outbox SET status = 'APPLIED', applied_at = ${at} WHERE intent_key = ${intentKey} AND status = 'PENDING'`) === 1;
  }
  /** MariaDB evaluates the SET list left to right: in `status = IF(attempts >= ?, ...)` `attempts` is ALREADY incremented (the rehearsal caught the off-by-one of the naive `attempts + 1`). */
  async markFailed(intentKey: string, error: string, maxAttempts: number): Promise<'PENDING' | 'DEAD'> {
    await this.db.$executeRaw`UPDATE warehouse_stock_outbox SET attempts = attempts + 1, last_error = ${error.slice(0, 200)}, status = IF(attempts >= ${maxAttempts}, 'DEAD', 'PENDING') WHERE intent_key = ${intentKey} AND status = 'PENDING'`;
    const r = await this.db.$queryRaw<{ status: string }[]>`SELECT status FROM warehouse_stock_outbox WHERE intent_key = ${intentKey}`;
    return r[0]?.status === 'DEAD' ? 'DEAD' : 'PENDING';
  }
  async all(): Promise<OutboxRecord[]> { return (await this.db.$queryRaw<OutRow[]>`SELECT ${OUT_COLS} FROM warehouse_stock_outbox ORDER BY enqueued_at, intent_key LIMIT 5000`).map(toOutbox); }
}

/**
 * SIMULATED posting side (tables `warehouse_sim_*`, NOT the TOKO inventory): the ledger primary key on `intent_key` makes a second application impossible
 * and the ledger row and the balance change commit in ONE transaction, so a crash can leave neither half. The production writer must offer the same two
 * properties on the real TOKO tables (a unique idempotency record written atomically with the stock change, using the POS lock order): that is the part
 * this rehearsal can only specify, not prove, because posting to real TOKO stock is out of scope.
 */
export class PrismaSimulatedStockApplier implements StockApplier {
  private readonly db: PrismaClient;
  constructor(db: PrismaClient) { this.db = db; }
  async apply(r: OutboxRecord): Promise<'APPLIED' | 'ALREADY_APPLIED'> {
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO warehouse_sim_stock_ledger (intent_key, store_company_id, store_item_id, quantity, applied_at) VALUES (${r.intentKey}, ${r.storeCompanyId}, ${r.storeItemId}, ${r.quantity}, ${new Date().toISOString()})`;
        await tx.$executeRaw`INSERT INTO warehouse_sim_stock_balance (store_company_id, store_item_id, quantity) VALUES (${r.storeCompanyId}, ${r.storeItemId}, ${r.quantity}) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`;
      });
      return 'APPLIED';
    } catch (e) { if (errno(e) === 1062) return 'ALREADY_APPLIED'; throw e; }
  }
}

// ------------------------------------------------------------------------------------------ manual recovery and reconciliation
export type RequeueOutcome = 'REQUEUED' | 'MARKED_APPLIED' | 'NOT_DEAD' | 'NOT_FOUND';
/**
 * Dead-letter recovery rule (manual, audited): a DEAD record is requeued only by a named actor with a reason, and ONLY if the posting side has no ledger
 * row for its key; if the ledger already holds the key the correct action is to mark it APPLIED (replaying would be a no-op anyway). Anything else is refused.
 */
export async function requeueDeadLetter(db: PrismaClient, input: { intentKey: string; actorUserId: number; requestId: string; reason: string }): Promise<RequeueOutcome> {
  const reason = input.reason.replace(/[\u0000-\u001f]/g, ' ').trim();
  if (reason.length < 10 || reason.length > 200) throw new Error('REASON_REQUIRED');
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM warehouse_stock_outbox WHERE intent_key = ${input.intentKey} FOR UPDATE`;
    if (!rows[0]) return 'NOT_FOUND';
    if (rows[0].status !== 'DEAD') return 'NOT_DEAD';
    const ledger = await tx.$queryRaw<{ x: Num }[]>`SELECT 1 AS x FROM warehouse_sim_stock_ledger WHERE intent_key = ${input.intentKey}`;
    const outcome: RequeueOutcome = ledger.length ? 'MARKED_APPLIED' : 'REQUEUED';
    if (outcome === 'MARKED_APPLIED') await tx.$executeRaw`UPDATE warehouse_stock_outbox SET status = 'PENDING', last_error = NULL WHERE intent_key = ${input.intentKey}`;   // the next drain sees ALREADY_APPLIED and acknowledges it
    else await tx.$executeRaw`UPDATE warehouse_stock_outbox SET status = 'PENDING', attempts = 0, last_error = NULL WHERE intent_key = ${input.intentKey}`;
    await tx.$executeRaw`INSERT INTO warehouse_audit_event (occurred_at, actor_user_id, action, subject, request_id, detail) VALUES (NOW(3), ${input.actorUserId}, 'warehouse.outbox.requeue', ${`outbox:${input.intentKey}`.slice(0, 190)}, ${input.requestId}, ${JSON.stringify({ outcome, reason })})`;
    return outcome;
  });
}

export type OutboxReconciliationRow = { intentKey: string; outbox: 'PENDING' | 'APPLIED' | 'DEAD' | 'MISSING'; ledger: boolean; finding: 'CONSISTENT' | 'PENDING' | 'DEAD_NEEDS_ACTION' | 'APPLIED_NOT_ACKNOWLEDGED' | 'ACKNOWLEDGED_WITHOUT_LEDGER' | 'LEDGER_WITHOUT_OUTBOX' };
/** Per-intent comparison of the outbox with the posting ledger: nothing is changed, every difference is named. */
export async function outboxReconciliation(db: PrismaClient, sourceRef: string): Promise<OutboxReconciliationRow[]> {
  const out = await db.$queryRaw<{ intent_key: string; status: 'PENDING' | 'APPLIED' | 'DEAD' }[]>`SELECT intent_key, status FROM warehouse_stock_outbox WHERE source_ref = ${sourceRef} ORDER BY intent_key LIMIT 5000`;
  const led = await db.$queryRaw<{ intent_key: string }[]>`SELECT intent_key FROM warehouse_sim_stock_ledger WHERE intent_key LIKE ${`${sourceRef.replace(/[\\%_]/g, (c) => `\\${c}`)}|%`} ORDER BY intent_key LIMIT 5000`;
  const ledgerKeys = new Set(led.map((l) => l.intent_key)); const rows: OutboxReconciliationRow[] = [];
  for (const o of out) {
    const inLedger = ledgerKeys.has(o.intent_key); ledgerKeys.delete(o.intent_key);
    const finding = o.status === 'APPLIED' ? (inLedger ? 'CONSISTENT' : 'ACKNOWLEDGED_WITHOUT_LEDGER') : inLedger ? 'APPLIED_NOT_ACKNOWLEDGED' : o.status === 'DEAD' ? 'DEAD_NEEDS_ACTION' : 'PENDING';
    rows.push({ intentKey: o.intent_key, outbox: o.status, ledger: inLedger, finding });
  }
  for (const k of ledgerKeys) rows.push({ intentKey: k, outbox: 'MISSING', ledger: true, finding: 'LEDGER_WITHOUT_OUTBOX' });
  return rows;
}
