# Implementation Journal — `unified-console-kosipa-warehouse`

Status vocabulary: **NOT STARTED · IN PROGRESS · IMPLEMENTED** (code exists) **· VERIFIED** (local automated + browser checks on synthetic data) **· BLOCKED · DEFERRED**. Staging acceptance and production activation are separate later states and are never implied by VERIFIED.

Owner decisions applied (16 Oct 2026): legacy applications (KOSIPA, TOKO PHP, Gudang) are **not modified** in any way; `TASK-001`/`TASK-002` are **DEFERRED** as legacy operational risks; the legacy payroll procedure is not patched (a corrected Next.js generator replaces it later); detailed vulnerability findings stay in the private, gitignored register.

## Task status overview

| Task | Status | Note |
|---|---|---|
| TASK-001, TASK-002 | DEFERRED | Legacy not modified (owner). Secure equivalents are requirements of the Next.js pages that replace them |
| TASK-003 | BLOCKED | Needs operator to run `docs/migration/sql/legacy-schema-objects-readonly.sql`; no production access from engineering |
| TASK-004 | BLOCKED | Depends on TASK-003 output |
| TASK-005 | NOT STARTED | Doc reconciliation; partly covered by this journal |
| TASK-010 … TASK-014 | **VERIFIED (local)** | Checkpoint 1 below |
| TASK-023, TASK-026, TASK-040, TASK-042, TASK-045, TASK-046 | **IN PROGRESS** — domain layer VERIFIED (unit) | Checkpoint 2; adapters, use cases, UI and writers still to do |
| TASK-020, 021, 022, 024 | **VERIFIED (local)** | Checkpoint 3 (Option B). TASK-021 uses the existing SELECT-only reader (no new business pool) + the console store guard |
| TASK-026 (read side) | **IMPLEMENTED + VERIFIED (synthetic fixtures, local staging copy read-only)**; official balance blocked on TASK-003; NOT staging-accepted | Checkpoint 7. Simulation/origination remain with TASK-043 |
| TASK-025 (read side) | **IMPLEMENTED + VERIFIED (synthetic fixtures, local staging copy read-only)**; official balance blocked on TASK-003; parity (REQ-023) not done; NOT staging-accepted | Checkpoint 8 |
| TASK-027 | **IMPLEMENTED + VERIFIED (synthetic fixtures, local staging copy read-only)**; NOT staging-accepted, NOT production-ready | Checkpoint 6. Payroll does not need an index (Checkpoint 5 measurement) |
| TASK-062, TASK-063 | **PARTIAL** — domain + application VERIFIED | Checkpoint 4; no adapter, storage, writer or UI; accounting treatment open |

---

## Checkpoint 1 — Unified Console Foundation (TASK-010 … TASK-014)

**Status:** VERIFIED (local). Not staging-accepted, not production-enabled (`CONSOLE_ENABLED` is off by default and in `.env.example`).
**Branch:** `feat/unified-console` (from `master-dev` @ `81dab9ed`).

### Delivered

- `/console` protected dashboard with authenticated-only guard (no `sales_add` inheritance), section sidebar, breadcrumb, branch/user context, branch switch + logout (reused `SessionControls`), drawer navigation ≤767 px (Escape/overlay/navigation close, focus return), loading skeleton, error boundary with retry, no-module empty state, honest module cards (Tersedia / Tersedia sebagian / Segera hadir), no numeric KPIs.
- Single typed navigation registry; KOSIPA (Keanggotaan, Simpanan, Pinjaman, Angsuran, Payroll) and Warehouse distribution/receiving registered as `planned` — never rendered as links.
- Server capability resolver: one batched `db_permissions` read (`grantedAmong`) instead of one COUNT per slug; compound rules mirror the existing page gates exactly.
- Post-login landing without changing the login API: the login page passes `/console?entry=login` (flag on) or `/pos` (flag off); `/console` sends cashier-focused users on to `/pos`. Safe `next` handling unchanged (`safeNextPath`).
- `GET /api/console/capabilities` (guarded, GET-only, 404 when the flag is off, 503 on store failure).
- Proxy gate for `/console` and `/api/console`, preserving a console deep link as `next`.
- TOKO shell: the disabled "Dashboard Supervisor" placeholder becomes a "Dashboard" link to `/console` only when the flag is on.

### Files

| Layer | Files |
|---|---|
| Domain | `packages/domain/src/console/capabilities.ts`, `packages/domain/src/console/navigation.ts`, `packages/domain/package.json` (exports) |
| Application | `packages/application/src/console/resolve-capabilities.usecase.ts`, `packages/application/package.json` (export) |
| Infrastructure | `apps/web/src/infrastructure/console/{flags,handlers}.ts`, `infrastructure/auth/page-guard.ts` (`requireConsoleSession`), `infrastructure/auth/prisma-legacy-repositories.ts` (`grantedAmong`, SELECT only), `infrastructure/auth/container.ts` (exposes `capabilities`), `infrastructure/sales/page-session.ts` (`consoleAvailable`) |
| UI / routes | `apps/web/src/app/console/{layout,page,loading,error}.tsx`, `app/console/console.css`, `app/api/console/capabilities/route.ts`, `components/console/{ConsoleFrame.tsx,icons.ts}`, `features/console/navigation.ts`, `proxy.ts`, `app/login/{page,LoginForm}.tsx` |
| TOKO (minimal) | `app/{pos,products,inventory}/page.tsx` and `features/pos/types.ts`: one added field `consoleAvailable`; `components/pos/PosShell.tsx`: placeholder → conditional link. No query, payment, register or permission logic changed |
| Tests | `packages/domain/tests/console.test.mjs`, `packages/application/tests/console-capabilities.test.mjs`, `apps/web/tests/{console-http,console-shell}.test.mjs`, `apps/web/tests/console-browser.mjs` (opt-in), `apps/web/tests/auth-route-guard-scan.test.mjs` (accepts the new guard) |
| Config | `apps/web/.env.example` (`CONSOLE_ENABLED=false`) |

### Decisions

1. **No login API change.** Landing is decided by `/console` itself on a `?entry=login` visit, so the login contract and its tests are untouched and the flag-off path is byte-identical (`/pos`).
2. **Cashier-focused** = holds `toko.pos.checkout` and neither `toko.products.view` nor `toko.inventory.view` (history/returns remain cashier work). Persona → route mapping for KOSIPA/Warehouse users is deferred until those capabilities exist (needs identity links, REQ-020/050).
3. **Login page is now dynamic** so `CONSOLE_ENABLED` is read per request (a runtime env change needs no rebuild).
4. **TOKO pages keep `PosShell`.** POS stays in focused mode (no console chrome); the console links to TOKO routes rather than re-wrapping them (PRD P0, REQ-015/016).
5. KOSIPA/Warehouse capabilities are deliberately absent from the `Capability` type until their adapters ship; unknown capabilities cannot be referenced by the registry (test enforced).

### Verification (actual results, 16 Oct 2026)

| Check | Result |
|---|---|
| Baseline before changes | lint 0 errors / 4 warnings; typecheck OK; tests domain 28, application 22, web 228 pass (+42 opt-in DB skipped) |
| `pnpm lint` | 0 errors, same 4 pre-existing warnings |
| `pnpm typecheck` | OK (domain, application, web) |
| `pnpm test` | domain **38/38**, application **24/24**, web **243 pass / 0 fail** (+42 opt-in DB skipped, unchanged) |
| `pnpm build` | OK; `/console` and `/api/console/capabilities` dynamic |
| `tests/console-browser.mjs` (flag on, synthetic `kkisi_e2e_legacy`, built app on 127.0.0.1) | PASS: anonymous → `/login?next=%2Fconsole`, API 401; cashier → `/pos`, POS has no console chrome, "Dashboard" link works, sidebar = Dashboard + POS only, roadmap not linked; safe `next` kept, `//evil.example` ignored; manager sidebar = Dashboard, POS, Riwayat, Retur, Produk, Warehouse; `aria-current`; no money figures; no horizontal overflow at 375/390/768/1024/1440; drawer opens fully on-screen, Escape closes and returns focus, closes on navigation; user without `sales_add` sees console, `/pos` page "Akses ditolak", POS API 403; zero browser errors |
| `tests/console-browser.mjs` (flag off) | PASS: `/console` 404, API 404, login → `/pos`, old "Dashboard Supervisor" placeholder shown |
| Existing `pos-browser.mjs` (POS security/layout suite) | PASS with console **off** and **on** |
| Existing `e2e-local.mjs` | FAIL — **pre-existing, unrelated**: its category-chip step targets UI removed in `f3b8bad6` (3 Oct 2026). Needs a separate test-maintenance task |

Synthetic data handling: the e2e schema was empty on arrival; it was seeded with the repo's seeder for the run and returned to empty with `scripts/e2e-cleanup.mjs`. No staging business data and no production system was touched.

### Invariants enforced

- Menu visibility never authorises: every TOKO page/API keeps its own existing guard (unchanged); console layout **and** page guard independently (scan test).
- Capabilities ⊆ existing permission slugs; compound rules covered by unit tests (returns need `sales_view`; warehouse master needs branch chooser + `inventory_view`; add/edit need view).
- Fail-closed: store failure → 503 / "Layanan tidak tersedia", never an empty allow-list.
- Branch only from the validated session (API returns `ctx.companyId`).
- Console CSS fully scoped (`.console-*`, test enforced).

### Compatibility impact on TOKO

None functional. Flag off: identical behaviour (verified in browser). Flag on: one extra sidebar link in `PosShell`; login fallback goes via `/console`, which forwards cashiers to `/pos` (one extra redirect hop on fresh login only).

### Risks

- **Implementation:** none blocking. The dev server's cached auth container (globalThis) predates the new `capabilities` field — restart `pnpm dev` after pulling.
- **Activation:** staging UAT with representative real roles is still required (PRD M2/M3 gates); persona landing for real permission distributions not yet validated (PRD open decision).

### Rollback

Set `CONSOLE_ENABLED` unset/false and restart: `/console` → 404, login → `/pos`, POS shell placeholder restored. No schema or data involved.

### Next eligible checkpoint

Checkpoint 2 — KOSIPA pure domain core (no database writes, no flags needed): `TASK-023` (NIK, savings balance, store credit net of returns), domain parts of `TASK-026` (loan schedule), `TASK-040` (document state machine + maker-checker), domain parts of `TASK-045` (batch-scoped payroll settlement), `TASK-046` (SHU allocation), `TASK-042` (balanced journal). Financial writers stay gated (owner decisions BR-005/007/012 and schema evidence TASK-003 outstanding).

---

## Checkpoint 2 — KOSIPA domain core (domain parts of TASK-023, 026, 040, 042, 045, 046)

**Status:** domain layer VERIFIED (unit tests). No adapters, no routes, no database access, no writers — nothing is reachable from the running app yet.

### Delivered (`packages/domain/src/kosipa/`, export `@koperasi/domain/kosipa`)

| Module | Corrects | Behaviour |
|---|---|---|
| `nik.ts` | ANO-K19 | Canonical NIK (numeric: no leading zeros; alphanumeric kept — legacy `CONVERT(...,UNSIGNED)` collapsed every non-numeric NIK to 0); index-friendly lookup keys |
| `member-eligibility.ts` | ANO-T02 (read-path side effect) | Reusable eligibility = exactly the POS Kredit rule (NIK present, `AKTIVE`, unexpired KONTRAK); never mutates members |
| `document-state.ts` | ANO-K03 | Server-side lifecycle DRAFT→OPEN→APPROVED→DISBURSED/POSTED→SETTLED/REVERSED; client sends an action, never a status; maker-checker on approve/reject/disburse/post/reverse; reason required for reject/reverse; terminal states immutable |
| `loan-schedule.ts` | ANO-K07/K08/K11 | Exact Flat/Anuitas schedules in integer sen (BigInt for the annuity factor), last instalment absorbs rounding so Σprincipal = principal; re-amortises only if extreme rate×term drift would overshoot; deduction-ratio check with a **required** ratio (BR-005 open) |
| `savings.ts` | ANO-K04 | Position from persisted lines only (pending debits reserved, pending credits not spendable); withdrawal check with a **required** policy (BR-007 open) |
| `store-credit.ts` | ANO-X01 | Payroll window = previous calendar month; Σ Final Kredit sales − Σ returns of those sales, per member × branch; return > sale refused |
| `payroll-settlement.ts` | ANO-K05 | Settles only instalments of NIKs in the batch matrix, due in the period, fully covered by the deduction; shortfall / no-due become exceptions for review; loans fully paid computed |
| `shu-allocation.ts` | ANO-K09 | Largest-remainder allocation: parts add up to floor(pool/unit)·unit; remainder reported; zero total / duplicate member refused |
| `journal.ts` | ANO-K10 | Balanced double entry, one side per line, not all lines on one account |

### Decisions

1. Undecided business rules are **mandatory parameters without defaults** (withdrawal policy, deduction ratio) so no code path can silently adopt an invented rule.
2. Payroll shortfall is not partially settled: it is surfaced as an exception (conservative; settlement order across multiple loans is an open business question).
3. Store-credit returns count only for sales inside the same window, so a later period can never reopen a finalised deduction.
4. BigInt via `BigInt()` constants (the shared tsconfig targets ES2017); amounts at the boundary stay integer sen like the rest of the domain.

### Verification (actual results)

| Check | Result |
|---|---|
| `packages/domain` tests | **56/56** (18 new KOSIPA tests incl. a 2,000-loan property test that found and drove the fix for annuity rounding drift at extreme rate×term) |
| Eligibility parity | 7 cases evaluated through both the new policy and the existing POS `memberCredit` — identical outcomes |
| `pnpm typecheck` / `pnpm lint` | OK / 0 errors (4 pre-existing warnings) |
| application / web tests | 24/24, 243 pass (+42 opt-in skipped) — unchanged |

### Remaining before any KOSIPA writer (activation blockers)

- TASK-003 schema objects (view/procedure definitions) → persisted-value parity for loans, savings balances, payroll matrix.
- Owner decisions BR-005 (salary ratio), BR-007 (withdrawable types/floor), BR-012 (contract expiry process), settlement order for payroll shortfalls.
- Single-writer cutover per context (MIG-002); legacy menus are not changed by engineering.

### Next eligible checkpoint

Checkpoint 3 — KOSIPA read-first access on **local staging only**: `TASK-020` (console tables in the auth store: identity link, action policy, audit), `TASK-021` (dedicated read-only reader + deployment-guard target), `TASK-022` (identity-link admin + KOSIPA capabilities derived from `ref_menu_akses`), then `TASK-024` (Anggota 360) using the Checkpoint 2 domain. Production DDL/grants only as review-only SQL.

---

## Checkpoint 3 — Console store, identity links, KOSIPA read-only, Anggota 360 (TASK-020, 021, 022, 024 + partial 025/026)

**Status:** IMPLEMENTED and VERIFIED (local: unit + local-staging DB + browser on synthetic data). **Not** STAGING ACCEPTED, **not** PRODUCTION READY.
**Owner decision applied (16 Oct 2026): Option B** — dedicated console database. Authorises local/staging work and production *artifacts* only.

### Delivered

| Area | What |
|---|---|
| Console DB (`apps/web/db/console/`) | `001_console_schema.sql` (2 tables: `console_identity_link`, `console_audit_event`; unique active-link keys; CHECKs; 4 triggers: audit append-only, links revoke-only/no-delete), `002_console_grants.sql.tpl` (`kkisi_console`: SELECT+INSERT, UPDATE only on 4 revocation columns, no DELETE/DDL, MAX_USER_CONNECTIONS 2), `003_verify.sql.tpl`; `scripts/setup-console-store.sh` (`--apply`, `--verify`, `--prove-triggers`) |
| Production artifact (review-only) | `docs/migration/sql/console-store-production.sql` — operator steps, DDL, verification, rollback, evolution notes. **Not executed.** |
| Connection safety | `deployment-guard.ts`: new `console` target (full allowlist; third account AND database; pool ≤ 4, here 1); `startup-check.ts`: verifies selected DB/server identity, exactly 2 tables, no DDL, no privileges on legacy/auth DBs (incl. `*.*`); readiness reports `consoleDb` separately and never fails TOKO readiness |
| Domain / application | `console/{capabilities,kosipa-access,identity-link}.ts`, `kosipa/masking.ts`, `application/console/{identity-links,resolve-capabilities}`, `application/kosipa/member-360.ts` |
| Infrastructure | `prisma-console.ts`, `console/{config,console-store,kosipa-directory,services,identity-handlers}.ts`, `repositories/kosipa-member.repository.ts` |
| API / pages | `POST /api/console/identity-links`, `POST …/{id}/revoke`, capabilities API now returns `kosipa` state; `/console/settings/identitas`, `/console/kosipa/anggota`, `/console/kosipa/anggota/[id]`, console `not-found` |
| Flags | `KOSIPA_READ_ENABLED` (off by default; also needs `CONSOLE_ENABLED` and a usable console store) |
| Test infra | `db/e2e/003_e2e_kosipa_structure.sql`, `scripts/e2e-kosipa-extend.sh`, seed/cleanup/guards extended for 11 KOSIPA-shaped synthetic tables |
| Separate repair | `tests/e2e-local.mjs` updated for the current POS UI (own commit `effb4283`) |

### Business rules and security enforced

- **No automatic identity matching.** A link is created only by an administrator (`iam.link.manage` = `users_edit` **and** role ≤ 2) for another, active console user and an active KOSIPA account that has ≥1 active access group. Self-link, duplicates (both sides), inactive accounts refused — enforced in the use case **and** by unique keys/CHECK in the DB (concurrent duplicate → `ALREADY_LINKED`).
- **KOSIPA capabilities are view-only and ⊆ legacy access**: active link → active KOSIPA account → controllers it may open (`ref_menu_akses`) → view capabilities; deactivating the KOSIPA account or revoking the link removes access on the next request. Detail tabs require the member directory.
- **Audit:** link create/revoke, refusals, and every Anggota 360 view; written **before** member data is read (audit failure stops the read); detail is an allow-listed flat object (no NIK/name/contact keys); subjects are opaque ids. Append-only by trigger (proven as root inside rolled-back transactions).
- **Fail closed:** console store/KOSIPA read failure removes only KOSIPA (state `unavailable`, link admin 503); TOKO and readiness are unaffected (browser-proven).
- **Anggota 360:** read-only; contact/bank masked; salary, address, KTP never selected; savings shown as recorded movements by header status with an explicit "bukan saldo resmi" notice; Kredit usage uses the exact POS query and return offset; expired-contract members show usage but no limit.
- **Honest gaps:** instalment detail and payroll deductions return `unavailable: INDEX_REQUIRED` and are deliberately not queried (scan-test enforced) until the index review is decided. **Correction (Checkpoint 5):** the earlier sizes "~3.5M / ~1.2M rows" were `AUTO_INCREMENT` counters; measured rows are 1,198,697 and 84,924, and "only primary keys in production" is established only for the 30 Sep dump (current production state is unverified). See `index-proposal.md`. All KOSIPA statements are time-capped (`max_statement_time=5`).
- **Reader pool:** page reads are sequential (peak 1 reader connection per view; tested), because the reader pool (3–4) is shared with POS checkout.

### Verification (actual, 16 Oct 2026)

| Check | Result |
|---|---|
| `pnpm lint` | 0 errors (4 pre-existing warnings) |
| `pnpm typecheck` | OK |
| `pnpm test` | domain **61/61**, application **36/36**, web **253 pass / 0 fail** (+45 opt-in DB tests skipped) |
| `pnpm build` | OK |
| Console DB integration (`console-store-db.test.mjs`, local store, app account) | 3/3: one-active-link per side + history, self-link refused, identity rewrite/delete refused (grants + triggers), audit append-only, JSON/action CHECKs |
| `setup-console-store.sh --verify` / `--prove-triggers` | all PASS (4/4 triggers refuse as root, rolled back) |
| Auth store contract (`verify-auth-store.sh`) | **20/20 PASS, exactly 2 tables — unchanged** |
| Browser, flag on, store up (`console-kosipa-browser.mjs`) | PASS: link/duplicate/own-account/inactive offered; linked user search + 360 content, masking, honest gaps, expired contract, empty/not-found, CSRF; unlinked cashier; revocation effective next request; audit trail contains create/denied/view/revoke with opaque subjects; no overflow at 375–1440 |
| Browser, console store unreachable | PASS: TOKO pages work, readiness `ready` with `consoleDb:false`, KOSIPA/link pages fail closed |
| Existing `pos-browser.mjs` + repaired `e2e-local.mjs` (console + KOSIPA on) | **PASS / PASS** (A–H) |

Synthetic data returned to empty (`e2e-cleanup.mjs`); console store retains append-only audit rows by design; no active links remain. No production system, legacy PHP or business data touched.

### Connection budget (recalculated)

Documented production allocation (`deploy/genesis/env.production.example`, 13 Oct 11/11): reader 3, auth 2, POS 2, register 1, returns 1, inventory 1, products 1. Console store adds **1** → **12 = `MAX_CONNECTION_BUDGET`** (leaves 8 of `max_user_connections = 20` to legacy PHP). `LEGACY_DB_CONNECTION_BUDGET` must be raised 11 → 12 **explicitly**; the startup guard refuses to start otherwise (tested). The console account is also capped server-side (`MAX_USER_CONNECTIONS 2` locally). **There is no headroom left**: any further writer/reader needs a pool redesign or fewer connections elsewhere.

### Decisions / deviations

1. Console store is the only new store; no cross-database FKs (ids by value). Auth DB untouched.
2. `kkisi_console` has no DELETE and column-limited UPDATE locally; **cPanel cannot express column grants**, so production relies on the triggers (stated in the SQL; if triggers cannot be created on the host, the console store must not be enabled).
3. Savings and loans are read from header/detail tables without the legacy `v_kartu_simpanan`/`v_saldo_awal`/`v_trans_pinjaman_*` views (definitions unavailable, TASK-003) — hence "recorded movements", not balances.
4. Payroll/instalment sections wait for reviewed indexes (SQL not yet written: needs production `EXPLAIN` evidence).
5. KOSIPA write capabilities, document transitions and member mutations remain **out of scope** (none authorised).

### Remaining blockers

**Implementation:** none for this checkpoint.
**Production activation (all manual, none done):** (1) operator runs `console-store-production.sql` after separate authorisation and confirms triggers could be created; (2) create `n1608204_nxcon` with SELECT, INSERT, UPDATE only; (3) set the `CONSOLE_DB_*`/`DATABASE_URL_CONSOLE`, raise budget to 12, restart, check startup line `console_db=… legacy_pool=12/12`; (4) TASK-003 schema-object export for savings/loan balance parity; (5) decision on the reviewed index proposal (`index-proposal.md`: two indexes on `trans_pinjaman_dtl`; none on the payroll matrix on current evidence); (6) staging UAT with real roles, then owner-approved link set; (7) `CONSOLE_ENABLED` then `KOSIPA_READ_ENABLED`.

### Rollback

Unset `KOSIPA_READ_ENABLED` (KOSIPA pages/menu vanish; TOKO untouched), then `CONSOLE_ENABLED`, then `DATABASE_URL_CONSOLE` and restore the budget to 11. Console data is kept unless the owner decides otherwise (drop SQL is in the production file).

### Next eligible checkpoint

Checkpoint 4 (no financial writes): `TASK-027` payroll read + store-credit reconciliation **after** the index review; `TASK-025`/`026` savings and loan detail parity **after** TASK-003; `TASK-028` KOSIPA reports; Warehouse reader (`TASK-060`) needs the Gudang schema export. Safe independent work available now: a reviewed index proposal from existing DDL (SQL only), and Warehouse domain modules (receipt/mapping) with unit tests.

---

## Checkpoint 4 — Warehouse domain foundation (domain/application parts of TASK-062, TASK-063; REQ-051/052/054, BR-013)

**Status:** domain + application contracts **IMPLEMENTED and VERIFIED** (unit tests and in-memory integration tests). **No** adapter, **no** database connection (Gudang or other), **no** stock mutation, **no** UI, **no** accounting. End-to-end inventory integration is **NOT** done and not claimed. Not staging accepted; not production ready.

### Delivered

| Layer | Files |
|---|---|
| Domain `packages/domain/src/warehouse/` (export `@koperasi/domain/warehouse`) | `errors`, `quantity`, `unit-conversion`, `item-mapping`, `dispatch-lines`, `shipment`, `reconciliation`, `index` |
| Application `packages/application/src/warehouse/` (export `@koperasi/application/warehouse`) | `ports` (repositories, catalog, actor, permissions, treatment policy), `mapping` (suggest/propose/confirm/retire), `shipments` (register, advance, receive, resolve, close, read), `index` |
| Tests | `packages/domain/tests/warehouse.test.mjs` (22), `packages/application/tests/warehouse-use-cases.test.mjs` (15) + `tests/helpers/warehouse-fakes.mjs` (in-memory repositories that emulate unique keys and compare-and-set, with an injectable concurrent writer) |

Design decisions are recorded in `design.md` §10b. In short: mappings are explicit propose→confirm and never name- or id-based; unit conversion needs an approved, documented, exact ratio (no factors invented); shipments are quantity-only aggregates with maker≠checker approval, idempotent receiving events, an **explicit, default-less** receiving policy (resolving BR-013 "once" vs. the owner's partial receipts), explicit handling of every shortage/rejection before closing, and deterministic reconciliation plus stable-key stock *intents*. No existing calculation engine was duplicated (the stock engine is untouched; intents are the future hand-off).

### Your 14 required scenarios → tests

| # | Scenario | Where |
|---|---|---|
| 1 | Valid mapping | domain 1, application mapping flow |
| 2 | Duplicate / ambiguous mapping | domain 2, application 12a (concurrent proposal) |
| 3 | Unknown / inactive products | domain 3, dispatch lines, mapping flow |
| 4 | Invalid unit conversion | domain 4 (+ inexact, overflow, unapproved) |
| 5 | Full receiving | domain 5, application receiving |
| 6 | Partial receiving (100/98 → 2 outstanding) | domain 6, application receiving |
| 7 | Receiving above dispatch | domain 7 (per event and cumulative, rejected counts), application |
| 8 | Duplicate receiving request | domain 8, application 8b (same intents, no write) |
| 9 | Multiple partial receipts (order-independent) | domain 9 |
| 10 | Damaged / rejected | domain 10 (reason required, never stock, must be handled to close), application discrepancy flow |
| 11 | Invalid lifecycle transition | domain 11 (+ maker–checker) |
| 12 | Concurrent request conflict via repository contracts | application 12a–12d: unique-key race (mapping and document), version conflict retried against fresh state (limit still holds), a request racing with itself becomes a replay, persistent conflict → `CONCURRENT_MODIFICATION` after exactly 3 tries, non-conflict failures not retried |
| 13 | Reconciliation after partial receipt | domain 13 (balanced, traceable, pure) |
| 14 | Terminal immutability | domain 14 (every transition, receipt and resolution refused) |

Edge cases: zero, negative, fractional and non-numeric quantities; overflow at 2,147,483,647 (including conversion and cumulative sums); missing/invalid references and keys; ambiguous live mappings; corrupted aggregates reported as `INVARIANT_VIOLATION`; inputs never mutated; branch isolation (another branch gets `NOT_FOUND` / read answers identically whether or not a document exists).

### Verification (actual, 16 Oct 2026)

| Check | Result |
|---|---|
| `pnpm lint` | 0 errors, 4 warnings (unchanged baseline) |
| `pnpm typecheck` / `pnpm build` | OK / OK |
| `pnpm test` | domain **83/83**, application **51/51**, web **253 pass / 0 fail** (+45 opt-in DB tests skipped) — Checkpoints 1–3 and TOKO tests all preserved |
| Mutation checks (to prove the tests bite) | Domain: removing the over-receipt limit, maker–checker, terminal guard, replay conflict, close-with-outstanding or branch check each fails ≥1 test. Application: removing conflict retry, mapping re-check, branch scoping (both lookups), duplicate-document check, replay short-circuit, receive/mapping permissions, warehouse scope, mapping-in-use or unique-key mapping each fails ≥1 test. (One first-pass mutant survived because it was *equivalent*, not a gap; the full removal is caught.) |

No production or legacy system, no new connection pool, no auth/console schema, and no TOKO checkout or KOSIPA logic was touched. All data is synthetic and in memory.

### Open questions / blockers (for the owner)

1. **Accounting treatment** (internal transfer vs. commercial purchase/sale) — undecided; kept out of the model. A stock/accounting writer must refuse `UNSPECIFIED`.
2. **Receiving policy per shipment** (`allowMultipleReceipts`) — who sets it, and the default for real Gudang documents. BR-013 text says "once".
3. **Unit conversions** — no factors are defined; each Gudang↔TOKO unit pair needs an approved ratio with evidence. Pack sizes (`unit_perpack`) are not modelled.
4. **Fractional quantities** — whole units only until defined.
5. **Gudang schema export** (`smart_kopkar_gudang`) — still missing (TASK-003); needed for the item catalog/reader adapter and to learn how Gudang records the dispatch (`db_sales` to a store customer) and its identifier for `sourceRef`.
6. **Warehouse permission mapping** — permission names exist as constants; wiring them into the console capability resolver needs the Gudang identity link design.

### Remaining dependencies before any live integration

Console-store tables (`warehouse_item_map`, shipment storage) via a reviewed migration; Gudang read adapter and catalog (needs #5); TOKO receiving writer with the POS lock order and its own least-privilege account (needs a connection-budget decision — the budget is already at the 12 ceiling); UI; fault-injection tests of the cross-database compensation path; UAT.

---

## Checkpoint 5 — KOSIPA index proposal (documentation and SQL artifacts only)

**Status:** DOCUMENTED. **No DDL was executed anywhere** (not production, staging or local). Measurements were read-only `SELECT`/`EXPLAIN`/`SHOW` through the SELECT-only reader on the local staging copy (30 Sep production data). Not applied, not approved, not scheduled.

### Deliverables

`index-proposal.md` (queries, evidence vs assumptions, candidate columns and order, expected plans, size and write-cost estimates, validation method, rollback), `docs/migration/sql/kosipa-read-indexes-proposed.sql` (review-only DDL with pre-check, post-check, rollback), `docs/migration/sql/kosipa-read-queries-validation.sql` (read-only before/after queries).

### What the evidence changed

| Earlier assumption | Measured |
|---|---|
| "~3.5M installment rows, ~1.2M payroll rows" | Those are `AUTO_INCREMENT` counters. Rows: **1,198,697** and **84,924** |
| Both tables need indexes | Only `trans_pinjaman_dtl` does (full scans ~190–360 ms). The payroll matrix scans in **14–65 ms**: payroll read (TASK-027) does not need to wait for an index |
| NIK lookups might need normalisation | Every distinct NIK in every KOSIPA table matches `m_anggota.nik_kar` **exactly** (93% have leading zeros), so the Checkpoint 3 exact-string reads are correct |
| Uniform data | Three NIKs hold ~80% of the installment rows (635k / 262k / 61k); 43% of rows have a zero `tgl_cicilan`; 33,136 detail rows reference no loan. Pagination is mandatory whatever is indexed |

### Recommendation

Tier 1: `trans_pinjaman_dtl (nik_kar, tgl_cicilan)` and `(doc_no, ke_cicilan)` (~75 MB, ~+38%; no maintenance on payroll status updates because those columns are not indexed). No matrix indexes now. Tier 2 (`m_anggota.nik_kar`, `db_sales.nik_kar`) left to the POS index plan owners after a production pre-check.

### Corrections made in this checkpoint

The unproven claims "tables are very large and unindexed in production" were removed from the repository comment and the member page message; the page now says the data "waits for a performance review". (Text-only change; the opt-in browser test string was updated to match, and that browser suite was not re-run for this change.)

### Open items

Production index state and `TABLE_ROWS` (pre-check SQL), identity of the three dominant NIKs (data owner), legacy write pattern on `trans_pinjaman_dtl`, view definitions (TASK-003), a staging validation run per §8 of the proposal, and the operator decision. Indexes are not required for any code in this repository to be correct.

---

## Checkpoint 6 — KOSIPA payroll read, read-only (TASK-027; REQ-025, REQ-034 read side, BR-006)

**Status vocabulary.** IMPLEMENTED: yes. VERIFIED: yes, on synthetic fixtures (`kkisi_e2e_legacy`) and by read-only smoke on the local copy of the 30 Sep 2026 data. STAGING ACCEPTED: **no** (needs the data owner to review real figures and confirm the store-column map). PRODUCTION READY: **no** (production state unverified; console store and flags are not provisioned there; nothing was run against production).

### Three figures, never mixed

| | Meaning | Source |
|---|---|---|
| **A** recorded | what the legacy matrix stored (`trans_potongan_matrix`, header `trans_potongan_bulanan`) | read as exact decimal strings, parsed to integer 1/10,000 rupiah (14% of recorded totals carry fractions of a sen), never overwritten, never "fixed" |
| **B** derived | store-credit obligation = Kredit Final sales of the previous calendar month minus Kredit returns, per member and store column | computed on the fly for review only |
| **C** difference | A − B, per member × store column, only where both sides are comparable | anomalies are carried as their own category (`NOT_COMPARABLE_ANOMALY`, unmapped branch, duplicate sale, return without sale, truncated source), never dropped |

### Delivered

- Domain `packages/domain/src/kosipa/payroll-read.ts`, `payroll-reconciliation.ts` (parsing, date classification, 59-column catalog and groups, batch integrity, derivation, reconciliation); console capability: payroll is independent of the member directory; three audit actions.
- Application `packages/application/src/kosipa/payroll.ts`: `PayrollReader` port (no write method), `listPayrollBatches`, `readPayrollBatch`, `readPayrollMember`, `readStoreReconciliation`, `loadMemberPayrollHistory`. Order everywhere: capability → input validation → audit (before any read; audit failure stops the read) → bounded reads. Anggota 360 now shows the member's recorded payroll history (optional port, `NOT_CONFIGURED` when absent).
- Adapter `apps/web/src/infrastructure/repositories/kosipa-payroll.repository.ts` on the **existing** SELECT-only reader (no new pool; budget unchanged at 12/12): every statement `SET STATEMENT max_statement_time=5`, parameterised, `LIMIT`ed, keyset-paginated (batches/history `id DESC`, rows `id ASC`), dates read as text, column names only from the domain catalog, headers and rows read by separate statements (no join can duplicate a row), `gaji_payroll` never selected.
- API (GET only): `/api/kosipa/payroll`, `/{docNo}`, `/{docNo}/anggota/{nik}`, `/{docNo}/store-reconciliation`. Pages: `/console/kosipa/payroll`, `/{docNo}`, `/{docNo}/anggota/{nik}`, `/{docNo}/rekonsiliasi`; sidebar entry available only with `kosipa.payroll.view`. No approve/post/generate control exists; the matrix procedure is never called.

### Verification (actual, 17 Oct 2026)

| Check | Result |
|---|---|
| `pnpm lint` / `typecheck` / `build` | 0 errors, 4 warnings (baseline) / OK / OK (the existing `process.exit` instrumentation warning is unchanged) |
| `pnpm test` | domain **94/94**, application **70/70**, web **258 pass / 0 fail** (+47 opt-in skipped) |
| Mutation checks (application) | removing the payroll grant, the audit, the page bound, the store-credit grant, the truncated-source guard, NIK validation, the loan grant or the history bound each fails ≥1 test (8/8 killed) |
| Opt-in DB test `kosipa-payroll-db.test.mjs` (synthetic schema, SELECT-only account) | PASS: filters, keyset, zero/9999 dates, orphan parents, duplicates, sub-sen totals, return-adjusted derivation, unmapped branch, wildcard input literal, the account cannot write, server-side time cap |
| Browser `console-payroll-browser.mjs` (built app, synthetic data) | PASS: 9 scenarios incl. list/filter/empty/invalid, batch detail + 50-row keyset, member breakdown + installment references, reconciliation A/B/C, Anggota 360 history, API codes (200/400/404/405/401/403), member-directory-only and unlinked accounts see nothing, audit trail opaque; no overflow at 375–1440; zero browser errors |
| Regression browsers | `console-browser.mjs`, `console-kosipa-browser.mjs`, `pos-browser.mjs`, `e2e-local.mjs` PASS. Flag off: payroll APIs 404 |
| Read-only smoke on the local copy of 30 Sep data | batch (161 rows) 0.4 s; reconciliation 0.35 s; member history 40 ms; heaviest member (635k installment rows): installment summary 0.56 s, month list 0.17 s, history 0.24 s: all under the 5 s cap |

### Data anomalies observed (30 Sep copy; production not verified)

35 of 84,924 matrix rows have total ≠ sum of the 59 components; 5 headers have total ≠ sum of rows; 3 headers have no rows; 4 duplicate (batch, NIK) pairs; 14% of totals carry sub-sen precision; a member can sit in two batches of the same period (the comparison is period-level for this reason); header `kd_group` is not a reliable membership key; `potongan_toko` is a redundant subtotal (never added again); installment due dates: zero dates on ~43% of rows and the placeholder `9999-12-10` on many (counted, never placed in a month); detail rows with no loan parent (orphans reported); `db_salesreturn` is empty on the staging copy, so return-adjusted derivation is proven on synthetic fixtures only.

### Limitations and open items

1. **TOKO column ↔ branch map is empirical** (company 1/2/3 → `TOKO_TAMBUN`/`TOKO_MJ`/`TOKO_GIIC` matched on the 30 Sep data). Until the process owner confirms it the reconciliation is labelled review-only; one line in `DEFAULT_STORE_COLUMN_MAP` changes when confirmed.
2. Reconciliation depends on the previous-month window (BR-006) and refuses to compare when the period is ambiguous or the source exceeds the 60,000-row cap, rather than inventing differences.
3. `trans_pinjaman_dtl` and `trans_potongan_matrix` reads are scans (no secondary index in the dump); measured within the cap. The index proposal stays deferred and was **not** executed.
4. Not delivered here: matrix generation (the replacement for the legacy procedure stays in TASK-045 behind its own approval), settlement, any write.
5. Anggota 360 "Rincian angsuran" stays gated; payroll history there is read with the member view audit.

### Next eligible checkpoint (recommendation)

**TASK-026 read side**: loan list/detail/schedule pages using the same patterns (the installment reads were measured within the cap even for the heaviest member). Balances/outstanding stay pending TASK-003 view definitions. Alternatives: index staging validation (separate task), Warehouse adapters (blocked on the Gudang schema export).

---

## Checkpoint 7 — KOSIPA loan read, read-only (TASK-026 read side; REQ-024, BR-004 read aspects) + payroll semantic correction

**Status vocabulary.** IMPLEMENTED: yes. VERIFIED: yes (synthetic fixtures; read-only smoke on the local copy of the 30 Sep data). STAGING ACCEPTED: **no**. PRODUCTION READY: **no**. The **official outstanding balance is not delivered**: it is a first-class `unavailable / OFFICIAL_BALANCE_UNVERIFIED` state in the model, API and UI until the legacy balance views are verified (TASK-003).

### Delivered

- Domain `packages/domain/src/kosipa/loan-read.ts`: filter/cursor validation, status-flag rules, header description (exact amounts, labelled dates), schedule integrity (`assessSchedule`) and row description. Audit actions `kosipa.loan.list.view`, `kosipa.loan.detail.view`.
- Application `packages/application/src/kosipa/loans.ts`: `LoanReader` port (4 read methods, no write), `listLoans`, `readLoan`. Capability → validation → audit (before any read) → bounded reads. An outage in the schedule leaves the header visible with an explicit `READ_FAILED` schedule; an unparsable stored amount surfaces as `AMOUNT_INVALID` (HTTP 502), never as zero.
- Adapter `apps/web/src/infrastructure/repositories/kosipa-loan.repository.ts` on the existing SELECT-only reader (no new pool; 12/12 unchanged): 5 s time cap, parameterised, `LIMIT`ed, keyset (`id DESC` for the list; `(COALESCE(ke_cicilan,0), id)` for the schedule), one bounded aggregate for the integrity sums, headers and rows in separate statements, dates as text. Salary (`gaji_pokok`), bank account and approver user names are never selected.
- API (GET only): `/api/kosipa/loans`, `/api/kosipa/loans/{docNo}`. Pages `/console/kosipa/pinjaman`, `/console/kosipa/pinjaman/{docNo}`; the sidebar entry is available only with `kosipa.loan.view`; Anggota 360 links each loan to its detail. The gate shared with payroll moved to `console/kosipa-http.ts` (flag → session guard → server-side capabilities); the route-guard scan now verifies that gate's order.
- Payroll semantic correction (owner directive): the reconciliation page states that **A−B is informational, not automatically an error**, that the comparison is per component (`TOKO_*` columns vs derived Kredit net of returns, never total deductions), and uses “selisih informasi”. The branch map is now an explicit boundary: `KOSIPA_STORE_COLUMN_MAP` (JSON, `basis: OWNER_CONFIRMED`) is the only way to leave the empirical default; malformed or ambiguous values fall back to it. Reconciliation stays review-only until the owner supplies it.

### Evidence from the 30 Sep copy that shaped the rules (production unverified)

32,631 loan headers, 7 `doc_no` values used by two headers; status combinations that contradict each other exist (17 REJECTED yet LUNAS); `actual_*` columns are unused (0) while `plan_*` are the working figures; for a 1,793-loan APPROVED sample Σ pokok = `plan_pinjaman` and row count = `plan_jangka_waktu` in 100%, and the few larger imported loans differ by under Rp 1 (2-decimal rounding), which is reported as an exact difference; `tgl_bayar` is **never** filled (242k paid rows), so a missing paid date is a shown fact, not an anomaly; zero and `9999-12-10` due dates are common and are counted and labelled, never placed in a month.

### Verification (actual, 17 Oct 2026)

| Check | Result |
|---|---|
| `pnpm lint` / `typecheck` / `build` | 0 errors, 4 warnings (baseline) / OK / OK |
| `pnpm test` | domain **101/101**, application **81/81**, web **264 pass / 0 fail** (+48 opt-in skipped) |
| Mutation checks (loans) | removing the capability check, audit, list bound, schedule bound, cursor, duplicate-header display, parse-error propagation, or replacing the balance state each fails ≥1 test (8/8 killed; one survivor was found and closed with a new test) |
| Opt-in DB tests (synthetic schema, SELECT-only account) | loans and payroll PASS, including a 70-row schedule paged 60 + 10 without overlap and the account's inability to write |
| Browser `console-loans-browser.mjs` | PASS: list/filters/search/invalid/empty, detail integrity notes, keyset paging, anomalies (messy schedule, duplicate header, missing schedule, rejected-but-settled), 360 → detail link, API codes, isolation (member-only and unlinked accounts), audit trail opaque; no overflow 375–1440; no browser errors |
| Regression | payroll, Anggota 360, console shell, POS, `e2e-local` browser suites PASS; flag-off 404 for API routes |
| Read-only smoke on the local copy | loan list 40–90 ms; detail 340–520 ms (one 1.8 s cold); 180-row schedule paged 60 per request; all under the 5 s cap |

### Limits and open items

1. Official outstanding/balance: blocked on TASK-003 (view definitions) — **release blocker for any balance display**.
2. Installment reads by `doc_no` / `nik_kar` are scans (no index in the dump; production unverified); measured within the cap, index proposal still deferred and **not** executed.
3. Loan origination, approval, disbursement, repayment, settlement (TASK-043/044/045) are not started: they need the writer-readiness gate (owner policy for the 70% salary rule, interest/rounding confirmation, single-writer enforcement). No writer exists or is enabled.
4. See `decision-register.md` for the consolidated owner decisions and blockers.

---

## Checkpoint 8 — KOSIPA savings ledger read, read-only (TASK-025 read side; REQ-023)

**Status vocabulary.** IMPLEMENTED: yes. VERIFIED: yes (synthetic fixtures; read-only smoke on the local 30 Sep copy). STAGING ACCEPTED: **no**. PRODUCTION READY: **no**. **No savings balance is stated anywhere** (`OFFICIAL_BALANCE_UNVERIFIED` is always present in the model, API and UI).

### Evidence that shaped the rules (30 Sep copy; production unverified)

The detail column `saldo` is `0` in 100% of 7,921 recent rows, so there is no recorded per-row balance to show. The detail `doc_status` is empty or different from the header in ~54% of those rows, so the **header status is authoritative** (APPROVED → posted, OPEN → pending, any other → void; same mapping as Anggota 360). 11 headers are `jenis_transaksi = 'SALDO AWAL'` (opening entries): shown and labelled, but opening-balance semantics are unverified, so the per-type sums are **movement sums, not balances**. No duplicated header `doc_no` and no orphan movement exist on that copy; the code nevertheless reports duplicates (`HEADER_AMBIGUOUS`) and missing headers (`HEADER_MISSING`) as UNVERIFIED and never counts them as posted. The heaviest member has ~240 movements.

### Delivered

- Domain `savings-read.ts`: query/id validation, header-status state mapping, `describeMovement` (exact amounts, labelled dates, flags `HEADER_MISSING`, `HEADER_AMBIGUOUS`, `DETAIL_STATUS_DIFFERS`, `DATE_UNUSABLE`, `NEGATIVE_AMOUNT`), `summarizeTypes`. Audit action `kosipa.savings.view`.
- Application `savings.ts`: `SavingsReader` port (3 read methods, no write), `readMemberSavings` (needs `kosipa.savings.view` **and** `kosipa.member.view`; validation → audit before any read → sequential bounded reads; sections fail independently with explicit `READ_FAILED`; unusable NIK → `MEMBER_NIK_UNUSABLE`, never guessed).
- Adapter `kosipa-savings.repository.ts` on the existing SELECT-only reader: 5 s cap, parameterised, keyset by row id, 50 + 1 rows, movement page and header lookup as separate statements, `saldo` never selected.
- API `GET /api/kosipa/savings/{memberId}`; pages `/console/kosipa/simpanan` (member search) and `/console/kosipa/simpanan/{id}` (summary + ledger with type filter and "load more"); sidebar entry available only with `kosipa.savings.view`; Anggota 360 links to the full ledger.

### Verification (actual, 17 Oct 2026)

| Check | Result |
|---|---|
| `pnpm lint` / `typecheck` / `build` | 0 errors, 4 warnings (baseline) / OK / OK |
| `pnpm test` | domain **106/106**, application **88/88**, web **267 pass / 0 fail** (+49 opt-in skipped) |
| Mutation checks (savings) | removing the member grant, audit, page bound, cursor, type filter, balance state, parse-error propagation, the unverified bucket or the header-wins rule each fails ≥1 test (9/9 killed after closing one survivor with a ledger-only test) |
| Opt-in DB test (synthetic schema, SELECT-only) | PASS: exact sums incl. cash credit and sub-unit interest, 66 movements paged 50 + 16 without overlap, POSTING treated as other status, duplicate / missing headers unverified, header beats detail status, zero date and opening entry labelled, member isolation, no write |
| Browser `console-savings-browser.mjs` | PASS: search → ledger, honest balance notice, per-type sums, 50-row keyset paging, type filter, empty / invalid / unknown member, 360 link, API codes, isolation (member-only and unlinked accounts), opaque audit; no overflow 375–1440; no browser errors |
| Regression | loans, payroll, Anggota 360, console shell, POS and `e2e-local` browser suites PASS; loans/payroll DB tests PASS |

### Limits and open items

1. Official savings balance and opening-balance semantics: blocked on TASK-003 (view definitions) — **release blocker for any balance display and for any withdrawal check against a balance**.
2. Reads by `nik_kar` are scans (no index in the dump; production unverified); measured within the cap on the synthetic and local copies; the index proposal stays deferred and **not** executed.
3. Deposits, withdrawals, approvals and ledger posting (TASK-044) are **not** started: owner decision D2 (withdrawable types, minimums) and a verified balance/ledger design are prerequisites; no writer exists or is enabled.

