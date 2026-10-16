# Requirements — `unified-console-kosipa-warehouse`

## 1. Overview & Business Objectives

- **Problem Statement:** Operasional koperasi tersebar di empat aplikasi (TOKO Next.js + TOKO PHP, KOSIPA CI2, Gudang CI3, smartkkisi Laravel) dengan tiga identitas staf, tiga model otorisasi, dua database bisnis, dan penulis ganda pada tabel bersama. KOSIPA dan Gudang berjalan di PHP 5.6 dengan celah keamanan aktif (ANO-K01, G01, G06) serta anomali perhitungan uang (ANO-K04, K05, K07, X01).
- **Business Goal:** Satu console Next.js dengan satu login dan satu navigasi berbasis capability, lalu pemindahan KOSIPA dan Warehouse secara bertahap (read-first, kemudian write per bounded context) dengan perhitungan yang benar, aman, dan dapat diaudit, **tanpa mengganggu operasi TOKO**.
- **Target User Roles (persona, bukan `role_id`):** Super Admin/Manajemen, Supervisor TOKO, Kasir, Petugas KOSIPA (simpanan/pinjaman/payroll), Penyetuju KOSIPA (ketua/bendahara), Staf Gudang, Admin Sistem. Anggota memakai PWA terpisah (P3).

Prioritas: **S0** hotfix legacy & bukti · **P0** console · **P1** KOSIPA · **P2** Warehouse + paritas TOKO · **P3** lanjutan.

## 2. Requirements Matrix

### Functional Requirements (`REQ-*`)

#### S0 — Keamanan legacy & bukti skema

- `REQ-001` (S0, **DEFERRED**): Risiko otorisasi dokumen cetak pada KOSIPA legacy.
  - **EARS:** `WHILE the legacy application remains in operation, THE SYSTEM SHALL record the risk as an accepted deferred operational risk; THE NEXT.JS REPLACEMENT SHALL serve every member/loan/payroll document only through authenticated, capability-checked routes with bound parameters (SEC-001, SEC-002).`
  - **Traceability:** register privat. Keputusan owner 16 Okt 2026: legacy tidak diubah.
- `REQ-002` (S0, **DEFERRED**): Risiko ekspor dan API pada Gudang legacy.
  - **EARS:** `WHILE the legacy application remains in operation, THE SYSTEM SHALL record the risk as an accepted deferred operational risk; THE NEXT.JS REPLACEMENT SHALL stream exports as authenticated responses and SHALL take scope from the session, never from request input (REQ-053, SEC-005).`
  - **Traceability:** register privat. Keputusan owner 16 Okt 2026: legacy tidak diubah.
- `REQ-003` (S0): Ambil bukti skema yang hilang secara read-only.
  - **EARS:** `WHEN the S0 baseline is captured, THE SYSTEM SHALL record the definitions of all views, procedures, functions, triggers and events in smart_kopkar, the no-data schema of smart_kopkar_gudang, and the consumers of smart_kopkar_toko and m_barang, without any write.`
  - **Traceability:** ANO-K07, ANO-X03, ANO-X07. Script: `docs/migration/sql/legacy-schema-objects-readonly.sql`.

#### P0 — Unified Console (dari PRD FR-01…FR-12)

- `REQ-010`: Console terproteksi tanpa syarat `sales_add`.
  - **EARS:** `WHEN an anonymous user opens /console or any /console/* path, THE SYSTEM SHALL redirect to /login?next=<same-site path>.` `WHEN an authenticated, active user without sales_add opens /console, THE SYSTEM SHALL render the console with only the sections that user is entitled to.`
  - **Traceability:** PRD FR-01, R-07.
- `REQ-011`: Registry navigasi bertipe + capability resolver server.
  - **EARS:** `WHEN a console page renders, THE SYSTEM SHALL resolve the user's capabilities once per request on the server and SHALL derive every menu item, card and quick link from the single navigation registry.` `WHEN an item's required capability is absent, THE SYSTEM SHALL omit the item from the rendered output.`
  - **Traceability:** PRD FR-02, ANO-K20.
- `REQ-012`: Sidebar berbasis seksi (Dashboard, KOSIPA, TOKO & POS, WAREHOUSE, Laporan, Pengaturan) dengan status kesiapan.
  - **EARS:** `WHEN a registry item has readiness 'planned', THE SYSTEM SHALL NOT render it as a link.` `WHEN a section has no visible items for the user, THE SYSTEM SHALL hide the section header.`
  - **Traceability:** PRD §7.2, G6.
- `REQ-013`: Kartu modul di dashboard yang jujur.
  - **EARS:** `WHEN the dashboard renders module cards, THE SYSTEM SHALL label each as Available, Read-only, Coming soon or Restricted from registry readiness and SHALL NOT display numeric metrics that are not backed by a verified query.`
  - **Traceability:** PRD FR-05, FR-08.
- `REQ-014`: Landing pasca-login aman dan berbasis capability.
  - **EARS:** `WHEN login succeeds with a same-site next path the user may access, THE SYSTEM SHALL redirect there.` `WHEN no valid next exists and the user's only operational capability is POS checkout, THE SYSTEM SHALL redirect to /pos.` `OTHERWISE, IF CONSOLE_ENABLED is true, THE SYSTEM SHALL redirect to /console, ELSE to the first permitted legacy route.`
  - **Traceability:** PRD FR-06, Baseline §3.2.
- `REQ-015`: Pertahankan route dan kontrak API TOKO.
  - **EARS:** `WHILE the console is enabled, THE SYSTEM SHALL keep /pos, /sales, /sales/returns, /products, /inventory and their /api/* request/response contracts byte-compatible with the pre-console baseline.`
  - **Traceability:** PRD FR-04, R-08.
- `REQ-016`: Shell responsif dan aksesibel, POS focused mode.
  - **EARS:** `WHEN the viewport is ≤767 px, THE SYSTEM SHALL present navigation as a modal drawer that closes on navigation and Escape and returns focus to its trigger.` `WHEN the user is on /pos, THE SYSTEM SHALL NOT render the console sidebar.`
  - **Traceability:** PRD FR-07, §7.1.
- `REQ-017`: Feature flag dan rollback.
  - **EARS:** `WHEN CONSOLE_ENABLED is false, THE SYSTEM SHALL return 404 for /console/* and SHALL restore the pre-console login landing.`
  - **Traceability:** PRD FR-10.

#### P1-R — KOSIPA read-first

- `REQ-020`: Identity link staf.
  - **EARS:** `WHEN an admin with iam.link.manage links a console user (db_users.id) to a KOSIPA user (ref_users.id_ref_user), THE SYSTEM SHALL store the link in the console auth database with actor, timestamp and status, and SHALL require that the KOSIPA user is active.` `THE SYSTEM SHALL NOT authenticate any user with ref_users credentials.`
  - **Traceability:** ANO-X05, ANO-K14.
- `REQ-021`: Capability KOSIPA per aksi.
  - **EARS:** `WHEN resolving KOSIPA capabilities for a linked user, THE SYSTEM SHALL take the set of legacy controllers allowed by ref_menu_akses as an upper bound and SHALL grant an action capability (view/create/update/approve/disburse/delete/export) only if the console action policy also grants it.` `WHEN a user has no active identity link, THE SYSTEM SHALL grant no KOSIPA capability.`
  - **Traceability:** ANO-K02.
- `REQ-022`: Direktori anggota dan Anggota 360.
  - **EARS:** `WHEN a user with kosipa.member.view searches by NIK, name or ID card, THE SYSTEM SHALL return paginated members with status, group and masked contact data.` `WHEN the user opens a member, THE SYSTEM SHALL show tabs for profile, savings, loans, payroll deductions and store credit, each loaded only if the corresponding capability is held.`
  - **Traceability:** `anggota/*`, `master/anggota_c`, root print controllers.
- `REQ-023`: Ledger dan saldo simpanan.
  - **EARS:** `WHEN a savings card is requested for a member, type and year, THE SYSTEM SHALL compute opening balance, credits (payroll and cash), debits, interest and closing balance from APPROVED detail rows on the server and SHALL show the legacy view value side-by-side during parity mode.`
  - **Traceability:** `simpanan/kas_anggota_c`, `anggota/trans_simpanan_c`, `print_simpanan`.
- `REQ-024`: Pinjaman read.
  - **EARS:** `WHEN a user with kosipa.loan.view lists loans, THE SYSTEM SHALL filter by type, status, disbursement and repayment state and period.` `WHEN a loan is opened, THE SYSTEM SHALL show header, fees, schedule rows with paid/unpaid state and source (PAYROLL/manual), rollover links and outstanding principal.`
  - **Traceability:** 7 varian `pinjaman/*`, `kartu_aktif_c`, `pelunasan_pinjaman_c`, `kartu_pinjaman`.
- `REQ-025`: Payroll read + rekonsiliasi TOKO.
  - **EARS:** `WHEN a payroll period is opened, THE SYSTEM SHALL show the header per group, per-NIK matrix rows, component totals and status.` `WHEN the store-credit reconciliation report is run for a period, THE SYSTEM SHALL compare each NIK's TOKO_* amount with Σ Kredit sales − Σ Kredit returns of the source month per branch and list every difference.`
  - **Traceability:** `payroll/matrix_c`, `ppob/tagihan_c`, `simpanan/master_payroll_c`, ANO-X01.
- `REQ-026`: Laporan KOSIPA.
  - **EARS:** `WHEN a user with kosipa.report.view runs any of the 14 legacy report types, THE SYSTEM SHALL return the same rows and totals as the legacy report for the same filters (parity mode) and SHALL export to XLSX as a streamed authenticated response.`
  - **Traceability:** `laporan/*`.
- `REQ-027`: Parity harness.
  - **EARS:** `WHEN parity mode runs for a sample of members and periods, THE SYSTEM SHALL record every mismatch between Next.js computations and legacy outputs (views/report endpoints) with inputs, and SHALL block enabling the related writer while unexplained mismatches exist.`
  - **Traceability:** ANO-K07, ANO-X03.

#### P1-W — KOSIPA write (per bounded context, setelah gate)

- `REQ-030`: Originasi pinjaman dengan kalkulasi server.
  - **EARS:** `WHEN a loan application is submitted, THE SYSTEM SHALL compute the schedule (Flat or Anuitas), fees, total deduction and net disbursement with the same domain function used for simulation, SHALL persist a salary snapshot without modifying m_anggota, and SHALL evaluate the deduction-ratio rule.`
  - **Traceability:** ANO-K07, K08, K11, K12, K18.
- `REQ-031`: State machine dokumen keuangan.
  - **EARS:** `WHEN a transition is requested on a KOSIPA document (loan, savings, withdrawal, payroll batch, SHU, mobile request), THE SYSTEM SHALL accept only transitions defined for the document's current state, SHALL reject approval by the document's creator, and SHALL apply the state change and all side effects in one database transaction.` `WHEN the same idempotency key is replayed, THE SYSTEM SHALL return the original result.`
  - **Traceability:** ANO-K03.
- `REQ-032`: Penarikan simpanan dengan saldo server.
  - **EARS:** `WHEN a withdrawal line is added or approved, THE SYSTEM SHALL compute available balance = approved credits − approved debits − pending debits for that member and savings type under a row lock and SHALL reject amounts above it.`
  - **Traceability:** ANO-K04.
- `REQ-033`: Approval payroll dengan settlement terbatas.
  - **EARS:** `WHEN a payroll batch is approved, THE SYSTEM SHALL mark as paid only the installments of loans whose borrower is in that batch's matrix with a positive installment component, SHALL record the batch reference on each settled installment, and SHALL leave all other installments unchanged.` `WHEN a batch is reversed, THE SYSTEM SHALL restore exactly the installments it settled.`
  - **Traceability:** ANO-K05.
- `REQ-034`: Kewajiban toko bersih retur.
  - **EARS:** `WHEN payroll store components or a resignation settlement are computed for a period and NIK, THE SYSTEM SHALL use Σ Final Kredit sales − Σ Kredit returns (db_salesreturn) in that window per branch.`
  - **Traceability:** ANO-X01, memori `sales-return-design`.
- `REQ-035`: Penomoran dokumen.
  - **EARS:** `WHEN a KOSIPA document number is allocated, THE SYSTEM SHALL draw the next value of a per-prefix-per-period counter under lock and SHALL guarantee uniqueness.`
  - **Traceability:** ANO-K06.
- `REQ-036`: Jurnal seimbang.
  - **EARS:** `WHEN a savings or loan document is posted, THE SYSTEM SHALL create journal lines from the account mapping with explicit counter accounts, SHALL require Σdebit = Σcredit, and SHALL commit the journal atomically with the posting.`
  - **Traceability:** ANO-K10.
- `REQ-037`: Pembagian SHU.
  - **EARS:** `WHEN SHU allocation is generated, THE SYSTEM SHALL reject the run if total savings or total business is zero, SHALL allocate with largest-remainder rounding to the configured unit so that the sum equals each pool, and SHALL show a preview before posting.`
  - **Traceability:** ANO-K09.
- `REQ-038`: Limit kredit anggota.
  - **EARS:** `WHEN limit_toko, limit_ppob or gaji_minus is changed (single or bulk upload), THE SYSTEM SHALL validate non-negative integer amounts, show a dry-run diff, record the previous and new value per NIK, and apply all rows atomically.`
  - **Traceability:** `master/anggota_c::ajax_upload_excel_limit`, kontrak dengan POS Kredit.
- `REQ-039`: Approval pengajuan mobile.
  - **EARS:** `WHEN a mobile savings, withdrawal or loan request is processed, THE SYSTEM SHALL create or update the KOSIPA document through REQ-031 and SHALL update the mobile request status in the same transaction.`
  - **Traceability:** `mobile/*`, `simpanan/*_mobile_c`.
- `REQ-040`: Perubahan status anggota dan pencabutan akses.
  - **EARS:** `WHEN a member becomes RESIGN, PENSIUN or an expired KONTRAK, THE SYSTEM SHALL set store and PPOB limits to zero, revoke the member's mobile tokens by user_id, and audit the change.` `THE SYSTEM SHALL NOT change member state from any read path.`
  - **Traceability:** ANO-K17, ANO-T02.
- `REQ-041`: Master data KOSIPA & anggota.
  - **EARS:** `WHEN master data (member, organisation units, savings/loan/financing types with COA accounts, interest rates, instalment periods, bank accounts, document types, letter templates, expense categories) is created or changed, THE SYSTEM SHALL validate references and SHALL deactivate rather than delete referenced rows.`
  - **Traceability:** `master/*`, ANO-T03.
- `REQ-042`: Administrasi IAM console.
  - **EARS:** `WHEN an admin manages console users, roles, identity links, action policies, business settings or password resets, THE SYSTEM SHALL require iam.* capabilities and SHALL audit each change.`
  - **Traceability:** `admin/*`, `auth/reset_c`, `pengaturan/bisnis_c`, TOKO `Users/Roles/Company/Site`.

#### P2 — Warehouse

- `REQ-050`: Reader Gudang.
  - **EARS:** `WHEN a user with warehouse.*.view opens items, stock, purchases, deliveries, stock opname, suppliers, customers, expenses or reports, THE SYSTEM SHALL read smart_kopkar_gudang through a dedicated read-only connection and scope rows by the Gudang company derived from the session.`
  - **Traceability:** controller Gudang read, ANO-G02.
- `REQ-051`: Pemetaan barang Gudang ↔ toko.
  - **EARS:** `WHEN a Gudang item is mapped to a store item per branch, THE SYSTEM SHALL suggest candidates by exact barcode then item code, require explicit confirmation, and store the mapping with actor and time.`
  - **Traceability:** ANO-X02.
- `REQ-052`: Penerimaan barang toko dari pengiriman Gudang.
  - **EARS:** `WHEN a Gudang delivery to a store customer is finalised, THE SYSTEM SHALL present it to that branch as a pending receipt.` `WHEN the branch confirms received quantities, THE SYSTEM SHALL create one TOKO purchase from supplier Gudang referencing the delivery, increase store stock by the received quantities, record discrepancies, and prevent a second receipt of the same delivery.`
  - **Traceability:** ANO-X02.
- `REQ-053`: Ekspor invoice terautentikasi.
  - **EARS:** `WHEN a Gudang invoice is exported from the console, THE SYSTEM SHALL generate it in memory and stream it with Content-Disposition attachment.`
  - **Traceability:** register privat (pola ekspor legacy).
- `REQ-054`: Model stok Warehouse terpisah.
  - **EARS:** `THE SYSTEM SHALL model Gudang stock as item × company balance (db_items_stock) in its own domain module and SHALL NOT write Gudang balances into smart_kopkar tables.`
  - **Traceability:** ANO-G05, PRD FR-14.
- `REQ-055`: Writer Gudang bertahap.
  - **EARS:** `WHEN Gudang purchase, delivery, stock opname (including handheld scanner counts), import or master writes are enabled per context, THE SYSTEM SHALL compute totals with one domain function (items, discounts, tax, charges, rounding), update payment status atomically, and take scope from the session.`
  - **Traceability:** ANO-G04, G06.

#### P2 — Paritas TOKO yang tersisa

- `REQ-060`: Pembelian & retur pembelian (termasuk konsinyasi).
  - **EARS:** `WHEN a purchase is Received, THE SYSTEM SHALL increase stock and SHALL forbid deletion; corrections SHALL use purchase returns or a void with reason.`
  - **Traceability:** TOKO `Purchase`, `Purchase_return`, ANO-T01.
- `REQ-061`: Supplier & customer beserta pembayaran/hutang-piutang.
  - **EARS:** `WHEN a supplier or customer payment is recorded, THE SYSTEM SHALL update the due balance from the ledger and SHALL NOT allow overpayment without an explicit advance flag.`
  - **Traceability:** TOKO `Suppliers`, `Customers`.
- `REQ-062`: Biaya (expense) & kategori.
  - **EARS:** `WHEN an expense is recorded, THE SYSTEM SHALL scope it to ctx.companyId and require a category.`
  - **Traceability:** TOKO `Expense`.
- `REQ-063`: Laporan TOKO.
  - **EARS:** `WHEN any legacy TOKO report (sales, sales return, purchase, purchase return, expense, toko, profit & loss, stock, brand stock, item sales, purchase/supplier/sales/customer payments, expired items) is run, THE SYSTEM SHALL scope it to the active branch, distinguish Cash/QRIS/Kredit, net returns, and match legacy totals in parity mode.`
  - **Traceability:** TOKO `Reports`.
- `REQ-064`: Dashboard supervisor.
  - **EARS:** `WHEN the dashboard shows TOKO KPIs, THE SYSTEM SHALL label each with source, branch and as-of time and SHALL show "tidak tersedia" instead of zero when a query fails.`
  - **Traceability:** TOKO `Dashboard`, PRD FR-08.
- `REQ-065`: Master data TOKO & IAM TOKO.
  - **EARS:** `WHEN brands, categories, units, taxes, payment types, branches, site settings, users or roles are managed, THE SYSTEM SHALL be the single writer of those tables (KOSIPA master menus for brand/category/unit retired).`
  - **Traceability:** TOKO masters, ANO-X09.
- `REQ-066`: Impor CSV.
  - **EARS:** `WHEN an import file is uploaded, THE SYSTEM SHALL validate every row and show a dry-run report, and SHALL apply only after confirmation in one transaction.`
  - **Traceability:** TOKO/Gudang `Import`.
- `REQ-067`: PPOB & pesanan mobile.
  - **EARS:** `WHEN PPOB or member mobile orders are migrated, THE SYSTEM SHALL integrate with the IAK provider through a server-side adapter with idempotent transaction references and status reconciliation.`
  - **Traceability:** TOKO `Pos_ppob`, `Sales_mobile`, KOSIPA `ppob/*`. P3.
- `REQ-068`: Sisa fungsi TOKO.
  - **EARS:** `WHEN labels/barcodes are printed, stock adjustments are recorded, cashier masters are maintained, held invoices are used, or a sale is corrected, THE SYSTEM SHALL provide the function with audit, and sale correction SHALL use void/return rather than edit/delete.`
  - **Traceability:** TOKO `Items`, `Barcode`, `Kasir`, `Sales`.
- `REQ-069`: Daftar yang tidak dimigrasikan.
  - **EARS:** `THE SYSTEM SHALL NOT reimplement runtime schema updates, database backup/restore from the web UI, unauthenticated APIs, static country/state/currency CRUD, calculators, or dead template code; each retirement SHALL be recorded in endpoint-inventory.md.`
  - **Traceability:** endpoint-inventory RETIRE.

#### P3

- `REQ-070`: KPI lintas modul.
  - **EARS:** `WHEN cross-module KPIs are displayed, THE SYSTEM SHALL use only finance-approved definitions with source, period, branch and as-of metadata.`
  - **Traceability:** PRD FR-15.
- `REQ-071`: PWA anggota.
  - **EARS:** `WHEN the member PWA is built, THE SYSTEM SHALL use member authentication separate from staff sessions and reuse only authorised domain APIs.`
  - **Traceability:** PRD P3, smartkkisi.

### Business Rules (`BR-*`)

- `BR-001`: Satu penulis per konteks bisnis (tabel/kolom) pada satu waktu. Matriks ownership wajib sebelum writer baru. Pemilik `m_anggota` = Keanggotaan (KOSIPA). TOKO hanya membaca. **Enforcement:** gate deployment + grant DB.
- `BR-002`: KOSIPA berlaku untuk seluruh koperasi (tanpa cabang). TOKO berbasis cabang (`ctx.companyId`). Gudang = DB sendiri. **Enforcement:** Backend.
- `BR-003`: Nilai uang adalah rupiah bulat dalam aritmetika integer (`bigint`) atau `Decimal`. Tidak memakai float. Pembulatan hanya pada titik yang didefinisikan. **Enforcement:** Domain.
- `BR-004`: Σ pokok jadwal = pokok pinjaman. Sisa pembulatan diserap angsuran terakhir. Bunga Flat per bulan = pokok × suku/100. Anuitas = PMT standar dengan bunga atas sisa pokok. **Enforcement:** Domain.
- `BR-005`: Rasio potongan bulanan terhadap gaji (legacy 70%) dikonfigurasi per jenis pinjaman. Pelanggaran → blokir, kecuali override penyetuju dengan alasan. **Keputusan owner sebelum P1-W.** **Enforcement:** Backend.
- `BR-006`: Jendela TOKO untuk periode payroll M = bulan kalender M−1 (sesuai `process_simulasi`). **Enforcement:** Domain.
- `BR-007`: Saldo tersedia penarikan = kredit APPROVED − debit APPROVED − debit pending. Jenis yang boleh ditarik dan syaratnya (mis. pokok/wajib saat masih aktif) **dikonfirmasi owner**. Legacy tidak membatasi jenis. **Enforcement:** Backend + lock.
- `BR-008`: Pembuat dokumen tidak boleh menyetujui dokumennya sendiri (maker-checker). **Enforcement:** Backend.
- `BR-009`: Dokumen APPROVED/POSTED tidak dapat diedit atau dihapus. Koreksi dilakukan via dokumen reversal yang merujuk dokumen asal. **Enforcement:** Backend.
- `BR-010`: Kunci NIK kanonik = trim + hapus nol awal untuk pencocokan. Nilai asli disimpan apa adanya. **Enforcement:** Domain.
- `BR-011`: Retur Kredit mengurangi kewajiban toko pada periode penjualan asal, dalam batas yang ditetapkan memori `sales-return-design`. **Enforcement:** Domain (generator payroll dan hak-kewajiban Next.js); procedure legacy tidak diubah.
- `BR-012`: Kontrak kedaluwarsa (`status_karyawan=KONTRAK`, `tgl_keluar ≤ hari ini`) → nonaktif. Mekanisme (job harian atau aksi admin) **diputuskan owner**. **Enforcement:** Backend.
- `BR-013`: Penerimaan dari Gudang hanya sekali per dokumen pengiriman. Selisih qty dicatat, bukan disamakan diam-diam. **Enforcement:** Backend + unique reference.

### Validation Requirements (`VAL-*`)

- `VAL-001`: `next` login hanya path relatif same-site (`/` di awal, bukan `//`, tanpa skema/kontrol karakter), sesuai `packages/domain/src/auth/redirect.ts`.
- `VAL-002`: NIK: 1–20 karakter alfanumerik. Nominal: integer ≥ 0 ≤ 10^13. Tanggal: ISO `YYYY-MM-DD` dalam zona `Asia/Jakarta`. Periode: `YYYY-MM`.
- `VAL-003`: Pinjaman: jangka waktu 1–360 bulan, suku bunga 0–100 (%/bulan menurut legacy `biaya_suku_bunga`, dikonfirmasi), metode ∈ {Flat, Anuitas}, persen biaya 0–100.
- `VAL-004`: Upload Excel/CSV: ≤ 5 MB, ≤ 5.000 baris, header wajib cocok template, setiap baris divalidasi sebelum apply.
- `VAL-005`: Filter laporan: rentang tanggal ≤ 366 hari. Paginasi ≤ 200 baris per halaman.
- `VAL-006`: Transisi status hanya nilai enum yang terdefinisi. String status dari klien tidak pernah disimpan langsung.

### Security & Multi-Tenancy Requirements (`SEC-*`)

- `SEC-001`: Semua dokumen cetak/ekspor membutuhkan sesi + capability pada dokumen terkait.
  - **Tenant Isolation Rule:** TOKO dokumen dibatasi `ctx.companyId`. KOSIPA dibatasi capability kategori data.
- `SEC-002`: Hanya query terparameter (Prisma/`Prisma.sql`). Dilarang menggabungkan input ke string SQL.
  - **Tenant Isolation Rule:** scope selalu dari sesi tervalidasi, tidak pernah dari body/query.
- `SEC-003`: Setiap route handler write memeriksa capability aksi di server, terlepas dari menu.
  - **Tenant Isolation Rule:** capability KOSIPA ⊆ akses legacy `ref_menu_akses`.
- `SEC-004`: Tidak ada penerimaan hash md5/sha1. Kredensial legacy tidak dipakai untuk login console.
  - **Tenant Isolation Rule:** identity link 1 user console ↔ maks 1 user KOSIPA aktif.
- `SEC-005`: Reader Gudang memakai DB user read-only khusus. Scope perusahaan Gudang dari pemetaan sesi.
  - **Tenant Isolation Rule:** tidak ada query lintas DB bisnis dalam satu statement.
- `SEC-006`: PII (no HP, alamat, rekening, gaji) dimasking default. Pembukaan penuh membutuhkan `kosipa.member.pii` dan tercatat di audit.
  - **Tenant Isolation Rule:** ekspor XLSX mengikuti masking yang sama.
- `SEC-007`: CSRF + Origin check untuk semua state change (pola existing `infrastructure/auth/origin.ts`). Rate limit ekspor dan pencarian anggota.
  - **Tenant Isolation Rule:** n/a.

### Non-Functional Requirements (`NFR-*`)

- `NFR-001`: Render console pertama tidak menjalankan query agregasi lintas domain. Capability resolution ≤ 3 query per request (auth existing + identity link + legacy menu, dengan cache per request).
- `NFR-002`: Total pool koneksi Next.js tetap ≤ `MAX_CONNECTION_BUDGET` (12). Reader KOSIPA dan Gudang masing-masing pool ≤ 2, `connect_timeout` ≤ 5 s, query timeout ≤ 10 s.
- `NFR-003`: Pencarian anggota p95 ≤ 800 ms pada data produksi-like (±1.300+ anggota aktif). Tidak memakai fungsi pada kolom terindeks di WHERE.
- `NFR-004`: Kalkulasi domain (jadwal, saldo, SHU, settlement) deterministik dan murni, dengan cakupan unit test 100% cabang aturan uang.
- `NFR-005`: Aksesibilitas WCAG 2.1 AA pada shell, tabel, dan formulir. Diuji pada 375/390/768/1024/1440 px.
- `NFR-006`: Checkout POS tidak menambah latensi akibat console (tidak ada provider/console query di route `/pos`).

### Observability & Logging (`OBS-*`)

- `OBS-001`: Log terstruktur non-PII untuk kegagalan auth/capability/navigasi, error adapter, dan durasi query > 2 s, mengikuti `infrastructure/auth/logger.ts`.
- `OBS-002`: Audit event (aktor, aksi, dokumen, before/after ringkas, request id) untuk setiap transisi dokumen keuangan, perubahan limit, identity link, pembukaan PII, dan ekspor. Disimpan di auth DB console.
- `OBS-003`: Laporan parity harian selama mode parity: jumlah dokumen dibandingkan, mismatch, dan status gate.

### Data & Migration Requirements (`MIG-*`)

- `MIG-001`: Staging untuk KOSIPA wajib memuat definisi view/procedure produksi (hasil `REQ-003`) sebelum parity test. Tanpa itu, hasil parity tidak sah.
- `MIG-002`: Sebelum writer KOSIPA/Gudang diaktifkan: matriks ownership per tabel/kolom, grant least-privilege per fitur (SQL review-only untuk produksi), backup, runbook rollback, UAT operator, rekonsiliasi finance, dan penonaktifan menu PHP yang setara (single-writer).
- `MIG-003`: Tabel baru hanya di `kkisi_auth` (milik Next.js) dengan migrasi aditif dan rollback `DROP` yang terdokumentasi. Tidak ada DDL pada DB bisnis tanpa keputusan owner terpisah.
- `MIG-004`: Procedure legacy `x_proc_create_matrix` **tidak diubah** (keputusan owner 16 Okt 2026). Generator matriks pengganti di Next.js menghitung kewajiban toko bersih retur (`REQ-034`), dibuktikan parity terhadap output procedure pada staging sebelum writer pengganti diaktifkan.
- `MIG-005`: Data historis tidak di-backfill atau dikoreksi diam-diam. Perbedaan akibat anomali (mis. ANO-K05 periode lalu) dilaporkan untuk keputusan finance.
