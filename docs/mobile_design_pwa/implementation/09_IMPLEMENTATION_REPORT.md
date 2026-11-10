# 09 — Implementation report

## Summary

`apps/mobile_kkisi` is a working, installable PWA for cooperative members, built from the approved mockup and connected to the real data model. Members sign in with their existing S-MART account (password + PIN) and see their own savings, loans and installment schedule, payroll deductions, SHU, store credit, transactions, favourites and the live store catalog, each computed with the rules the KOSIPA console already uses. Flows that would change data (loan application, deduction change, store order, PPOB purchase, password/PIN change) are fully built as forms with validation but **do not submit**: no approved member write path exists, and the screens say so plainly.

**Verdict: IMPLEMENTED — EXTERNAL INTEGRATION REQUIRED.** The read-only member app is complete and tested; production needs the database accounts, DNS/TLS and an index decision (owner actions), and the write/PPOB features need contracts that do not exist yet.

## Screens

| Screen | Route | Data | Tests | State |
|---|---|---|---|---|
| Masuk | `/masuk` | smartkkisi `users` | unit, integration, E2E | done |
| PIN | `/pin` | `users.pin` (4 digits) | unit, integration, E2E | done (4 dots, documented) |
| Beranda | `/beranda` | savings, loan, deductions, SHU, credit, notices | E2E, visual | done |
| Simpanan (4 tabs) | `/simpanan` | ledger, deductions, requests, withdrawals | integration, E2E, visual | done |
| Pinjaman (2 tabs) | `/pinjaman` | header, schedule, applications | integration, E2E, visual | done |
| Ajukan Pinjaman | `/pinjaman/ajukan` | Master Pinjaman Mobile + domain simulation | unit, E2E | done; submit blocked |
| Saldo Kredit Toko | `/saldo` | POS credit rule | unit, integration, visual | done; online-channel detail unavailable |
| Favorit | `/favorit` | smartkkisi wishlist | integration | read-only |
| Transaksi | `/transaksi` | POS sales + orders | unit, E2E | done |
| Lainnya | `/lainnya` | profile, FAQ | E2E | done; QR/help/password change are truthful placeholders |
| Potongan | `/potongan` | payroll matrix + batch headers | integration, visual | done |
| Pengajuan Potongan | `/potongan/ajukan` | recorded deduction | unit, E2E | done; submit blocked |
| SHU | `/shu` | published SHU | unit, integration | done |
| Belanja | `/belanja` | live catalog | integration, E2E | done |
| Checkout Toko | `/belanja/checkout` | server re-priced cart, real credit | E2E | done; order blocked |
| Pulsa, Token, Paket Data, Pascabayar, Air PDAM, Internet | `/layanan/[id]` | none (IAK not exposed) | unit, E2E | form + validation; products/prices external |
| Checkout Layanan | `/layanan/checkout` | — | smoke | empty state (external) |

## Definition of Done

| Item | Status | Evidence |
|---|---|---|
| App exists and is a workspace member | ✅ | `pnpm-workspace.yaml` (`apps/*`), lockfile importer, root `mobile:*` scripts |
| Runs locally | ✅ | `dev:synthetic` |
| Production build | ✅ | with and without env; Docker image builds and runs hardened |
| All mockup screens implemented or documented as dependent | ✅ | 22/22 (table above) |
| Visual fidelity | ✅ | `screenshots/comparison/` (19 screens); deviations listed in 07 |
| No monolithic screens; reusable components; clean feature boundaries | ✅ | 02, 04 |
| Navigation, refresh, deep links | ✅ | E2E |
| Mobile responsiveness | ✅ | no overflow at 320–430 px (E2E) |
| Authentication integrated | ✅ (code) / ⏳ (production accounts) | smartkkisi accounts; production DSNs not provisioned |
| Server-side member authorization | ✅ | session-scoped reads; IDOR tests |
| Real backend data used | ✅ | every screen reads the legacy schema (synthetic copy in tests) |
| No mock financial data shown as real | ✅ | no sample amounts anywhere; PPOB shows no prices |
| Loading, empty, error, offline states | ✅ | skeletons, empty/unavailable states, offline page + banner |
| Manifest and icons | ✅ | E2E manifest/icon checks |
| Service worker registration | ✅ | E2E |
| Sensitive data excluded from SW caches | ✅ | unit policy tests + E2E Cache Storage audit |
| Install and update UX | ✅ | Android prompt, iOS instructions, update toast |
| Unit and integration checks | ✅ | 24/24, 15/15 |
| E2E navigation | ✅ | 25/25 |
| Workspace regression | ✅ | `pnpm -r test`, `pnpm typecheck`, `pnpm lint`, apps/web build |
| Deployment readiness documented | ✅ | 08 + `deploy/mobile_kkisi` |
| No unrelated functionality broken | ✅ | apps/web untouched; shared changes limited to lint config, root scripts, lockfile importer |
| Production-ready | ❌ not claimed | open items below |

## Changed files

Modified (shared, minimal):
* `eslint.config.mjs` — lints `apps/mobile_kkisi` with the same Next rules; forbids importing `apps/web` code.
* `package.json` — `mobile:*` scripts.
* `pnpm-lock.yaml` — +42 lines: the new importer only (existing resolutions and Nexus URLs unchanged; `--frozen-lockfile` passes).

New:
* `apps/mobile_kkisi/**` — the app (112 source files), `db/auth/001_member_auth.sql`, `db/fixtures/legacy-schema.sql` (DDL only), `integration/` (synthetic stack), `tests/{unit,integration,e2e}`, `scripts/generate-icons.mjs`, `public/` (icons, logo, offline page), README, `.env.example`.
* `deploy/mobile_kkisi/` — Dockerfile (+ dockerignore), compose, env template, nginx site.
* `docs/migration/sql/mobile-member-pwa-production.sql` — review-only DB preparation.
* `docs/mobile_design_pwa/implementation/01…09`, `screenshots/comparison/*.png`.

`apps/mobile_kkisi/AGENTS.md` and `CLAUDE.md` are generated by `next dev` (same as `apps/web`).

## Outstanding issues

| # | Severity | Issue | Impact | Next action (owner) |
|---|---|---|---|---|
| 1 | High | Production DB accounts and session database not provisioned | app cannot log anyone in on production | run `docs/migration/sql/mobile-member-pwa-production.sql` via cPanel |
| 2 | High | DNS + TLS for `app.kkisitb2.id` | not reachable/installable | create the record, issue the certificate (08 §4–5) |
| 3 | High | Unindexed member reads (`trans_simpanan_dtl`, `trans_pinjaman_dtl`, `trans_potongan_matrix`) | slow or "belum dapat dimuat" screens under load; load on the shared POS server | decide the index proposal before go-live |
| 4 | Medium | Legacy PINs stored in plain text (smartkkisi) | credential exposure risk in the shared DB | migrate to hashed PINs in smartkkisi (the PWA already accepts bcrypt PINs) |
| 5 | Medium | No member write contracts (loan application, deduction change, orders) | members still apply via the cooperative | specify and approve writers per flow (same pattern as `*-writer-production.sql`) |
| 6 | Medium | PPOB (IAK) not exposed to members | service screens show no products | define a server-side PPOB contract with pricing and idempotent payment |
| 7 | Low | Password/PIN reset and registration | guidance only | needs smartkkisi flows or a new approved flow |
| 8 | Low | QR member ID format, official WhatsApp, legal texts | placeholders | cooperative to provide |
| 9 | Low | CSP allows inline scripts (Next bootstrap) | defence-in-depth only | add a nonce proxy |
| 10 | Low | No physical-device or Lighthouse run | unverified on real iOS/Android | test on devices after DNS/TLS |

Nothing was committed, pushed, merged or deployed. Work is on branch `feat/mobile-kkisi-pwa`.
