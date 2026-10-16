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
| TASK-025, 026 | PARTIAL | Read of movements/loan headers only; balances and instalment detail wait for TASK-003 / index review |
| TASK-027 … | NOT STARTED | Payroll read needs the index review |

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
- **Honest gaps:** instalment detail and payroll deductions return `unavailable: INDEX_REQUIRED` because `trans_pinjaman_dtl` (~3.5M rows) and `trans_potongan_matrix` (~1.2M rows) have only primary keys in production; they are deliberately not queried (scan-test enforced). All KOSIPA statements are time-capped (`max_statement_time=5`).
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
**Production activation (all manual, none done):** (1) operator runs `console-store-production.sql` after separate authorisation and confirms triggers could be created; (2) create `n1608204_nxcon` with SELECT, INSERT, UPDATE only; (3) set the `CONSOLE_DB_*`/`DATABASE_URL_CONSOLE`, raise budget to 12, restart, check startup line `console_db=… legacy_pool=12/12`; (4) TASK-003 schema-object export for savings/loan balance parity; (5) reviewed index plan for `trans_pinjaman_dtl`/`trans_potongan_matrix`/`m_anggota.nik_kar`/`trans_simpanan_dtl.nik_kar`/`trans_pinjaman.nik`; (6) staging UAT with real roles, then owner-approved link set; (7) `CONSOLE_ENABLED` then `KOSIPA_READ_ENABLED`.

### Rollback

Unset `KOSIPA_READ_ENABLED` (KOSIPA pages/menu vanish; TOKO untouched), then `CONSOLE_ENABLED`, then `DATABASE_URL_CONSOLE` and restore the budget to 11. Console data is kept unless the owner decides otherwise (drop SQL is in the production file).

### Next eligible checkpoint

Checkpoint 4 (no financial writes): `TASK-027` payroll read + store-credit reconciliation **after** the index review; `TASK-025`/`026` savings and loan detail parity **after** TASK-003; `TASK-028` KOSIPA reports; Warehouse reader (`TASK-060`) needs the Gudang schema export. Safe independent work available now: a reviewed index proposal from existing DDL (SQL only), and Warehouse domain modules (receipt/mapping) with unit tests.
