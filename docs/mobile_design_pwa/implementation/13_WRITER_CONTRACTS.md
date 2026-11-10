# 13 — Member Transaction & Writer Contracts (WS-03)

## 1. Writer Ownership & Readiness Classification

Every member-facing mutation flow was audited against the legacy database schema (`smart_kopkar`), the KOSIPA console (`apps/web`), and external provider dependencies:

| Flow | UI Route | Target Table / External System | Classification | Rationale |
|---|---|---|---|---|
| **Loan Application** (`loan_application`) | `/pinjaman/ajukan` | `trans_pinjaman_pengajuan` (`doc_status = 'OPEN'`, `status_pencairan = 'OPEN'`, `is_online = 1`, `is_payroll = 1`) | `SAFE_TO_ENABLE_WITH_DB_WRITER` (Disabled by default: `ENABLE_LOAN_APPLICATION=false`) | `trans_pinjaman_pengajuan` is a dedicated pending-intake table. Inserting an `OPEN` row never mutates the active loan ledger (`trans_pinjaman` / `trans_pinjaman_dtl`), which is created only when a cooperative officer approves the application in KOSIPA. |
| **Savings Deduction Change** (`deduction_change`) | `/potongan/ajukan` | `trans_simpanan_pengajuan` (`doc_status = 'OPEN'`, `is_mobile = 1`, `status_notif = 0`) | `SAFE_TO_ENABLE_WITH_DB_WRITER` (Disabled by default: `ENABLE_DEDUCTION_CHANGE=false`) | `trans_simpanan_pengajuan` is a dedicated pending-intake table. It never overwrites `m_simpanan_aktif` or `trans_potongan_matrix` directly; officer approval applies the change for `awal_potong_bulan` / `awal_potong_tahun`. |
| **Member Favourites** (`favourite_toggle`) | `/favorit` | `wishlists` (`customer_id`, `product_id`) | `SAFE_TO_ENABLE_WITH_DB_WRITER` (Disabled by default: `ENABLE_MEMBER_FAVOURITES_WRITE=false`) | Non-financial member preference table scoped strictly to `customer_id = session.userId`. |
| **Store Checkout** (`store_checkout`) | `/belanja/checkout` | `orders` + `order_details` (S-MART e-commerce) / `db_sales` (POS) | `CONTRACT_DEFINED_ONLY` (Disabled by default: `ENABLE_STORE_CHECKOUT=false`) | `orders` requires coupled writes to `order_details` (mapping POS `db_items` to e-commerce `products`), stock reservation, and cashier notification in `smartkkisi`. Server-side cart validation and credit checks are implemented, and the BFF fails closed with `503 UPSTREAM_WRITER_UNAVAILABLE` until an upstream S-MART order API is connected. |
| **PPOB Services** (`ppob`) | `/layanan/[layanan]`, `/layanan/checkout` | External IAK (`mobilepulsa.net`) API + `orders` / `db_sales` | `BLOCKED_BY_EXTERNAL_PROVIDER` (Hard-disabled on server: `ENABLE_PPOB=false`) | Requires live third-party bill inquiry, product pricelist sync, balance debit, and signed webhook settlement. Number validation is available in the UI, and the BFF fails closed with `403 FEATURE_DISABLED` / `503 PROVIDER_UNAVAILABLE`. |

---

## 2. Server-Enforced Feature Capability Flags

Configured in [`env.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/lib/config/env.ts) and evaluated in [`container.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/container.ts):

```ini
ENABLE_LOAN_APPLICATION=false
ENABLE_DEDUCTION_CHANGE=false
ENABLE_STORE_CHECKOUT=false
ENABLE_PPOB=false
ENABLE_MEMBER_FAVOURITES_WRITE=false
```

- All five flags default to `false`. Any value other than `'true' | '1' | 'false' | '0' | '' | undefined` throws `ConfigError` at startup.
- In [`container.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/container.ts), a DB-backed writer flag (`enableLoanApplication`, `enableDeductionChange`, `enableMemberFavouritesWrite`) evaluates to `true` **only** when both the environment flag is `true` **and** `DATABASE_URL_MEMBER_WRITE` is configured with a dedicated non-root writer account distinct from `DATABASE_URL_MEMBER_READ`.
- Current effective flags are reported by `GET /health` and `GET /health?check=ready` to internal callers only (loopback / container network); through nginx the endpoint answers `{status}` alone.

---

## 3. BFF Mutation Contract (`POST /api/transaksi/ajukan`)

Implemented in [`route.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/app/api/transaksi/ajukan/route.ts) and [`member-mutations.ts`](file:///Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/mobile_kkisi/src/server/writers/member-mutations.ts):

1. **CSRF & Content-Type**: Enforces `sameOrigin(request.headers, settings.origin)` (`403 CSRF`) and `application/json` (`415 BAD_REQUEST`).
2. **Session & Live Account Verification**: Calls `resolveMember(deps, sid)`. Pre-PIN sessions receive `403 PIN_REQUIRED`; expired or deactivated accounts receive `401 UNAUTHENTICATED` with cookie clearing.
3. **Member Ownership**: The member's `userId`, `memberId`, `nik`, and `nikKeys` are taken exclusively from the server session — never from the request body.
4. **Idempotency & Payload Hash Ledger (`kkisi_member_auth.member_command_ledger`)**:
   - Every mutation requires `Idempotency-Key` (`16..64` chars matching `/^[A-Za-z0-9._:-]{16,64}$/`).
   - Computes `payload_hash = SHA-256(canonical_payload)`.
   - Replaying the same `(member_id, command_kind, idempotency_key)` with the same `payload_hash` returns `200 OK` (`replayed: true`) with the original `docNo` without inserting a duplicate row.
   - Replaying the same `Idempotency-Key` with a different payload returns `409 IDEMPOTENCY_CONFLICT`.
   - **Exactly-once (P0, 10 Nov 2026)**: the legacy intake tables have no unique key on `doc_no`, so the body is parsed strictly first (unknown fields → `400 FIELD_NOT_ALLOWED`), then the command runs under an expiring per-member lease (`member_write_lease`, 30 s; a waiting double-tap replays the first result, otherwise `409 BUSY_RETRY` + `Retry-After`). Inside the lease the ledger row is **reserved as `PENDING` with the planned `doc_no` before the business insert**, completed to `RECORDED` after it, and deleted when the command is refused before any write. A `PENDING` row found later is reconciled through the reader views (`doc_no` + `nik_kar`): an existing business row is replayed, a missing one is written once under the reserved number. The open-application limit is checked inside the same lease, so parallel submits cannot exceed it.
5. **Write Rate Limiting**: Capped at 10 write attempts per 15 minutes per `memberId` via `throttleKey('write', String(member.memberId), secret)`, counted with one atomic statement (`throttleHit`).
6. **Server-Side Recalculation**:
   - `loan_application`: Re-reads `m_pinjaman_mobile` + `m_jenis_pinjaman`, runs `simulateLoan()` on the server, verifies `< 3` existing `OPEN` loan applications, and generates `PGJ-MBL-YYYYMMDD-XXXXXX`.
   - `deduction_change`: Re-reads `m_simpanan_aktif`, runs `validateDeductionChange()` on the server, computes next Jakarta business month (`businessMonth(now, 1)`), and generates `PPS-MBL-YYYYMMDD-XXXXXX`.
   - `store_checkout`: Re-reads `db_items` prices and `buildStoreCredit()` remaining balance on the server before checking upstream writer availability.

