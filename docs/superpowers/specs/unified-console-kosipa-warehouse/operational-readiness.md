# Operational Readiness Package — toward STAGING ACCEPTANCE (not production)

Status at checkpoint 10 (17 Oct 2026): everything below marked VERIFIED is verified **locally on synthetic fixtures** (and read-only smoke on the local copy of the 30 Sep data). **No item is staging-accepted or production-ready.** Deploying the new console does **not** remove any legacy exposure: the legacy KOSIPA, TOKO and Gudang applications stay reachable and unchanged (owner decision), and their known weaknesses (documented in the private, untracked register; not repeated here) remain open until those surfaces are independently retired or protected.

## 1. Implementation matrix

| Module | Task / REQ | Routes (page → API) | Data source | Read/write | Capability / grant | Flag(s) | Status |
|---|---|---|---|---|---|---|---|
| Console shell, navigation, landing | TASK-010…014 | `/console` | session + `db_permissions` | read | session | `CONSOLE_ENABLED` | VERIFIED |
| Identity links | TASK-020/022 | `/console/settings/identitas` → `/api/console/identity-links` | Console store | write (links, append-only audit) | `iam.link.manage` (`users_edit`, role ≤ 2) | `CONSOLE_ENABLED` + console store | VERIFIED |
| Anggota 360 | TASK-021/024 | `/console/kosipa/anggota[/id]` | KOSIPA tables (reader) | read | `kosipa.member.view` (+ per-tab grants) | `KOSIPA_READ_ENABLED` | VERIFIED |
| Savings ledger | TASK-025 (read) | `/console/kosipa/simpanan[/id]` → `/api/kosipa/savings/{id}` | `trans_simpanan*` | read | `kosipa.savings.view` + `member.view` | `KOSIPA_READ_ENABLED` | VERIFIED; no balance (B1) |
| Loans | TASK-026 (read) | `/console/kosipa/pinjaman[/doc]` → `/api/kosipa/loans` | `trans_pinjaman*` | read | `kosipa.loan.view` | `KOSIPA_READ_ENABLED` | VERIFIED; no outstanding (B1) |
| Payroll + reconciliation | TASK-027 | `/console/kosipa/payroll/**` → `/api/kosipa/payroll/**` | `trans_potongan_*`, `db_sales`, `db_salesreturn` | read | `kosipa.payroll.view` (+ `store-credit.view` for reconciliation) | `KOSIPA_READ_ENABLED`, `KOSIPA_STORE_COLUMN_MAP` (D5) | VERIFIED; review-only |
| Reports + data quality | TASK-028 (subset) | `/console/kosipa/laporan/**` → `/api/kosipa/reports/**` | same tables, no joins | read | per-report view grant | `KOSIPA_READ_ENABLED` | VERIFIED |
| CSV export | TASK-028 (subset) | `…/export` on loans, payroll, membership, savings-movements, data-quality | same | read | `kosipa.report.export` **and** the view grant | `KOSIPA_EXPORT_ENABLED`, `KOSIPA_EXPORT_USER_IDS` | VERIFIED |
| Warehouse preview | TASK-062/063 (UI) | `/console/warehouse/**` | **synthetic, in memory** | read | `warehouse.preview.view` (= flag + `toko.inventory.warehouse`) | `WAREHOUSE_PREVIEW_ENABLED` | VERIFIED (synthetic only) |
| Warehouse persistence | TASK-062/063 | none | `kkisi_warehouse_rehearsal` (local only) | rehearsal | none | none (not wired) | REHEARSED locally; gaps in the architecture §8 |
| TOKO (POS, sales, returns, products, inventory) | existing | unchanged | TOKO tables | read/write | existing slugs | existing flags | VERIFIED (regression suites with console flags on and off) |
| Financial / stock **writers** (loans, savings, payroll processing, SHU, stock posting) | TASK-040…046 | none | — | — | — | — | **NOT BUILT; disabled by design** |

## 2. Outstanding business decisions and evidence dependencies
See `decision-register.md`: D1–D10 (owner), E1–E3 (export), B1–B6 (evidence/operator/capacity). Unblocking map: **B1 + D5/D6** → official balances, payroll generator parity, loan/savings parity; **B2 + D7/D8/D9** → Gudang reader, stock writer; **B4 + B5** → any write cutover.

## 3. Database ownership matrix

| Database | Owner / writer today | New console access | Notes |
|---|---|---|---|
| `smart_kopkar` (business: TOKO + KOSIPA tables) | legacy PHP apps + existing Next.js TOKO writers | SELECT-only reader (3 connections, shared with POS reads) | no new writer; KOSIPA tables are never written by the console |
| Auth store | Next.js auth | own 2 connections | unchanged |
| Console store (`kkisi_console`) | Next.js console | 1 connection | identity links + access audit only; no Warehouse, no policy table |
| Warehouse store (proposed, A in the architecture) | none yet | — | rehearsed locally only |
| `smart_kopkar_gudang` | legacy Gudang PHP | **none** | schema not obtained (B2); never read by this application |
| TOKO stock (`db_items.stock`) | POS / return / inventory writers | **unchanged** | the future stock writer needs its own reviewed account |

## 4. Connection budget and capacity risk
12 / 12 (reader 3, auth 2, POS 2, register 1, returns 1, inventory 1, products 1, console 1); 8 of `max_user_connections = 20` remain for legacy PHP. Every report, export and preview in this package reuses the existing reader or no database. A real Warehouse needs +2 (see architecture §10, decision B5); **nothing may be added silently** (the startup guard refuses a larger budget).

## 5. Module feature flags (all default OFF; independent rollback)
`CONSOLE_ENABLED` (shell) → `KOSIPA_READ_ENABLED` (needs a usable console store) → `KOSIPA_EXPORT_ENABLED` + `KOSIPA_EXPORT_USER_IDS` (allow-list; any malformed id empties it) → `KOSIPA_STORE_COLUMN_MAP` (only with an owner-confirmed map) → `WAREHOUSE_PREVIEW_ENABLED` (synthetic data only). Activation order = that order; rollback = reverse order, no data change (links and audit rows are kept).

## 6. Role / permission UAT matrix (synthetic roles verified; real roles need approved staging)

| Persona | Console | Anggota/360 | Savings | Loans | Payroll | Reports | Export | Warehouse preview | TOKO |
|---|---|---|---|---|---|---|---|---|---|
| Cashier (role 4, unlinked) | landing `/pos` | no | no | no | no | no | no | no | POS |
| Cashier linked to member-only KOSIPA account | yes | yes | no | no | no | membership summary only | no | no | POS |
| KOSIPA staff, full grants, not on the export list | yes | yes | yes | yes | yes | all | **no** | no | per slugs |
| KOSIPA staff on the export list | yes | yes | yes | yes | yes | all | yes (aggregate CSV only) | no | per slugs |
| Branch manager (role 3, inventory_view, no chooser) | yes | per link | per link | per link | per link | per link | no | **no** (needs the branch chooser) | per slugs |
| Administrator / Koperasi admin (role ≤ 2) | yes | per link | per link | per link | per link | per link | per list | **yes if the flag is on** | per slugs |
| Anonymous | login | — | — | — | — | — | — | — | — |

Every cell marked "no" is asserted server-side by a browser test (page and API), not only by hiding the menu.

## 7. Financial reconciliation checklist (for staging acceptance by the data owner)
1. Pick 20 members per loan type and compare the recorded schedule sums on the loan page with the legacy loan card; differences < Rp 1 are the known imported-schedule rounding, anything else is logged.
2. For three periods compare each report's recorded payroll totals with the legacy matrix output; confirm header/detail findings are the same rows the owner already knows.
3. Compare per-type savings movement sums with the legacy ledger for 20 members; confirm **no balance is expected** from the console.
4. For one period review the store comparison with the process owner: confirm the company ↔ `TOKO_*` map (D5) or record the correction; treat A−B as informational.
5. Review the data-quality page against the 30 Sep findings: counts may differ in production; investigate any category that is new.
6. Export each report, open in a spreadsheet: no formula executes, decimals match the screen, no member data present.
7. Sign-off sheet records tester, date, data snapshot, differences and decisions.

## 8. Warehouse dispatch / receiving UAT scenarios (once B2/D7–D10 allow a real source)
Full receipt; partial receipt keeps the outstanding units; receipt with damaged units unresolved; short-close with a reason; duplicate receipt event replay; conflicting payload under one event key; cross-branch isolation (a branch cannot see another's documents); unmapped / unconfirmed / inactive / inexactly convertible line rejects the whole document; concurrent receipts; outbox drain with a crash between apply and acknowledgement; dead-letter recovery with the ledger check. The local rehearsal already runs the database-level versions of the last four; the rest run on synthetic data.

## 9. Technical single-writer requirements (B4)
For each bounded context and branch a **technical** mechanism must make a second writer impossible (database grant, trigger, or routing), not a staff instruction. Until proven: no console financial or stock writer is enabled; legacy PHP remains the only writer for KOSIPA tables and for Gudang.

## 10. Production rollout prerequisites (all must hold)
Business decisions D1–D10 relevant to the module; schema evidence (B1/B2) reviewed and redacted; console store provisioned by the operator with trigger creation confirmed (B6); budget decision (B5) and startup guard updated deliberately; module acceptance by authorised users on representative staging data; parity demonstrated where a parity requirement exists; export allow-list approved by the owner (E1) and audit-review owner named (E2); rollback rehearsed; separate, explicit deployment approval.

## 11. Rollback procedure
Unset the module flag (reverse activation order); restart. KOSIPA/Warehouse/Export pages and APIs return 404, navigation entries disappear, TOKO is untouched. Console data is kept unless the owner decides otherwise. For a database rollback see `docs/migration/sql/console-store-production.sql` (Console store) and architecture §6 (Warehouse store, not provisioned).

## 12. Known limitations to state at acceptance
Official balances absent (B1); reconciliation review-only (D5); synthetic Warehouse; CSV only (no XLSX); per-process export rate limit; export allow-list is a deployment setting; production index state unverified (B3; index DDL not executed); real role configurations untested; legacy security exposure unchanged.
