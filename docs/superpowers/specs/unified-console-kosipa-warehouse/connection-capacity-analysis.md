# Connection capacity analysis — Warehouse needs +2 (decision B5)

Status: **analysis and recommendation only; section 7 (checkpoint 12) supersedes the interpretation in section 6.** Nothing here changes a production setting, a pool, an account or the guard.** Decision B5 stays **open / Warehouse module disabled**.
Numbers below are produced by `apps/web/src/infrastructure/db/capacity-plan.ts` and asserted in `apps/web/tests/capacity-plan.test.mjs`, which also fails if the documented pools drift from `deploy/genesis/env.production.example`.

## 1. Evidence (what is measured, what is not)

| Fact | Source | Kind |
|---|---|---|
| Ceiling `MAX_CONNECTION_BUDGET = 12`, per-client ceiling `MAX_POOL_PER_CLIENT = 4`, idle lifetime ≤ 15 s | `deployment-guard.ts` | code constant |
| The startup guard sums `connection_limit` of **configured** DSNs on the legacy server and refuses to start above the budget | `deployment-guard.ts` `assertConnectionBudget`, `startup-check.ts:51-74` | code |
| Writers are counted **only when their flag is `1`** (`POS_WRITES_ENABLED`, `INVENTORY_WRITES_ENABLED`, `PRODUCTS_WRITES_ENABLED`, `SALES_RETURN_WRITES_ENABLED`); the console pool only when configured | `startup-check.ts` | code |
| Documented pools: reader 3, auth 2, console 1, POS 2, register 1, inventory 1, products 1, returns 1 → **12 when everything is active**; **6** for the read-only console (reader + auth + console); every writer is disabled by default | `env.production.example` + test | configuration |
| `max_user_connections = 20` "shared with the legacy PHP application" | handoff / budget comment | **stated, not verified** (the evidence bundle's `server.maxUserConnections` will confirm the variable; **whether Niagahoster counts it per database user or per hosting account is not documented anywhere in the repository**) |
| Legacy PHP peak connection use | — | **unmeasured**. "8 left for PHP" is the budget's assumption, not a measurement. No unused capacity is claimed. |
| One consumer process of the harness needs **1 connection per account** (`connection_limit = 1`); 3 concurrent consumer processes + the test process needed 4 on the Warehouse account | `tests/cross-db-outbox.test.mjs`, local sampler | local measurement (synthetic) |

**Warehouse requirement:** exactly two new accounts (different databases, different owners) → **+2**: the Warehouse store (documents, mappings, outbox) and the TOKO stock-apply writer (idempotency record + stock, written in one transaction). One drain process holds both at `connection_limit = 1`. **A second drain process would add +2 more**, so concurrent consumers are a test-only configuration and must not be deployed under this budget (single drain instance; the target-side invariant makes extra consumers *safe*, not *free*).

## 2. Scenarios (same arithmetic as the guard)

| # | Active pools | Used / 12 | Left of 20 for PHP (strict reading) |
|---|---|---|---|
| S0 | reader, auth, console (read-only console, today) | 6 | 14 |
| S1 | S0 + Warehouse store + stock-apply | 8 | 12 |
| S2 | S0 + every existing writer (POS 2, register, inventory, products, returns) | **12** | 8 |
| S3 | S2 + both Warehouse pools | **14 — refused by the guard** | 6 |
| S4 | S0 + POS + register + both Warehouse pools (other writers still legacy) | 11 | 9 |

The Warehouse fits *today* (S1) and *with POS cut over* (S4). It does **not** fit with every writer active at once (S3). The budget problem is therefore a **sequencing problem**, not a present shortage.

## 3. Options

### A — Consolidate compatible pools without weakening isolation
* **What:** pools may be merged only if account, privilege set and target database are identical; otherwise merging puts two duties behind one credential. By that rule **no existing pair is mergeable** (auth/console/read/each writer differ in account, database or grants). The only safe lever is **lowering a `connection_limit`** where measured concurrency never needs it (candidates: reader 3 → 2, auth 2 → 1).
* **Connections:** frees 0–2; S3 fits (12) only with **both** reductions verified (test: `reader:2, auth:1`).
* **Per-user/server constraints:** unchanged accounts; `connection_limit` ≥ 1.
* **Least privilege / failure isolation:** preserved (accounts untouched). Queuing risk: a smaller pool serialises requests; auth at 1 puts every session lookup behind one connection, reader at 2 lengthens report/export waits (5 s `max_statement_time` bounds a query, not queue time).
* **Runtime impact:** latency under concurrency; needs a measured peak per pool under realistic load. Only synthetic UAT peaks exist (section 5), which cannot justify a production reduction.
* **Deployment impact:** a DSN query-string change per pool; guard recomputes at startup; no code change.
* **Operational complexity:** low, but needs ongoing monitoring of `P2024` pool timeouts.
* **Rollback:** restore the previous `connection_limit`; restart.

### B — Reallocate writer pools by verified activation / cutover ownership
* **What:** treat the 12 as a **schedule**: a writer pool exists only while its module is the **single writer** for the branch (flag `1`), which is already how the guard counts. Warehouse pools are activated in a phase where enough legacy-owned writers are still off. S4 (POS cut over, Warehouse live, inventory/products/returns still legacy) is 11/12.
* **Connections:** 0 added to the ceiling; the peak is whatever the activation plan allows. **Conflict rule:** a plan that activates all of inventory, products, returns, POS *and* Warehouse simultaneously is refused (S3) and needs A, C or a ceiling decision.
* **Constraints:** requires an **owner-approved cutover order** per module (single-writer rule: old and new financial/inventory writers on the same branch are not authorised). The order is an owner decision (D5/D7-adjacent), not an engineering default.
* **Least privilege / failure isolation:** best of the three — no account is merged or widened; inactive writers hold **no** connection, so an unused writer cannot starve others.
* **Runtime impact:** none; pools are lazy and counted only when enabled.
* **Deployment impact:** an activation checklist item: *before enabling a writer flag, compute `evaluate(...)` for the resulting set*; the startup guard is the backstop (it refuses to boot above 12).
* **Operational complexity:** low–moderate (a documented activation order and a pre-flight check).
* **Rollback:** unset the writer flag (a rollback *frees* connections).

### C — Separately provisioned Warehouse data service / capacity (approved infrastructure only)
* **What:** the Warehouse store lives on its own database service (own server/limits), outside the legacy server's per-user budget. The **stock-apply writer still must reach the TOKO database**, so C removes **one** of the two connections (13 in S3, still above 12; fits with A's reader reduction — test: `moveWarehouseTo`, `reader:2`).
* **Per-user/server constraints:** a new server, TLS, network path from the application host, backups, patching, ownership, cost. None exist today; **not provisionable by this work** (no production infrastructure changes).
* **Least privilege / failure isolation:** strongest data isolation (a Warehouse outage or runaway query cannot consume legacy capacity); introduces a **second failure domain on the outbox path** (already handled: drains retry; cross-database harness proves no double posting).
* **Runtime impact:** one more network hop; latency irrelevant for the asynchronous drain.
* **Deployment impact:** new DSN, new startup guard target kind (the guard today knows `legacy|auth|console`), new infra runbook.
* **Operational complexity:** highest (a new system to run).
* **Rollback:** point the DSN back / disable the module; data stays on the new service.

## 4. Recommendation (a proposal for the owner, not a decision)

1. **Do not add any pool yet.** B5 remains open; no unused capacity is claimed, because the PHP peak and the way the 20 is counted are unverified.
2. **Take B as the primary mechanism**: it costs nothing, weakens nothing and is already enforced by the guard. Ask the owner for the cutover order of the five existing writers; if Warehouse is needed while at most three of {inventory, products, returns, POS, register} are active, no capacity change is needed at all (S4).
3. **Do not pursue A on current evidence** (section 6: the pools it would shrink were not idle under synthetic load). Revisit only with production-like concurrency data (section 5).
4. **Hold C in reserve** for the case where the owner requires the Warehouse **and** all existing writers live at once. It needs approved infrastructure and is the only option that survives growth.
5. **Single drain instance.** Do not deploy more than one drain process while the budget is this tight.

## 5. What would convert this into a decision

| Evidence | Who | Why |
|---|---|---|
| Hosting confirmation of how `max_user_connections` is counted (per DB user vs per account) | hosting provider / operator | decides whether the 20 is one shared pool at all |
| Legacy PHP peak concurrent connections over ≥ 2 weeks (`SHOW STATUS LIKE 'Max_used_connections'`, processlist sampling by the operator) | operator | converts "8 left" from an assumption to a number |
| Owner-approved cutover order of POS / register / inventory / products / returns / Warehouse | owner | makes option B concrete |
| Peak per pool under realistic production concurrency (not the synthetic UAT) | operator | needed before any option A reduction |

## 6. Local measurement (synthetic only) — checkpoint 11, **interpretation corrected in section 7**

`apps/web/scripts/sample-db-connections.sh` counts open connections per account on the **local** container (processlist, 0.25 s interval, idle pooled connections included) while the complete `scripts/uat-run.sh` (six phases, all passing) ran against the built application, 17 Oct 2026:

| Account (local) | Local `connection_limit` | Peak open during UAT | Production ceiling for the same pool | Reading |
|---|---|---|---|---|
| auth store | 8 | **3** | 2 | the auth pool *used* 3 when allowed; the production ceiling of 2 would queue under the same load → **no support for reducing auth** |
| KOSIPA/TOKO reader (`kkisi_e2e_read`) | 8 | **10** (pool of 8 + the browser suites' own clients) | 3 | the reader wants far more than 3 under concurrent page loads → **no support for reducing reader** |
| console store | 1 | 1 | 1 | at its ceiling |
| seed/cleanup account | — | 1 | n/a | test tooling only |

**What this does and does not show.** It shows that, in this repository's synthetic UAT, the pools that option A would shrink are **not idle**; it therefore gives option A no evidence, and the honest reading is that production ceilings (3 and 2) are already tight. It is a measurement of *demand with a larger local ceiling*, not of the production behaviour with ceilings of 3 and 2 (which would queue rather than open more connections, bounded by `pool_timeout`), and it says nothing about the legacy PHP application. Option A is therefore **not recommended on current evidence**; B (and, if needed, C) are.

The Warehouse harness gives the other measured number: the Warehouse and TOKO-test accounts each needed **1** connection per drain process (`connection_limit = 1`) and a second drain process costs another 1 on each account.

## 7. Checkpoint 12 investigation — what the numbers really were, one defect fixed

**Method (reproducible):** `apps/web/scripts/measure-app-connections.sh [pages|api|mixed] <concurrency> <seconds>` starts **one** built Next.js process with **production-sized pools** (reader 3, auth 2, console 1; overridable), signs in synthetic users, drives a fixed page/API mix (`scripts/lib/connection-load.mjs`) and samples `information_schema.processlist` **inside the container** every ~50 ms. It reports, per account, the configured `connection_limit`, the peak of **simultaneous** connections, the peak of **active** (non-`Sleep`) connections, and the number of **distinct connection ids over the whole run** (accumulated, to detect churn), plus the number of app processes. Synthetic schema and local container only.

### Defect found and fixed — two reader pools in one process

| Load (one app process, 8 workers, 15 s) | Reader configured | Reader peak simultaneous (before) | Distinct ids (before) | Reader peak (after fix) |
|---|---|---|---|---|
| API routes only | 3 | 3 | 3 | 3 |
| Server-rendered pages only | 3 | **6** | 6 | **3** |
| Mixed | 3 | **6** | 6 | **3** |

A temporary probe in `prisma.ts` logged **two** `PrismaClient` constructions from the same module file in the **same pid**: Next.js evaluated the module in two server module graphs, and `prisma.ts` cached the client on `globalThis` only when `NODE_ENV !== 'production'`. Under `next start` every graph therefore built its own client and pool, so one process could open **2 × connection_limit** reader connections while the startup guard counted one. Auth, console and every writer already cached unconditionally and were not affected. **Fix:** `prisma.ts` now always uses `globalThis.prismaClient ??= new PrismaClient()`. **Regression tests** (`tests/db-client-lifecycle.test.mjs`): the module evaluated twice in a production process yields one client; every client module caches unconditionally with no `NODE_ENV` gate; no client is built outside `src/infrastructure/db`. Both fail on the old code.

**Consequence for the production budget:** before the fix, the documented 12/12 was in practice up to **15** (reader 6 instead of 3) whenever both page and API paths were used. After the fix the guard's arithmetic matches the process.

### Checkpoint 11's numbers, explained

| Observation (C11) | What it actually was |
|---|---|
| Reader peak 10 "against 3" | The local UAT configured the reader with `connection_limit=8`, not 3. The duplicated pool (2 × 8) plus extra app processes that `tests/e2e-local.mjs` spawns (`withApp`, outage scenarios) pushed demand above 10, and the **local account's own cap** `MAX_USER_CONNECTIONS 10` stopped it at 10. It was a server-enforced ceiling being reached, not 10 connections from one pool. |
| Auth peak 3 "against 2" | Local `connection_limit` was 8; 3 was ordinary demand under that limit, across the main app and spawned instances. No defect. |
| Console peak 1 | At its ceiling of 1; correct. |

### Representative local load after the fix (one process, production-sized pools)

| Load | Requests | Errors | p50 / p95 / max latency | Reader | Auth | Console |
|---|---|---|---|---|---|---|
| mixed, 8 workers, 15 s | 5,422 | 0 | 21 / 41 / 180 ms | 3 of 3 | 2 of 2 | 1 of 1 |
| mixed, 32 workers, 20 s | 6,988 | **0** (no pool timeout) | 97 / 184 / 570 ms | 3 of 3 | 2 of 2 | 0–1 of 1 |

The production pool sizes serve this synthetic load without errors; requests queue for a connection rather than failing. Latency to the real server through the SSH tunnel will be higher, so these numbers are a lower bound. Fixture gap noted: the synthetic schema has no `db_brands`, so `/api/products` cannot run there and is excluded from the load (it is exercised against the staging copy elsewhere).

### How the limit is counted (interpretation)

In MariaDB, `max_user_connections` is the maximum number of simultaneous connections **per account** (`user@host`), and a per-account `MAX_USER_CONNECTIONS` overrides it (the local accounts show exactly this: each is capped separately). Under that semantics the application's separate accounts do **not** share one pool of 20 with the PHP account. The project's "12 of a shared 20" rule is the **stricter** reading and may reflect a hosting-level limit (shared-hosting governors can cap a whole hosting account) that is not visible in the MariaDB variable. Which one applies on Niagahoster is **unverified** and remains evidence item B8. Until it is confirmed, keep the strict reading.

### Recommended safe allocation (unchanged budget, no new pool)

* Keep reader 3, auth 2, console 1 and the writers as documented. The fix restores the guard's arithmetic, so the documented 12 is now real rather than optimistic.
* Exactly one application process; no extra drain or worker process.
* The Warehouse +2 still needs B5/B8/B9 (sections 3–5). No production budget was increased and no pool was added.

### Remaining production evidence

B8 (how the hosting counts connections, and the legacy PHP peak), B9 (cutover order), and a production-like latency measurement through the tunnel before any pool size is reduced.
