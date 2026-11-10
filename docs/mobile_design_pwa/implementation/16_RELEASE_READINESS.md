# 16 — Production Release Readiness & Runbook (WS-06)

## 1. Deployment Architecture (`deploy/mobile_kkisi`)

`apps/mobile_kkisi` deploys as an isolated Docker Compose stack (`name: kkisi-mobile`) on loopback port `127.0.0.1:3150`, completely independent of `genesis.web`:

- `kkisi-mobile-netns` (`registry.k8s.io/pause:3.10`): Owns the shared container network namespace and binds `127.0.0.1:3150:3000`.
- `kkisi-mobile-db-tunnel` (`genesis-db-tunnel`): Dedicated SSH tunnel container forwarding `127.0.0.1:3307 -> remote 127.0.0.1:3306` with its own key (`/opt/apps/kkisi-mobile/tunnel/id_ed25519`).
- `kkisi-mobile-web` (`kkisi-mobile:<tag>`): Runs as non-root `node` (UID 1000) with `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges:true`, `mem_limit: 768m`, `pids_limit: 256`, and tmpfs mounts only at `/tmp` and `/app/apps/mobile_kkisi/.next/cache`.

---

## 2. Observability & Health Endpoints

- **Liveness (`GET /health`)**: Returns `200 OK` without querying the database (used by Docker `HEALTHCHECK` every 30s). Internal callers (loopback / container network) get `{ status, app, version, env, features }`; requests through nginx get `{ status }` only.
- **Readiness (`GET /health?check=ready`)**: Verifies connectivity to both `readerDb` (`n1608204_kkisi_member_view`, the reader's view schema) and `authDb` (`n1608204_kkisi_member_auth`) with a 1.5-second timeout (`SELECT /*+ MAX_EXECUTION_TIME(1500) */ 1 AS ok`). Returns `200 OK` when both pools respond, or `503 Service Unavailable` `{ status: "degraded", checks: { readerDb, authDb } }` without leaking DSNs or error messages.
- **Redacted Structured Logging**:
  - `auth.login.password_ok`, `auth.login.failed`, `auth.login.throttled`, `auth.login.pin_throttled`, `auth.login.refused`
  - `auth.pin.ok`, `auth.pin.failed`, `auth.pin.locked`, `auth.pin.throttled`
  - `member.mutation.recorded`, `member.mutation.blocked`
  - `db.query.slow` (`ms >= 500`, duration only — no SQL or parameters)

---

## 3. Controlled Cutover Checklist

1. **Database Owner (cPanel)**:
   - Execute Stages 1–4 of [`mobile-member-pwa-production.sql`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/docs/migration/sql/mobile-member-pwa-production.sql) (create `n1608204_kkisi_member_auth`, apply `001_member_auth.sql`, create `n1608204_nxmauth` and `n1608204_nxmread`).
   - Apply Stage 5 online indexes (`idx_pinjaman_dtl_doc_cicilan`, `idx_potongan_matrix_nik_id`, `idx_sales_nik_date`, `idx_simpanan_dtl_nik_id`, `idx_simpanan_doc_no`, `idx_orders_nik_id`, `idx_anggota_nik_id`) in [`14_PRODUCTION_MIGRATION_PLAN.md`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/docs/mobile_design_pwa/implementation/14_PRODUCTION_MIGRATION_PLAN.md).
2. **Server Operator**:
   - Populate `/opt/apps/kkisi-mobile/.env.production` (`chmod 600`) from [`env.production.example`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/deploy/mobile_kkisi/env.production.example) with generated 32-byte base64 secrets (`MEMBER_AUTH_SECRETS`, `MEMBER_PIN_PEPPER`), database passwords, and all `ENABLE_*=false`.
   - Build and start the stack:
     ```bash
     docker build -f deploy/mobile_kkisi/Dockerfile -t kkisi-mobile:v0.2.0 .
     docker compose --env-file /opt/apps/kkisi-mobile/compose.env -f deploy/mobile_kkisi/docker-compose.yml up -d
     curl -fsS http://127.0.0.1:3150/health?check=ready
     ```
3. **DNS & TLS (`app.kkisitb2.id`)**:
   - Create DNS `A` record for `app.kkisitb2.id` pointing to the application server IP.
   - Issue Let's Encrypt certificate (`certbot certonly --webroot -w /var/www/certbot -d app.kkisitb2.id`).
   - Enable [`app.kkisitb2.id.nginx.conf`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/deploy/mobile_kkisi/nginx/app.kkisitb2.id.nginx.conf) (`nginx -t && systemctl reload nginx`).

---

## 4. Rollback Procedure (< 2 Minutes)

- **Application Rollback**: Update `MOBILE_TAG` in `/opt/apps/kkisi-mobile/compose.env` to the previous image tag and run `docker compose --env-file /opt/apps/kkisi-mobile/compose.env -f deploy/mobile_kkisi/docker-compose.yml up -d web`, or stop the stack completely (`docker compose ... down`).
- **Nginx Disable**: Remove the symlink `/etc/nginx/sites-enabled/app.kkisitb2.id.conf` and reload nginx (`nginx -t && systemctl reload nginx`).
- **Database Rollback**: Because the PWA never alters `n1608204_smart_kopkar` data, stopping the container immediately ceases all database activity.

