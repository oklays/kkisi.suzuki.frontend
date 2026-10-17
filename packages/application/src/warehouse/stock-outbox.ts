import { WarehouseError, stockIntents, type Shipment, type StockIntent } from '@koperasi/domain/warehouse';
import type { MovementTreatment, MovementTreatmentPolicy } from './ports.ts';

/**
 * Durable, idempotent hand-off of accepted quantities from a Warehouse shipment to the future TOKO stock writer (spec design §10b; checkpoint 9).
 * Gudang and TOKO live in different databases and share no transaction, so the Warehouse side only ever WRITES an outbox record per accepted
 * receipt line (stable `intentKey` from the domain) and a separate drain applies each record exactly once through a `StockApplier`.
 * Ports and pure orchestration only: no adapter, no connection, no stock is touched. A writer refuses UNSPECIFIED accounting treatment (owner
 * decision D7 is open), so nothing is enqueued without an explicit policy.
 */
export type OutboxStatus = 'PENDING' | 'APPLIED' | 'DEAD';
export type OutboxRecord = StockIntent & { treatment: Exclude<MovementTreatment, 'UNSPECIFIED'>; status: OutboxStatus; attempts: number; lastError: string | null; enqueuedAt: string; appliedAt: string | null };

export interface StockOutbox {
  /** Insert-if-absent keyed on `intentKey`. An existing key with IDENTICAL content is `existing`; with different content it is a `conflict` (never overwritten). */
  enqueue(records: readonly OutboxRecord[]): Promise<{ inserted: string[]; existing: string[]; conflicts: string[] }>;
  /** PENDING records in deterministic order (enqueuedAt, intentKey), at most `limit`. Claiming is not a lock: applying is idempotent, so a second drain is harmless. */
  pending(limit: number): Promise<OutboxRecord[]>;
  /** Compare-and-set PENDING -> APPLIED; false when it already is (another drain won). */
  markApplied(intentKey: string, at: string): Promise<boolean>;
  /** Records the failure; returns DEAD once `attempts` reaches `maxAttempts` (needs a human), otherwise PENDING again. */
  markFailed(intentKey: string, error: string, maxAttempts: number): Promise<'PENDING' | 'DEAD'>;
}

/** The (future) TOKO stock writer. Contract: idempotent by `intentKey` — applying the same key twice must not change stock twice. */
export interface StockApplier { apply(intent: OutboxRecord): Promise<'APPLIED' | 'ALREADY_APPLIED'>; }

export type OutboxDeps = { outbox: StockOutbox; now: () => Date; treatment?: MovementTreatmentPolicy };

const sameContent = (a: StockIntent, b: StockIntent) => a.sourceRef === b.sourceRef && a.eventKey === b.eventKey && a.storeCompanyId === b.storeCompanyId && a.storeItemId === b.storeItemId && a.mappingRef === b.mappingRef && a.quantity === b.quantity;
export const contentOf = sameContent;

/**
 * Turns the accepted quantities of a shipment into outbox records. Replaying the same shipment changes nothing (already-known keys are
 * `existing`); a key that reappears with different content is an IDEMPOTENCY_CONFLICT and nothing from that call is trusted.
 */
export async function enqueueStockIntents(d: OutboxDeps, shipment: Shipment): Promise<{ inserted: number; existing: number }> {
  const treatment: MovementTreatment = d.treatment?.treatmentFor({ sourceWarehouseId: shipment.sourceWarehouseId, destinationStoreCompanyId: shipment.destinationStoreCompanyId }) ?? 'UNSPECIFIED';
  if (treatment === 'UNSPECIFIED') throw new WarehouseError('POLICY_REQUIRED');   // owner decision D7: no stock hand-off without an explicit treatment
  const at = d.now().toISOString();
  const records: OutboxRecord[] = stockIntents(shipment).map((i) => ({ ...i, treatment, status: 'PENDING', attempts: 0, lastError: null, enqueuedAt: at, appliedAt: null }));
  if (records.length === 0) return { inserted: 0, existing: 0 };
  const r = await d.outbox.enqueue(records);
  if (r.conflicts.length > 0) throw new WarehouseError('IDEMPOTENCY_CONFLICT');
  return { inserted: r.inserted.length, existing: r.existing.length };
}

export type DrainSummary = { applied: number; alreadyApplied: number; failed: number; dead: number };

/**
 * Applies pending records one by one. A crash between `apply` and `markApplied` is safe: the next drain re-applies, the applier answers
 * ALREADY_APPLIED, and the record is then marked. One failing record never blocks the others; after `maxAttempts` it becomes DEAD and is reported.
 */
export async function drainStockOutbox(d: { outbox: StockOutbox; applier: StockApplier; now: () => Date }, options: { limit?: number; maxAttempts?: number } = {}): Promise<DrainSummary> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200), maxAttempts = Math.min(Math.max(options.maxAttempts ?? 5, 1), 20);
  const summary: DrainSummary = { applied: 0, alreadyApplied: 0, failed: 0, dead: 0 };
  for (const record of await d.outbox.pending(limit)) {
    let outcome: 'APPLIED' | 'ALREADY_APPLIED';
    try { outcome = await d.applier.apply(record); }
    catch (e) { const state = await d.outbox.markFailed(record.intentKey, (e instanceof Error ? e.message : 'unknown').slice(0, 200), maxAttempts); if (state === 'DEAD') summary.dead++; else summary.failed++; continue; }
    await d.outbox.markApplied(record.intentKey, d.now().toISOString());
    if (outcome === 'ALREADY_APPLIED') summary.alreadyApplied++; else summary.applied++;
  }
  return summary;
}
