# 07 — Test report

Run date: 9 November 2026, macOS, Node 22.23, Chromium (Playwright 1.64), MariaDB 11.4. All data: the synthetic stack (`apps/mobile_kkisi/integration/stack.mjs`, container `kkisi-mobile-test`, fictitious "ANGGOTA UJI" members). No real database was read or written by any test.

## Results

| Suite | Command | Result |
|---|---|---|
| Lint (mobile) | `node ../web/node_modules/eslint/bin/eslint.js .` | 0 problems |
| Lint (root, whole repo) | `pnpm lint` | 0 errors; 7 warnings, all pre-existing in `apps/web`/`packages` (same count on `master`) |
| Typecheck | `pnpm typecheck` (domain, application, web, mobile) | pass |
| Unit (mobile) | `pnpm --filter @koperasi/mobile-kkisi test` | **24/24** |
| Integration (mobile, real MariaDB) | `pnpm --filter @koperasi/mobile-kkisi test:integration` | **15/15** |
| E2E (production build, real Chromium) | `build` then `test:e2e` | **25/25** |
| Workspace regression | `pnpm -r test` | domain 407/407 · application 233 pass, 4 todo · web 559 pass, 226 skipped (DB-gated, unchanged), 0 fail |
| `apps/web` production build | `NEXT_DIST_DIR=.next-regression next build` (isolated dist, removed afterwards) | pass (one pre-existing Edge-runtime warning in its `instrumentation.ts`) |
| Mobile production build without any env | `env -i … next build` | pass; every member route dynamic (`ƒ`) |
| Docker image | `docker build -f deploy/mobile_kkisi/Dockerfile .` | pass |
| Hardened container (read-only FS, cap-drop ALL, tmpfs) | login + PIN + Beranda + `/sw.js` against the synthetic stack | pass |

## What the suites cover

**Unit** — fail-closed configuration (production origin/secret/DSN/memory-store rules); CSRF origin check, JSON requirement, trusted-proxy IP; cookie attributes; session-id format and HMAC; identity classification; PIN constant-time compare; redirect safety; full auth service on the memory store (PIN-stage, rotation, lockout, idle deadline, deactivation, logout, throttle across NIK spellings, generic errors); cache policy (only hashed/public assets cached; API, RSC and navigations never stored); service worker source validity and routing in a simulated worker scope; Rupiah formatting and parsing (no floats, missing ≠ zero); Jakarta month boundaries; savings sums by header status; latest deduction per type; installment status words; loan simulation against the master; POS credit rule; transaction mapping and filters; catalog/cart parsing; deduction-change rules; SHU mapping; navigation ownership; PPOB number validation.

**Integration** — login by NIK (with leading zeros), email (case), phone (+62); generic errors for wrong password, unknown identity and shared phone; inactive/deleted/non-member refusals; throttle lock that a correct password cannot bypass; PIN countdown and lockout; id rotation (pre-PIN id dead); deactivation ends a live session and it stays revoked; forged ids; **the reader account cannot write**; **IDOR** (member B's id with member A's keys returns nothing; loans, sales, wishlist isolated); every reader's SQL with expected figures (savings 1,5 jt/750 rb/250 rb + pending 50 rb; loan 10/24 paid, remaining principal 14 jt; payroll 1.990.000; SHU only the published year; credit 5 jt limit − (550 rb − 50 rb return) = 4,5 jt; catalog scope 31 items, injection string returns nothing).

**E2E** (`tests/e2e/run.mjs`) — deep-link redirect and return after login; 401 JSON for anonymous API; wrong password; wrong then right PIN; HttpOnly cookie not visible to scripts; `no-store` + CSP + frame denial on member pages; every bottom-nav tab with correct active state; real data on Beranda; nested navigation, tabs, browser back/forward and in-app back; refresh of a protected deep link; privacy toggle; loan schedule, real simulation (Rp1.291.666 for 25 jt × 24 bln) and honest "nothing sent" submission; deduction rule; catalog search → cart → server-priced checkout with real remaining credit; URL-persisted transaction filters and detail sheet; PPOB number validation without any price shown; Lainnya QR deep link and FAQ from the database; IDOR in rendered HTML; manifest fields and icon availability; service worker control and **Cache Storage audit** (only public URLs); offline navigation shows the offline page without member data and recovers automatically; **no horizontal overflow at 320/360/390/430 px on 12 screens**; exactly one `h1` and no unnamed button/link on 12 screens; logout revokes the session and clears the cart; inactive account message; no unexpected console errors.

## Defects found by testing and fixed

| Found by | Defect | Fix |
|---|---|---|
| E2E | Clicking **Masuk** before hydration did a native GET submit (password in the URL) | form `method="post"`, submit disabled until hydrated |
| E2E | First service-worker install (`clients.claim`) reloaded the page while the member typed | reload only after the member chooses "Muat ulang" |
| Docker build | Without runtime env the member layout was prerendered as static | `cookies()` read first; route groups `force-dynamic` |
| Visual comparison | `.dot` class collision inflated the "Aktif" badge; focus ring on titles | modifier renamed; titles excluded from focus ring |
| Web Vitals | Pinjaman CLS 0.24, Saldo 0.10 (undersized skeletons) | skeletons sized to the final layout |
| Lint | `setState` in effects (React compiler rule) | `useSyncExternalStore` stores |
| Proxy review | Anonymous `/api/*` redirected instead of 401 | JSON 401 |

## Performance (production build, Chromium, 390×844, CPU ×4, ~1.6 Mbps / 150 ms)

| Screen | LCP ms | CLS | TTFB ms | JS (gzip KB) |
|---|---|---|---|---|
| /masuk | 996 | 0 | 81 | 146 |
| /beranda | 236 | 0.008 | 28 | 148 |
| /simpanan | 240 | 0.032 | 23 | 140 |
| /pinjaman | 436 | 0 | 14 | 140 |
| /saldo | 244 | 0 | 13 | 140 |
| /potongan | 424 | 0.056 | 10 | 140 |
| /shu | 412 | 0.045 | 9 | 140 |
| /belanja | 272 | 0 | 53 | 143 |
| /transaksi | 240 | 0 | 14 | 141 |
| /lainnya | 240 | 0 | 11 | 147 |

Synthetic data is small: production TTFB depends on the unindexed member scans (01, risk table). Lighthouse was not run (not installed; would require a download) — the figures above come from the browser's own LCP/CLS APIs.

## Visual comparison

`screenshots/comparison/*.png` place the approved mockup (left) beside the implementation (right) for 19 screens at 390 px, from the production build. Viewport captures (320/360/390/430 px) are written by the E2E run into `screenshots/` (not committed by default). Intentional differences:

| Difference | Reason |
|---|---|
| 4 PIN dots instead of 6 | legacy PINs are 4 digits |
| "Simpanan tercatat" instead of "Saldo simpanan"; "(jadwal)" on loan remainders | official balances are unverified in the domain; figures are recorded sums |
| No running "Saldo" per mutation | the legacy detail `saldo` column is not trusted by the console either |
| Compact amounts "Rp1,5 juta" instead of "Rp1,5 jt" | shared Rupiah standard (`formatRupiahCompact`) |
| Form inputs 16 px instead of 14 px | iOS zooms on focus below 16 px |
| "Contoh/Pratinjau" labels removed; disabled flows explained | the app shows real data and must not imply actions it cannot perform |
| PPOB screens without nominal/price lists; Checkout Layanan empty state | no member-facing PPOB contract |
| Loan form without "Langkah 2 dari 4" | there is no multi-step submission yet |

## Not done / limits

No physical iOS/Android device testing (emulated viewports only; iOS install steps verified by code path, not on a device). Production database performance not measured (no production access by policy). Lighthouse PWA audit not run.
