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
