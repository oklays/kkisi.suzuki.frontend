# 01 — Audit and screen inventory

Date: 9 November 2026 · Branch: `feat/mobile-kkisi-pwa` (from `master` 46222bd6)

## 1. Monorepo as found

| Item | Finding |
|---|---|
| Package manager | pnpm 10.0.0 workspaces (`apps/*`, `packages/*`), lockfile v9 with private Nexus tarball URLs |
| Apps | `apps/web` — Next.js 16.3.7 (Turbopack, App Router), React 19.2, TypeScript 5.9; console, POS, inventory, KOSIPA. Legacy CodeIgniter apps live outside the workspace |
| Shared packages | `@koperasi/domain` (pure rules: money, auth policy, KOSIPA savings/loan/payroll/SHU, POS credit), `@koperasi/application` (use cases over ports) |
| Data access | Prisma 6.12 in `apps/web` for POS tables; KOSIPA reads are raw parameterised SQL through a SELECT-only reader (`apps/web/src/infrastructure/repositories/kosipa-*.repository.ts`), each statement `SET STATEMENT max_statement_time=5` and LIMITed |
| Auth (console) | Staff only (`db_users`): opaque session id, HMAC-hashed in a separate auth DB, `__Host-` cookie, Origin + JSON CSRF layers, bcrypt in worker threads, throttle store. Not usable for members |
| Tests | `node --test` with `--experimental-strip-types` (`tests/*.test.mjs`); browser checks with the `playwright` library (no test runner) |
| Lint | one root `eslint.config.mjs` (next core-web-vitals + typescript) resolved from `apps/web` |
| Deploy | `deploy/genesis`: Docker image per app (`next start`), own compose project, loopback port behind host nginx, DB through an SSH-tunnel sidecar; production DB on Niagahoster cPanel (database-level grants only) |
| Existing member route | `apps/web/src/app/anggota` — a "segera hadir" placeholder; left untouched |

## 2. Member identity (verified)

The member mobile backend that exists today is **smartkkisi** (Laravel 8, Passport) on the shared database. Its `users` table is the member login account; `users.nik` (unique) links to KOSIPA `m_anggota.nik_kar`.

Aggregate format check on the 30 Sep 2026 dump (counts only; no value was printed):

| Column | Result (1,189 rows) | Consequence |
|---|---|---|
| `users.password` | 100 % bcrypt `$2y$` | verified with bcryptjs in worker threads |
| `users.pin` | 100 % **plain 4 digits** | PIN step uses 4 digits (mockup shows 6); constant-time comparison; plaintext storage reported as a legacy weakness, not changed |
| `users.is_active` | 930 active / 259 inactive | inactive accounts refused |
| `users.is_delete` | 290 set to 1 | deleted accounts refused |
| `users.password_hit` | exists | **never selected** by the PWA |

The smartkkisi source code is not available, so its API/token contract cannot be reused; the PWA authenticates against the same account data instead (see 05).

## 3. Mockup investigation

`S-MART_KKISI_TB2_Mockup_PWA Anggota.html` (3.8 MB) is a bundled export: a navigation runtime plus **22 gzip-packed pages** in a `__bundler/manifest`, an injected "bridge" script per page, embedded fonts and the landscape logo. Every page was unpacked and read in full (HTML, CSS, scripts, dialogs); the bridge script defines the real cross-page flows (PIN step, completion sheets, cart/service hand-over).

### Screen inventory

| # | Screen (mockup id) | Entry | Interactions | Data | Source used | Auth | Status |
|---|---|---|---|---|---|---|---|
| 1 | Masuk (`masuk`) | start, logout | identity+password form, show password, lupa password, daftar, tamu | — | smartkkisi `users` | public | Implemented |
| 2 | PIN (`pin`) | after password | keypad, keyboard digits, hapus, lupa PIN, back | — | `users.pin` | PIN-stage session | Implemented (4 digits) |
| 3 | Beranda (`beranda`) | nav, after PIN | privacy eye, QR, notification bell, service grid, all-services sheet, carousel, coop grid, reminders, store card | savings, loan, deductions, SHU, credit, notices | KOSIPA + TOKO + smartkkisi | member | Implemented |
| 4 | Simpanan (`simpanan`) | Beranda, coop grid | 4 tabs, type list, type picker sheet, mutations, change deduction | savings ledger, active deductions, requests, withdrawals | `trans_simpanan(_dtl)`, `m_simpanan_aktif`, `trans_simpanan_pengajuan`, `trans_simpanan_penarikan` | member | Implemented |
| 5 | Pinjaman (`pinjaman`) | Beranda, reminders | 2 tabs, privacy, installment timeline, application sheet, simulasi, ajukan | loan header + schedule, applications | `trans_pinjaman(_dtl)`, `trans_pinjaman_pengajuan` | member | Implemented |
| 6 | Ajukan Pinjaman (`pengajuan-pinjaman`) | Pinjaman | form, simulation, lanjut | loan products | `m_pinjaman_mobile` + `m_jenis_pinjaman` | member | Implemented; submission **blocked** (no approved writer) |
| 7 | Saldo Kredit Toko (`saldo`) | nav | privacy, disclosure cards | limit, usage, month purchases | `m_anggota`, `db_sales`, `db_salesreturn` | member | Implemented (online channel detail unavailable) |
| 8 | Favorit (`favorit`) | nav | product cards, remove/undo | wishlist | smartkkisi `wishlists`, `products` | member | Implemented read-only (remove needs a writer) |
| 9 | Transaksi (`transaksi`) | nav | 4 filters, reset, detail sheet | sales + orders | `db_sales`, `orders` | member | Implemented |
| 10 | Lainnya (`lainnya`) | nav | profile, QR, address, security, ticket, WhatsApp, FAQ, legal, settings, logout | profile, FAQ | `m_anggota`, `faqs` | member | Implemented; QR/ticket/WhatsApp/password-change are truthful "not available" |
| 11 | Potongan (`potongan`) | coop grid | privacy, components, other periods, ajukan | payroll rows + batch headers | `trans_potongan_matrix`, `trans_potongan_bulanan` | member | Implemented |
| 12 | Pengajuan Potongan (`pengajuan-potongan`) | Potongan, Simpanan | form, validation, consent | current deduction | `m_simpanan_aktif`, `m_anggota` | member | Implemented; submission **blocked** |
| 13 | SHU (`shu`) | coop grid | year tabs, privacy | SHU per year | `trans_shu`, `trans_shu_dtl` (published only) | member | Implemented |
| 14 | Belanja (`belanja`) | grid, promo, store card | search, category, sort, load more, add/stepper, cart sheet, checkout | catalog | `db_items`, `db_category`, `db_units` | member | Implemented |
| 15 | Checkout Toko (`checkout`) | Belanja | stepper, address, coupon, payment choice, pay with PIN | cart prices, credit | server re-priced | member | Implemented; order submission **blocked** |
| 16–21 | Pulsa, Token, Paket Data, Pascabayar, Air PDAM, Internet | grid, all-services | account input, contact picker, nominal/bill selection | — | none (IAK PPOB not exposed to members) | member | Form + validation implemented; products/prices **externally dependent** |
| 22 | Checkout Layanan (`checkout-layanan`) | service screens | review, pay | — | none | member | Empty state only (externally dependent) |

Hidden states also covered: empty, loading, error, offline, update available, install prompt (Android + iOS), PIN lockout, session expiry, inactive account.

## 4. Implementation risks found

| Risk | Detail | Handling |
|---|---|---|
| No official balances | The domain marks savings and loan balances `OFFICIAL_BALANCE_UNVERIFIED` | Screens show "tercatat" sums of approved movements / unpaid schedule rows, labelled as such |
| Unindexed member scans | `trans_simpanan_dtl`, `trans_pinjaman_dtl`, `trans_potongan_matrix` have no `nik_kar` index (30 Sep dump) | every statement capped at 5 s; failure renders "belum dapat dimuat"; index decision pending (`docs/superpowers/specs/unified-console-kosipa-warehouse/index-proposal.md`) |
| Shared reader server | POS checkout shares the production DB | pool of 2 connections per process, queue limit 20 |
| Plain PINs | legacy stores 4-digit PINs in clear | constant-time compare; bcrypt PINs also accepted when legacy migrates |
| No member write contract | applications, orders and PPOB purchases have no approved writer for the PWA | forms validate and summarise, then state plainly that nothing was sent |

## 5. Component boundaries chosen

Route layer (`src/app`) → feature modules (`src/features/<feature>/{components,services}`) → shared UI (`src/components`) → server adapters (`src/server`) → `@koperasi/domain` / `@koperasi/application`. Details in 02.
