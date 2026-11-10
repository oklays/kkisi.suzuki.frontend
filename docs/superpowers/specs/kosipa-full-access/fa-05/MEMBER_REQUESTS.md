# FA-05 — Member requests (PWA intake, console review, deduction approval)

Date: 10 November 2026. Scope: P1 of the PWA Anggota audit.
- One write owner for member requests: the KOSIPA command pipeline in apps/web.
- Console review of `trans_pinjaman_pengajuan` / `trans_simpanan_pengajuan`.
- Native approval of deduction changes (legacy F45).

Converting a loan request into a loan (F47, `mobile/pinjaman_mobile_c`) is **not** in scope: it is loan origination and stays legacy. No production change has been made. Everything runs on the synthetic stacks, and the production SQL is review-only.

## 1. Flow

| Step | Who | Feature (flag) | From → to | What is written |
|---|---|---|---|---|
| Intake loan | PWA BFF, signed (`member.intake` channel) | `member.intake` (`KOSIPA_MEMBER_INTAKE_ENABLED`) | — → `OPEN` | INSERT `trans_pinjaman_pengajuan` (`PGJ-MBL-YYYYMMDD-XXXXXX`, `is_online` 1, `is_payroll` 1) |
| Intake deduction | PWA BFF, signed | `member.intake` | — → `OPEN` | INSERT `trans_simpanan_pengajuan` (`PPS-MBL-…`, `potongan_old` = current active deduction, effective next month, `is_mobile` 1, `remarks` PWA_ANGGOTA) |
| Reject loan request | officer (`kosipa.request.decide`) | `request.loan` (`KOSIPA_REQUEST_WRITES_ENABLED`), always shared | `OPEN` → `REJECTED` | `doc_status`, `keterangan_riject`, `ud`, `ud_usr` |
| Approve deduction | officer (`kosipa.request.decide`) | `request.deduction`, fenced (or owner-approved shared) | `OPEN` → `APPROVED` | every `m_simpanan_aktif` row of NIK + jenis: `doc_no`, `potongan_payroll`, `status` 1 (or one inserted row); `m_anggota.sim_wajib`/`sim_sukarela`; header `doc_status`, `posting_date`, `updated_at`, `ud_usr` |
| Reject deduction | officer (`kosipa.request.decide`) | `request.deduction` | `OPEN` → `REJECTED` | header `doc_status`, `updated_at`, `ud_usr` (reason in the ledger: the table has no reason column) |

Every command:
- runs in ONE transaction (`runCommandTransaction`);
- writes a ledger row;
- re-checks the rules on locked rows;
- uses guarded UPDATEs (`WHERE … AND doc_status = 'OPEN'`);
- verifies postconditions on every table it wrote.

Ids are found by a plain read and locked by primary key: none of these tables has an index on `doc_no` or `nik_kar`.

## 2. The member channel

- **Transport.** PWA BFF → `POST /api/internal/member-requests` over the Docker network `kkisi-internal` (`deploy/*/docker-compose.intake.yml`). The genesis nginx answers 404 for `/api/internal/`. The app also refuses a request whose client address is public (`TRUSTED_PROXY_HOPS`).
- **Authentication.** HMAC-SHA256 of `kkisi-intake:v1`, method, path, timestamp, nonce and SHA-256 of the body.
  - Header: `x-kkisi-intake`.
  - The key ring (`MEMBER_INTAKE_KEYS`) is shared by both apps; the first key signs and every key verifies, so keys can rotate.
  - Requests are accepted within ±60 s, and each nonce once per process.
  - Module: `@koperasi/application/member-intake/signature`.
- **Identity.** The body carries the PWA session's `memberId`, `userId` and NIK; the client never chooses them. apps/web locks the `m_anggota` row and requires the same id, the exact NIK and status AKTIVE (`REQUEST_MEMBER_INVALID`).
- **Idempotency.** The ledger key is a UUID-shaped digest of (member, client Idempotency-Key), with actor 0 and capability `member.intake`. The same key replays the first document; the same key with another payload is `IDEMPOTENCY_CONFLICT`.
- **Concurrency.** The `m_anggota` row lock serialises one member's intakes, so the count of OPEN loan requests (limit 3) is exact under parallel submits. Proven by `kosipa-member-request-db.test.mjs`.
- **Failure.** Network errors, timeouts, 5xx and signature or routing refusals reach the member as "layanan tidak dapat dihubungi" (503). A retry with the same key never duplicates.

## 3. Legacy F45 defects corrected

| Legacy (`mobile/pengajuan_mobile_c::ajax_proses`) | Native rule |
|---|---|
| Any status accepted, even re-approving | `OPEN` only; decided requests are immutable |
| No transaction: header, active deduction and member amount could diverge | One transaction with postconditions on all three tables |
| Inserted `m_simpanan_aktif` row left `potongan_old` / `is_mobile` to non-strict SQL mode | Explicit `potongan_old` (current deduction) and `is_mobile` 1 |
| Any jenis, any amount | Only WAJIB → `sim_wajib`, SUKARELA → `sim_sukarela`; whole Rupiah; WAJIB may only go up |
| NIK silently truncated into `m_simpanan_aktif.nik_kar varchar(10)` | Refused (`REQUEST_NIK_TOO_LONG`) |
| Ambiguous or exited member still applied | Exactly one AKTIVE member with that NIK |
| Public-link requests (`PSS…`) could be decided outside their lifecycle | Refused here (`REQUEST_TYPE_UNSUPPORTED`); the screen links to Pengajuan sukarela |

Kept on purpose:
- every matching NIK + jenis row is updated, as legacy does;
- the period of an inserted row runs from the 1st of the request month to 31 December.

A loan request that legacy already converted (a `trans_pinjaman` row with the same `doc_no`) can no longer be rejected (`REQUEST_ALREADY_CONVERTED`).

## 4. Coexistence

- `request.loan` has no fence: legacy `mobile/pinjaman_mobile_c` must stay open to convert requests.
- `request.deduction` is fenced against `mobile/pengajuan_mobile_c` and `simpanan/pengajuan_mobile_c` unless `KOSIPA_DEDUCTION_REQUEST_LEGACY_SHARED=true`. The local staging setup script keeps both screens open unless it is run with `--deduction-fence`. A request changed by legacy first is refused here as STALE.

## 5. Verification (synthetic only)

| Suite | Result |
|---|---|
| `packages/domain/tests/kosipa-member-request.test.mjs` | parse, plans, F45 corrections |
| `packages/application/tests/kosipa-member-request-command.test.mjs` | channel envelope, capabilities, list buttons, HMAC contract |
| `apps/web/tests/kosipa-member-request-db.test.mjs` (KOSIPA_FA01=1) | exactly-once intake, open limit under parallel load, member checks, reject / approve paths, fence vs shared, STALE, least privilege |
| `apps/web/tests/member-intake-http.test.mjs` | signature, replayed nonce, public caller, size, code-only errors |
| `apps/web/tests/kosipa-member-request-browser.mjs` (:3230) | signed intake → console reject + approve; read-only without grant; 375/768/1440 without overflow |
| `apps/mobile_kkisi` unit + integration | intake client mapping, config, session identity sent, replay/conflict/outage, PWA writer has no intake grant |

## 6. Production gates (owner)

1. The KOSIPA writer guard still refuses production writers; extending it is a separate reviewed change.
2. Account `kosipa_request_w`: `docs/migration/sql/kosipa-member-request-writer-production.sql`.
3. Deduction coexistence decision (§4).
4. Network `kkisi-internal`, both compose overlays and the shared key ring.
5. Check against public-savings triggers if CP2 is deployed (see the SQL file's open item).
