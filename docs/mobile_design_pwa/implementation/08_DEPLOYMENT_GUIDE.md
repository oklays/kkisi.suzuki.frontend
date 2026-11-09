# 08 — Deployment guide (app.kkisitb2.id)

Nothing here has been executed against production. DNS, certificates, database accounts and the release are owner/operator actions.

## 1. Build and runtime

| | |
|---|---|
| Image | `docker build -f deploy/mobile_kkisi/Dockerfile -t kkisi-mobile:<tag> .` (context filtered by `deploy/mobile_kkisi/Dockerfile.dockerignore`; needs outbound HTTPS once for `next/font`) |
| Process | `next start` on container port 3000, unprivileged `node` user, read-only root FS, `/tmp` + `.next/cache` tmpfs |
| Compose | `deploy/mobile_kkisi/docker-compose.yml` — own project `kkisi-mobile`, loopback host port `3150`, own SSH-tunnel sidecar (same reviewed image as genesis.web), no shared container or network |
| Health | `GET /health` (liveness, no DB) — Docker `HEALTHCHECK` uses it |
| Without Docker | `pnpm install --frozen-lockfile && pnpm --filter @koperasi/mobile-kkisi build && pnpm --filter @koperasi/mobile-kkisi start` (binds 127.0.0.1:3240) |

## 2. Environment (`deploy/mobile_kkisi/env.production.example`)

| Variable | Production value / rule |
|---|---|
| `APP_ENV` | `production` |
| `APP_ORIGIN` | `https://app.kkisitb2.id` (HTTPS, no path) |
| `TRUSTED_PROXY_HOPS` | `1` (nginx overwrites X-Forwarded-For) |
| `MEMBER_AUTH_SECRETS` | `k1:<base64 of 32 random bytes>`; different from genesis.web `AUTH_SECRETS`; rotate by prepending `k2:` (old sessions keep working until expiry) |
| `DATABASE_URL_MEMBER_READ` | SELECT-only account on `n1608204_smart_kopkar` via the tunnel |
| `DATABASE_URL_MEMBER_AUTH` | session-store account on `n1608204_kkisi_member_auth` via the tunnel |
| `MEMBER_CATALOG_COMPANY_ID` | `1` (TOKO S-MART TB II) |
| `MEMBER_DB_POOL_LIMIT` | `2` |

The app refuses to log anyone in (and shows "Layanan belum tersedia") when a value is missing or unsafe; `/health` stays green so the process is observable.

## 3. Database preparation (manual, reviewed)

`docs/migration/sql/mobile-member-pwa-production.sql`: create database `kkisi_member_auth`, apply `apps/mobile_kkisi/db/auth/001_member_auth.sql`, create `nxmauth` (S/I/U/D on that database only) and `nxmread` (SELECT only), verify with `SHOW GRANTS`. No legacy table is altered.

**Connection budget**: the PWA adds at most 4 connections (2 reader + 2 session store) under two new cPanel accounts. Check `max_user_connections` before adding replicas.

**Recommended before go-live**: decide the read-index proposal (`docs/superpowers/specs/unified-console-kosipa-warehouse/index-proposal.md`) for `trans_simpanan_dtl.nik_kar`, `trans_pinjaman_dtl.doc_no`, `trans_potongan_matrix.nik_kar`. Without them every member screen runs table scans capped at 5 s; under load they will show "belum dapat dimuat" instead of data.

## 4. DNS (owner action)

Create one record once the hosting server is confirmed (no IP is assumed here):

```
app.kkisitb2.id.   A      <public IPv4 of the server running nginx + kkisi-mobile>
app.kkisitb2.id.   AAAA   <public IPv6, only if that server serves IPv6>
```

If the PWA runs on the same server as `smart.kkisitb2.id`, a `CNAME` to that host is equivalent. Wait for propagation before requesting the certificate.

## 5. Reverse proxy and HTTPS

1. Install `deploy/mobile_kkisi/nginx/app-kkisitb2.conf.example` as `/etc/nginx/sites-available/kkisi-mobile` (symlink into `sites-enabled`); do not edit other sites.
2. `mkdir -p /var/www/kkisi-mobile-acme`; temporarily enable only the port-80 block, `nginx -t && systemctl reload nginx`.
3. `certbot certonly --webroot -w /var/www/kkisi-mobile-acme -d app.kkisitb2.id --deploy-hook "systemctl reload nginx"`.
4. Enable the 443 block, `nginx -t && systemctl reload nginx`.

HTTPS is mandatory: service workers and installation do not work on plain HTTP. HSTS is set; `/sw.js` is never cached by nginx; response buffering is off so streamed screens arrive progressively. No CORS configuration is needed — the browser only talks to `app.kkisitb2.id`. The session cookie is host-only (`__Host-`), so it is never sent to `smart.kkisitb2.id` or any other subdomain, and the console cookie is never sent to the PWA.

## 6. Release (isolated from genesis.web)

```
# on the server, in a release directory (pattern of .local/genesis-release/<tag>/)
git -C /opt/apps/kkisi-mobile/repo pull --ff-only
docker build -f deploy/mobile_kkisi/Dockerfile -t kkisi-mobile:<tag> /opt/apps/kkisi-mobile/repo
MOBILE_TAG=<tag> docker compose --env-file /opt/apps/kkisi-mobile/compose.env -f deploy/mobile_kkisi/docker-compose.yml up -d web
curl -fsS http://127.0.0.1:3150/health
```

Smoke test after release: open `https://app.kkisitb2.id/masuk`, log in with a member test account agreed with the cooperative, open Beranda, Simpanan, Pinjaman, Saldo; check that DevTools → Application → Cache Storage holds only `/_next/static`, `/icons`, `/images`, `/offline.html`.

## 7. Rollback

```
MOBILE_TAG=<previous tag> docker compose --env-file /opt/apps/kkisi-mobile/compose.env -f deploy/mobile_kkisi/docker-compose.yml up -d web
```

Only the PWA container is recreated. The previous build's service worker is replaced on the members' next visit (new cache name). To withdraw the app entirely: stop the compose project and disable the nginx site; the console, POS and KOSIPA are unaffected. Sessions in `kkisi_member_auth` can be revoked in bulk with `UPDATE member_sessions SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = 'logout' WHERE revoked_at IS NULL;` (session store only).

## 8. CI

Suggested job (no repository CI exists today): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm -r test`, `pnpm --filter @koperasi/mobile-kkisi build`. Integration and E2E need Docker for the synthetic MariaDB (`stack:up`) and Playwright Chromium.
