# genesis.web: deployment on the DEV server (read-only production phase)

Status (2026-10-13): **main POS application; all writes ON**: POS checkout (Cash/Kredit/QRIS), register open/close, sales returns, stock opname and product add/edit (owner decision 2026-10-13). Startup guard: `writes=pos,register,inventory,products,returns legacy_pool=11/11`. Earlier status (2026-10-12): deployed and verified, read-only. `https://smart.kkisitb2.id` serves the Next.js app from the DEV server 117.54.42.178. It reads the production MariaDB on Niagahoster through an encrypted SSH tunnel. Legacy PHP is unchanged and healthy.

This replaces the GCP target in [GCP_PARTIAL_CUTOVER.md](GCP_PARTIAL_CUTOVER.md): GCP → Niagahoster stays blocked by IP reputation, while DEV → Niagahoster works (65002/3306/443 open, about 24 ms).

Naming rule (owner): deployment artifacts use the alias **genesis.web**; nothing on the server is named after the original project. The production database and account names (`n1608204_*`) are unchanged.

## 1. Architecture

```text
Browser ─HTTPS─▶ DEV 117.54.42.178 nginx site "genesis-web" (smart.kkisitb2.id, Let's Encrypt)
                   └─▶ 127.0.0.1:3140 ─▶ compose project genesis-web (private network namespace):
                        genesis-web-netns   pause container, owns the namespace, publishes only 127.0.0.1:3140
                        genesis-db-tunnel   ssh -L 127.0.0.1:3307 → srv149.niagahoster.com:65002 → 127.0.0.1:3306
                        genesis-web         Next.js (APP_ENV=production), DSNs 127.0.0.1:3307
Niagahoster srv149 MariaDB 10.11.19 ── n1608204_smart_kopkar (single source of truth) + n1608204_kkisi_auth (sessions)
Legacy PHP (tokonew.kkisitb2.id) ── localhost ── same business database (unchanged)
```

No database runs on DEV. No port was opened on DEV (ufw unchanged; 3140 and 3307 are loopback or namespace-only).

## 2. What is on the DEV server

| Path / object | Content |
|---|---|
| `/opt/apps/genesis.web/` (700, root) | `src/` (build source: allowlisted paths only), `tunnel/` (`id_ed25519` 600, `known_hosts`), `.env.production` (600), `compose.env` (600), `compose.env.prev` (previous tags, for rollback) |
| Images | `genesis-web:<tag>`, `genesis-db-tunnel:<tag>`; current `97304ea2-202610121638-wt`, previous `97304ea2-202610121604` kept for rollback |
| Containers / network | `genesis-web-netns`, `genesis-db-tunnel`, `genesis-web`; network `genesis-web` |
| nginx | `/etc/nginx/sites-available/genesis-web` (+ symlink); ACME webroot `/var/www/genesis-web-acme` |
| Certificate | `/etc/letsencrypt/live/smart.kkisitb2.id` (Let's Encrypt, until 2027-01-10; webroot renewal, deploy hook reloads nginx) |

Nothing belonging to the other applications on the server (nadivo, bsn, omnibugs, sphone, lumina, llm, asiaholiday, supabase) was changed. Every nginx change was guarded by `nginx -t` with automatic rollback.

## 3. External changes

| System | Change |
|---|---|
| Niagahoster `~/.ssh/authorized_keys` | Added the DEV tunnel key: `from="117.54.42.178",restrict,port-forwarding,permitopen="127.0.0.1:3306",command="/bin/false"`. Removed the unused GCP key (from 34.101.195.90). Backups `authorized_keys.bak-*` |
| Niagahoster DNS zone `kkisitb2.id` | `smart` A record changed from 34.101.195.90 (GCP) to **117.54.42.178**, TTL 500 (serial 2026101200) |
| Production DB users/grants | **None.** Existing accounts reused: `n1608204_nxread` (SELECT), `n1608204_nxauth` (auth DB). `n1608204_nxpos`/`n1608204_nxreg` are configured but inactive |

## 4. Code changes found by testing against production data

Both are defects of existing features that only showed on real production data (staging rows differ). They were fixed with tests:

| Defect | Evidence | Fix |
|---|---|---|
| Receipt reprint refused every legacy sale (`RECEIPT_UNSUPPORTED`) | 217,913 POS sales (93%) have `return_bit = ''`. Legacy treats `!empty(return_bit)` as "return raised"; the reset writes NULL, which becomes `''` in the NOT NULL column | `evaluateReprintEligibility` accepts `null`, `''`, `'0'` (no return) and `'1'` (return); anything else, including a missing value, stays blocked |
| Stock opname detail failed (`INVALID_INPUT`) | 103 of 138 production documents have more than 500 lines (largest 1,681); the read path shared the 500-line write cap | Locked write paths keep 500; the read-only detail allows 5,000 |

Other changes: the deployment directory is renamed `deploy/gcp` → `deploy/genesis` with genesis names; the asset `suzuki-background-mobile.png` is renamed `brand-background-mobile.png` (user-facing business name "Koperasi Suzuki Mart" in the UI is unchanged); the nginx template drops `http2` (nginx 1.18 on Ubuntu 22.04 lacks `http2 on`, and `listen … http2` would change every site on :443).

Repository checks: lint 0 errors (4 pre-existing warnings), typecheck clean, 307 tests: 265 pass, 0 fail, 42 opt-in DB tests skipped.

## 5. Verification on the target host

| Check | Result |
|---|---|
| Startup guard | `production database configuration verified: legacy_db=n1608204_smart_kopkar auth_db=n1608204_kkisi_auth server=srv149.niagahoster.com:3306 (10.11.19-MariaDB-cll-lve) transport=ssh-tunnel writes=none legacy_pool=5/10` |
| HTTPS | `https://smart.kkisitb2.id/login` 200, valid certificate; HTTP → HTTPS 301; HSTS; anonymous `/pos` → `/login`; `/health` 200; `/health/ready` 403 from the internet, 200 on the server |
| Production read suite, 3 branches, app repositories unchanged | **69/69**: auth (company, user, permission, open register), POS catalog/search/categories/product/barcode, member + credit limit, receipt reprint, sales history/detail/payments, returns list/context, master products, inventory items/warehouses/opname list/detail. Authorization checks behave as designed (warehouses refused for cashier; checkout-mode receipt only for Next.js sales) |
| Tunnel recovery | ssh killed: readiness 503 at +1 s, 200 at +3 s; app and netns not restarted |
| Restart on reboot | docker enabled; restart policies `always` (tunnel) / `unless-stopped` (app, netns) |
| Exposure | Tunnel not reachable from the host; ufw unchanged; app port loopback only |
| Legacy | `tokonew.kkisitb2.id` 200; legacy account unchanged |

Typical production read latency from DEV: catalog 40–100 ms, sales detail about 0.6–1.3 s, receipt reprint about 1.5 s (many sequential queries over a 24 ms round trip; deferred optimization).

Not yet verified: an authenticated browser session of a real user (needs a production account; see section 8).

## 6. Operations

From `/opt/apps/genesis.web` on the DEV server:

```sh
docker compose --env-file compose.env -f src/deploy/genesis/docker-compose.yml ps
docker logs genesis-web | grep startup
curl -s 127.0.0.1:3140/health/ready
```

**Deploy a new version.**
1. Upload the allowlisted source to `src/` (the same paths as `.dockerignore`).
2. `docker build -t genesis-db-tunnel:<tag> src/deploy/genesis/tunnel` and `docker build -f src/deploy/genesis/Dockerfile -t genesis-web:<tag> src`.
3. `cp compose.env compose.env.prev`, set both tags in `compose.env`, then `up -d`.
4. Run `docker builder prune -f`. The disk is about 90% used.

**Rollback.** `cp compose.env.prev compose.env && docker compose --env-file compose.env -f src/deploy/genesis/docker-compose.yml up -d`.

**Stop the app entirely.** `docker compose ... down`, disable `/etc/nginx/sites-enabled/genesis-web`, then `nginx -t && systemctl reload nginx`. The legacy application is unaffected.

## 7. Write phase

**2026-10-13, owner decision: the new app becomes the main POS.** Done:
- Fresh non-locking dump at 14:47 WIB, stored on Niagahoster (`~/kkisi-backups/`) and offsite on the DEV server (`/opt/apps/genesis.web/backups/`, mode 600, checksums verified).
- `ALLOW_PRODUCTION_DB_WRITE=true`, `POS_WRITES_ENABLED=1` with the existing `n1608204_nxpos`/`n1608204_nxreg` accounts. Startup guard: `writes=pos,register legacy_pool=8/10`.

The remaining writers were created **manually** by the owner in cPanel (MySQL Databases → add user → add to `n1608204_smart_kopkar` with exactly these privileges, never ALL) and enabled with `set-writer.sh` on 2026-10-13. Crosscheck: every account's `SHOW GRANTS` matches the table below exactly (no DDL, no other database), budget 11/11:

| Feature | Suggested user | Privileges |
|---|---|---|
| Sales returns | `n1608204_nxret` | SELECT, INSERT, UPDATE |
| Stock opname | `n1608204_nxinv` | SELECT, INSERT, UPDATE, DELETE |
| Product add/edit | `n1608204_nxprd` | SELECT, INSERT, UPDATE |

Then, on the DEV server: `/opt/apps/genesis.web/set-writer.sh return|inventory|products <user>` (source: `deploy/genesis/set-writer.sh`). It asks for the password without echo, tests the login and grants through the tunnel, writes the DSN and flag, adjusts the connection budget (max 12), restarts the app, verifies the startup guard, and restores the previous environment on any failure.

Residual risk accepted with this decision (previous gating text below kept for reference): PHP POS is still able to write. Operating rule: each branch/cashier uses only one application at a time; PHP POS remains the fallback.

### Checkout hang ("Periksa/Ulangi Pembayaran"), 2026-10-13

Symptom: payment spinner, then nginx 504/499 after 60 s; no sale saved (the idempotent retry button is safe). genesis.web never calls PHP; the only shared part is the database. Causes:

| Cause | Evidence | Fix |
|---|---|---|
| **Root cause:** cart cleanup statement | A rolled-back rehearsal of the real checkout traced every statement at about 35 ms except the last, `DELETE cart FROM db_cart JOIN db_sales … OR … NOT EXISTS (SELECT … db_sales)`: over 60 s. As a multi-table DELETE, MariaDB rescans the unindexed db_sales (200k rows) for each db_cart row (about 325), so every checkout hit the 15 s transaction timeout and nginx's 60 s limit. Staging data was too small to show it. No Next.js sale had ever been saved | Drafts and code uniqueness are read with plain SELECTs, then `DELETE … FROM db_cart WHERE sales_id IN (…) OR (sales_id IS NULL AND sales_code IN (unique codes))`. Same ownership rules (ambiguous code-only rows are kept). Checkout now about 1 s |
| Lock waits behind the PHP POS (secondary) | Production has PRIMARY keys only. PHP's per-sale `UPDATE db_sales WHERE sales_code`, `UPDATE/DELETE db_salesitems WHERE sales_id`, `DELETE db_salespayments WHERE sales_id` scan and, under REPEATABLE-READ, lock the whole table until the PHP request commits; genesis.web inserts then wait up to `innodb_lock_wait_timeout=50` s. The same checkout with a rollback takes about 1.2 s when uncontended | App: every legacy write transaction first sets `innodb_lock_wait_timeout = 8` for its session (`src/infrastructure/db/lock-wait.ts`), so a blocked statement fails fast, is retried (checkout, register, returns, opname) or reported, and releases its own locks. **Root fix, owner only:** run `docs/migration/sql/pos-lock-indexes-production.sql` (six online indexes, review-only) |
| Member lookup failed for zero dates | 1,782 members (346 active) have `tgl_keluar = '0000-00-00'` (non-strict `sql_mode`), which the driver cannot decode as a date | `tgl_keluar` read through `DATE_FORMAT`; a zero date means no exit date |

Deployed as `39aafad3-202610131555-cart` (rollback image `39aafad3-202610131537-lock` in `compose.env.prev`). Startup guard `writes=pos,register,inventory,products,returns legacy_pool=11/11`; readiness 200; all five writer accounts accept the 8 s cap; production read suite 72/72 including a zero-date member.

Write rehearsal on production: the real repositories, run in a one-off container from the deployed image, each transaction **always rolled back** (nothing persisted, verified): checkout 0.9–1.1 s (two branches), register close 0.5 s, register open 0.4 s, sales return (Cash, 1 unit) 1.7 s, opname create 0.4 s, product edit 0.4 s, stock adjustment 0.4 s. Not rehearsed: opname count/approve (no open document in the branch). Until the indexes exist, contention with the PHP POS can still make a payment fail after about 8–25 s; pressing "Periksa/Ulangi Pembayaran" is safe (idempotent).

### Original gating (2026-10-12)

Owner decision: read-only first. Before any write is enabled:

1. **Single writer.** A per-branch mechanism stops PHP POS writing the pilot branch (recommended: branch 3 GIIC; details in GCP_PARTIAL_CUTOVER.md section 9). Without it, invoice numbers (`MAX+1` without lock), stock and credit limits can conflict.
2. **Writer accounts, created manually from reviewed SQL** (owner rule: no agent-made production users or grants):
   - Sales returns: `docs/migration/sql/sales-return-writer-production.sql` (ready).
   - Checkout and register: `n1608204_nxpos`/`n1608204_nxreg` exist but hold database-wide DML (created before the rule). Replace them with table-level grants (support ticket if cPanel cannot).
   - Inventory and product writers: not yet in production; their SQL must be generated from the tested local grants.
3. **Backup.** Refresh and copy offsite (the verified dump `~/kkisi-backups/…20261006…` is on the same server as production).
4. **Controlled UAT** with an operator-agreed product.

## 8. Open items

- Owner: run `docs/migration/sql/pos-lock-indexes-production.sql` outside shop hours after a fresh backup.
- Authenticated end-to-end check by a real user (login, POS screen, history, receipt reprint, opname detail) on `https://smart.kkisitb2.id`.
- GCP leftovers removed 2026-10-12: nginx site, certificate and ACME webroot for `smart.kkisitb2.id`, `/opt/kkisi-web/` (including its secrets), the GCP tunnel key. Other applications on GCP were untouched and still answer as before.
- Remote MySQL wildcard `%.%.%.%` (risk R-WILDCARD in GCP_PARTIAL_CUTOVER.md).
- DEV disk at about 90%: keep at most one previous image.
