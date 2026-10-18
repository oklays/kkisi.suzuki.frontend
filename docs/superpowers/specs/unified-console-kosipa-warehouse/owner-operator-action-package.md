# Owner / operator action package (checkpoint 12)

The eligible internal engineering work is done. **Every remaining major task now waits on authoritative evidence, an owner policy, a capacity decision or real role data.** Engineering will not generate more synthetic-only features in the meantime. This page lists the minimum inputs that unblock the next phase, in the order that unlocks the most.

## 1. Operator actions (read-only, on production or authorised staging)

| # | Action | Tool (in the repository) | Output to return | Unlocks |
|---|---|---|---|---|
| O1 | Export schema evidence with SHOW VIEW and SHOW CREATE ROUTINE | `docs/migration/sql/schema-evidence-bundle-json.sql`, then `validate-schema-evidence.mjs --scan` | the **readiness report** (safe), keeping the bundle itself restricted | KOSIPA gates to level 3: analysis of the savings, loan and payroll definitions; D5 evidence readable from the generator |
| O2 | Export the Gudang schema and fill the role → column mapping with the process owner | same SQL on the Gudang schema; `gudang-mapping.template.json`; `--gudang-bundle --gudang-mapping` | Gudang readiness report | Gudang item/stock/dispatch readers (read-only) |
| O3 | Export the real role configuration with a private salt | `docs/migration/sql/role-config-export-readonly.sql` → `validate-role-config.mjs` | role readiness report (counts and role/group ids only) | staging walk-through accounts; R1 confirmation on production |
| O4 | Confirm with the hosting provider how `max_user_connections` is counted (per database user vs per hosting account); sample legacy PHP peak connections for two weeks | `SHOW STATUS LIKE 'Max_used_connections'`, processlist sampling | two numbers and the provider's answer | B5/B8 capacity decision |
| O5 | After O1: restore the definitions in an isolated sanitized database; run ≥ 5 reviewed cases per object; later a parity run on ≥ 30 records | `kosipa-evidence-gate-report.md` §4 (semantic file format) | semantic and parity evidence files (no personal data; refused otherwise) | levels 4–5: candidate, then official balances and parity |
| O6 | Review, do not run yet: the idempotency table DDL and the writer grants | `docs/migration/sql/toko-stock-posting-idempotency-proposed.sql` | review comments; whether cPanel allows the column-level `UPDATE(stock)` grant and the triggers | T1 |
| O7 | Confirm whether shared hosting allows trigger creation in the console store | `docs/migration/sql/console-store-production.sql` STEP 1 | yes/no | B6 (console store in production) |

## 2. Owner decisions (none has a default; engineering does not assume one)

| # | Decision | Why it blocks |
|---|---|---|
| D7 | Gudang → TOKO movement: internal transfer or commercial purchase | It chooses the **ledger** the TOKO writer must use (`db_stockentry` vs purchase tables): legacy recomputes stock from the ledgers, so this cannot be left open |
| D5 | TOKO company ↔ payroll `TOKO_*` column | Official store-credit comparison |
| R1 | Real cashier role permissions and console landing | Console enablement for cashiers |
| B9 | Order in which writers are activated (POS, register, inventory, products, returns, Warehouse) | It *is* the capacity plan; the guard counts only enabled writers |
| B4 | Technical single-writer mechanism per branch | Any write cutover; simultaneous old+new writers stay unauthorised |
| W5 / W1 | Warehouse Operator / Supervisor roles and scopes | Any Warehouse feature beyond the synthetic preview |
| D1–D4, D6, D8–D10 | Salary deduction, withdrawable savings, expired contracts, short-payment allocation, loan rules, receiving authority, unit conversion, quantity precision | The corresponding KOSIPA and Warehouse write features |
| Scale-out | Whether more than one application process will ever run | Requires the shared export limiter (X1) and a capacity decision |

## 3. Minimum evidence for the next phase

1. **O1 + O3**: enough to start KOSIPA level-3 analysis and to choose real staging walk-through accounts.
2. **D7 + O6**: enough to design the real TOKO stock writer against the validated contract.
3. **O4 + B9**: enough to decide whether the Warehouse +2 connections fit without any capacity change.

## 4. Next truly executable engineering tasks once inputs arrive

| Input | Engineering task |
|---|---|
| O1 report at level 3 | Read the definitions, write candidate implementations behind tests, and prepare the semantic case lists with the operator (nothing displayed as official) |
| O2 report | Gudang readers behind the existing ports, still read-only, still behind the preview flag |
| O3 report | Run the staging walk-through (`staging-rbac-uat-matrix.md` §5) with the chosen accounts |
| D7 + O6 | Real TOKO writer implementing `toko-stock-writer-contract.md`, first against a schema-equivalent authorised staging copy |
| Scale-out decision | Build the shared count-after-insert export limiter |

Engineering-only items that need no input are small: an outbox permanent-error class (a conflict parks the record as DEAD immediately), and extending the persona fixtures once W5 is answered.

## 5. Checkpoint 13: final list of tasks blocked by external decisions or evidence

| Task / capability | Blocked by | Type |
|---|---|---|
| Release of the login credential-exposure fix; historical exposure check and rotation | S1 release authorisation; operator checklist | Owner + Operator |
| Console for cashiers (landing policy activation) | R1 approval + O3 role ids | Owner + Operator |
| KOSIPA savings official balance (TASK-025/044) | O1 → O5 (level 5) | Operator |
| KOSIPA loan outstanding and simulation (TASK-026/043) | O1 → O5; D6 | Operator + Owner |
| Payroll generator and component parity (TASK-027/045) | O1 (procedure body), O5 | Operator |
| Payroll ↔ TOKO Kredit official comparison | D5 (+ O1 level 3) | Owner |
| Loan origination, withdrawals, payroll settlement, status changes | D1, D2, D4, D3 (+ maker-checker roles) | Owner |
| Real Gudang reader, mapping persistence on real items | Gudang schema bundle + mapping; D9/D10 | Operator + Owner |
| Dispatch/receiving beyond preview | W1/W5 roles, D8 | Owner |
| TOKO stock posting (applier activation) | **D7** (ledger), O6 (DDL/grants review), B4, B5/B8/B9 | Owner + Operator |
| Any production writer cutover | B4, B9, O4, backups, owner go (`cutover-plan.md`) | Owner + Operator |
| Console store in production | O7 / B6 | Operator |
| Staging acceptance of every scenario | `staging-acceptance-matrix.md` "Missing" column | Owner + Operator |

## 6. Checkpoint 15 status of the blocker list (nothing new was delivered; the intake is now executable)

Still **missing**: O1, O3, O4, Gudang bundle + mapping, O5, O6, O7, credential-exposure counts. Still **open decisions**: R1, D5, D7, B9, B4, D1–D4, D6, D8–D10, W1/W5.

What changed: every evidence item now has a same-day validation command and accept/reject criteria in `evidence-intake-runbook.md`; the O4 capacity answer has its own validator (`validate-capacity-evidence.mjs`); the hotfix is **review-ready** (`login-hotfix-release-plan.md`, with a controlled master-vs-hotfix comparison) but needs your release authorisation; R1 has DEV LOCAL trial evidence (`scripts/dev-local.sh r1-trial`) and stays inactive; the owner's manual UAT (`owner-uat-checklist.md`) is the next gate before `representative-staging-plan.md`.
