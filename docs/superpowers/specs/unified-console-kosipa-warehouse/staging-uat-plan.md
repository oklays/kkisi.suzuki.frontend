# Integrated staging UAT — preparation (checkpoint 11)

Status: **prepared, not executed against staging.** Everything marked *synthetic* runs today on the local container (`scripts/uat-run.sh`, seven phases, all passing at the time of writing); everything marked *needs staging* requires an environment, data or evidence that does not exist yet. **No row here is an operational acceptance**; simulated integration is not marked accepted anywhere.

## 1. Feature-flag state (preserved; all default off)

| Flag | Default | UAT setting | Effect |
|---|---|---|---|
| `CONSOLE_ENABLED` | off | on, then off (TOKO must be identical) | unified shell; off → pre-console behaviour |
| `KOSIPA_READ_ENABLED` | off | on; reader outage; store-down | read-only KOSIPA pages/APIs |
| `KOSIPA_EXPORT_ENABLED` + `KOSIPA_EXPORT_USER_IDS` | off / empty | on for one allow-listed user, then off | E1 allow-list export (no policy store) |
| `KOSIPA_STORE_COLUMN_MAP` | unset | unset (D5 open) | payroll `TOKO_*` ↔ branch mapping stays unavailable |
| `WAREHOUSE_PREVIEW_ENABLED` | off | on, then off | synthetic read-only Warehouse screens |
| Warehouse persistence / stock apply | **not wired in the application** | n/a | the outbox and TOKO apply exist only in tests and the rehearsal stores |
| `POS_WRITES_ENABLED` etc. | 0 | per existing TOKO UAT | simultaneous old+new financial/inventory writes remain **not authorised** |

## 2. Scenarios

| # | Scenario | Synthetic evidence (local, automated) | Needs staging | Pass criteria |
|---|---|---|---|---|
| 1 | Login and landing | `console-persona-matrix.test.mjs`; UAT phase 1 | operator accounts per persona | landing and sidebar equal `staging-rbac-uat-matrix.md` |
| 2 | Anggota 360 | UAT-1…7 (`console-uat-browser.mjs`) | anonymised member copy | sections independent; restricted/unavailable states explicit; nothing invented |
| 3 | Savings | UAT savings steps; `console-savings-browser.mjs` | anonymised ledger | recorded sums only; `OFFICIAL_BALANCE_UNVERIFIED` shown; **no official balance until TASK-003 G2** |
| 4 | Loans | UAT loan steps; `console-loans-browser.mjs` | anonymised loans | schedule shown as recorded; outstanding withheld until G3 |
| 5 | Payroll | UAT payroll steps; `console-payroll-browser.mjs` | anonymised batch | recorded components; generator parity withheld until G4/G5 |
| 6 | Payroll ↔ TOKO comparison | `payroll-reconciliation` tests; UAT | D5 mapping + return-adjusted source (TASK-003 G5) | review-only, never a decision; mapping flag stays unset until D5 |
| 7 | Report export | UAT phase 5 (`console-export-browser.mjs` EXP-1…A, EXP-2b); `scripts/uat-export-instances.sh` | allow-listed staging user | exact decimals, injection-safe, audited, 429 on the 7th; one instance only |
| 8 | Warehouse item mapping | UAT phase 6 (WH-2) on **synthetic** data | Gudang schema evidence (G-Gudang) and a reviewed mapping file | mapping statuses explicit, no name matching |
| 9 | Dispatch and partial receiving | WH-3/WH-4; `warehouse-use-cases.test.mjs`; stock contracts | Gudang dispatch reader + owner receiving policy | received ≤ dispatched, discrepancies explicit, no stock effect in the preview |
| 10 | Cross-database outbox | `cross-db-outbox.test.mjs` (UAT phase 7): two stores, durable intent, atomic target posting, duplicate, conflict | real TOKO writer account (B5) + D7 decision + stock-posting design | **never exactly-once claimed beyond the target-side invariant**; production posting stays disabled |
| 11 | Retry and crash recovery | same file: proxy faults (mid-transaction, before commit, reply lost, unreachable), SIGKILL mid-transaction and after commit, three concurrent processes, seeded chaos | repeat on staging infrastructure (real network, real restart) | every run converges to stock = Σ distinct postings; reconciliation reports no critical row |
| 12 | Cross-branch denial | persona matrix (branch switch, link isolation); TOKO suites; WH-5 | staging accounts on two branches | a branch-bound user can neither see nor switch to another branch |
| 13 | TOKO regression | UAT phases 1 and 4 (`pos-browser`, `e2e-local`) with flags on and off | staging TOKO smoke by the owner | identical behaviour with and without the console |
| 14 | Dependency outage | UAT phase 2 (KOSIPA reader down) and 3 (console store down); harness: Warehouse or TOKO store unreachable | staging outage drill | KOSIPA fails closed per section, TOKO keeps working, outbox records retry |

## 3. How to run the synthetic evidence

```
pnpm lint && pnpm typecheck && pnpm test && pnpm build
bash apps/web/scripts/setup-warehouse-rehearsal.sh --apply     # once, local container only
bash apps/web/scripts/setup-toko-posting-test.sh --apply       # once, local container only
bash apps/web/scripts/e2e-setup.sh --apply                     # once, synthetic schema
PLAYWRIGHT_MODULE=<path to playwright> bash apps/web/scripts/uat-run.sh
bash apps/web/scripts/uat-export-instances.sh                  # optional two-instance limiter probe
```

`apps/web/scripts/sample-db-connections.sh` can be run in the background to record per-account connection peaks. Stop the local container when finished. Nothing in this list touches legacy PHP, a production database or production infrastructure.

## 4. What staging UAT will not be allowed to claim

* Official savings/loan balances or payroll generator parity (blocked on TASK-003 evidence, gates G2–G5).
* Warehouse operational use, stock posting or accounting (blocked on D7, Gudang schema evidence, B5 and the TOKO stock-posting design).
* Scale-out (blocked on B5 and a shared export limiter).
* Production readiness of anything (`operational-readiness.md`).
