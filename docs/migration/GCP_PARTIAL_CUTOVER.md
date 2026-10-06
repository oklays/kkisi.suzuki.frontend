# GCP partial cutover: Next.js on GCP → production MariaDB on Niagahoster

Status (2026-10-06, round 2): **NOT READY FOR CONTROLLED PARTIAL CUTOVER.** Two blockers remain, and the agent cannot clear either one:

1. **Network.** Niagahoster's server firewall drops all traffic from the GCP IP 34.101.195.90. Only Niagahoster support can change this.
2. **Single writer.** There is no existing mechanism to stop the legacy PHP POS from writing for a pilot branch. Adding one needs owner approval for a small legacy change.

Everything else is done and was verified against the real production database through the encrypted tunnel: secure transport, dedicated accounts, the auth store, a verified backup, read-only production validation, and the GCP staging files. Next.js production writes remain **disabled** (`ALLOW_PRODUCTION_DB_WRITE=false`). HTTPS and the domain are deferred to the next phase.

Constraints kept: no business query, business logic, business schema or legacy PHP change; no dual-write, replication or database on GCP; no change to any other application on the GCP VM.

## 1. Blocker resolution

| Blocker | Before | Action | After | Status |
|---|---|---|---|---|
| GCP network | 34.101.195.90 → 217.21.72.51 times out on every port | Re-tested 2026-10-06 (3306, 22, 65002, 443, 2083 all time out). The reverse probe is inconclusive because GCP ingress may itself be filtered | Unchanged. Needs a Niagahoster firewall allow for **TCP 65002 only** (A1) | **OPEN (operator)** |
| Secure DB transport | Server offers no TLS | SSH tunnel sidecar (`deploy/gcp/tunnel`) in a private pod network namespace. Restricted key on cPanel. Guard extended with an explicit `*_TRANSPORT=ssh-tunnel` and server-identity pin. Remote MySQL is **not** needed | Validated end to end against production (from the operator Mac, same images and compose) | **DONE** (on GCP once A1 is done) |
| Dedicated reader | None | `n1608204_nxread`: SELECT on `n1608204_smart_kopkar` only, `@localhost` | Startup `SHOW GRANTS` check passes; a write attempt is refused by the server (1142) | **DONE** |
| Dedicated writer | None | `n1608204_nxpos` (checkout) and `n1608204_nxreg` (register): SELECT/INSERT/UPDATE/DELETE, no DDL, `@localhost` | Created and verified; **not enabled** | **DONE** (inactive) |
| Auth DB | None | Database `n1608204_kkisi_auth` with only `auth_session` and `auth_throttle` (approved DDL). `n1608204_nxauth` has DML on that database only | Startup check passes (tables present, no business-DB grant, no DDL) | **DONE** |
| Backup | Not confirmed | No account-visible database backup existed. Created a non-locking `mysqldump --single-transaction`, then downloaded, restored into an isolated temporary MariaDB and validated it | Exact match: row counts, max id, financial and stock aggregates; all 45 views and key tables pass `CHECK TABLE` | **DONE** (provider backup policy still to confirm, A3) |
| Single writer | Undefined | Audited the legacy writers and the available switches (section 9) | No safe existing mechanism. Pilot recommended (branch 3, GIIC); minimal mechanism specified | **BLOCKED (owner decision)** |
| Production connectivity | Never connected | Real production through the tunnel: startup guard, readiness, idle reconnect, read via the app repository, pool, tunnel auto-recovery | All pass from the operator Mac. GCP pending A1 | **DONE except the GCP path** |

## 2. Architecture

```text
GCP VM 34.101.195.90 (shared; other apps untouched; nothing installed on the host)
 └─ compose project kkisi-web, private network namespace ("pod"):
      netns (pause)     publishes only 127.0.0.1:3140 on the host (nginx/HTTPS later)
      db-tunnel         ssh -L 127.0.0.1:3307 ─┐  (inside the pod only; not on host or any Docker network)
      web (Next.js)     DSN host 127.0.0.1:3307 │
                                                │ SSH, TCP 65002, key pinned to from="34.101.195.90",
                                                │ permitopen="127.0.0.1:3306", no shell
                                                ▼
Niagahoster srv149.niagahoster.com (217.21.72.51) ── 127.0.0.1:3306 MariaDB 10.11.19-MariaDB-cll-lve
      ├─ n1608204_smart_kopkar   SINGLE SOURCE OF TRUTH  ← nxread (SELECT), nxpos / nxreg (inactive)
      └─ n1608204_kkisi_auth     sessions + throttle     ← nxauth
Legacy PHP (tokonew.kkisitb2.id) ── localhost ── n1608204_kkisi (unchanged) ── n1608204_smart_kopkar
```

## 3. Network

| Item | Value |
|---|---|
| GCP source IP | 34.101.195.90 (confirmed egress) |
| SSH host / port | srv149.niagahoster.com (217.21.72.51) / 65002 |
| Host key pin | ED25519 `SHA256:E0tMsixUc1wnR2lM9aI7R4IoeSmJeyaud73foFnEVnA`, matching the key already trusted by the operator. `HostKeyAlgorithms=ssh-ed25519`, `StrictHostKeyChecking=yes` |
| Tunnel | 127.0.0.1:3307 inside the pod → 127.0.0.1:3306 on the server. Not reachable from the host (on the operator Mac, host port 3307 was the local staging MariaDB 11.4; the identity pin told them apart) |
| Firewall | **GCP still blocked** (re-tested after the operator added `34.101.195.90` to Remote MySQL: 3306 and 65002 still time out; Remote MySQL changes MySQL account hosts, not the server firewall). The app does not use Remote MySQL |
| Auto-recovery | Killing `ssh`: readiness 503 at +1 s, 200 at +3 s (Docker restart). Restarting the tunnel container: 200 within seconds. The app and netns containers were never restarted |

## 4. Database users (passwords never printed; stored only in GCP `/opt/kkisi-web/.env.production`, mode 600)

| User | Grants |
|---|---|
| `n1608204_nxread` | `USAGE ON *.*`; `SELECT ON n1608204_smart_kopkar.*` (@localhost) |
| `n1608204_nxpos` | `USAGE ON *.*`; `SELECT, INSERT, UPDATE, DELETE ON n1608204_smart_kopkar.*` (@localhost). Inactive |
| `n1608204_nxreg` | same as `nxpos`. Inactive |
| `n1608204_nxauth` | `USAGE ON *.*`; `SELECT, INSERT, UPDATE, DELETE ON n1608204_kkisi_auth.*` (@localhost) |
| `n1608204_nxbak` | `SELECT, LOCK TABLES, SHOW VIEW, EVENT, TRIGGER ON n1608204_smart_kopkar.*` (@localhost). Backups only; credential in cPanel `~/.kkisi-nxbak.cnf` (600); never used by the app |
| `n1608204_kkisi` (legacy) | Unchanged (all database privileges); remains PHP-only |

Residual: cPanel grants are database-wide, so the writers can DML every business table, not only the POS tables staging restricted them to. The startup check refuses any writer holding DDL.

**Correction (2026-10-06):** cPanel Remote MySQL contains the pre-existing wildcard `%.%.%.%` (plus `34.101.195.90`, added by the operator). cPanel therefore also created a `<user>@%.%.%.%` account for every database user, the new `nx*` users included. A direct login as `n1608204_nxread` from an arbitrary internet IP to 217.21.72.51:3306 **succeeded** (`CURRENT_USER()` = `n1608204_nxread@%.%.%.%`, no TLS). The earlier statement that these accounts work only `@localhost` through the tunnel was wrong. The application still connects only through the tunnel; the exposure is that the accounts (and the legacy `n1608204_kkisi`, which has all privileges) accept password logins from any IPv4 over plaintext. See risk R-WILDCARD in section 13.

## 5. Auth store

`n1608204_kkisi_auth`: `auth_session`, `auth_throttle` (from `apps/web/db/auth/001_auth_schema.sql`), owned by `nxauth`. Startup verifies the database, server identity, both tables, no business-DB grant and no DDL. Readiness `authDb=true` against production.

## 6. Connection safety

| Item | Value |
|---|---|
| Pools | reader 3, auth 2 (writers 2 + 1 when enabled) |
| Budget | `LEGACY_DB_CONNECTION_BUDGET=10` (≤ 12 enforced), counted per pinned server, whatever the path |
| Observed on production | at most 3 reader and 2 auth connections during a burst |
| `max_user_connections` / `wait_timeout` | 20 / 20 s |
| `max_idle_connection_lifetime` | 10 (≤ 15 enforced). Readiness after 25 s idle returns 200 |

## 7. Backup

| Item | Value |
|---|---|
| Existing backups visible to the account | None for the database (no JetBackup UAPI; cPanel backup list empty; `~/backup_*` hold app ZIPs from 2026-09-18) |
| Verified backup | `~/kkisi-backups/n1608204_smart_kopkar-20261006T000806+0700.sql.gz` (92,346,728 bytes, SHA-256 `ca758a50…f49b2c`, file mode 600, directory 700) |
| Method | `mysqldump --single-transaction --quick --skip-lock-tables --events --routines --triggers --hex-blob` at `nice 19` / `ionice idle`. All tables are InnoDB, so no locking. Took 52 s |
| Restore test | Isolated temporary MariaDB 10.11 (no network): 53 s. 328 objects (283 tables, 45 views). Row counts identical to live production: `db_sales` 232,035, `db_salesitems` 752,826, `db_salespayments` 230,598, `db_items` 20,522, `m_anggota` 9,276, max sale id 244,916. October sales total 180,791,000 and stock sum 4,295,017,983 identical. `CHECK TABLE` OK for all 45 views and key tables. The temporary database and the local copy were deleted |
| Restore note | Views use DEFINER `n1608204@localhost` and `n1608204_kkisi@%.%.%.%`. A restore target must have these accounts (locked is enough), otherwise views fail with "definer does not exist" |
| Rollback | Next.js has no schema of its own in the business DB, so rollback means stopping the pod. For data, restore the dump (or provider backup) to a new database and reconcile, never overwriting live data blindly. **Offsite copy:** the verified dump is on the same server; copy it off-server before any write UAT (A3) |

Refresh before write UAT, run on the cPanel host:

```sh
mysqldump --defaults-extra-file=$HOME/.kkisi-nxbak.cnf --single-transaction --quick --skip-lock-tables --events --routines --triggers --hex-blob --default-character-set=utf8mb4 --databases n1608204_smart_kopkar | gzip > ~/kkisi-backups/n1608204_smart_kopkar-$(date +%Y%m%dT%H%M%S%z).sql.gz
```

## 8. Production connectivity (real production, through the tunnel)

| Check | Result |
|---|---|
| Tunnel reachable | Yes, from the operator Mac (validation key `from=` the Mac IP, now **revoked**). GCP pending A1 |
| MariaDB authentication | `n1608204_nxread@localhost`, `n1608204_nxauth@localhost` (and `nxpos`/`nxreg` for identity checks only) |
| Database selected / identity | `n1608204_smart_kopkar` and `n1608204_kkisi_auth` on `srv149.niagahoster.com:3306` |
| Startup guard | `production database configuration verified ... transport=ssh-tunnel writes=none legacy_pool=5/10` |
| Read test | 13/13 expected POS tables; 10 products for company 1 through the unchanged `PrismaItemRepository` in 205 ms |
| Readiness / idle | 200; 200 after 25 s idle |
| Writes | None executed. The reader's 0-row `UPDATE` was refused by the server (1142) |

## 9. Single-writer audit (mandatory)

**Legacy writers of `db_sales`:**

| Writer | Code space |
|---|---|
| POS: `Pos::pos_save`, `Pos::index` (draft code), `Pos_model` | `sales_init + yymm + 5 digits`, the same space Next.js allocates in. `MAX(RIGHT(sales_code,5))` without lock |
| PPOB: `Pos_ppob` / `Pos_ppob_model` | `PPOB` + date (0 in the last 30 days) |
| Sales invoice: `Sales_model` | `sales_init` + Roman month + year + 6 digits |
| Mobile: `Sales_mobile_model` | Code supplied by the client |

Next.js allocates under a company-row lock with a collision check, but PHP POS does not take that lock. **Only PHP POS and Next.js POS for the same branch conflict.** `db_buka_kasir` (register open/close) has the same issue.

**Existing switches, none of which is safe:**
- `sales_add` permission, users, roles and branch status are **shared**: Next.js authenticates against the same `db_users`, `db_roles`, `db_permissions` and `db_company`. Turning any of them off disables both applications.
- PHP takes `company_id` from the POST body (`pos_update`, `buka_toko`), not the session, so a URL-level per-branch block is not a hard guarantee.
- A database trigger would be a business-schema change (not allowed). MySQL has no row-level security.

**Decision: Next.js production writes remain OFF. Stop condition "legacy PHP write cannot be disabled for pilot scope" applies.**

Recommended pilot: **branch 3, TOKO S-MART GIIC** (prefix `GIIC`; 63.5 sales/day; 1 cashier; 0 PPOB in 30 days).

Minimal mechanism (needs explicit owner approval; not implemented):

| Option | Scope | Change | Guarantee |
|---|---|---|---|
| **A (recommended)** | Per branch | Small legacy guard: a config list `pos_cutover_company_ids` checked at the top of the PHP POS/register write entry points (`Pos::index` draft, `pos_save`, `pos_update`, `add_to_cart*`, `buka_toko`, `Kasir::ajax_tutup_kasir`) against session **and** posted `company_id`; it refuses with a message. No query or flow change for other branches. This is the "small legacy patch" `DATA_OWNERSHIP.md` already recommends | Hard, per branch |
| B | All branches (whole POS module) | Web-server `.htaccess` 403 for PHP `pos/*` and register open/close; no PHP code change. PPOB and invoice stay on PHP (different prefixes) | Hard, but a big-bang for all 3 branches, and Next.js lacks returns/void (D10) |

Then the operating procedure for the pilot: close all GIIC registers in PHP at day end → apply A → set `POS_WRITES_ENABLED=1` and `ALLOW_PRODUCTION_DB_WRITE=true` → open the register in Next.js. Other branches stay on PHP. Rollback: disable Next.js writes, remove the company from the list. PHP keeps recomputing `db_items.stock` from the ledger for purchases and stock opname, and Next.js writes the same ledger rows (plan F-03), so stock stays consistent. Monitor it.

## 10. Controlled write UAT

**Not run.** Stop conditions apply: GCP cannot reach Niagahoster, and single-writer ownership is not established. The write path itself was rehearsed on a disposable production-like copy in round 1 (Cash checkout, idempotent replay, write after idle; 23/23). Manual UAT after A1 and option A: open the GIIC register in Next.js, sell one agreed low-value product with Cash, then verify one `db_sales`/`db_salesitems`/`db_salespayments` row each and the stock decrement. Replay the same idempotency key (no duplicate). Close the register and check the recap and the legacy sales report. Use an operator-agreed product and reverse it through the normal legacy return process if required.

## 11. Files changed (round 2)

| File | Change | Reason |
|---|---|---|
| `apps/web/src/infrastructure/db/deployment-guard.ts` | `*_TRANSPORT` (direct / ssh-tunnel), `*_SERVER_HOSTNAME`/`*_SERVER_PORT` identity pin; budget and auth isolation keyed on server identity | Tunnel support without weakening the guard: loopback only with explicit ssh-tunnel |
| `apps/web/src/infrastructure/db/startup-check.ts` | Verifies `@@hostname`/`@@port` on every connection; auth account has no business-DB grant and no DDL | Proves what is behind 127.0.0.1 |
| `apps/web/src/infrastructure/auth/store-health.ts` | Returns server identity and the auth account's grants | Used by the startup check |
| `apps/web/tests/deployment-guard.test.mjs` | 4 tunnel tests (13 total) | Loopback refused without ssh-tunnel; identity, DSN and write gates kept |
| `deploy/gcp/tunnel/Dockerfile`, `deploy/gcp/tunnel/entrypoint.sh` | New | Pinned, keepalive, fail-and-restart SSH tunnel, unprivileged after setup |
| `deploy/gcp/docker-compose.yml` | Pod pattern (`netns` + `db-tunnel` + `web`) | Tunnel private to the app; independent restarts |
| `deploy/gcp/env.production.example` | ssh-tunnel variables | Template |
| `docs/migration/GCP_PARTIAL_CUTOVER.md` | This report | |

No repository, use-case, query, Prisma schema, business-logic or legacy file changed.

## 12. Operator actions

**Done by the agent:**
- DB users, the auth DB and its tables.
- Restricted tunnel key; Mac validation key added and then revoked; authorized_keys backups at `~/.ssh/authorized_keys.bak-*`.
- Verified backup.
- `/opt/kkisi-web/` on GCP: `.env.production`, `compose.env`, `tunnel/{id_ed25519, known_hosts}`. Mode 600 or 700 as appropriate.
- Production validation, and the legacy health check (login page 200; `n1608204_kkisi` unchanged).

**Still to do:**

- **A1. Niagahoster support ticket** (only they can change the server firewall). Ask them to allow inbound **TCP 65002 (SSH)** from **34.101.195.90** on srv149.niagahoster.com, account n1608204, and to remove that IP from any block or deny list (CSF/Imunify360/LFD). Mention that from 34.101.195.90 every port to 217.21.72.51 and 217.21.72.90 times out, while other networks connect. Do **not** request MySQL 3306 and do **not** add Remote MySQL hosts. Then verify from the VM: `timeout 5 bash -c '</dev/tcp/217.21.72.51/65002' && echo open`.
- **A2. Deploy** (after A1):
  1. Build off-VM: `docker buildx build --platform linux/amd64 -f deploy/gcp/Dockerfile -t kkisi-web:<sha> --load .` and `docker buildx build --platform linux/amd64 -t kkisi-db-tunnel:<sha> --load deploy/gcp/tunnel`.
  2. Transfer: `docker save kkisi-web:<sha> kkisi-db-tunnel:<sha> | ssh <vm> docker load`.
  3. On the VM, set both tags in `/opt/kkisi-web/compose.env`, then run `docker compose --env-file /opt/kkisi-web/compose.env -f deploy/gcp/docker-compose.yml up -d`.
  4. Check that `docker logs kkisi-web | grep startup` shows `verified ... transport=ssh-tunnel` and that `curl 127.0.0.1:3140/health/ready` returns `ready`.
- **A3. Backup policy:** ask Niagahoster for the server-level backup schedule and retention for this account. Keep an offsite copy of `~/kkisi-backups/*` (for example on GCP `/opt/kkisi-web/backups`, mode 600, once A1 is done), and refresh the dump right before write UAT.
- **A4. Owner decision:** approve option A for branch 3 (GIIC), or choose B, plus the pilot date and the UAT product.
- **A5. HTTPS/domain** (next phase): replace `APP_ORIGIN` and install the nginx site from `deploy/gcp/nginx/`.

## 13. Remaining risks

| Severity | Risk | Type |
|---|---|---|
| Critical | GCP blocked by Niagahoster firewall | Blocking (A1) |
| Critical | No mechanism to stop PHP POS writing the pilot branch | Blocking for writes (A4) |
| High | Backup on the same server as production; provider policy unknown | Blocking for writes (A3) |
| Medium | Shared-hosting SSH session limits or LVE may drop long-lived tunnels | Mitigated by keepalive and auto-restart; monitor tunnel restarts |
| Medium | Writers have database-wide DML (cPanel) | Accepted; DDL refused at startup; writers inactive |
| Medium | WAN latency on auth and checkout paths (round 1 deferred findings) | Future optimization |
| High | **R-WILDCARD:** Remote MySQL `%.%.%.%` lets every cPanel DB account (legacy `n1608204_kkisi` with all privileges, and the new `nx*` accounts) log in from any IPv4 to the internet-facing port 3306, plaintext. Pre-existing for the legacy account | Not blocking for read-only; decide before writes. Identify remote consumers, then replace the wildcard with explicit IPs (or remove it). `34.101.195.90` in Remote MySQL is not needed for the tunnel design and does not open the network block |
| Low | `nxbak` credential on the cPanel host (600) | Backup-only privileges |
| Deferred | HTTPS / domain (`APP_ORIGIN` placeholder) | Next phase |

## 14. Final checklist

- [ ] GCP can reach Niagahoster (A1)
- [x] Encrypted DB transport active (SSH tunnel; validated against production)
- [x] SSH tunnel auto-recovery verified
- [x] Dedicated reader created
- [x] Dedicated writer created (inactive)
- [x] Auth DB created
- [x] Auth user created
- [x] Production DB connection successful (through the tunnel from the operator Mac; GCP pending A1)
- [x] Correct DB selected (identity pinned and verified)
- [x] Pool budget verified
- [x] Idle connection issue handled
- [x] Backup confirmed (verified dump; provider policy A3)
- [x] Restore procedure validated
- [x] Pilot ownership defined (branch 3 recommended)
- [ ] Legacy write disabled for pilot (A4)
- [ ] Next.js write enabled only for pilot (after A4)
- [x] No dual-write
- [x] No query changes
- [x] No business schema changes
- [x] No business logic changes
- [x] Legacy app healthy
- [x] Final audit completed

---

## Appendix: round 1 (2026-10-05) summary

The production guard, startup check, `/health` and `/health/ready`, the Docker image and compose, and the nginx template were added. A production-mode rehearsal ran on a disposable production-like database: 20/20 read, 23/23 write, 14 fail-fast cases. Prisma 6.12 combined with `wait_timeout=20` produces P1017 without `max_idle_connection_lifetime`, which the guard now requires. The deferred findings stand: WAN round trips per request, checkout lock duration over WAN, production missing the 28 staging indexes, the 1.7 GB image, and replica or Cloud SQL options.
