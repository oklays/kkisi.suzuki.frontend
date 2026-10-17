// TEST support for the TOKO stock-writer CONTRACT (checkpoints 12-13), run against kkisi_toko_writer_contract (exact legacy DDL of db_items and db_stockentry plus the
// proposed nx_stock_posting). The writer itself is the unwired staging implementation src/infrastructure/warehouse/toko-stock-applier.ts; this file only supplies a
// TEST-ONLY ledger (the real ledger is decision D7) and helpers that model the legacy stock recompute.
import { PrismaTokoStockApplier, StockApplyError } from '../../src/infrastructure/warehouse/toko-stock-applier.ts';
const num = (v) => Number(typeof v === 'bigint' ? Number(v) : v);

/** TEST-ONLY ledger for the contract database: db_stockentry, status 1 — chosen here ONLY because the legacy recompute counts it. The real ledger is decision D7. */
export const stockEntryLedgerForContractTests = {
  ledgerTable: 'db_stockentry',
  async insert(tx, m) {
    await tx.$executeRaw`INSERT INTO db_stockentry (entry_date, item_id, qty, expire_date, company_id, status, note) VALUES (NOW(), ${m.itemId}, ${m.quantity}, NULL, ${m.companyId}, 1, 'Penyesuaian')`;
    const [{ id }] = await tx.$queryRaw`SELECT LAST_INSERT_ID() AS id`; return num(id);
  },
};
export const StockWriterError = StockApplyError;
/** The applier under test is the staging implementation in src/infrastructure/warehouse/toko-stock-applier.ts, with the test-only ledger above. */
export class TokoStockWriterContract extends PrismaTokoStockApplier { constructor(db, hooks = {}) { super(db, stockEntryLedgerForContractTests, hooks); } }

/** The legacy recompute restricted to what the contract database holds (db_stockentry, status 1); the other four ledgers are empty here. */
export async function legacyRecompute(db, itemId) {
  const [{ s }] = await db.$queryRaw`SELECT COALESCE(SUM(qty), 0) AS s FROM db_stockentry WHERE item_id = ${itemId} AND status = '1'`;
  await db.$executeRaw`UPDATE db_items SET stock = ${num(s)} WHERE id = ${itemId}`;
  return num(s);
}
export const stockOf = async (db, itemId) => num((await db.$queryRaw`SELECT stock FROM db_items WHERE id = ${itemId}`)[0].stock);
export const ledgerSum = async (db, itemId) => num((await db.$queryRaw`SELECT COALESCE(SUM(qty), 0) AS s FROM db_stockentry WHERE item_id = ${itemId} AND status = '1'`)[0].s);
export const postingsFor = async (db, prefix) => (await db.$queryRaw`SELECT intent_key, item_id, quantity, ledger_id FROM nx_stock_posting WHERE source_ref LIKE ${prefix + '%'} ORDER BY intent_key`).map((p) => ({ key: p.intent_key, item: num(p.item_id), qty: num(p.quantity), ledger: num(p.ledger_id) }));
