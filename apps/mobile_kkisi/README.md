# S-MART KKISI TB2 — PWA Anggota (`apps/mobile_kkisi`)

Installable member app for Koperasi Karyawan KKISI Tambun 2: savings, loans, payroll deductions, SHU, store credit, transactions, store catalog. Next.js 16 App Router, separate from the console (`apps/web`), deployed to `https://app.kkisitb2.id`.

Design reference: `docs/mobile_design_pwa/S-MART_KKISI_TB2_Mockup_PWA Anggota.html`. Full documentation: `docs/mobile_design_pwa/implementation/01…09`.

## Quick start (synthetic data, no real database)

Requires Docker (for an isolated MariaDB) and pnpm 10.

```bash
pnpm install --frozen-lockfile                       # repository root
pnpm --filter @koperasi/mobile-kkisi stack:up        # container kkisi-mobile-test on 127.0.0.1:3324, fictitious members
pnpm --filter @koperasi/mobile-kkisi dev:synthetic   # http://127.0.0.1:3240
```

Log in with NIK `10234`, email `anggota.uji1@contoh.test` or phone `081200000001`, password `Uji-Sandi#2026`, PIN `2468`. All people and amounts in the stack are invented. `stack:down` removes the container and its generated passwords (`.local/stack.json`).

## Against a real database

Copy `.env.example` to `.env.local` and fill it (never commit it): a SELECT-only reader DSN, a session-store DSN (schema `db/auth/001_member_auth.sql`) or `MEMBER_AUTH_STORE=memory` for local work, and `MEMBER_AUTH_SECRETS`. Then `pnpm --filter @koperasi/mobile-kkisi dev`. Missing or unsafe settings make login unavailable instead of falling back to defaults.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `dev:synthetic` | Next dev server on 127.0.0.1:3240 (own env / synthetic stack env) |
| `build`, `start`, `start:synthetic` | production build and server |
| `lint`, `typecheck` | ESLint (repository config), `tsc --noEmit` |
| `test` | unit tests (`tests/unit`, no database) |
| `test:integration` | auth + readers against the synthetic MariaDB |
| `test:e2e` | real-browser journeys against the production build (`build` first); writes screenshots to `docs/mobile_design_pwa/implementation/screenshots/` |
| `stack:up`, `stack:seed`, `stack:status`, `stack:down` | synthetic database lifecycle |
| `icons` | regenerate PWA icons and the header logo from the approved brand assets |

## Layout

```
src/app            routes: (auth) masuk, pin · (member) beranda … layanan · api/auth/* · api/belanja/harga · sw.js · manifest · health
src/features       auth, home, member, savings, loans, deductions, shu, store-credit, transactions, catalog, account, ppob
src/components     layout, navigation, overlay, feedback, pwa, ui
src/server         auth (sessions, PIN, throttle, bcrypt workers) · kosipa (member-scoped SELECT readers) · db
src/lib            config (fail-closed env), auth session, security, api client, navigation, pwa cache policy, money/date utils
db/auth            session-store schema · db/fixtures: legacy DDL subset for the synthetic stack (no rows)
integration        synthetic stack + seed · tests: unit, integration, e2e
```

## Rules for contributors

* Member data is read with the NIK keys of the server session only — never with an id from the URL or body.
* Never write to the legacy database from this app; a write flow needs an approved least-privilege writer (production DB changes are manual and reviewed).
* Never let the service worker store anything but hashed build assets and public brand files (`src/lib/pwa/cache-policy.js` + its tests).
* Reuse `@koperasi/domain` / `@koperasi/application` for business rules; show unavailable data as unavailable, never as zero.
