# 10 — Testing and reconciliation plan

Status: **PROPOSED**; must exist and pass before any write feature is enabled (PRD §10). Existing commands: `pnpm lint`, `pnpm typecheck`, `pnpm test` (all packages, `node --test` with `--experimental-strip-types`), `pnpm test:browser`, DB tests under `apps/web/tests/*-db.test.mjs` against the local `kkisi-staging` container.

## 1. Test data rules
- Destructive tests run only on **synthetic** databases built from the production DDL (structure only) — never on `kkisi_staging` real rows, never with real member data (MIG-108, PRD §10).
- Synthetic generators produce members, savings, loans, payroll batches with controlled edge cases (duplicate canonical NIK, column-shifted status values, divergent header/line status, due day 31, back-dated loans, annuity parameters that drop a row in legacy).
- Read-only checks on `kkisi_staging` real data are **aggregate-only** (counts/sums), as in this audit.
- Fixtures never contain names/NIKs copied from staging; snapshots in reports are hashed or counted.

## 2. Test categories

| Category | Scope | Where | Gate |
|---|---|---|---|
| **Characterization** | Actual legacy behaviour for every write path WP-01…WP-30 ([04 §3](04_DATABASE_WRITE_MAPPING.md#3-write-paths)): run the real PHP 5.6 CI2 controller against a synthetic DB with production DDL (same approach as the existing public-savings legacy runtime harness), capture table snapshots before/after, store as golden files | `integration/kosipa-full-access/legacy-runtime/` | every P1 feature before design freeze |
| **Domain unit** | Formulas, rounding, state transitions, invariants INV-01…INV-12, NIK canonicalisation, ratio, SHU, settlement, payoff, reversal netting | `packages/domain/tests/kosipa-*.test.mjs` | 100% of rule branches (NFR-104) |
| **Application** | Command use cases with in-memory ports: capability, maker-checker, state refusal, idempotent replay, error mapping, audit emission | `packages/application/tests/kosipa-commands-*.test.mjs` | all commands |
| **Repository integration** | Real MariaDB (synthetic schema): writes, lock order, rollback on injected failure, idempotency under concurrency, deadlock retry, post-condition checks, zero writes in read paths | `apps/web/tests/kosipa-*-write-db.test.mjs` | all writers |
| **HTTP** | Auth, CSRF/Origin, capability 403, flag 503, error codes, `no-store` | `apps/web/tests/console-kosipa-*-http.test.mjs` | all routes |
| **End-to-end** | Operator workflows in the console (Playwright pattern of existing `*-browser.mjs`): register member → deposit → approve → withdraw; apply loan → approve → disburse → payroll approve → settle; exit | `apps/web/tests/console-kosipa-*-browser.mjs` | per feature |
| **Regression** | Existing read-only KOSIPA suites keep passing: `kosipa-*-db.test.mjs`, `console-*-http.test.mjs`, `console-kosipa-browser.mjs`, `kosipa-uiux-*.mjs`, persona matrix | existing files | every change |
| **Security** | Threat list of [08 §6](08_AUTHORIZATION_AND_AUDIT_DESIGN.md#6-security-test-plan-prd-8) | HTTP + DB tests | every command |
| **Performance** | Baselines then targets of [06 §3.1](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md#31-performance-targets-proposed--baselines-first-prd-61): same synthetic dataset scaled to staging sizes (9.3 k members, 32.6 k loans, 1.2 M instalments), local container, no other load, 5 warm-up + 50 measured runs, record p50/p95/query count/rows examined (`EXPLAIN ANALYZE`) | `apps/web/scripts/kosipa-perf-baseline.mjs` | before claiming improvement |
| **Compatibility** | After Next.js writes: legacy list/detail/report pages and `x_proc_create_matrix` read the rows correctly (staging with real definitions, B1) | legacy runtime harness | before cutover |

## 3. Key test cases per area (minimum)

| Area | Cases |
|---|---|
| Foundation | same key ×20 concurrent → 1 effect; key reuse with different payload → 409; failure after 3rd statement → no rows; deadlock → retried once; flag off → 503, no query; ownership `L` → 503 |
| Members | duplicate canonical NIK refused; status RESIGN zeroes limits+wallet once, deletes tokens by `user_id`; deactivate with history refuses hard delete; salary not changed by loan form |
| Imports | 5,000 rows, 1 bad row → preview shows 1 error, nothing applied until confirm; shifted columns detected |
| Savings | header+lines same status; saldo row inserted once under replay; line edit after approval refused; reversal nets to 0 |
| Withdrawal | concurrent withdrawals exceeding balance → one refused; approval re-checks balance; type not withdrawable (D2 unset) → refused |
| Loans | flat/annuity schedules Σ principal exact; day 31 clamps; Feb; schedule never rebuilt after disbursement; rollover amounts server-side; approval keeps maker; reversal within limits |
| Payroll | approval settles only batch members; shortfall → exception; re-approval refused; header edit touches no loan; chunked update ≤ 10 s for 1,400 members |
| Exit | failure injected at each of 4 steps → nothing committed; statement totals = components |
| SHU | zero total refused; Σ = pool; duplicate NIK lines independent |
| Security | full matrix in 08 §6 |

## 4. Legacy defects in tests
Characterization records legacy behaviour **as is** (including `ANO-K22/K23/K24/K26/K31`). The Next.js tests assert the corrected behaviour. Each intentional difference is listed in the reconciliation "accepted differences" table with its ANO/R reference, so parity reports do not hide or "fix" them silently.

## 5. Reconciliation methodology

For each feature and period:
1. **Scenario replay:** run the same scenario (inputs) through legacy (harness) and Next.js on two copies of the same synthetic starting snapshot.
2. **Compare** per table: row counts by status; Σ of every money column by (member, type, period); per-document field equality on the compatibility columns ([07 §6](07_TARGET_ARCHITECTURE.md#6-legacy-compatibility-contracts)).
3. **Classify** each difference: (a) expected correction (cites ANO/R id) · (b) defect in Next.js (blocks) · (c) unexplained (blocks).
4. **Read-side parity on real data (aggregate-only):** for staging, compare Next.js computed balances/outstanding with legacy views (once B1 definitions are loaded) per member type totals; differences explained or blocking.
5. **Report** (OBS-104): feature, period, scenario hash, counts, sums, differences by class, sign-off fields (engineering, finance). Gate: zero (b)/(c).

## 6. Exit criteria per feature (feeds cutover gate 1–3 and 7)
- All categories green for the feature, regression green, security matrix green.
- Reconciliation report with zero blocking differences and finance sign-off of class (a).
- Performance within targets or an accepted exception with numbers.
