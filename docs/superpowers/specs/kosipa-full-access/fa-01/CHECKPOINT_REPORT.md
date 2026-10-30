# FA-01 — Native KOSIPA write foundation: checkpoint report

Date: 30 October 2026. Branch: `feat/currency-rupiah-standard` (not committed). Baseline: this spec folder ([README](../README.md)). Scope: the reusable write foundation, plus one real legacy reference-data operation built end to end.

**KOSIPA Full Access is not complete.** FA-01 is its technical foundation only. No financial write exists. Nothing is enabled outside the isolated synthetic stack.

## A. Implementation summary

**Built:**

- One command pipeline for every native KOSIPA write: ownership/flag → authorize → parse/validate → request hash → one InnoDB transaction (locks → idempotency lookup → re-check on locked rows → legacy-compatible write → ledger row) → commit → console audit.
- A command ledger in the business database (FD-01). It serves as both the idempotency store and the audit record, and is written atomically with the business rows.
- An explicit write-capability vocabulary and a grant store in the console store (FD-16), with a grants API and page.
- A feature ownership gate and kill switch.
- A verified legacy fence procedure (FD-03).
- A metadata-only B1 export procedure.
- The reference slice: **Master Lokasi** (legacy `master/lokasi_c` → `m_lokasi`), with create, update, deactivate and reactivate. It is reached through the API, the console page and the sidebar.

**Intentionally excluded:**

- Any financial command (posting, settlement, balances, schedules).
- The other 16 reference masters.
- The legacy hard delete of a location (unsafe; see F).
- Document numbering (TASK-109; masters have none).
- A native legacy-runtime (PHP) proof.
- A 2-person confirmation for grants.
- Any production DDL, account, fence or flag.
- Any repair of historical data.

## B. Architecture

Existing layering is kept (`apps → application → domain`). No new ORM, validation library or transaction library was added; the code uses Prisma raw SQL, as the TOKO writers do.

| Layer | Files (new unless marked) | Role |
|---|---|---|
| Domain | `packages/domain/src/kosipa/command.ts` | UUID v4 key, canonical JSON, request fingerprint, idempotency decision, reason rule (VAL-108), allow-listed ledger snapshot |
| | `packages/domain/src/kosipa/master.ts` | Location rules: field limits from the real columns, case-insensitive uniqueness, optimistic version, rename-while-referenced refusal, status plan |
| | `packages/domain/src/console/capabilities.ts` (changed) | `KOSIPA_WRITE_CAPABILITIES` (08 §3), `KOSIPA_WRITE_REQUIRES`, `GRANTABLE_KOSIPA_CAPABILITIES` = `kosipa.master.manage` only, `iam.kosipa.grant` |
| | `packages/domain/src/console/kosipa-grants.ts` | Grant rules (no self-grant, linked target, reason); effective capabilities require the live view capability |
| Application | `packages/application/src/kosipa/commands/pipeline.ts` | `runKosipaCommand`, `CommandEnvelope`, ports `WriteOwnership` and `AuditLog`; strict body fields |
| | `packages/application/src/kosipa/commands/master.ts` | `createLocation`, `updateLocation`, `setLocationStatus`, `listLocations`; port `LocationRepository` |
| | `packages/application/src/console/kosipa-grants.ts` | Grant, revoke and list use cases; port `KosipaGrantStore` |
| | `resolve-capabilities.usecase.ts`, `identity-links.ts` (changed) | Write capabilities only from grants and a live link; `kosipaUserId` exposed; fail closed for **all** KOSIPA capabilities on store error |
| Infrastructure | `apps/web/src/infrastructure/db/kosipa-unit-of-work.ts` | Transaction, lock order, ledger lookup and insert, retry policy |
| | `.../db/prisma-kosipa-master-write.ts` | Writer client; refuses every target except `127.0.0.1:3322/kkisi_kfa_synthetic`, shared accounts, pools > 2, and production |
| | `.../repositories/kosipa-location-write.repository.ts` | `m_lokasi` reads and commands; post-condition read-back |
| | `.../console/kosipa-ownership.ts`, `kosipa-grant-store.ts`, `kosipa-command-http.ts`, `kosipa-grant-handlers.ts`, `services.ts` (changed) | Ownership gate and flags, grant store, HTTP edges, wiring |
| Routes and UI | `app/api/kosipa/master/[type]/**`, `app/api/console/kosipa-grants/**` | REST commands: POST create, PATCH update, POST deactivate/reactivate |
| | `app/console/kosipa/master/lokasi/page.tsx`, `components/console/kosipa/LocationMasterManager.tsx`, `app/console/settings/akses-kosipa/page.tsx`, `components/console/KosipaGrantManager.tsx` | Console pages. Sidebar entries are shown only when `KOSIPA_WRITE_GRANTS_ENABLED=true` |
| Tooling | `integration/kosipa-full-access/{local-stack,app-server}.mjs`, `apps/web/scripts/kosipa-legacy-fence.mjs`, `apps/web/scripts/kosipa-b1-schema-export.sh` | Isolated stack, isolated console server, fence SQL generator, B1 export |

**Design choices:**

1. **Business locks before the ledger lookup.** Concurrent copies of one submission serialize on the subject, and the later ones replay the first result. This avoids gap-lock deadlocks on the ledger's unique index.
2. **Isolation level.** REPEATABLE READ (the server default), with locking reads for every re-check.
3. **Write lock scope for this master.** Every `m_lokasi` row is locked with `FOR UPDATE`. The table is small (12 rows in staging; refused above 2,000), and the full-index next-key locks also block concurrent inserts, so uniqueness is enforced without DDL.
4. **Concurrency control for edits.** `m_lokasi` has no update timestamp, so the optimistic version is a hash of the visible columns.
5. **Kill switch.** Two conditions, the feature flag and `KOSIPA_WRITE_OWNERSHIP`, decided before authorization.
6. **Authorization runs before parsing,** so unauthorized callers cannot probe record existence.

## C. Database changes

| File | Structure | Executed where |
|---|---|---|
| `apps/web/db/kosipa/001_command_ledger.sql.tpl` (+ `.rollback.sql.tpl`) | `kosipa_command_ledger` (design §2 plus `capability`, `outcome`, CHECKs); `UNIQUE (actor_console_user_id, idempotency_key)`, `KEY (subject_type, subject_ref, created_at)`; utf8mb4_bin | FA-01 container only (`kkisi_kfa_synthetic`); rollback rehearsed in a scratch database there |
| `apps/web/db/kosipa/002_master_writer_grants.sql.tpl` | Account `kosipa_master_w`: SELECT/INSERT on `m_lokasi`, UPDATE on 3 columns of `m_lokasi`, SELECT on `m_anggota.lokasi` and `users.lokasi`, SELECT/INSERT on the ledger; no DELETE; 2 connections | FA-01 container only |
| `apps/web/db/console/004_kosipa_grants.sql` (+ `.rollback.sql`, `005_kosipa_grants_grants.sql.tpl`) | `console_kosipa_grant` with an active-key unique index, CHECKs (not self, capability format, revocation shape), and no-delete / revoke-only triggers (same pattern as `console_identity_link`) | FA-01 container only |
| `docs/migration/sql/kosipa-command-ledger-production.sql` | Review-only production SQL with blocker **FD-01b** | **Not executed** |
| `integration/kosipa-full-access/fixtures/legacy-structure.sql` | Structure-only `m_lokasi` and `users` (copied from `SHOW CREATE TABLE`) | FA-01 container only |

No index was created on any legacy table. Index recommendations stay as proposed in [06 §3](../06_LEGACY_ANOMALIES_AND_PERFORMANCE.md#3-performance-findings) and the earlier index proposal. The command's reference count scans `m_anggota` (about 9.5k rows) and `users` (about 1.2k rows) by `lokasi`. That costs a few milliseconds and runs only when a name is being changed, so no index is needed now.

## D. Authorization

**Permission names:**

- `kosipa.master.manage`, requiring `kosipa.member.view`. This is the only grantable capability.
- `iam.kosipa.grant`, which needs `iam.link.manage` (`users_edit` plus branch chooser) **and** the deployment allow-list `KOSIPA_GRANT_ADMIN_USER_IDS`.
- A write capability counts only when four things all hold: an active grant, an active identity link, an active KOSIPA account, and the matching view capability.
- Legacy menus never yield a write capability, even with every KOSIPA controller allowed.
- Branch scope: KOSIPA is cooperative-wide (UCKW:BR002). A TOKO branch switch does not change KOSIPA access.

**Negative evidence (all executed and green):**

| Threat | Evidence |
|---|---|
| Anonymous | 401 (`kosipa-master-http`) |
| Missing or forged CSRF token, cross-origin, `sec-fetch-site: cross-site`, form post | 403, before any write |
| Read-only user / granted but not linked / link with every legacy menu but no grant / grant without view | 403, plus a `kosipa.command.denied` audit row, nothing written (HTTP and application tests) |
| Forged entity id | An unauthorized PATCH on id 999999 returns 403, never 404; an authorized one returns 404 `MASTER_NOT_FOUND` (DB test) |
| Forged fields (`status`, `id`) | 400 `FIELD_NOT_ALLOWED` |
| Expired session | 401 after the idle timeout |
| Permission change and identity-link revocation | 403 on the very next request (HTTP test and browser E6) |
| Privilege escalation | `iam.*` capabilities never grant writes. Self-grant is refused by the application (`SELF_GRANT`) and by a database CHECK. A grant administrator is not even offered themselves (browser E3) |
| Unlinked user | KOSIPA page refused (browser E2) |
| Cross-member checks | Not applicable to a master; they arrive with membership commands |

## E. Transactions and idempotency

| Property | How it is guaranteed | Evidence |
|---|---|---|
| Atomicity | Business rows and the ledger row are in one transaction. A failure injected after the business write leaves 0 rows and 0 ledger rows, and the same key then succeeds once. | `kosipa-foundation-db.test.mjs` |
| Idempotent retry | The same key with the same hash returns the stored `result_json` with `replayed: true`. There is no second effect and no second audit event. | DB and application tests |
| Key reuse | A different payload, command or subject under the same key returns 409 `IDEMPOTENCY_CONFLICT`. | |
| Concurrency, same key | 20 parallel submissions produce 1 row and 1 ledger row; every caller gets the same id. | DB test (run 3 times) |
| Concurrency, same value | 20 parallel creates with different keys produce 1 row; the rest return 422 `MASTER_CODE_DUPLICATE`. | |
| Concurrent edits | Two edits of one version: one wins, the other returns 409 `STALE`. | DB test and browser E5 |
| Lock wait | `capLockWait` 8 s. A real 1205 caused by a held row lock is retried, then succeeds. | DB test |
| Deadlock retry | Deadlock-class errors (1213 / 1205 / P2034 / ledger-key race) are retried up to 3 attempts in total, then 409 `BUSY_RETRY` with `Retry-After`. Other errors are not retried. | DB test |
| Failed attempts | Failures are not recorded in the ledger, so a retry with the same key re-executes against current state. | |
| Never claims success after rollback | The ledger row is inside the rolled-back transaction. | |
| Resource limits | Transaction timeout 15 s; writer pool ≤ 2 (enforced, and the account itself is capped at 2 connections); no network or file I/O inside a transaction. | |
| UI behaviour | One UUID per attempt, reused on timeout or `BUSY_RETRY`. A double click produced exactly one row. | Browser E4 |

## F. Reference mutation: Master Lokasi

**Legacy evidence:**

- `master/lokasi_c` `ajax_add`, `ajax_update` and `ajax_delete` write posted values with no validation and no uniqueness, and the delete has no reference check (02A rows; `lokasi_m.php:84/97/111`).
- Members store the location **name**: `m_anggota.lokasi` is VARCHAR(100), and smartkkisi has `users.lokasi`. On staging, 2,161 members and 998 member accounts reference the 12 location names.
- The member form lists `status=1` rows.

**Native rules (class B):**

- Code and name are required, printable ASCII (the table is latin1), with code ≤ 50 and name ≤ 100 characters.
- Code and name are unique, compared case-insensitively.
- A location's name cannot be changed while members or member accounts store it. Its code can still change.
- Removal means deactivation with a reason. **The legacy hard delete is not offered**, because deleting a referenced location breaks the member dropdowns and loan prints.
- Status is written as legacy 1/0, so legacy reads and forms keep working.

**End-to-end run** (`apps/web/tests/kosipa-master-browser.mjs`, against the isolated server on :3230):

| Step | Result |
|---|---|
| E1 Viewer | Read-only list; a direct POST without CSRF is refused; no overflow at 375/768/1440 px |
| E2 Unlinked user | Refused |
| E3 Administrator | Grants the operator through the UI |
| E4 Operator | Creates (a double click produces one row), edits the code, is refused renaming the referenced `SYNTH Tambun`, deactivates with a reason |
| E5 Second tab | Stale edit refused |
| E6 Revocation | The operator loses the form on the next load |
| E7 Database evidence | Ledger rows `create, update, deactivate, update` carry console id 910002 and KOSIPA id 9102; audit successes and refusals present; no member identifiers in the ledger |

Screenshots are in `/private/tmp/kfa01-browser/`.

## G. Test results

All results are from 30 Oct 2026, on the final tree unless noted. Nothing unexecuted is reported as passing.

| Command | Result |
|---|---|
| `pnpm lint` | 0 errors, 6 warnings, all in files not touched by FA-01 |
| `pnpm typecheck` | exit 0 (domain, application, web) |
| `pnpm -r test` | domain 337/337; application 172/172; web 591 tests: 473 pass, 0 fail, 118 skipped (opt-in DB/env suites, including the 3 FA-01 DB files) |
| `KOSIPA_FA01=1 node --experimental-strip-types --test tests/kosipa-foundation-db.test.mjs tests/kosipa-legacy-fence-db.test.mjs tests/kosipa-migrations-rollback-db.test.mjs` | 11/11 pass. Requires the FA-01 app server to be stopped, because the writer account is capped at 2 connections; with the server running, 3 tests fail on that cap, as designed. |
| `node tests/kosipa-master-browser.mjs` | PASS (E1–E7) |
| `next build` (via `app-server.mjs build`, into `.next-kfa01`) | exit 0. The default `.next` was not rebuilt, so that the user's running `next dev` server is not disturbed. |
| `validate-spec-coverage.sh` | Passed (see README) |

**New tests:**

| Area | Tests |
|---|---|
| Domain | 18 (`kosipa-command`, `kosipa-master`, `console-kosipa-grants`) |
| Application | 11 (`kosipa-commands-pipeline`, `console-kosipa-grants`) |
| Web HTTP | 8 (`kosipa-master-http`) |
| DB | 11 |
| Browser | 1 script, 7 stages |

**Changed guard tests (deliberately, not weakened):**

- `auth-route-guard-scan` and `console-shell` now name the one sanctioned KOSIPA writer, and add a rule that only the service wiring may import it.
- `support/personas.mjs` and `public-savings-isolation` model the deployment explicitly, because the FA-01 nav entries appear only when the write foundation is deployed. The staging RBAC document did not change.

**Not run:**

- The existing browser suites (`pnpm test:browser`, DEV LOCAL) were not run. They need DEV LOCAL servers that may be in use (memory: do not stop them). FA-01 changes nothing they cover when `KOSIPA_WRITE_GRANTS_ENABLED` is unset.
- To run them: `bash apps/web/scripts/dev-local.sh status`, then `pnpm test:browser`.

## H. Safety verification

| Check | Result |
|---|---|
| Real-data staging server (`kkisi-staging`), checked after all runs | No ledger, grant or FA-01 objects; no FA-01 accounts; `kkisi_staging.m_lokasi` still has 12 rows, max id 12; `ref_menu` `master/lokasi_c` still status 1 |
| Reads of staging | Read-only metadata and aggregates only (DDL of `m_lokasi`/`users`, counts, `EVENTS`) |
| Legacy source | `kosipa/` unchanged (gitignored copy, read only) |
| Production and DEV LOCAL | Nothing deployed, migrated or switched; no DEV LOCAL database or the shared local console store was touched |
| Commits | None |
| Legacy runtime dependency | None. No HTTP call to KOSIPA, no PHP session, no stored procedure. The writer guard refuses every non-FA-01 database. |
| Historical data | No repair of any kind |

## I. Specification traceability

**Requirements:**

| Status | IDs |
|---|---|
| Done for the foundation | REQ-103, REQ-104, REQ-105, REQ-130, REQ-140 |
| Done for Master Lokasi (1 of 17) | REQ-129 |
| Done for the feature built | REQ-133, REQ-142 |
| Business rules and validation | BR-117, VAL-102 (status 1/0), VAL-108, VAL-109, VAL-112 |
| Security | SEC-101, SEC-102, SEC-103, SEC-104, SEC-105, SEC-107 (local), SEC-108, SEC-109, SEC-111 |
| Partial | SEC-112: reason required, but no typed confirmation; masters are not destructive. OBS-103: no-PII logs, but no metrics yet. |
| Non-functional | NFR-102, NFR-103, NFR-105, NFR-108 (reads via a SELECT-only account) |
| Observability | OBS-101, OBS-102 |
| Migration | MIG-101, MIG-105, MIG-108 |

**Tasks:**

| Status | IDs |
|---|---|
| `[x]` | TASK-105, 106, 107, 108, 110 |
| `[~]` | TASK-102 (B1 procedure ready; operator run pending), TASK-113 (synthetic rehearsal only), TASK-114 (Lokasi only), TASK-141 |
| Not started | TASK-109, 111, 112 |

Details are in [tasks.md](../tasks.md). Decisions: [12 §3.1](../12_DECISION_REGISTER.md#31-fa-01-implementation-baseline-30-oct-2026). The FD-03 verification is in [FD-03-legacy-fence-verification.md](FD-03-legacy-fence-verification.md).

**Open for production enablement of Master Lokasi:**

- FD-01b (append-only ledger on cPanel).
- An operator run of the fence on production, after confirming smartkkisi does not write `m_lokasi`.
- Accounts from reviewed SQL.
- The B5/B8 connection budget.
- The 2-person grant rule (FD-16).
- The cutover gates of [11](../11_CUTOVER_AND_ROLLBACK_PLAN.md).

## J. Next checkpoint (recommended)

**FA-02: the remaining KOSIPA-only reference masters, plus the legacy characterization harness.** This is the next dependency-safe step: it reuses the FA-01 pipeline unchanged and still moves no money.

1. **Non-financial in-menu masters first:**
   - `m_bagian` (`bagian_c`, referenced by name like lokasi)
   - `m_jenis_dokumen`
   - `m_rekening` (`rekening_bank_c`)
   - `m_jangka_waktu` (`periode_angsuran_c`)
2. **Product-configuration masters second:** `m_jenis_simpanan`, `m_jenis_pinjaman` and `m_jenis_pembiayaan` (with COA validation), and `m_suku_bunga`. They change how *new* loans and savings are computed, so they need D6 (rule authority) and B1 (view bodies) first.
3. **TASK-104:** run the legacy pages and `x_proc_create_matrix` against rows written by Next.js in the PHP harness. This proves REQ-142 for real, not only by contract.
4. **Close FD-01b and the 2-person grant rule** before any production enablement.

Membership (WI-07/08) should follow FA-02, not precede it. `m_anggota` is written by TOKO legacy and smartkkisi too, and its status change revokes tokens and zeroes limits, so it needs the harness and the cross-application fence answers first.
