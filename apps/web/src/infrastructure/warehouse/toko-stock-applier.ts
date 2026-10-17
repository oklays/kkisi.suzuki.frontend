import type { PrismaClient, Prisma } from '@prisma/client';
import type { OutboxRecord, StockApplier } from '@koperasi/application/warehouse';

/**
 * TOKO stock applier for Warehouse receipts — STAGING IMPLEMENTATION, NOT WIRED (checkpoint 13). Nothing in the application constructs it, no
 * environment variable enables it, and it cannot run without a `LedgerWriter`, of which the application provides NONE: which of the five ledgers the
 * legacy recompute (Pos_model::update_items_quantity) counts should receive a Gudang -> TOKO movement is owner decision D7.
 *
 * Contract (validated on the exact legacy DDL, see toko-stock-writer-contract.md): ONE transaction, in the POS-compatible lock order —
 *   1. read nx_stock_posting by intent key (identical -> ALREADY_APPLIED, different -> PAYLOAD_CONFLICT; nothing written)
 *   2. UPDATE db_items SET stock = stock + q WHERE id AND company_id AND status_so = 0   (item row lock; refuses stock opname and other branches)
 *   3. LedgerWriter.insert(...) -> ledger row id   (the authoritative movement the legacy recompute counts)
 *   4. INSERT nx_stock_posting (PRIMARY KEY intent_key) with source/receipt reference and ledger id; a concurrent winner -> 1062 -> whole rollback
 * No INSERT .. ON DUPLICATE KEY UPDATE (incompatible with least-privilege grants). The idempotency table is the reviewed DDL proposal
 * (docs/migration/sql/toko-stock-posting-idempotency-proposed.sql) and needs separate staging approval before it exists anywhere but local tests.
 */
export interface LedgerWriter {
  /** Name recorded on the posting row, e.g. 'db_stockentry'. */
  readonly ledgerTable: string;
  /** Inserts the ledger row for this movement inside `tx` and returns its id. Must not touch db_items. */
  insert(tx: Prisma.TransactionClient, movement: { companyId: number; itemId: number; quantity: number; sourceRef: string; eventKey: string }): Promise<number>;
}
export type StockApplyErrorCode = 'PAYLOAD_CONFLICT' | 'ITEM_LOCKED' | 'ITEM_UNKNOWN';
export class StockApplyError extends Error {
  readonly code: StockApplyErrorCode;
  constructor(code: StockApplyErrorCode) { super(code); this.name = 'StockApplyError'; this.code = code; }
}
type Num = number | bigint;
type PostingRow = { source_ref: string; event_key: string; company_id: Num; item_id: Num; mapping_ref: string; quantity: Num };
const num = (v: Num) => Number(v);
const dup = (e: unknown) => /\b1062\b/.test(String((e as { message?: string })?.message ?? ''));
const same = (row: PostingRow | undefined, r: OutboxRecord) => !!row && row.source_ref === r.sourceRef && row.event_key === r.eventKey && num(row.company_id) === r.storeCompanyId && num(row.item_id) === r.storeItemId && row.mapping_ref === r.mappingRef && num(row.quantity) === r.quantity;

export class PrismaTokoStockApplier implements StockApplier {
  private readonly db: PrismaClient; private readonly ledger: LedgerWriter; private readonly hooks: { beforePosting?: (r: OutboxRecord) => Promise<void> };
  constructor(db: PrismaClient, ledger: LedgerWriter, hooks: { beforePosting?: (r: OutboxRecord) => Promise<void> } = {}) {
    if (!ledger) throw new Error('LedgerWriter required (decision D7): no default ledger exists');
    this.db = db; this.ledger = ledger; this.hooks = hooks;
  }
  async apply(r: OutboxRecord): Promise<'APPLIED' | 'ALREADY_APPLIED'> {
    if (!Number.isSafeInteger(r.quantity) || r.quantity <= 0) throw new StockApplyError('PAYLOAD_CONFLICT');
    try {
      return await this.db.$transaction(async (tx) => {
        const prior = (await tx.$queryRaw<PostingRow[]>`SELECT source_ref, event_key, company_id, item_id, mapping_ref, quantity FROM nx_stock_posting WHERE intent_key = ${r.intentKey} LOCK IN SHARE MODE`)[0];
        if (prior) { if (same(prior, r)) return 'ALREADY_APPLIED' as const; throw new StockApplyError('PAYLOAD_CONFLICT'); }
        const changed = await tx.$executeRaw`UPDATE db_items SET stock = stock + ${r.quantity} WHERE id = ${r.storeItemId} AND company_id = ${r.storeCompanyId} AND status_so = 0`;
        if (changed !== 1) {
          const item = (await tx.$queryRaw<{ status_so: Num }[]>`SELECT status_so FROM db_items WHERE id = ${r.storeItemId} AND company_id = ${r.storeCompanyId}`)[0];
          throw new StockApplyError(item ? 'ITEM_LOCKED' : 'ITEM_UNKNOWN');
        }
        const ledgerId = await this.ledger.insert(tx, { companyId: r.storeCompanyId, itemId: r.storeItemId, quantity: r.quantity, sourceRef: r.sourceRef, eventKey: r.eventKey });
        if (this.hooks.beforePosting) await this.hooks.beforePosting(r);
        await tx.$executeRaw`INSERT INTO nx_stock_posting (intent_key, source_ref, event_key, company_id, item_id, mapping_ref, quantity, ledger_table, ledger_id, posted_at)
          VALUES (${r.intentKey}, ${r.sourceRef}, ${r.eventKey}, ${r.storeCompanyId}, ${r.storeItemId}, ${r.mappingRef}, ${r.quantity}, ${this.ledger.ledgerTable}, ${ledgerId}, NOW())`;
        return 'APPLIED' as const;
      });
    } catch (e) {
      if (!dup(e)) throw e;
      const prior = (await this.db.$queryRaw<PostingRow[]>`SELECT source_ref, event_key, company_id, item_id, mapping_ref, quantity FROM nx_stock_posting WHERE intent_key = ${r.intentKey}`)[0];
      if (same(prior, r)) return 'ALREADY_APPLIED';
      throw new StockApplyError('PAYLOAD_CONFLICT');
    }
  }
}
