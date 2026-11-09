# 02 — Architecture

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js 16.3.7 App Router, React 19, TypeScript — same versions as `apps/web` | one toolchain; pnpm resolves both apps to the same packages |
| Independence | separate workspace app `@koperasi/mobile-kkisi`, own port (3240 dev), own image, compose project, domain | release and roll back without touching the console |
| Member identity | existing smartkkisi `users` account + KOSIPA `m_anggota` by NIK | the accounts members already have; no new identity system |
| Session model | BFF: opaque 256-bit id in an HttpOnly host-only cookie, server-side session row (HMAC of the id), PIN as second step, id rotated after PIN | revocable, nothing readable by scripts, no tokens in storage |
| Data access | mysql2, parameterised raw SQL mirroring the console's KOSIPA repositories, member-scoped | the console repositories need its generated Prisma client; generating another schema would overwrite it (shared pnpm store) |
| Business rules | reused from `@koperasi/domain` / `@koperasi/application` (summarizeTypes, describeMovement, describeLoan, assessSchedule, loanSchedule, loadMemberPayrollHistory, describeRow, memberCredit, masking, Rupiah formatting) | no duplicated financial logic |
| Writes | none to the legacy database | no approved member writer exists; production DB changes are manual-only |
| Rendering | Server Components for every data screen, Suspense streaming with layout-matched skeletons; Client Components only for interaction | minimal JS (~140 KB gzip per screen), no client data fetching for member data except the checkout re-price |
| Styling | layered global CSS from the mockup (tokens → base → components → screens), conflicting names scoped by `data-screen` | faithful reproduction of the approved design |
| PWA | hand-written service worker served by a route, policy function shared with unit tests | no plugin; exact control of what may be cached |

## Layers

```
src/app/                 routes only: (auth)/masuk, (auth)/pin, (member)/…, api/auth/*, api/belanja/harga, sw.js, manifest, health
src/features/<feature>/
  components/            feature UI (client components where interaction is needed)
  services/<f>.ts        pure mapping: reader rows -> view models, using domain rules (unit-tested)
  services/<f>.server.ts session-bound loaders: requireMember() -> reader(nikKeys from session) -> mapper; return Loaded<T>
src/components/          shared UI: layout, navigation, overlay (Sheet), feedback, pwa, ui (Icon, ServiceArt)
src/providers/           PrivacyProvider (hide amounts), CartProvider (session cart)
src/hooks/               browser-store (useSyncExternalStore over Web Storage / feature detection)
src/lib/                 config/env (fail-closed), auth/session.server, security/request, api/client, navigation, pwa, utils, errors
src/server/
  auth/                  ports, policy, auth-service, memory + MySQL session stores, bcrypt worker pool, HTTP envelope
  kosipa/                member-scoped SELECT readers (identity, member, store, content)
  db/mysql.ts            guarded pools (exact decimals, text dates, 5 s statements)
  container.ts           composition root
```

Features: `auth`, `home`, `member`, `savings`, `loans`, `deductions`, `shu`, `store-credit`, `transactions`, `catalog`, `account`, `ppob`.

## Request flow (member screen)

1. `proxy.ts` (optimistic): no session cookie → redirect to `/masuk?next=…` (API → 401 JSON); forwards the path for deep links.
2. `(member)/layout.tsx` → `requireMember()`; each page's loaders call it again (memoised per request with React `cache`).
3. `resolveMember()` reads the session row by HMAC, checks idle (30 min) / absolute (12 h) deadlines, then re-reads `users.is_active/is_delete` — a deactivated account loses access on its next request.
4. Loaders read with the session's NIK keys only; no route parameter ever selects a member, loan or document.
5. Mappers apply domain rules; components format with the shared Rupiah standard; unavailable sections render as such.

## Security properties

* Cookie `__Host-kkisi_member` (HTTPS) / `kkisi_member` (loopback dev): HttpOnly, SameSite=Lax, Path=/, no Domain → never shared with other `kkisitb2.id` subdomains.
* CSRF: Origin/Referer must equal `APP_ORIGIN`, `Sec-Fetch-Site: cross-site` refused, JSON body required; no CORS is granted.
* Brute force: identity (8) and IP (30) failures per 15 min → 15 min lock; PIN: 5 failures revoke the session.
* Enumeration: unknown identity, wrong password and ambiguous phone give the same error and the same bcrypt cost.
* Headers: CSP (`default-src 'self'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cache-Control: private, no-store` on every non-static response.
* Logs: one JSON line per auth event, never identities, NIKs, IPs, passwords or PINs.
* Config fails closed (missing secret/DSN/origin → login unavailable); production refuses HTTP origins, the memory store, root DSNs, and a reader that shares the session-store account.

## Future readiness (not implemented)

Push notifications (service worker already root-scoped; would need a VAPID key, a subscription table and consent UI), notification preferences, passkeys (would sit after the password step in `auth-service`), and member write flows (each needs an approved least-privilege writer as in `docs/migration/sql/*-writer-production.sql`).
