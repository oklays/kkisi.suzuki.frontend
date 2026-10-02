# KKISI Web — Next.js application

This directory contains the **new** Next.js application. Original reverse-engineering documentation lives in [`../../docs/legacy-reference/`](../../docs/legacy-reference/00-index.md) (`00-index.md`–`10-diagrams.md`). The legacy PHP source remains in `../../tokonew.kkisitb2.id/`.

## Getting started

Use the Node/pnpm versions documented in the root README. The current CLI/tests and TypeScript source packages are verified on Node 22.23.0.

```sh
# From the repository root (pnpm 10.0.0)
pnpm install --frozen-lockfile
pnpm db:generate
pnpm dev
```

Open http://127.0.0.1:3000/login (the app binds to loopback only; use exactly this origin). `/pos` and every `/api/pos/*` route require a session; `/pos` is still a **read-only catalog preview** (products, prices and stock of the *session's* branch from the local staging database; members are sample data; no checkout, payment, stock, limit or register write exists).

### Authentication (Stage 2A, local staging only)

- **Login** verifies the legacy bcrypt hashes (`$2y$`, cost 10) in a worker thread (`bcryptjs`); the legacy `html_escape` of passwords is reproduced, passwords the legacy `xss_clean` rewrote (`%hh`, control characters, tokens such as `javascript:`) fail generically until reset by an admin. Every failure is the same `401 INVALID_CREDENTIALS`; a lockout is a generic `429`; any database/worker outage is `503` (fail closed).
- **Sessions**: opaque 256-bit id in an `HttpOnly; SameSite=Lax` cookie (`__Host-` and `Secure` over HTTPS); only `SHA-256(id)` is stored in the auth store (`kkisi_auth_staging.auth_session`). Idle timeout 2 h, absolute 12 h, at most 5 valid sessions per user, logout revokes persistently. Every protected request re-validates session, user, role, branch and password fingerprint (legacy, SELECT-only) — a changed password, disabled user/role/branch or removed permission takes effect on the next request. No `user id 1` bypass.
- **Throttling** is persistent per username (10 failures / 15 min); per-IP and pair keys switch on only behind a trusted reverse proxy (`TRUSTED_PROXY_HOPS`); `X-Forwarded-For` is otherwise ignored. Unlock one username: `pnpm auth:unlock --username <name>`; summary: `pnpm auth:status`.
- **CSRF**: `Origin` must equal `APP_ORIGIN`, JSON only, plus a per-session token (`X-CSRF-Token`, from `/api/auth/session` or login).
- **Branch**: `session.cid` is the only source of the branch (`company_id` in a request is ignored). Role 4/3 are fixed to `db_users.company_id`; role 1-2 may choose a branch (`POST /api/auth/company`), refused while they hold an open register in another branch. Roles whose `db_roles.status <> 1` cannot log in.
- **Configuration** (all required, all fail closed): `DATABASE_URL` (SELECT-only account), `DATABASE_URL_AUTH` (`kkisi_auth`, created by `bash apps/web/scripts/setup-auth-store.sh` from the repository root), `AUTH_SECRETS`, `APP_ORIGIN` (must be loopback), optional `TRUSTED_PROXY_HOPS`. `POS_COMPANY_ID` no longer exists. The app never writes to legacy tables; the auth store is written only by the `kkisi_auth` account.
- **Tests**: `pnpm test` (fakes + synthetic hashes). Opt-in, against a *disposable* MariaDB: `AUTH_TEST_DATABASE_URL`, `AUTH_TEST_LEGACY_URL`, `AUTH_TEST_FIXTURE` (`tests/auth-store-db.test.mjs`; refuses port 3307); browser: `apps/web/tests/pos-browser.mjs` (from the repository root) with `POS_FIXTURE` (synthetic identities only).

### POS product catalog (Stage 1)

- **Branch scope**: stock is per branch (`db_items.company_id`). The branch is the authenticated session's `cid`; `company_id` in a query string is ignored.
- **API**: `GET /api/pos/products` — `?q=` name/code/barcode search, `?category=` category id, `?barcode=` exact scanner lookup. At most 24 rows; unit barcode wins over pack barcode; unknown barcode returns `{"products":[]}`. Errors return only a safe code (`INVALID_INPUT`, `DB_UNAVAILABLE`, `NOT_CONFIGURED`, `UNEXPECTED`).
- **Rules verified against staging**: only `status=1` and `type='Produk Jadi'` items; sold price per unit = `sales_price − discount` (nominal, per unit, as the legacy cart does); tax is not part of the price; negative legacy stock is shown as "Stok habis"; browsing lists in-stock items only, a text search also shows out-of-stock ones; items priced 0 are shown as "Harga belum diatur" and cannot be added. `db_category` is global (no `company_id`); the category list is limited to categories the branch sells.
- **Money**: `DOUBLE(18,2)` prices leave the repository as exact 2-decimal strings and are integer *sen* from then on (`@koperasi/domain/money`); no floating point is applied to amounts (e.g. Rp 4.000,10 = 400010 sen).
- **Columns read**: id, company, code, barcode, name, price, discount, stock, category. Cost price, tax and pack data never leave the server.
- **Optional checks**: `cd apps/web && POS_STAGING_DB_TEST=1 node --env-file=.env.local --experimental-strip-types --test tests/pos-staging-catalog.test.mjs` reads the local staging copy (refuses non-local/non-"staging" URLs); `pnpm test:browser` runs against a `next start` build.

## Database foundation (Checkpoint 2A)

Prisma 6.12.0 maps a read-only subset of the existing `db_items` and `db_category` tables in `prisma/schema.prisma`. The legacy database remains the source of truth and writer. No migration or schema push is part of setup. `src/domain/inventory/item-repository.ts` defines the read port and stable projection, `src/application/inventory/use-cases/read-products.usecase.ts` validates and orchestrates reads, and `src/infrastructure/repositories/prisma-item.repository.ts` owns the Prisma queries. `src/infrastructure/db/prisma.ts` reuses one client during development hot reload. Decimal price and stock values leave the adapter as strings to avoid floating-point loss. Errors use safe codes: `INVALID_INPUT`, `NOT_FOUND`, `DB_UNAVAILABLE`, `UNEXPECTED`.

`bash apps/web/scripts/setup-staging.sh` (from the repository root) builds the local staging database: a MariaDB 11.4 container (`kkisi-staging`, `127.0.0.1:3307`, database `kkisi_staging`) restored from a dump of the production database (283 tables, 45 views) with 28 performance indexes added, plus a SELECT-only user (`kkisi_read`, used by this app through `DATABASE_URL`) and a read/write user for later stages. Credentials live only in gitignored `.env.local`/`.env.staging`. Only ever point `DATABASE_URL` at this staging copy; the app never contacts production.

Column names, types and nullability used by the Prisma models were checked against the staging DDL (Stage 1 found and fixed `db_category`, which has no `company_id`). Models not used by the POS catalog (`Brand`, `Unit`, `Tax`, `Company`, `Anggota`) are mapped but still unverified for writes.

```sh
pnpm db:generate
pnpm db:validate
pnpm db:read-products 2 beras
```

The last command searches up to 10 products for company ID 2 by name, item code or barcode (browsing without a term lists in-stock items only) and prints the catalog projection as JSON, or a safe error code.

## Quality checks

Stage 1 verification (2026-09-30): unit tests, opt-in staging integration tests and the browser scenario pass against the staging copy; lint, typecheck, Prisma validation and the production build pass. `npm audit` was not re-run in Stage 1.

```sh
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Optional browser checks require an installed Playwright package and Chromium. Start the production build on port 3100, then run:

```sh
pnpm start --hostname 127.0.0.1 --port 3100
# In another terminal; omit PLAYWRIGHT_MODULE if playwright is installed locally.
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs pnpm test:browser
```

`POS_URL` overrides the preview URL; `POS_SCREENSHOTS` overrides the screenshot directory (default `/private/tmp/ksm-pos-verification`). Browser checks cover search, barcode Enter, category filters, cart limits, member identifiers, disabled payment/checkout, clear confirmation, refresh and horizontal overflow at five widths.

## UI structure

`src/app/pos/page.tsx` loads the first catalog page server-side and passes it (plus sample members from `src/components/pos/fixtures.ts`) to `PosScreen`, which fetches further pages from `/api/pos/products`. Presentation components live in `src/components/pos/`; catalog projections belong to `@koperasi/application/pos/contracts` and UI-only types to `src/features/pos/types.ts`. Image/currency display helpers remain in `preview.ts`; in-memory cart calculations belong to `@koperasi/domain/pos/preview` and remain non-authoritative. Future server use cases supply verified projections; do not turn the fixtures into a service or persistence layer.

Illustration filenames preserve the supplied five category families with six variants each. Selection hashes the product ID; real images take precedence, with a fallback on image-load error. The supplied SVGs contain empty raster wrappers, so the app uses replacement native vectors; originals remain in the mockup directory. All UI icons use Lucide React.

## Next steps

Follow `../../.kiro/specs/pos-kasir-revamp/{requirements,design,tasks,ui-foundation}.md`. Operational migration checkpoints remain separate from the [monorepo refactor](../../docs/refactor/MONOREPO_REFACTOR_PLAN.md). Operational characterization remains required before pricing, member credit or checkout integration. Do not enable production transaction writes before the single-writer cutover and parity checks in `../../docs/migration/DATA_OWNERSHIP.md`.
