# Operator evidence acceptance report (checkpoint 13)

**Result: no operator evidence has been received** (checked 18 Oct 2026: `docs/migration/_baseline/` holds only the 1 Oct POS artefacts; no schema bundle, role export, Gudang bundle, semantic/parity file or capacity statement). Nothing was unlocked. No schema, number or permission was guessed or substituted.

| Evidence | Status | Exact operator action | Intake / validation (ready) | Unlocks when accepted |
|---|---|---|---|---|
| **O1** KOSIPA authoritative schema: savings views (`v_kartu_simpanan`, `v_saldo_awal`), loan views (`v_trans_pinjaman_flat/_anuitas/_simulasi`), payroll views (`v_trans_potongan_bulanan`, `v_matrix_toko`, `v_matrix_toko_dtl`), `x_proc_create_matrix`, dependencies, status/type semantics | **Missing** | Run `docs/migration/sql/schema-evidence-bundle-json.sql` on production with SHOW VIEW + SHOW CREATE ROUTINE; screen with `--scan`; return the report (keep the bundle restricted) | `validate-schema-evidence.mjs` (levels 1–5; refuses personal data) | Level 3: analysis only. Official amounts need level 5 (O5) |
| **O5** Sanitized semantic cases and parity runs | **Missing** (depends on O1) | `kosipa-evidence-gate-report.md` §4: ≥ 5 reviewed cases per object in an isolated sanitized DB, then parity on ≥ 30 records with zero unexplained differences, signed off by the data owner | `--semantic` intake bound to the definition fingerprint | Levels 4–5 |
| **O3** Real role configuration | **Missing** for production (30 Sep copy evaluated) | Run `docs/migration/sql/role-config-export-readonly.sql` with a private salt | `validate-role-config.mjs` (runtime rules, pseudonyms only) | Staging walk-through accounts; R1 role ids; differences real vs personas (below) |
| **O4** Connection limits: server and per-account limits, concurrent legacy use, expected peak, process count, reserve, cutover requirements | **Missing** | Hosting statement on how `max_user_connections` applies; `SHOW VARIABLES LIKE '%connections%'`; two weeks of `Max_used_connections` and processlist sampling per account; confirmation that exactly one `genesis-web` process runs | `connection-capacity-analysis.md` §7 method; `capacity-plan.ts` scenarios | B5/B8 decision; Warehouse +2 |
| **Gudang** schema: product identifiers, inventory tables, source stock ledger, distribution/sales documents, movement semantics, quantity/unit representation, store/customer relations, constraints and indexes | **Missing** | Same bundle SQL on the Gudang schema + `gudang-schema-evidence-readonly.sql` prose answers; fill `gudang-mapping.template.json` with the process owner | `validate-schema-evidence.mjs --gudang-bundle --gudang-mapping` | Real Gudang read adapter (read-only, behind the preview flag) |
| **O6** Review of the idempotency DDL and writer grants | **Missing** | Review `toko-stock-posting-idempotency-proposed.sql`; confirm cPanel can express `UPDATE(stock)` and allows triggers | — | T1 on authorised staging |
| **O7** Trigger creation in the console store | **Missing** | `console-store-production.sql` STEP 1 | — | B6 |
| **Credential exposure check** | **Missing** | `docs/migration/operator-credential-exposure-checklist.md` (counts only) | — | Containment and rotation decisions |

## Real roles vs personas (from the 30 Sep copy; production pending O3)

| Topic | Synthetic persona expectation | Real configuration (copy) | Consequence |
|---|---|---|---|
| TOKO Cashier | lands on `/pos`, checkout only | the cashier role holds management slugs → lands on `/console` | R1; the policy is implemented but inactive |
| Console Administrator | users_edit + chooser | roles 1, 2 | matches |
| KOSIPA Administrator / Staff | all views / subset | 5 groups with all views; **no** subset group | staff persona untestable with real data |
| Read-only Auditor | view only | none | synthetic only |
| Warehouse Operator / Supervisor | — | **no permission exists** | W5; nothing was created to make tests pass |
| Console navigation | per persona matrix | 49 legacy KOSIPA controller URLs grant nothing in the console | expected (read-only scope) |
