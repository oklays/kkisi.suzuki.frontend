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
| TASK-020 … | NOT STARTED | Next checkpoints |

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
