# KOSIPA full access: isolated synthetic stack (FA-01 through FA-03A)

This harness runs the native KOSIPA write foundation, five reference masters, real legacy PHP compatibility and document-numbering tests. Reports: [FA-01](../../docs/superpowers/specs/kosipa-full-access/fa-01/CHECKPOINT_REPORT.md), [FA-01.5 + FA-02](../../docs/superpowers/specs/kosipa-full-access/fa-02/CHECKPOINT_REPORT.md), [FA-03A](../../docs/superpowers/specs/kosipa-full-access/fa-03a/CHECKPOINT_REPORT.md).

Everything runs in its own disposable MariaDB 11.4 container, `kkisi-kosipa-fa01`, on `127.0.0.1:3322`:

| Database | Contents |
|---|---|
| `kkisi_kfa_synthetic` | Business data: legacy structure from `apps/web/db/e2e/*.sql` plus `fixtures/legacy-structure.sql` (structure only), with synthetic rows |
| `kkisi_kfa_ledger` | Command ledger and append-only numbering registry (FD-01b: separate database, same server) |
| `kkisi_auth_staging`, `kkisi_console_staging` | Auth store and console store (identity links, audit, grants) |

The container never connects to the staging container (`:3307`), DEV LOCAL or production.

Secrets are random. They live only in `.local/kosipa-fa01/` and `apps/web/.env.kosipa-fa01`; both are mode 600 and gitignored.

```bash
# 1. database stack (container, schemas, least-privilege accounts, synthetic seed; legacy master menus start FENCED)
node integration/kosipa-full-access/local-stack.mjs setup      # status | reset | stop

# 2. Build the isolated legacy test image (cached after first build).
docker build --platform linux/amd64 -t kkisi-kfa-php56-ci2 integration/kosipa-full-access/legacy-runtime

# DB integration suites. Keep the FA app server STOPPED and run files sequentially: writer cap = 2 connections.
cd apps/web && KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 \
  tests/kosipa-foundation-db.test.mjs tests/kosipa-masters-db.test.mjs tests/kosipa-legacy-fence-db.test.mjs \
  tests/kosipa-migrations-rollback-db.test.mjs tests/kosipa-b1-export-db.test.mjs \
  tests/kosipa-document-number-db.test.mjs tests/kosipa-production-sql-static-db.test.mjs \
  tests/kosipa-legacy-runtime.test.mjs && cd ../..

# 3. console on http://127.0.0.1:3230, built into apps/web/.next-kfa01 (never .next, never a running dev server)
node integration/kosipa-full-access/app-server.mjs build && node integration/kosipa-full-access/app-server.mjs start
cd apps/web && node tests/kosipa-master-browser.mjs && cd ../..   # E1–E9, screenshots in /private/tmp/kfa01-browser
node integration/kosipa-full-access/app-server.mjs stop

# 4. regression of the existing DEV LOCAL browser suites in an isolated runtime (:3203, apps/web/.next-devlocal; FA features off)
node integration/kosipa-full-access/app-server.mjs build --profile devlocal && node integration/kosipa-full-access/app-server.mjs start --profile devlocal
cd apps/web && DEV_LOCAL_URL=http://127.0.0.1:3203 node tests/console-kosipa-nav-browser.mjs && DEV_LOCAL_URL=http://127.0.0.1:3203 node tests/kosipa-uiux-browser.mjs && cd ../..
# Inspect every profile DSN and the _devlocal_marker first. The following consume synthetic stock / create synthetic POS effects.
# A stale synthetic cashier register must be closed and today's register opened through the normal UI/API first.
cd apps/web && DEV_LOCAL_URL=http://127.0.0.1:3203 node tests/dev-local-smoke-browser.mjs && DEV_LOCAL_URL=http://127.0.0.1:3203 node tests/dev-local-writes-smoke.mjs && cd ../..
node integration/kosipa-full-access/app-server.mjs stop --profile devlocal
```

The launcher refuses to start on an occupied port, and refuses to rebuild while that profile's server is running.

## Synthetic accounts

Passwords are in `.local/kosipa-fa01/accounts.json`.

| Username | Role | KOSIPA link | Write rights |
|---|---|---|---|
| `synth_kfa_admin` | 1, `users_edit` | linked | Grant administrator |
| `synth_kfa_second` | 1, `users_edit` | linked | Second grant administrator (approves requests made by the first) |
| `synth_kfa_operator` | 4 | linked | None by default; the E2E test requests, approves, then revokes `kosipa.master.manage` |
| `synth_kfa_viewer` | 4 | linked | None (read-only) |
| `synth_kfa_unlinked` | 4 | none | None |

## Flags

The app env (`apps/web/.env.kosipa-fa01`) sets:

| Flag | Value |
|---|---|
| `KOSIPA_WRITE_GRANTS_ENABLED` | `true` |
| `KOSIPA_GRANT_ADMIN_USER_IDS` | The two administrators |
| `KOSIPA_MASTER_WRITES_ENABLED` | `true` |
| `KOSIPA_LEDGER_DATABASE` | `kkisi_kfa_ledger` |
| `KOSIPA_WRITE_OWNERSHIP` | The five `master.*` features |

With any of them off, the console behaves as before FA-01. The writer client refuses every database except `127.0.0.1:3322/kkisi_kfa_synthetic` with the ledger `kkisi_kfa_ledger`.
