# 18 — P2: signed member QR, read cache, observability (11 Nov 2026)

## 1. Signed dynamic member QR
The flow is PWA **Lainnya → QR ID Anggota**, then the cashier scans, then the POS member lookup (`GET /api/pos/members?kind=qr`).

| | |
|---|---|
| Token | `KQ1.<kid>.<payload>.<sig>`. Ed25519 over `KQ1.<kid>.<payload>`. The payload is `{m: m_anggota.id, i: issued, e: expires, j: 16-byte id}`. |
| Lifetime | 60 s, with ±30 s clock skew tolerated. The PWA refreshes 10 s before expiry and whenever the screen becomes visible again. |
| Single use | The POS remembers `j` until expiry, so a second scan answers `QR_ALREADY_USED` ("minta QR terbaru"). |
| Privacy | No NIK, name or amount is in the QR. A screenshot is useless after 60 s. |
| Keys | The PWA holds the private key (`MEMBER_QR_SIGNING_KEY`). The POS holds only public keys (`MEMBER_QR_VERIFY_KEYS`, several during a rotation), so a leaked POS configuration cannot mint QRs. Generate the pair with `node scripts/generate-member-qr-keys.mjs <kid> <dir>`. |
| Legacy | Printed-card QRs (AES-CBC of the NIK, `POS_QR_SECRET_*`) keep working. A `KQ1.` token never falls back to the legacy decoder. |
| Not configured | The PWA shows "QR belum diaktifkan" with the NIK. The POS answers `QR_NOT_CONFIGURED` for dynamic tokens only. |

Code:
- `packages/application/src/member-qr/token.ts` (shared);
- `apps/mobile_kkisi/src/app/api/qr/route.ts`;
- `features/account/components/MemberQrCard.tsx`;
- `apps/web/src/infrastructure/pos/member-qr.ts` (`resolveMemberQr`).

## 2. Read cache (PWA, server memory only)
| Data | TTL | Why it is safe |
|---|---|---|
| Account active/deleted state | 30 s (`MEMBER_ACCOUNT_STATE_CACHE_MS`, 0 = off) | A deactivation takes effect within 30 s instead of instantly. Password/PIN lookups are never cached. |
| Master Pinjaman Mobile | 5 min | Changes rarely. apps/web re-checks bounds on the live master at intake. |
| Catalog categories, FAQ, notices | 5 min | Public / non-financial. |
| Published SHU per member | 10 min | Published SHU is never recalculated. Keyed by the session's NIK keys. |

These are never cached: savings, loans and schedules, payroll deductions, store credit, transactions, requests and favourites. Concurrent misses share one database read (single-flight). Errors are not cached. Hit and miss counts are reported in metrics.

## 3. Observability
- **Request id.** nginx `$request_id` is passed as `X-Request-Id`, kept by the proxy (or generated), echoed in the response, and attached to every log line and slow-query record of auth and mutation requests.
- **Per-query latency.** Every statement is labelled `<verb> <table>` (no SQL text or values). The last 512 samples per label give p50, p95, max, the error count and the slow count (≥500 ms).
- **`GET /health?check=metrics`.** Internal callers only; through nginx it answers 404. It reports pool readiness, query stats, cache stats, memory, and `alerts[]` evaluated against `METRICS_P95_WARN_MS` (1000), `METRICS_P95_CRITICAL_MS` (3000) and `METRICS_ERROR_RATE_WARN` (0.05). A pool that is down is always critical.
- **Host monitor.** `deploy/mobile_kkisi/monitor/` holds a script and a systemd timer that runs every 2 minutes. It checks:
  - the PWA metrics;
  - genesis `/health/ready`;
  - the four web and tunnel containers.

  It writes to syslog (`journalctl -t kkisi-monitor`) on every state change and optionally posts to `ALERT_WEBHOOK_URL` (`/opt/apps/kkisi-mobile/monitor.env`, any Slack/Discord/Chat-compatible incoming webhook). A refused tunnel key like the one on 10 Nov 2026 surfaces within 2 minutes.

## 4. Deploy steps (owner/operator)
1. Generate a key pair on .178 (`scripts/generate-member-qr-keys.mjs q1 /opt/apps/kkisi-mobile/qr-keys`). Put the private key in the PWA env and the public key in the genesis env.
2. Redeploy genesis (POS verify) and the PWA (signing, cache, metrics).
3. Install the monitor:
   - `install -m 755 …/kkisi-monitor.sh /usr/local/bin/`;
   - copy the units to `/etc/systemd/system/` and run `systemctl enable --now kkisi-monitor.timer`;
   - optionally set `ALERT_WEBHOOK_URL`.
4. Add `proxy_set_header X-Request-Id $request_id;` to the live nginx site (already in the repo example).
