// TEST-ONLY reference implementation of the TOKO stock-writer CONTRACT (checkpoint 12), run against kkisi_toko_writer_contract — tables with the EXACT
// legacy DDL of db_items and db_stockentry plus the proposed nx_stock_posting. It is the shape the real writer must have; it is not wired anywhere.
// One transaction, in this order (lock order compatible with the POS checkout, which locks db_items rows through its stock UPDATE):
//   1. read the posting by intent key (fast path for retries; identical content -> ALREADY_APPLIED, different -> conflict)
//   2. UPDATE db_items SET stock = stock + q WHERE id AND company_id AND status_so = 0   (row lock; refuses an item under stock opname)
//   3. INSERT the LEDGER row the legacy recompute (Pos_model::update_items_quantity) counts — here db_stockentry, status 1; WHICH ledger is decision D7
//   4. INSERT nx_stock_posting (PRIMARY KEY intent_key) with the ledger id; a concurrent winner makes this fail (1062) -> whole transaction rolls back
// No INSERT .. ON DUPLICATE KEY UPDATE anywhere: with column-level grants MariaDB would demand UPDATE on every inserted column.
const num = (v) => Number(typeof v === 'bigint' ? Number(v) : v);
const errno = (e) => { const m = /\b(1062|1142|1143|1644)\b/.exec(String(e?.message)); return m ? Number(m[1]) : null; };
export class StockWriterError extends Error { constructor(code) { super(code); this.name = 'StockWriterError'; this.code = code; } }
const same = (row, r) => row && row.source_ref === r.sourceRef && row.event_key === r.eventKey && num(row.company_id) === r.storeCompanyId && num(row.item_id) === r.storeItemId && row.mapping_ref === r.mappingRef && num(row.quantity) === r.quantity;

export class TokoStockWriterContract {
  constructor(db, hooks = {}) { this.db = db; this.hooks = hooks; }
  async #existing(tx, key) { return (await tx.$queryRaw`SELECT source_ref, event_key, company_id, item_id, mapping_ref, quantity FROM nx_stock_posting WHERE intent_key = ${key} LOCK IN SHARE MODE`)[0]; }
  async apply(r) {
    try {
      return await this.db.$transaction(async (tx) => {
        const prior = await this.#existing(tx, r.intentKey);
        if (prior) { if (same(prior, r)) return 'ALREADY_APPLIED'; throw new StockWriterError('PAYLOAD_CONFLICT'); }
        const changed = await tx.$executeRaw`UPDATE db_items SET stock = stock + ${r.quantity} WHERE id = ${r.storeItemId} AND company_id = ${r.storeCompanyId} AND status_so = 0`;
        if (changed !== 1) {
          const item = (await tx.$queryRaw`SELECT status_so FROM db_items WHERE id = ${r.storeItemId} AND company_id = ${r.storeCompanyId}`)[0];
          throw new StockWriterError(item ? 'ITEM_LOCKED' : 'ITEM_UNKNOWN');   // locked by stock opname: retry later; unknown: mapping defect, DEAD after retries
        }
        await tx.$executeRaw`INSERT INTO db_stockentry (entry_date, item_id, qty, expire_date, company_id, status, note) VALUES (NOW(), ${r.storeItemId}, ${r.quantity}, NULL, ${r.storeCompanyId}, 1, 'Penyesuaian')`;
        const [{ id }] = await tx.$queryRaw`SELECT LAST_INSERT_ID() AS id`;
        if (this.hooks.beforePosting) await this.hooks.beforePosting(r);
        await tx.$executeRaw`INSERT INTO nx_stock_posting (intent_key, source_ref, event_key, company_id, item_id, mapping_ref, quantity, ledger_table, ledger_id, posted_at)
          VALUES (${r.intentKey}, ${r.sourceRef}, ${r.eventKey}, ${r.storeCompanyId}, ${r.storeItemId}, ${r.mappingRef}, ${r.quantity}, 'db_stockentry', ${num(id)}, NOW())`;
        return 'APPLIED';
      });
    } catch (e) {
      if (errno(e) !== 1062) throw e;
      // a concurrent writer committed the same intent first: our transaction (cache + ledger) was rolled back; classify against what it wrote
      const prior = (await this.db.$queryRaw`SELECT source_ref, event_key, company_id, item_id, mapping_ref, quantity FROM nx_stock_posting WHERE intent_key = ${r.intentKey}`)[0];
      if (same(prior, r)) return 'ALREADY_APPLIED';
      throw new StockWriterError('PAYLOAD_CONFLICT');
    }
  }
}

/** The legacy recompute restricted to what the contract database holds (db_stockentry, status 1); the other four ledgers are empty here. */
export async function legacyRecompute(db, itemId) {
  const [{ s }] = await db.$queryRaw`SELECT COALESCE(SUM(qty), 0) AS s FROM db_stockentry WHERE item_id = ${itemId} AND status = '1'`;
  await db.$executeRaw`UPDATE db_items SET stock = ${num(s)} WHERE id = ${itemId}`;
  return num(s);
}
export const stockOf = async (db, itemId) => num((await db.$queryRaw`SELECT stock FROM db_items WHERE id = ${itemId}`)[0].stock);
export const ledgerSum = async (db, itemId) => num((await db.$queryRaw`SELECT COALESCE(SUM(qty), 0) AS s FROM db_stockentry WHERE item_id = ${itemId} AND status = '1'`)[0].s);
export const postingsFor = async (db, prefix) => (await db.$queryRaw`SELECT intent_key, item_id, quantity, ledger_id FROM nx_stock_posting WHERE source_ref LIKE ${prefix + '%'} ORDER BY intent_key`).map((p) => ({ key: p.intent_key, item: num(p.item_id), qty: num(p.quantity), ledger: num(p.ledger_id) }));
