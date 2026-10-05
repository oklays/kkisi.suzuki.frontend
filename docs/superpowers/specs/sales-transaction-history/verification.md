# Verification & Traceability — Sales Transaction History

## 1. Status evidence

Implementasi aplikasi dan unit/contract checks sudah tersedia di checkout lokal. Ini **belum** membuktikan schema/index, permission assignment, query plan/performance, receipt readability, atau acceptance di staging/production. Skenario V01..V22 di bawah tetap menjadi target acceptance; only evidence explicitly listed here is marked locally verified.

Local checks run after implementation: `pnpm check` (lint, all workspace typechecks, and all unit suites) and `pnpm build` (Next production build). The final check reported domain 20/20, application 20/20, and web 173 passed, 0 failed, 42 skipped; skips are existing opt-in staging/writer tests and do not count as feature acceptance. Four existing lint warnings remain in transaction panel and register test code. Focused new repository/HTTP/UI/receipt tests also passed. `git diff --check` passed; live browser and staging checks remain pending.

The source audit and Prisma mapping were checked locally. No database/schema/migration/seed/grant/provision action was performed, and no operational database or production site was inspected. TASK-001's staging gate, TASK-009's runtime/browser/performance gate, and TASK-010's staging rollout rehearsal remain open. See [implementation handover](../../../migration/SALES_TRANSACTION_HISTORY_IMPLEMENTATION.md).

## 2. Requirement traceability matrix

| ID | Design | Tasks | Verification |
|---|---|---|---|
| REQ-001 | D1,D2 | TASK-006,TASK-007 | V01,V19 |
| REQ-002 | D1,D3 | TASK-001,TASK-002,TASK-003,TASK-007 | V02,V03 |
| REQ-003 | D2,D3,D4 | TASK-002,TASK-003,TASK-004,TASK-007 | V03,V04,V05 |
| REQ-004 | D2,D3,D4 | TASK-002,TASK-003,TASK-004,TASK-007 | V04,V05 |
| REQ-005 | D2,D3,D4 | TASK-002,TASK-003,TASK-007 | V05,V18 |
| REQ-006 | D2,D3,D4 | TASK-002,TASK-003,TASK-004,TASK-008 | V06,V07 |
| REQ-007 | D3,D4,D6 | TASK-002,TASK-003,TASK-004,TASK-008 | V08,V09 |
| REQ-008 | D5 | TASK-005,TASK-008 | V10,V11,V12 |
| REQ-009 | D3,D5 | TASK-001,TASK-002,TASK-003,TASK-005,TASK-008 | V07,V09,V10,V13 |
| REQ-010 | D4,D5 | TASK-002,TASK-003,TASK-004,TASK-005,TASK-008 | V12,V13,V14 |
| REQ-011 | D2,D3,D4 | TASK-002,TASK-003,TASK-007,TASK-008 | V07,V15 |
| REQ-012 | D1,D5,D6 | TASK-004,TASK-005,TASK-006,TASK-008 | V01,V08,V10,V16 |
| REQ-013 | D2,D6 | TASK-006,TASK-007,TASK-008 | V17 |
| REQ-014 | D2,D4,D7 | TASK-004,TASK-005,TASK-007,TASK-008 | V14,V16,V18 |
| REQ-015 | D2 | TASK-006,TASK-007,TASK-008 | V19 |
| REQ-016 | D1,D3,D6,D7 | TASK-003,TASK-004,TASK-006,TASK-009 | V20,V21 |
| BR-001 | D3,D5 | TASK-001,TASK-002,TASK-003,TASK-008 | V02,V09,V13 |
| BR-002 | D3,D5 | TASK-001,TASK-002,TASK-003,TASK-005,TASK-008 | V09,V10,V13 |
| BR-003 | D3,D5 | TASK-001,TASK-002,TASK-003,TASK-005,TASK-008 | V07,V10 |
| BR-004 | D3,D5 | TASK-001,TASK-002,TASK-003,TASK-005,TASK-008 | V10,V16 |
| BR-005 | D5 | TASK-002,TASK-005,TASK-008 | V11,V12,V14 |
| VAL-001 | D2,D3,D4 | TASK-002,TASK-004,TASK-007 | V03,V04,V05 |
| VAL-002 | D2,D3,D4 | TASK-002,TASK-004,TASK-005,TASK-007 | V04,V05,V16 |
| VAL-003 | D3,D4,D5 | TASK-002,TASK-003,TASK-005,TASK-008 | V09,V13 |
| VAL-004 | D3,D4,D5 | TASK-002,TASK-003,TASK-004,TASK-005,TASK-008 | V06,V09,V12 |
| SEC-001 | D1,D6 | TASK-004,TASK-005,TASK-006,TASK-009 | V01,V16 |
| SEC-002 | D1,D5,D6 | TASK-004,TASK-005,TASK-006,TASK-008,TASK-009 | V01,V08,V16 |
| SEC-003 | D3,D5,D6 | TASK-003,TASK-004,TASK-005,TASK-008,TASK-009 | V04,V07,V08,V16,V17 |
| SEC-004 | D3,D5,D6 | TASK-003,TASK-004,TASK-005,TASK-007,TASK-008 | V07,V09,V16,V22 |
| SEC-005 | D3,D6 | TASK-003,TASK-004,TASK-005,TASK-007,TASK-009 | V04,V16,V22 |
| NFR-001 | D3,D7 | TASK-003,TASK-009,TASK-010 | V21 |
| NFR-002 | D1,D5,D7 | TASK-005,TASK-006,TASK-009,TASK-010 | V10,V20,V22 |
| NFR-003 | D2,D3,D7 | TASK-003,TASK-007,TASK-009 | V05,V17,V18,V21 |
| OBS-001 | D7 | TASK-004,TASK-005,TASK-010 | V11,V22 |
| OBS-002 | D4,D5,D7 | TASK-002,TASK-004,TASK-005,TASK-007,TASK-008,TASK-010 | V07,V12,V13,V14 |
| MIG-001 | D1,D3,D7 | TASK-001,TASK-003,TASK-009,TASK-010 | V20,V22 |
| MIG-002 | D1,D3,D7 | TASK-001,TASK-003,TASK-009,TASK-010 | V20,V22 |
| MIG-003 | D7 | TASK-001,TASK-010 | V21,V22 |

## 3. Acceptance scenarios

| ID | Scenario / input | Expected result |
|---|---|---|
| V01 | Roles: sales_view-only, sales_add-only, kedua permission, neither; buka menu dan direct routes | Menu/list/detail sesuai sales_view; sales_add-only tidak dapat history tetapi checkout receipt tetap ada; neither403; semua caller shell konsisten |
| V02 | Sale POS/non-POS/PPOB, active/inactive, Final/Quotation/Hold/raw unknown | Default POS Final bulan berjalan; source all/nonpos dan semua status sesuai; PPOB dikecualikan; status inactive tetap terlihat tanpa label cancel palsu |
| V03 | 30 Sep–2 Okt, 30 Des–2 Jan, leap day, invalid29Feb, from>to, 93/94hari; clock dekat tengah malam WIB | Boundary dates inclusive benar;94hari/invalid400; default bulan/today WIB bukan timezone host |
| V04 | q berisi NIK leading-zero, quotes, `%`, `_`, `!`, backslash, SQL-like text; query companyId=999/duplicate/unknown/sort injection | Search literal/parameterized; tenant+date tetap berlaku; query invalid400 tanpa pembacaan data widened |
| V05 | Banyak sale hari sama, page1/2, page kosong, pageSize0/101, negative/fractional/unsafe IDs, offset berlebihan | Count sama filter; order date+ID deterministic; no duplication akibat joins; invalid400; empty page200 |
| V06 | Detail dengan >100 line, beberapa status line, >100 payment rows | Paging bounded, count benar, tidak download semua; raw status tampil; tidak memperlakukan partial page sebagai whole invoice |
| V07 | UMUM, pelanggan snapshot beda master, anggota dihapus; item renamed/inactive/hilang; child line foreign; session null/foreign | Header snapshot tetap; provenance label jujur; foreign data tidak tampil; DATA_INCOMPLETE/missing-session warning; tidak menghilangkan transaksi |
| V08 | sales_view tanpa sales_payment_view; hanya payment_view; keduanya; direct payment endpoint pada parent foreign/missing | UI+API konsisten; kedua permission perlu; forbidden sebelum repo; same404 untuk parent foreign/missing bila authorized |
| V09 | Cash paid>total, unpaid/Partial/Sebagian, Kredit Paid, QRIS, payment inactive/zero/multiple, pecahan header dan rounded payment DECIMAL(10,0) | Nominal raw masing-masing, bukan always grand_total; pembayaran inactive jelas; tidak mengubah rounded row atau menganggap Kredit physical cash |
| V10 | Eligible Cash/QRIS/Kredit, update created_time setelah sale, tax tersimpan nonzero, anggota current limit berubah | Preview80mm nilai saved; tanggal sales_date; reprint tidak query/menampilkan limit; tax tersimpan tidak ditambah lagi ke grand total; checkout auto-print regression tetap lulus |
| V11 | Klik print, cancel, repeated print, reload preview, buka preview lewat list | Preview tidak auto-print; dialog explicit; tidak mencatat sukses/count/copy number; operasi tidak mengubah sale/stock/session |
| V12 | Retur, non-POS, unknown payment, unsettled, missing line, >200line, multiple active payment, ambiguous charge/totals/tax | Detail tetap200 dengan alasan; preview reguler ditolak server409/notice; tidak mencetak receipt normal/palsu |
| V13 | Invalid/nonfinite/unsafe money atau negatif, header total tidak sama formula sederhana, round_off known rounded total dan round_off tak cocok | Invalid field null+warning bukan0; raw negative visible; print diblokir; known rounded grand total tidak memblokir cetak; nilai round_off lain diblokir dan tidak dianggap adjustment atau membuat total baru |
| V14 | Unknown status/return marker, stale eligible list lalu record berubah, no rows | Status raw tetap visible, print eligibility dicek ulang, error per record; empty berbeda dari failure |
| V15 | Filter sesi milik kasir lain di company sama, sesi hilang/asing, reference matching | Sale sesi dicari dari header; read tidak dibatasi created_by user; metadata asing tidak terbuka; tidak membuka full register management |
| V16 | Expired/revoked/disabled user/role/company, forged cookie, direct URLs, viewer memilih checkout mode, DB permission service gagal | Auth fail closed; unauthorized query tidak jalan; viewer tetap reprint tanpa aggregate kredit lintas cabang; no-store pada error/sukses; 404 foreign/missing |
| V17 | Admin switch branch via existing auth; delayed fetch response, dua tab; ordinary user mencoba company query | Session company otoritatif; clear old data dan reject/ignore stale response; policy switch existing dipertahankan |
| V18 | Loading/empty, network down, DB unavailable, retry, back dari detail | Messages berbeda; retry hanya GET; state URL/page restored; bukan fake data/checkout retry |
| V19 | Viewports375/390/768/1280/1440px, zoom80% existing, keyboard/tab, long name/invoice, payment notes HTML | Filter/actions bisa dipakai, no page overflow, lokal table scroll, label/focus/status jelas, HTML text escaped; print PDF80mm terbaca |
| V20 | Tanpa register open; writer URLs unavailable; pakai reader SELECT-only | History/detail/payments/reprint tetap berfungsi; zero business writes; session housekeeping existing dipisahkan dalam evidence |
| V21 | Dataset representatif, date31hari/page25, >=30requests per op setelah warm-up, EXPLAIN existing indexes | p95 list/detail/payment<=2s, receipt<=3s; bounded queries/noN+1; tidak menambah index/tabel. Kegagalan jadi gate, bukan silently declare pass |
| V22 | Review diff, payload/logs, regression checkout/register, rollback previous build | No DDL/schema/grant/provision/seed/backfill/PII/HPP/SQL leak; existing tests pass; rollback kode pulihkan routes/receipt tanpa SQL; produksi belum diklaim |

## 4. Commands

### Fase spec, sekarang

```sh
bash .agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/sales-transaction-history
git diff --check
git status --short
```

Validator skill hanya memastikan file wajib dan keberadaan REQ pada tasks/verification; design hit dicetak namun tidak digate, dan kategori lain belum diperiksa. Lengkapi dengan audit semua ID (`REQ|BR|VAL|SEC|NFR|OBS|MIG`) pada requirements terhadap design/tasks/verification, referensi task/design/scenario valid, dan review semantik setiap mapping.

### Baseline / setelah implementasi (bukan hasil task spec)

```sh
pnpm --filter @koperasi/web exec node --experimental-strip-types --test tests/pos-receipt-http.test.mjs tests/pos-receipt-repository.test.mjs tests/auth-route-guard-scan.test.mjs
pnpm --filter @koperasi/application exec node --experimental-strip-types --test tests/pos-receipt.test.mjs
pnpm check
pnpm build
```

### Proposed tests — tersedia setelah TASK-002..TASK-009

```sh
pnpm --filter @koperasi/domain exec node --experimental-strip-types --test tests/sales-history.test.mjs
pnpm --filter @koperasi/application exec node --experimental-strip-types --test tests/sales-history.test.mjs
pnpm --filter @koperasi/web exec node --experimental-strip-types --test tests/sales-history-repository.test.mjs tests/sales-history-http.test.mjs
pnpm --filter @koperasi/web exec node --experimental-strip-types tests/sales-history-browser.mjs
```

Proposed staging test memakai flag `SALES_HISTORY_STAGING_TEST=1`, guard host loopback dan database existing bernama staging, SELECT-only connection, tanpa scripts schema/seed, dan `.env.local` tetap privat. Dari root:

```sh
SALES_HISTORY_STAGING_TEST=1 pnpm --filter @koperasi/web exec node --env-file=.env.local --experimental-strip-types --test tests/sales-history-staging.test.mjs
```

Jangan run command proposed sebelum file dibuat. Browser suite memakai fake server/in-memory data untuk edge-case; runtime smoke hanya membaca staging existing dan session yang disetujui. Tidak menjalankan pos-browser-seed atau fixtures SQL karena membuat/menulis data. Dataset real yang tidak memuat edge case tidak meniadakan fake unit/HTTP coverage; juga tidak membuktikan edge case deployed.

## 5. Manual acceptance, rollout, dan rollback

1. Pastikan environment target memang staging existing, reader privileges/schema/index terkonfirmasi. Jangan provision DB/tabel.
2. Jalankan menu/list, default/filter lintas tanggal, detail, payment permission, same-company/foreign404, no register, dan switch branch. Report hanya status/count yang aman, tanpa export pelanggan.
3. Buka preview eligible Cash/QRIS/Kredit, bandingkan field tersimpan, save PDF80mm untuk QA lokal tanpa commit PII; print dialog/cancel tidak menjadi bukti printer fisik berhasil.
4. Verifikasi tax/rounding/return/unsupported reasons, fallback label dan absence credit aggregates pada reprint. Jika tidak ada sampel runtime, catat batas bukti dan gunakan fake tests.
5. Ukur benchmark/explain, review zero write path, jalankan regression dan full checks satu kali setelah perubahan final.
6. Rehearsal rollback kode pada environment yang disetujui; check receipt checkout existing dan auth. Tidak rollback SQL.

Acceptance hanya selesai jika requirements teruji dan gate aktual lulus. Task spec selesai ketika keenam dokumen lengkap, traceability tervalidasi, dan scope audit/unknown/runtime limits jelas. Deployment/production tetap memerlukan instruksi terpisah.

## Audit UI lokal 5 Oktober 2026

Lihat [audit UI dan behaviour](../../../migration/SALES_TRANSACTION_HISTORY_UI_AUDIT.md) untuk root cause, perbaikan, cakupan browser, dan batas evidence. Suite `node apps/web/tests/sales-history-browser.mjs` memeriksa entry langsung, sidebar permission parity, submit/invalid/reset/preset/pagination/back, pending navigation, lima viewport dan scroll terpisah, detail/keyboard, pembayaran cancel/retry/401/403, duplicate query/not-found, serta explicit reprint. Menggunakan akun/data uji lokal existing dan synthetic request interception; tidak provision/seed atau menulis transaksi baru. Physical print, matriks branch/role live, staging privilege/schema/index dan performance gates tetap terbuka.
