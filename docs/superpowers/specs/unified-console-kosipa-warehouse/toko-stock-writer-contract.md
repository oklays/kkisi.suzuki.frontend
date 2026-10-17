# TOKO stock-writer SQL and idempotency contract — review (checkpoint 12)

Status: **contract validated locally against tables with the exact legacy DDL; no writer is wired; production posting remains disabled.** Blocked by D7 (which ledger), B5/B9 (writer account capacity and cutover order), B4 (technical single-writer), and a production review of the DDL proposal and lock order. Production exactly-once is **not** claimed.

## 1. How TOKO stock works today (evidence from code)

| Writer | Statement | Transaction / lock | Ledger row |
|---|---|---|---|
| POS checkout (Next.js) | `UPDATE db_items SET stock = stock - q WHERE id AND company_id AND status = 1 AND status_so = 0 AND stock >= q` | one transaction with the sale rows; the UPDATE takes the item row lock | `db_salesitems` (sales Final) |
| Sales return (Next.js) | `UPDATE db_items SET stock = stock + q WHERE id AND company_id AND status_so = 0` | one transaction with the return rows | `db_salesitemsreturn` |
| Stock opname (Next.js) | `UPDATE db_items SET stock = <counted>, status_so = 0 … AND status_so = 1` + `INSERT db_stockentry` | one transaction | `db_stockentry` |
| Legacy PHP, every item it touches | `Pos_model::update_items_quantity()`: `stock = Σ stockentry(status 1) + Σ purchases Received (≥ 2025) + Σ sales returns − Σ purchase returns − Σ sales Final` then `UPDATE db_items SET stock = …` | **not** locked: separate statements | — (it **recomputes** the cache) |

Consequences for any new writer:

1. `db_items.stock` is a **cache**; the ledgers are the truth. A writer that only increments the cache is **erased** by the next legacy recompute (proven: `toko-writer-contract-db.test.mjs`, "a cache-only +5 is ERASED").
2. The writer must insert a ledger row that the recompute counts. The candidates are `db_stockentry` (status 1; its `note` ENUM has no "transfer" value) or `db_purchase` + `db_purchaseitems` with status Received (a commercial purchase). **Which one is decision D7**; the contract test uses `db_stockentry` only because the recompute counts it.
3. Items under stock opname (`status_so = 1`) must be refused, as POS and returns already do.
4. The legacy recompute is not transactional: if a posting commits between its SUM and its UPDATE, the cache is briefly stale. It self-heals at the next recompute because the ledger row exists. This is the same exposure the POS has today, and it is one more reason simultaneous old and new writers stay unauthorised (B4).

## 2. Contract (validated)

One transaction, in this order (lock order compatible with POS, which locks `db_items` rows through its stock UPDATE):

1. Read `nx_stock_posting` by intent key (`LOCK IN SHARE MODE`). Identical content → `ALREADY_APPLIED`; different → `PAYLOAD_CONFLICT`. Nothing is written in either case.
2. `UPDATE db_items SET stock = stock + q WHERE id AND company_id AND status_so = 0`. 0 rows → `ITEM_LOCKED` (opname, retry later) or `ITEM_UNKNOWN` (mapping defect; DEAD after bounded retries).
3. `INSERT` the ledger row (D7) and capture its id.
4. `INSERT nx_stock_posting` (PRIMARY KEY `intent_key`) with the ledger id. A concurrent writer that committed the same intent first makes this fail with 1062, the **whole** transaction (cache + ledger) rolls back, and the writer re-reads and answers `ALREADY_APPLIED` or `PAYLOAD_CONFLICT`.

**SQL strategy and privileges.** No `INSERT … ON DUPLICATE KEY UPDATE`: MariaDB requires UPDATE on every inserted column for it, which a least-privilege grant does not give (1143 with a column-level grant, Checkpoint 11 harness; 1142 with an insert-only grant, this checkpoint). The writer needs exactly: `SELECT` + `UPDATE(stock)` on `db_items`, `SELECT, INSERT` on the ledger table, `SELECT, INSERT` on `nx_stock_posting`. It needs no INSERT on `db_items`, no DELETE anywhere and no DDL. **No privilege was widened to make a syntax work.**

**Schema change required.** No existing ledger table has a business key that can hold the intent key (`db_stockentry`: surrogate id + fixed ENUM; purchases: non-unique references). Transactional idempotency therefore needs the new table in the TOKO database; the exact DDL is `docs/migration/sql/toko-stock-posting-idempotency-proposed.sql` (review-only, with immutability triggers and the grant list).

## 3. Evidence (local, synthetic, schema-equivalent)

`scripts/setup-toko-writer-contract.sh --apply` creates `kkisi_toko_writer_contract` with `db_items` and `db_stockentry` from `SHOW CREATE TABLE` of the local legacy copy (structure only), verifies that columns **and** indexes equal the source, adds the proposed table, synthetic items 990001–990020 (990020 under opname) and the least-privilege account. `tests/toko-writer-contract-db.test.mjs` (opt-in, 5 tests, green on three consecutive runs):

| Property | Result |
|---|---|
| Privileges refuse everything outside the contract (other columns of `db_items`, ledger UPDATE/DELETE, cache upsert, ODKU, DELETE of postings) | pass |
| Posting + ledger + cache in one transaction; survives the legacy recompute; cache-only counter-example erased | pass |
| Retry after commit changes nothing; conflicting payload (quantity, item, mapping) rejected and changes nothing | pass |
| Opname-locked item, other branch, unknown item refused; failure after the ledger insert rolls everything back | pass |
| Three writers delivering the same 10 intents concurrently while the exact POS statement sells the same item: 10 postings, cache = start + posted − sold = ledger-derived stock | pass |

Mutation checks (writer broken on purpose, then restored): no ledger row → 3 tests fail; opname lock ignored → 1 fails; no content comparison → 1 fails.

## 4. What is still not proven (do not claim)

* Production equivalence: the local copy is the 30 Sep snapshot, so its indexes may differ from production (B3), and the production MariaDB version and triggers come from the evidence bundle (G6/G7).
* The ledger choice and its accounting meaning (D7), and the purchase path if D7 chooses a commercial purchase (its own tables and lock order).
* Coexistence with legacy PHP writers on the same branch: not authorised (B4).
* Network and process failures between Warehouse and TOKO: covered by the Checkpoint 11 harness on a test store, not on this schema.
* Exactly-once in production: only after this contract runs on a schema-equivalent **authorised staging** environment.
