# 10 — Security Hardening (WS-01)

## 1. PIN Consumer Audit & Coexistence Strategy

### 1.1 Consumers of `smartkkisi.users.pin`
An audit of the repository and the 30 Sep / Oct 2026 database snapshot (`kkisi_refresh_20261030`, 1,192 total `users` rows; 575 active `is_active = 1 AND (is_delete IS NULL OR is_delete = 0)`) established:

| Consumer | Access Pattern | Format Observed in Snapshot | Coexistence Constraint |
|---|---|---|---|
| Legacy `smartkkisi` Laravel / Mobile App | Reads/writes `users.pin` (`VARCHAR(255)`) | **100% (1,192/1,192)** are 4-digit plaintext (`^[0-9]{4}$`); `0` empty, `0` 6-digit, `0` bcrypt/scrypt | Altering `users.pin` in place on the live database before legacy mobile retirement would break PIN verification in the legacy `smartkkisi` app. |
| KOSIPA Console (`apps/web`) | None (`apps/web` uses `console_users` / staff auth, never `users.pin`) | N/A | Independent |
| Member PWA (`apps/mobile_kkisi`) | Reads `users.pin` via `storedPin(userId)` (`SELECT`-only reader account) | Supports `$scrypt-p$`, `$scrypt$`, `$2a$/$2b$/$2y$` (bcrypt), and legacy 4–6 digit plaintext | Must verify existing 4-digit PINs without modifying `smartkkisi.users.pin` while eliminating plaintext verification overhead and preparing for hashed storage. |

### 1.2 Memory-Hard `scrypt` + HMAC Pepper & Shadow Credential Store
Because a 4-digit PIN has only $10^4 = 10{,}000$ possible values, unsalted or unpeppered hashes remain vulnerable to offline precomputation if a credential table is ever leaked. We implemented a two-layer defense in [`policy.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/auth/policy.ts) and [`auth-service.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/auth/auth-service.ts):

1. **Memory-hard `scrypt` with server-side HMAC pepper (`$scrypt-p$`)**:
   - Pre-hashes the PIN with `HMAC-SHA256(pepper.key, "kkisi:pin:v1:" + pin)` using the active key from `MEMBER_PIN_PEPPER` (or a dedicated pepper key derived from `MEMBER_AUTH_SECRETS` via `derivePinPeppers`).
   - Runs Node `crypto.scrypt` (`N = 16384, r = 8, p = 1, maxmem = 32 MB`, 16-byte random salt, 32-byte output).
   - Encodes the credential as `$scrypt-p$kid=<kid>,n=16384,r=8,p=1$<salt_b64url>$<hash_b64url>`.
   - Key rotation is supported natively via the `kid` header and `pinPeppers` key ring.
2. **Shadow PIN Credential Store (`kkisi_member_auth.member_pin_credentials`)**:
   - Defined in [`001_member_auth.sql`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/db/auth/001_member_auth.sql): stores `(user_id, source_digest, pin_hash, hash_scheme, updated_at)` in the PWA's isolated `kkisi_member_auth` database.
   - `source_digest` is `HMAC-SHA256(activeSecret, "pin-src:" + users.pin)`.
   - On PIN verification (`verifyPin`), if a shadow row exists whose `source_digest` matches the current upstream `users.pin`, the PWA verifies against `member_pin_credentials.pin_hash` (`$scrypt-p$`).
   - When a member verifies a legacy plaintext PIN (or if an administrator resets `users.pin` in `smartkkisi`, causing `source_digest` to change), the PWA transparently writes a fresh `$scrypt-p$` hash into `member_pin_credentials` without mutating `smartkkisi.users`.

---

## 2. Account-Level & Cross-Session PIN Lockout Hardening

In Phase 1, `pinFailures` was tracked only per `member_sessions` row (`MAX_PIN_FAILURES = 5`), allowing an attacker who knew a member's password to re-authenticate at `/masuk` after 4 failed PIN attempts to obtain a fresh `pinFailures = 0` session.

Phase 2 closes this vector in [`auth-service.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/auth/auth-service.ts):
- **Single active PIN-stage session per user**: `login()` calls `store.revokePinSessions(account.userId, 'rotated', now)` before inserting a new `stage = 'pin'` row, invalidating any prior open PIN-stage cookie.
- **Cross-session failure carryover**: `login()` reads the account-level `pin` throttle state (`throttleKey('pin', String(account.userId), active)`) and initializes the new session's `pinFailures` to `activePinFailures % MAX_PIN_FAILURES`. Re-logging in after 3 failed PIN attempts leaves only `5 - 3 = 2` attempts in the new session.
- **Account-level + IP-level PIN lockout**: Every failed PIN attempt increments both `throttleKey('pin', String(session.userId), active)` (limit `10` failures per 15-minute window -> 15-minute account lock) and `throttleKey('ip', clientIp, active)` (limit `30` failures per 15-minute window -> 15-minute IP lock). When locked, both `verifyPin()` and `login()` reject the account with `PIN_LOCKED` / `THROTTLED`.

---

## 3. Member Identity Mapping & Duplicate NIK Safeguards

### 3.1 Snapshot Findings on `m_anggota`
Read-only inspection of `kkisi_refresh_20261030.m_anggota` (9,351 rows) revealed:
- Status distribution: `AKTIVE` (`5,527`), `RESIGN` (`1,857`), `0,00` corrupted import status (`1,427`), `PENSIUN` (`540`).
- **4 canonical NIK groups** have multiple rows in `m_anggota`:
  1. `id 0 (AKTIVE) | id 8344 (AKTIVE)` — placeholder `nik_kar = '0'`.
  2. `id 8031 (AKTIVE) | id 10008 (AKTIVE)` — two active rows sharing a canonical NIK.
  3. `id 5567 (AKTIVE) | id 9994 (AKTIVE)` — two active rows sharing a canonical NIK.
  4. `id 1807 (AKTIVE) | id 3318 (RESIGN)` — one historical resigned row and one current active row (the only duplicate among the 575 active `users` accounts).

### 3.2 Fail-Closed `resolveMemberIdentity` Policy
Implemented in [`policy.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/auth/policy.ts):
1. Rejects empty or `'0'` NIKs (`no_member_record`).
2. Filters candidate `m_anggota` rows whose canonical `nikLookupKeys(row.nik)` intersects `nikLookupKeys(expectedNik)`.
3. Separates rows with `status === 'AKTIVE'`:
   - If `activeRows.length === 1`: selects that unique active member record (correctly resolving `id 1807` over historical `RESIGN` `id 3318`).
   - If `activeRows.length > 1`: **fails closed** with `{ ok: false, reason: 'ambiguous_member' }` (never guessing via `ORDER BY id DESC LIMIT 1`).
4. If `activeRows.length === 0`:
   - If multiple non-active rows exist: fails closed with `{ ok: false, reason: 'ambiguous_member' }`.
   - If a single `RESIGN` / `PENSIUN` / `KELUAR` row exists: refuses login with `{ ok: false, reason: 'member_inactive' }` (`ACCOUNT_INACTIVE`).

---

## 4. Browser, Cookie, CSP & Session Lifecycle Controls

- **Cookie Isolation**: Production uses `__Host-kkisi_member` (`HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain` attribute), isolating the cookie from `kkisitb2.id` and all sibling subdomains.
- **Session Rotation & Revocation**: Pre-PIN session IDs (`stage = 'pin'`, 5-minute TTL) are atomically rotated (`rotate()`) on PIN success into a new 256-bit session ID (`stage = 'active'`, 30-minute sliding idle TTL, 12-hour absolute TTL). Every authenticated request re-queries `users.is_active` and `users.is_delete`.
- **Back-Forward Cache (`bfcache`) Protection**: [`PwaRuntime.tsx`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/components/pwa/PwaRuntime.tsx) registers a `pageshow` listener (`if (e.persisted) window.location.reload()`) in addition to `Cache-Control: private, no-store, no-cache, must-revalidate` on all member routes, ensuring back-button navigation after logout never displays a cached screen.
- **Strict CSP & Framing Protection**: [`proxy.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/proxy.ts) enforces `default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` and `X-Frame-Options: DENY`.

