# Connection capacity and single-writer cutover plan (checkpoint 13) — PLAN ONLY

**Not authorised for execution.** Any disabling of a legacy writer, routing change or production pool change needs a separate written authorisation. Nothing here was executed.

## 1. Starting point (measured or code-enforced)

* One application process (`single-instance-deployment.test.mjs`); one client per pool per process (checkpoint 12 fix, `db-client-lifecycle.test.mjs`).
* Pools: reader 3, auth 2, console 1; writers POS 2, register 1, inventory 1, products 1, returns 1, all **disabled**. The guard counts enabled DSNs only; ceiling 12.
* Proposed (not provisioned): Warehouse store 1, TOKO stock applier 1.
* Unknown (O4): how the hosting counts `max_user_connections`, the legacy PHP peak, and reserve.

## 2. Preconditions for every step

1. O4 evidence recorded, and `capacity-plan.ts` scenario for the step within budget **with reserve** (the step is refused if the legacy PHP peak + the step's total exceeds the hosting limit minus a reserve the owner sets).
2. B4 mechanism proven for the module and branch: the legacy write path is made unable to write (operator action on legacy configuration, separately authorised) and a probe shows it refuses.
3. Backup: a verified full logical backup of the affected schema taken immediately before, with a restore rehearsal on staging in the last 30 days.
4. Owner's written go for the step, naming branch(es) and window; users informed; active sessions drained (sessions are short-lived; the step is done outside opening hours).
5. Rollback rehearsed on staging: flag off → new writer stops; re-enable the legacy path; documents written by the new writer stay readable by legacy (same tables) or are reconciled.

## 3. Proposed sequence (B9 is the owner's; this is engineering's proposal)

| Step | Writer(s) enabled | Legacy path disabled for the branch | Pools on the server after the step | Specific gates |
|---|---|---|---|---|
| 0 | none (read-only console, KOSIPA reads, exports) | none | reader 3 + auth 2 + console 1 = 6 | B6 console store; R1 before cashiers see the console |
| 1 | POS checkout + register (one pilot branch) | TOKO PHP POS for that branch | +3 = 9 | POS UAT, Kredit/QRIS, returns interplay; legacy recompute unaffected (same ledgers) |
| 2 | POS + register (all branches) | TOKO PHP POS everywhere | 9 | step 1 stable for an agreed period |
| 3 | Sales returns | PHP returns | +1 = 10 | sales-return design decisions (memory: 7-day Cash/QRIS, same-month Kredit fallback, payroll gate) |
| 4 | Inventory (stock opname), products | PHP inventory/products | +2 = 12 | at the ceiling: **no further pool without B5/B8** |
| 5 | Warehouse store + TOKO stock applier | Gudang → TOKO manual purchase entry for the branch | +2 = 14 → **exceeds 12** | needs B5/B8 (or option C: Warehouse store elsewhere = 13, still needs one more freed), D7, O6, T1 on authorised staging |
| 6 | KOSIPA financial writers | KOSIPA PHP writers per module | each +1 | D1–D4, D6, level-5 parity, maker-checker; separate plan |

KOSIPA and Gudang legacy writers keep writing until their own steps. They never write the same tables as a new writer for the same branch at the same time.

## 4. Rollback per step

Turn the module flag off (the guard then stops counting the pool), re-enable the legacy path, run the module's reconciliation (sales: ledger vs `db_items.stock` recompute; Warehouse: outbox ↔ posting report), and restore from backup only if reconciliation shows unexplained differences.

## 5. What is needed to start step 0 in production

B6 (console store with triggers), R1 (if cashiers use the console), the login fix released (credential-exposure closeout), and the owner's go. Steps 1+ additionally need O4, B9, B4 and backups.
