# Warehouse Persistence Architecture — PROPOSAL for owner review

**Status:** proposal only. **Nothing is created, enabled or connected.** No Warehouse table exists anywhere, no adapter opens a connection, no writer exists, no stock is posted. Approving this document does not approve any DDL: production objects need their own reviewed SQL run by the operator (see `production-db-changes-manual-only`).
Inputs: design §10b (domain contract), `packages/application/src/warehouse/` (ports, outbox), the connection-budget record (journal, Checkpoint 3), owner decisions D7–D10 and blockers B2, B4, B5 in `decision-register.md`.

## 1. What must be persisted

| Aggregate | Purpose | Written by | Existing port |
|---|---|---|---|
| Item mapping (Gudang item ↔ TOKO item per branch, conversion, status, who/when) | Explicit, stable identity of the link; never name-based | Warehouse console (manage permission) | `MappingRepository` |
| Shipment + lines + receipts + resolutions (versioned) | Dispatch lifecycle, partial receipt, discrepancies, idempotent receiving | Warehouse console / branch receiving | `ShipmentRepository` |
| Stock outbox (one record per accepted receipt line) | Durable hand-off of quantities to the TOKO stock writer; the only thing that may ever change TOKO stock | Warehouse application (enqueue), stock writer (drain) | `StockOutbox` (new, checkpoint 9) |
| Idempotency / event keys | Duplicate request recovery | Inside the shipment aggregate (`eventKey`, `idempotencyKey`) | — |

Not persisted here: Gudang items and stock (read from Gudang), TOKO items and stock (the existing TOKO tables are changed only by the future stock writer through its own account), audit of console access (Console store), financial ledgers (none: accounting treatment D7 is open).

## 2. Ownership and schema location — options

| Option | Description | For | Against | Verdict (proposal) |
|---|---|---|---|---|
| **A. Dedicated Warehouse schema** on the same MariaDB server, e.g. `<account>_nxwh`, with its own least-privilege account | One owner for mappings, shipments and the outbox; no legacy table touched; same pattern as the Console store | Clear ownership; legacy PHP never sees it; independent grants and rollback; reversible by dropping a schema the owner controls | One more account ⇒ one more pool (budget, §4); needs operator-run DDL and trigger/grant review (cPanel cannot express column grants) | **Recommended** |
| B. Tables inside the TOKO business schema (`n1608204_smart_kopkar`) | New `wh_*` tables next to `db_*` | No new account | Mixes ownership with a schema legacy PHP can read and write; its backups, grants and `max_user_connections` are shared with every legacy writer; harder to roll back | Rejected |
| C. Tables inside the Console store | Reuse the existing pool | Zero budget impact | The Console store is the **identity + access-audit** store (append-only audit semantics, column-limited UPDATE, triggers). Stock-affecting documents need different guarantees (compare-and-set updates, unique keys, outbox claims) and a different owner; coupling them would force UPDATE rights onto the audit store. Owner direction: mappings are **not** to be placed there automatically | Rejected |
| D. Tables inside the Gudang database | Next to the data it describes | Locality | Schema unknown (B2); legacy Gudang PHP is an active writer; ownership of new tables would be ambiguous; a Gudang credential would be needed in the new app | Rejected until B2 and B4 are resolved |

## 3. Persistence constraints (what the schema must enforce, not just the application)

1. `warehouse_item_map`: unique on (`gudang_item_id`, `store_company_id`) and (`store_company_id`, `store_item_id`) **among non-retired rows**; status in (`PROPOSED`,`CONFIRMED`,`RETIRED`); conversion stored as explicit numerator/denominator with approver and evidence (never inferred); no foreign keys across databases (ids by value).
2. `warehouse_shipment`: unique (`source_ref`, `destination_store_company_id`); integer `version` for compare-and-set; fingerprint + idempotency key stored; lines in TOKO units after the single conversion; status in the domain's set.
3. `warehouse_receipt`: unique (`shipment`, `event_key`); accepted + rejected per line never exceeds the line's outstanding (also asserted by the domain; the DB check is a backstop).
4. `warehouse_stock_outbox`: **primary key `intent_key`** (`sourceRef|eventKey|lineNo`), immutable content, status in (`PENDING`,`APPLIED`,`DEAD`), attempts, last error; claims are not locks (apply is idempotent by key).
5. All statements parameterised; no `UPDATE` without the expected-version / expected-status predicate; no `DELETE` grant at all (append-oriented, like the Console store).

## 4. Connection budget implications

Recorded allocation (journal, Checkpoint 3): reader 3, auth 2, POS 2, register 1, returns 1, inventory 1, products 1, Console store 1 = **12 = `MAX_CONNECTION_BUDGET`**, leaving 8 of `max_user_connections = 20` for legacy PHP. A Warehouse store account therefore **cannot be added silently** (decision B5). Alternatives, none chosen:

| Alternative | Effect | Cost / risk |
|---|---|---|
| Raise the budget by 1 (13) | Simplest; stock writer later needs another account (14) | Fewer connections for legacy PHP (7); needs a measured production check of PHP peak usage |
| Retire an unused pool or merge two least-privilege pools of the same owner (e.g. inventory + products readers/writers) | Budget-neutral | Weakens least privilege; needs its own review |
| Warehouse store reuses the Console store **account** with grants on a second schema | Budget-neutral | One credential spanning identity/audit and stock documents: rejected on privilege grounds (Option C reasoning) |
| Run the Warehouse module read-only behind the existing reader until decisions land | No new pool | Exactly the current state; no writes possible |

Recommendation: keep Warehouse persistence **disabled** until B2/B4/B5 and D7–D10 are decided; then prefer "raise by 1 with a measured PHP-usage check", with `connection_limit=1` on the new pool and the deployment guard updated explicitly (the guard refuses to start otherwise).

## 5. Cross-database integration (no shared transaction)

Gudang, the Warehouse store and TOKO are separate databases. The design therefore uses a **transactional outbox inside the Warehouse store** and an idempotent applier on the TOKO side:

1. A receipt is saved with its shipment (single aggregate, compare-and-set) and the outbox records for its accepted lines are enqueued by stable key (`enqueueStockIntents`). A replay inserts nothing; a changed payload under the same key is an `IDEMPOTENCY_CONFLICT`.
2. A drain (`drainStockOutbox`) asks the stock writer to apply each record. The writer's contract is **idempotent by `intentKey`** (it must record the key in the same TOKO transaction that changes stock, using the POS lock order). A crash between apply and acknowledge is harmless: the retry answers `ALREADY_APPLIED`.
3. Failures never block other records; after the attempt limit a record is `DEAD` and surfaces for a human; there is no silent retry loop.
4. `UNSPECIFIED` accounting treatment (D7) makes enqueue refuse (`POLICY_REQUIRED`): no stock record exists without an explicit treatment.
5. A reconciliation view compares, per shipment line, expected, accepted, rejected, short-closed, outstanding and outbox status. Differences are shown, never auto-corrected.

Implemented and tested with synthetic in-memory stores only: `packages/application/src/warehouse/stock-outbox.ts`, `tests/warehouse-stock-outbox.test.mjs` (policy refusal, stable keys, replay no-op, conflict, exactly-once under concurrent drains, crash recovery, failure isolation, attempt limit, bounded deterministic order).

## 6. Migration strategy (when approved)

1. Owner approves Option A and the budget alternative (B5). 2. Engineering writes `docs/migration/sql/warehouse-store-production.sql` (schema, account, grants, triggers if cPanel needs them, verification and rollback) — **review-only, run by the operator**; a local synthetic rehearsal on the staging container comes first. 3. Expand-only: no legacy table is altered. 4. Feature flag off by default; startup/readiness reports the store separately (as the Console store does). 5. Rollback: unset the flag, keep data, drop the schema only by owner decision.

## 7. Required business decisions before any writer

D7 accounting treatment (valuation, ownership, documents), D8 who sets the receiving policy per shipment and the default, D9 approved unit ratios with evidence, D10 fractional quantities, plus B2 (Gudang schema), B4 (technical single-writer per context and branch), B5 (connections). Read-only development, domain/application code and synthetic tests continue meanwhile; **stock writes stay disabled**.

---

## 8. Local rehearsal evidence (checkpoint 10) — what is proven and what is not

Rehearsal store: database `kkisi_warehouse_rehearsal` + account `kkisi_wh_rehearsal` on the **local** staging container (MariaDB 11.4), created by `scripts/setup-warehouse-rehearsal.sh` from `db/warehouse/*.sql` (11 tables, 19+ triggers, no DELETE/DDL for the account, no right on any other schema, no Warehouse table in the Console store — verified by the script and by `tests/warehouse-rehearsal-isolation.test.mjs`). Adapter: `infrastructure/warehouse/warehouse-store.repository.ts`, constructed **only** by the opt-in test; it is not wired into the application, reads no DSN from the application environment and adds no pool.

| # | Assumption tested against real constraints | Evidence (`tests/warehouse-store-db.test.mjs`, opt-in, 6 tests PASS, repeated 3×) |
|---|---|---|
| 1 | Durable outbox persistence | records survive across clients and runs; read back with exact content; deterministic `(enqueued_at, intent_key)` order |
| 2 | Unique idempotency keys | `intent_key` is the primary key; a second insert is `1062`; re-enqueue of the same shipment inserts nothing |
| 3 | Atomic local state transitions | `PENDING→APPLIED` is a compare-and-set `UPDATE … WHERE status='PENDING'`; shipment save = one transaction (header CAS + append-only rows): a rejected save writes **nothing** |
| 4 | Retry after process failure | a failed apply leaves the record `PENDING` with `attempts+1`; the next drain retries |
| 5 | Crash after stock apply, before acknowledgement | the stock change committed, the record stayed `PENDING` (reconciliation says `APPLIED_NOT_ACKNOWLEDGED`); the retry gets `ALREADY_APPLIED`, acknowledges, **stock is not changed again** |
| 6 | Duplicate event delivery | applying one key twice: second answer `ALREADY_APPLIED`, balance unchanged; three concurrent deliveries: exactly one wins |
| 7 | Payload conflict under a reused key | the same key with other content is an `IDEMPOTENCY_CONFLICT`; stored content never overwritten (also: content columns are not updatable by the account, and a trigger forbids it independently of grants) |
| 8 | Concurrent consumers | two parallel drains over the same pending set post each intent exactly once (ledger primary key) |
| 9 | Failed events and dead letters | attempt limit → `DEAD` (not drained again); recovery only by `requeueDeadLetter`: reason required, audited in an append-only table, and the posting ledger is checked first (a key already posted is **marked**, never replayed) |
| 10 | Manual reconciliation | `outboxReconciliation` names every difference per intent (`CONSISTENT`, `PENDING`, `DEAD_NEEDS_ACTION`, `APPLIED_NOT_ACKNOWLEDGED`, `ACKNOWLEDGED_WITHOUT_LEDGER`, `LEDGER_WITHOUT_OUTBOX`); posted total equals the shipment's accepted total; closing a shipment does not change posted quantities |

Also proven: mapping uniqueness per branch among non-retired rows (both identities), retired pair re-proposable, ratio needs approver + evidence, concurrent proposals → one winner, version compare-and-set serialises concurrent receipts (both succeed through the bounded retry, no unit lost or doubled, history sequence gapless), same event key concurrently → one row, append-only tables, `UNSPECIFIED` treatment not representable. The same **contract suites** run against the in-memory doubles and the database adapters (`tests/contracts/stock-contracts.mjs`).

**A defect the rehearsal found:** `status = IF(attempts + 1 >= ?, …)` after `attempts = attempts + 1` in one `UPDATE` marks a record dead one attempt early, because MariaDB evaluates the `SET` list left to right with the already-incremented value. Pure unit tests with an in-memory fake could not have caught it. Fixed and covered.

**What is NOT proven (stays a gap, do not claim exactly-once from this):**
1. **The posting side is simulated.** `warehouse_sim_stock_ledger/_balance` live in the same database as the outbox. The real TOKO stock writer changes `db_items.stock` in the **TOKO** database under the POS lock order; its idempotency record must live in that database and commit in the same transaction as the stock change. That is specified in §9 but **not demonstrated**, and posting to real TOKO inventory is out of scope here.
2. No true process kill (`kill -9`) between the two commits was injected; the crash is simulated by an exception after commit. The database-level outcome (committed stock, unacknowledged record) is the same, but OS-level failures, connection loss and lock timeouts under POS load were not exercised.
3. cPanel production grants are database-level only; the triggers are the enforcement there, and trigger creation on the production host is unconfirmed (as for the Console store).
4. No performance or lock-contention measurement against production-like data.

## 9. Integration contract (Warehouse ⇄ TOKO) — ports, keys, ownership, recovery

| Operation | Owner / writer | Idempotency key | Contract (port) | On duplicate | On failure / recovery |
|---|---|---|---|---|---|
| Item mapping propose / confirm / retire | Warehouse store (console, `warehouse.mapping.manage`) | `ref` = `map:g<gudang>:c<branch>:s<store>`; unique per branch among non-retired rows | `MappingRepository` | `DUPLICATE_MAPPING` | compare-and-set on status; retire refused while an open shipment uses it |
| Dispatch registration | Warehouse store (Gudang side) | `(sourceRef, destination)` unique + `idempotencyKey` + content fingerprint | `ShipmentRepository.insert` | identical content = replay; different = `DUPLICATE_DOCUMENT` | whole document rejected, nothing partial |
| Dispatch lifecycle (submit/approve/dispatch/cancel) | Warehouse store | `version` compare-and-set | `ShipmentRepository.save` | stale writer gets `VERSION_CONFLICT`, bounded retry (3) | maker ≠ checker enforced in the domain |
| Receiving confirmation | Warehouse store, by a branch user | `eventKey` per shipment | `receiveShipment` | same payload = replay, other payload = `IDEMPOTENCY_CONFLICT` | quantities beyond outstanding refused; partial receipts allowed only where the policy says |
| Inventory posting intent | Warehouse store (`warehouse_stock_outbox`) | `intentKey = sourceRef|eventKey|lineNo` (primary key) | `StockOutbox.enqueue` | identical = `existing`; different = conflict | refused without an explicit accounting treatment (D7) |
| Stock posting + acknowledgement | **TOKO stock writer (future, own account)** | the same `intentKey`, recorded in the TOKO database **in the same transaction as the stock change** | `StockApplier.apply` → `APPLIED` / `ALREADY_APPLIED` | `ALREADY_APPLIED` and no stock change | unacknowledged after apply: next drain re-applies, gets `ALREADY_APPLIED`, acknowledges |
| Reconciliation | read-only, Warehouse store + TOKO ledger | per intent | `outboxReconciliation` (+ TOKO ledger read) | n/a | differences are listed, never auto-corrected |
| Dead-letter recovery | named operator, audited | per intent | `requeueDeadLetter` | `NOT_DEAD` | ledger checked first; reason mandatory |

TOKO stock ownership is untouched: the existing POS, return and stock-opname writers keep their accounts and logic. The future stock writer must (a) use the POS lock order, (b) own a unique-key idempotency table in the TOKO database, (c) write stock and key in one transaction, (d) refuse an unspecified treatment, (e) have its own least-privilege account (UPDATE on the stock column and INSERT on the idempotency table only). None of this is enabled.

## 10. Capacity proposal (explicit — the current budget has no spare capacity)

Today: reader 3, auth 2, POS 2, register 1, returns 1, inventory 1, products 1, console 1 = **12 / 12**; `max_user_connections = 20` leaves 8 for legacy PHP. A real Warehouse needs **two new accounts** (different databases, different owners): the Warehouse store (documents, mappings, outbox) and the TOKO stock-apply writer (idempotency table + stock). Minimum footprint: `connection_limit = 1` each ⇒ **+2 (14)**. The drain can run in the same Next.js process as the writer pools; a separate worker would add processes, not accounts.

| Option | Budget | Effect on legacy PHP | Risk / cost | Status |
|---|---|---|---|---|
| A. Raise the ceiling to 14 | +2 | 20 − 14 = 6 left (from 8) | needs a measured PHP peak; startup guard must be changed deliberately | **needs owner decision B5 + measurement** |
| B. Merge two least-privilege pools of the same owner (e.g. inventory + products) to free 1 | 0 / +1 | unchanged / 7 left | weakens least privilege; own review | not proposed by default |
| C. Time-share: run the stock-apply writer as a short-lived job that opens its connection only while draining | +1 persistent (Warehouse store) | peak briefly +1 | scheduling complexity, still needs the account | possible refinement of A |
| D. Keep Warehouse read-only (preview, synthetic) | 0 | none | no operational Warehouse | **current state** |

Recommendation (proposal): measure PHP's peak connections for two weeks, then take **A** with both new pools at `connection_limit = 1`. Until the owner decides, nothing is added. The rehearsal account's limit of 4 exists only to test concurrency locally and is asserted rehearsal-only by a test.
