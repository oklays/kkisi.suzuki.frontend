# 15 — User Acceptance Testing & Verification Report (WS-05 & WS-07)

## 1. Automated Verification Summary

| Test Suite | Command | Result | Coverage |
|---|---|---|---|
| **Unit Tests** (`apps/mobile_kkisi`) | `pnpm --filter @koperasi/mobile-kkisi test` | **29/29 PASS** | Auth stages, `scrypt-p` PIN hashing & shadow upgrade, cross-session PIN lockout, `resolveMemberIdentity` duplicate-NIK fail-closed, env/feature-flag validation, CSRF/IP headers, financial reconciliation (`savings`, `loans`, `store-credit`, `deductions`, `shu`), service worker cache policy & simulated worker fetch routing. |
| **Database Integration Tests** (`kkisi-mobile-test` MariaDB 11.4) | `pnpm --filter @koperasi/mobile-kkisi test:integration` | **17/17 PASS** | End-to-end SQL auth, session rotation, account deactivation revocation, least-privilege `mobile_reader` write denial, IDOR cross-member isolation, duplicate active NIK rejection, shadow PIN credential persistence in `kkisi_member_auth.member_pin_credentials`, and `MemberMutationService` feature-flag + idempotency ledger enforcement with `mobile_writer`. |
| **End-to-End Browser UAT** (Playwright Chromium against production build) | `pnpm --filter @koperasi/mobile-kkisi test:e2e` | **26/26 PASS** | Unauthenticated deep-link redirect, 401 API guard, login + PIN pad + session cookie flags, CSP/no-store headers, bottom nav, back/forward navigation, privacy amount masking, loan simulation & submission notice, deduction validation, catalog search & server-priced checkout, URL transaction filters, PPOB number validation, QR & FAQ sheets, IDOR checks, `/health?check=ready` + BFF mutation CSRF/feature-flag enforcement, PWA manifest/icons, SW cache inspection, offline fallback & auto-recovery, 320/360/390/430 px responsive overflow checks, accessibility (`h1` & named controls), and logout revocation. |
| **Monorepo Regression Tests** | `pnpm -r test` | **100% PASS** | `@koperasi/domain` (407/407), `@koperasi/application` (233/233), `apps/web` (559/559), `@koperasi/mobile-kkisi` (29/29). |
| **Workspace Lint & Typecheck** | `pnpm lint && pnpm typecheck` | **0 errors** | Full ESLint + TypeScript strict verification across all packages and apps. |

---

## 2. 22-Screen UAT Matrix

| # | Mockup Screen | Route | Auth & Scoping | Data / Behavior Verified | Responsive (320–430 px) | Status |
|---:|---|---|---|---|---|---|
| 1 | Masuk | `/masuk` | Public (redirects if active) | NIK / email / phone + password, generic error on wrong password, clear message on inactive account | Pass (0 px overflow) | **PASS** |
| 2 | Verifikasi PIN | `/pin` | `stage = 'pin'` session | 4-digit keypad, remaining attempts counter, rotates session ID on success, locks after 5 failures across sessions | Pass (0 px overflow) | **PASS** |
| 3 | Beranda | `/beranda` | `requireMember()` | Recorded savings card, active loan card, store credit summary, quick actions, notices | Pass (0 px overflow) | **PASS** |
| 4 | Simpanan — Semua / Setoran / Penarikan / Potongan | `/simpanan` | `requireMember()` | 4 tabs (`semua`, `setoran`, `penarikan`, `potongan`), `APPROVED` vs pending/unverified separation, keyset pagination | Pass (0 px overflow) | **PASS** |
| 5 | Pinjaman — Aktif & Riwayat / Pengajuan | `/pinjaman` | `requireMember()` | Active loan progress (`10 dari 24`), installment window, full schedule sheet, applications tab | Pass (0 px overflow) | **PASS** |
| 6 | Ajukan Pinjaman | `/pinjaman/ajukan` | `requireMember()` | Live simulation from `m_pinjaman_mobile`, field validation, `SubmissionNotice` ("Belum ada yang dikirim." when flag disabled; BFF intake when enabled) | Pass (0 px overflow) | **PASS** |
| 7 | Saldo Kredit Toko | `/saldo` | `requireMember()` | POS credit rule (`gaji_minus` override or `limit_toko` minus current month `Kredit+Final` net of returns) | Pass (0 px overflow) | **PASS** |
| 8 | Potongan Payroll | `/potongan` | `requireMember()` | Latest period total & component breakdown (`amount4`), previous periods list, mismatch warning | Pass (0 px overflow) | **PASS** |
| 9 | Pengajuan Perubahan Potongan | `/potongan/ajukan` | `requireMember()` | Enforces Simpanan Wajib increase-only rule, next business month effective date, payroll consent checkbox | Pass (0 px overflow) | **PASS** |
| 10 | Sisa Hasil Usaha (SHU) | `/shu` | `requireMember()` | Displays only published (`publish = 1`) years; unpublished years (`2024` in test seed) stay hidden | Pass (0 px overflow) | **PASS** |
| 11 | Transaksi | `/transaksi` | `requireMember()` | Merged POS sales (`db_sales`) + online/PPOB orders (`orders`), URL-persisted filters, detail sheet | Pass (0 px overflow) | **PASS** |
| 12 | Favorit | `/favorit` | `requireMember()` | Member's `wishlists` joined with `products`, deep link to catalog search | Pass (0 px overflow) | **PASS** |
| 13 | Lainnya (Profil, QR, FAQ, Keluar) | `/lainnya` | `requireMember()` | Member profile details, `?buka=qr` deep-linked QR dialog, database-backed FAQ sheet, logout confirmation clearing cart & session | Pass (0 px overflow) | **PASS** |
| 14 | Belanja (Katalog Toko) | `/belanja` | `requireMember()` | Live `db_items` catalog (`company_id = 1`, excludes `SALDOPPOB`), search, category pills, sort, sticky cart bar | Pass (0 px overflow) | **PASS** |
| 15 | Checkout Toko | `/belanja/checkout` | `requireMember()` | Re-prices cart from `/api/belanja/harga`, checks remaining store credit, flags unavailable items | Pass (0 px overflow) | **PASS** |
| 16–21 | Layanan PPOB (`pulsa`, `token`, `data`, `pascabayar`, `pdam`, `internet`) | `/layanan/[layanan]` | `requireMember()` | Normalizes and validates phone / meter / customer numbers; never displays invented prices | Pass (0 px overflow) | **PASS** |
| 22 | Checkout Layanan PPOB | `/layanan/checkout` | `requireMember()` | Honest empty state explaining PPOB provider is not yet connected | Pass (0 px overflow) | **PASS** |

