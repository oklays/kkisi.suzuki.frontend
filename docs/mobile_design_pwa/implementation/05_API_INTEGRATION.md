# 05 — API and data integration

The PWA is a backend-for-frontend: the browser talks only to `app.kkisitb2.id` (same origin, no CORS), and the server reads the shared legacy database with a SELECT-only account. Member data reaches the browser as server-rendered HTML/RSC, never through a public JSON API.

## HTTP endpoints of the PWA

| Method + path | Auth | Request | Response | Notes |
|---|---|---|---|---|
| `POST /api/auth/login` | public, CSRF-checked | `{identity, password}` JSON | `200 {next:"/pin"}` + session cookie (PIN stage) · `400 {error}` · `401 INVALID_CREDENTIALS` · `403 ACCOUNT_INACTIVE \| NOT_A_MEMBER` · `429 THROTTLED` + `Retry-After` · `503 NOT_CONFIGURED \| BUSY \| UNAVAILABLE` | identity = NIK, email or phone |
| `POST /api/auth/pin` | PIN-stage cookie, CSRF | `{pin}` | `200` + rotated cookie · `401 PIN_INVALID {remaining}` · `401 PIN_LOCKED \| SESSION_EXPIRED` (cookie cleared) · `409 PIN_NOT_SET` · `400 PIN_MALFORMED` | |
| `POST /api/auth/logout` | cookie, CSRF | `{}` | `200 {next:"/masuk"}`, cookie cleared, `Clear-Site-Data: "cache"` | revokes server-side |
| `GET /api/belanja/harga?items=id:qty,…` | member | ≤ 50 items, qty 1–99 | `{lines:[{id,quantity,item|null}], credit:{remainingSen}|null}` | prices re-read from `db_items`; never trusts client prices |
| `GET /health` | public | — | `{status,app,version,env}` | liveness only, no DB |
| `GET /sw.js`, `GET /manifest.webmanifest` | public | — | service worker / manifest | |

All responses: `Cache-Control: no-store` (member) and the security headers listed in 02. Errors are codes only; the client maps them to Indonesian messages (`src/lib/api/client.ts`).

## Tables read (SELECT only)

| Area | Tables | Columns of note | Scope | Mirrors |
|---|---|---|---|---|
| Login | `users` | `id, nik, email, phone, password, pin, is_active, is_delete` (`password_hit`, wallets, documents never read) | identity keys from the form; pin/state by session `user_id` | — |
| Member | `m_anggota` | profile, status, employment, exit date, address, `limit_toko`, `gaji_minus` | `id = session.memberId AND nik_kar IN session.nikKeys` | `kosipa-member.repository.ts member()` |
| Savings | `trans_simpanan_dtl`, `trans_simpanan` | per-type sums by header status; movements (keyset by id); header lookup separately | `nik_kar IN nikKeys` | `kosipa-savings.repository.ts` (all three statements) |
| Deductions | `m_simpanan_aktif`, `trans_simpanan_pengajuan`, `trans_simpanan_penarikan` | recorded deduction, change requests, withdrawals | `nik_kar IN nikKeys` | new, read-only |
| Loans | `trans_pinjaman`, `trans_pinjaman_dtl`, `trans_pinjaman_pengajuan` | header (same column set as the console), schedule aggregate + rows, applications | header by `nik IN nikKeys`; schedule only for a `doc_no` taken from that member's own headers in the same request | `kosipa-loan.repository.ts` HEADER, `scheduleAggregate`, `scheduleRows` |
| Loan products | `m_pinjaman_mobile`, `m_jenis_pinjaman` | min/max amount, tenor, rate, interest method | active rows (not personal) | Master Pinjaman Mobile (75efd4dd) |
| Payroll | `trans_potongan_matrix`, `trans_potongan_bulanan` | all 59 component columns from the domain catalog, totals; batch headers | `nik_kar IN nikKeys`, newest 12 | `kosipa-payroll.repository.ts memberHistory/headersByDocNo` |
| SHU | `trans_shu_dtl`, `trans_shu` | recorded SHU columns | `nik_kar IN nikKeys` and header `publish = 1` | new, read-only |
| Store credit | `db_sales`, `db_salesreturn` | Kredit + Final sales this Jakarta month, all branches, minus returns | `nik_kar = m_anggota.nik_kar` | `kosipa-member.repository.ts storeCredit` + `kreditReturnedSen` |
| Transactions | `db_sales`, `db_company`, `orders` | newest 60 sales + 40 orders | `nik_kar IN nikKeys` | new, read-only |
| Catalog | `db_items`, `db_category`, `db_units` | active finished products of store `MEMBER_CATALOG_COMPANY_ID`, excluding `SALDOPPOB` | not personal | same scope as the approved mockup snapshot |
| Content | `wishlists`+`products`, `faqs`, `notifications` | | wishlist by session `user_id` | new, read-only |

Every statement: bound parameters only (identifiers from closed lists), `SET STATEMENT max_statement_time=5`, LIMIT, DECIMAL casts so money arrives as exact strings, legacy dates as text.

## Business rules reused (not re-implemented)

| Rule | From |
|---|---|
| Savings sums by header status, pending/void/unverified separation, movement flags | `@koperasi/domain/kosipa` `summarizeTypes`, `describeMovement` |
| Loan view, status flags, schedule integrity, schedule row | `describeLoan`, `assessSchedule`, `describeScheduleRow` |
| Loan simulation | `loanSchedule` (Flat/Anuitas, BigInt, unit rounding) with the master's rate and method |
| Payroll history and component breakdown | `@koperasi/application/kosipa/payroll` `loadMemberPayrollHistory` + `describeRow` |
| Store credit limit and remaining | `@koperasi/domain/pos/sale` `memberCredit`, `businessDates` |
| NIK matching | `nikLookupKeys` / `canonicalNik` |
| Masking (phone, email) | `maskPhone`, `maskEmail` |
| Rupiah formatting (id-ID, exact decimals, compact) | `@koperasi/domain/money/rupiah` |

PWA-specific presentation rules (documented, testable in `tests/unit/features.test.mjs`): installment status words from recorded status + due month; latest active deduction per type; transaction status mapping; SHU column-to-label mapping (from the mockup arithmetic).

## Authorization

* The member is identified only from the server session (`users.id`, `m_anggota.id`, NIK keys). No URL or body parameter can choose another member, loan, document or wishlist.
* Loan schedules are read only for documents found in the member's own header list (IDOR test in E2E and integration suites).
* Account state is re-checked on every request; inactive/deleted accounts lose their sessions.
* The reader account cannot write (integration test asserts `UPDATE`/`INSERT` fail).

## Externally dependent

| Feature | Missing contract | UI today |
|---|---|---|
| Loan application, deduction change submission | approved member writer + legacy document numbering | validated summary + "Belum ada yang dikirim" |
| Store order / payment | order writer, delivery fees, coupons | server-priced cart + same notice |
| PPOB (pulsa, token, data, bills) | IAK product list/pricing/payment exposed to members | number validation + "belum terhubung" |
| Password/PIN change, reset, registration | smartkkisi flows (source unavailable) | guidance to contact the cooperative |
| QR member ID | QR payload format accepted by POS | NIK shown, no QR generated |
| WhatsApp/ticket help, legal texts | official number/content | truthful placeholders |
