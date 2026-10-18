# Representative staging — design (checkpoint 15) — PLAN ONLY

**DEV LOCAL is not representative staging.** Its data is synthetic, its schema is the local 30 Sep structure, its roles are test-only and its connection limits are local. Nothing in this plan has been built or executed.

## 1. Entry criteria (all must hold before building anything)

| # | Criterion | Evidence |
|---|---|---|
| 1 | Owner completed manual DEV LOCAL UAT; defects triaged | `uat-findings-register.md` with real owner results |
| 2 | Login hotfix released (or explicitly accepted as pending) | release record |
| 3 | O1 accepted at level ≥ 3 for the objects under test | validator report |
| 4 | O3 accepted (production role export) | role report |
| 5 | O4 accepted for the intended pool set | capacity verdict `FITS` |
| 6 | Authorisation for sanitised data (who sanitises, how, retention) | owner/operator record |
| 7 | Gudang schema bundle + mapping accepted (only if Warehouse is in scope) | validator report |

## 2. Environment design

| Aspect | Design |
|---|---|
| Isolation | Separate host or container network from production and from DEV LOCAL; its own MariaDB instance; **no network route to the production database or tunnel**; credentials are staging-only and unusable elsewhere; the deployment guard keeps refusing production-like DSNs (`APP_ENV` stays non-production) |
| Schemas | `legacy` (TOKO + KOSIPA + their views/procedures) restored from the **authorised operator export** of definitions with **sanitised rows**; auth store and console store exactly as in production design (own databases, own accounts, triggers present: O7); Warehouse store as rehearsed; Gudang schema only if O1-Gudang is accepted. Views/procedures are installed **from the operator's definitions**, never recreated by engineering |
| Data | Sanitised copy under an approved procedure: NIK, names, contact and bank fields replaced by deterministic pseudonyms; **money and dates untouched** so precision and calendar edge cases (zero dates, 9999 dates, sub-sen noise) are real; referential and duplicate patterns preserved; sampling plan agreed with the data owner |
| Roles and branches | The real role/group configuration from O3 loaded as-is (pseudonymous users); no invented permissions; Warehouse Operator/Supervisor stay unmapped until W5 |
| Versions | Same MariaDB major/minor and `sql_mode` as production (from the O1 bundle server section), same Node/Next.js image |
| Connections | Production-sized pools; limits configured like production (per O4 interpretation); measured with `scripts/measure-app-connections.sh`-style sampling under realistic concurrency; single application process |
| Writers | Disabled by default. Each writer (POS, register, returns, products, inventory, later Warehouse/KOSIPA) is enabled **one at a time** against staging data only, behind its flag, with the single-writer mechanism (B4) simulated by disabling the corresponding legacy path **in staging only** |
| Reset and rollback | Repeatable: restore from the sanitised backup (scripted), re-run migrations/DDL proposals, re-seed identity links through the app. Every writer step has a recorded rollback (flag off + reconciliation) and is rehearsed before use |

## 3. Test programme

1. **Parity:** for each financial object with level ≥ 3, run candidate implementations beside the legacy definitions on the sampled records; zero unexplained differences is the acceptance for level 5 (operator + data owner sign-off).
2. **Roles:** log in as pseudonymous accounts of every real role/group; compare landing, menu and API access with `validate-role-config.mjs` output; confirm R1 per the owner's decision.
3. **Precision:** exact decimals through reports and exports; compare totals with legacy reports to the sen.
4. **Performance and capacity:** representative concurrency, read-report latency through the real network path, `max_statement_time` behaviour, pool saturation, one process; compare with the O4 verdict.
5. **Transactions:** POS, returns and stock paths under concurrency; the stock-writer contract (idempotency, lost acknowledgement, concurrent POS) on the real schema; recompute compatibility with legacy PHP running against the same staging copy.
6. **Failure isolation:** console store down, KOSIPA reader down, tunnel flap: KOSIPA fails closed, TOKO continues.
7. **Security:** login closeout suite, audit-before-read on every KOSIPA read, export allow-list, credential/log scan.

## 4. Exit criteria (what "representative staging accepted" means)

Every scenario of `staging-acceptance-matrix.md` that has its data and policy is run by authorised users on this environment and signed off per scenario. Scenarios whose policy is still undecided (D1–D4, D6, D7…) stay **not accepted**; a financial or stock writer is never accepted without its owner decision and its parity/contract evidence.

## 5. What this plan does not authorise

Production access, production writes, dual-write, a cutover step, or enabling any writer outside staging. `cutover-plan.md` remains a separate, separately authorised plan.
