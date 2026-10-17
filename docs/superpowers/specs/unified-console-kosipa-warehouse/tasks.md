# Implementation Task Breakdown — `unified-console-kosipa-warehouse`

Aturan umum: satu task = satu PR yang dapat direview. Tidak menulis ke DB produksi dari task mana pun. SQL produksi = file review-only untuk operator. Tiap task selesai hanya bila verifikasinya lulus dan hasilnya dicatat di `verification.md` (SHA + tanggal). Perintah dasar: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Phase 0 — S0: Keamanan legacy & bukti (operator + dokumentasi)

- [ ] `TASK-001`: **DEFERRED** — risiko keamanan dokumen cetak KOSIPA legacy
  - **Status:** DEFERRED (keputusan owner 16 Okt 2026: aplikasi legacy tidak diubah). Detail hanya di register privat.
  - **Requirements Addressed:** `REQ-001`, `SEC-001`, `SEC-002`
  - **Verification:** padanan aman diverifikasi pada route cetak Next.js (`TASK-024`, `TASK-028`).
- [ ] `TASK-002`: **DEFERRED** — risiko ekspor & API Gudang legacy
  - **Status:** DEFERRED (keputusan owner yang sama).
  - **Requirements Addressed:** `REQ-002`, `SEC-005`
  - **Verification:** padanan aman diverifikasi pada ekspor/scanner Next.js (`TASK-061`, `TASK-064`).
- [ ] `TASK-003`: Snapshot objek skema produksi (read-only)
  - **Files:** `docs/migration/sql/legacy-schema-objects-readonly.sql` (sudah disiapkan), hasil disimpan di `docs/migration/_baseline/schema-objects-<tanggal>.sql` (**gitignored**, tanpa data)
  - **Goal:** definisi 45 view, procedure/function/trigger/event, skema no-data Gudang, identifikasi konsumen `smart_kopkar_toko` dan `m_barang`.
  - **Requirements Addressed:** `REQ-003`, `MIG-001`
  - **Verification:** jumlah objek = jumlah di `information_schema`. `v_trans_pinjaman_flat/anuitas` dan `x_proc_create_matrix` terbaca. ANO-K07 dan ANO-X01 diperbarui dari Suspected ke Confirmed/Rejected.
- [ ] `TASK-004`: Refresh staging dengan objek skema asli
  - **Files:** `apps/web/scripts/setup-staging.sh` (langkah opsional apply `schema-objects-*.sql` setelah restore), `apps/web/scripts/lib/*`
  - **Goal:** staging representatif untuk parity KOSIPA.
  - **Requirements Addressed:** `MIG-001`, `REQ-027`
  - **Verification:** `SELECT COUNT(*) FROM v_trans_pinjaman_flat` di staging > 0 dan cocok dengan contoh produksi yang diberikan operator.
- [ ] `TASK-005`: Rekonsiliasi dokumen migrasi
  - **Files:** `docs/migration/DATA_OWNERSHIP.md`, `docs/migration/MIGRATION_MATRIX.md`, `docs/migration/SALES_RETURN_IMPLEMENTATION.md`, `.kiro/specs/pos-kasir-revamp/tasks.md`, `CLAUDE.md`
  - **Goal:** ownership KOSIPA/Gudang/smartkkisi, G3 → `x_proc_create_matrix`, status POS aktual.
  - **Requirements Addressed:** `BR-001`, `MIG-002`
  - **Verification:** review owner. Tautan bukti ada pada setiap baris matriks.

## Phase 1 — P0: Unified Console

- [x] `TASK-010`: Domain capability & registry navigasi
  - **Status:** VERIFIED (local) — see implementation-journal.md Checkpoint 1
  - **Files:** `packages/domain/src/console/capabilities.ts`, `apps/web/src/features/console/navigation.ts`, `packages/domain/tests/console-capabilities.test.mjs`
  - **Goal:** tipe `Capability`, pemetaan slug TOKO → capability termasuk aturan majemuk, registry bertipe dengan readiness/flag.
  - **Requirements Addressed:** `REQ-011`, `REQ-012`, `NFR-001`
  - **Verification:** unit test pemetaan untuk 11 slug existing + aturan returns. Test "setiap item registry punya `requires` non-kosong".
- [x] `TASK-011`: Use case `resolveConsoleCapabilities` + guard
  - **Status:** VERIFIED (local) — see implementation-journal.md Checkpoint 1
  - **Files:** `packages/application/src/console/resolve-capabilities.usecase.ts`, `apps/web/src/infrastructure/auth/console-guard.ts` (`requireConsoleSession`, `requireCapability`), `apps/web/src/app/api/console/capabilities/route.ts`
  - **Goal:** guard authenticated-only + capability per request (cache per request), fail-closed.
  - **Requirements Addressed:** `REQ-010`, `REQ-011`, `SEC-003`, `OBS-001`
  - **Verification:** test: anonim → redirect, user tanpa `sales_add` → 200, store error → 503. Jumlah query ≤ 3 (spy repository).
- [x] `TASK-012`: Console shell & dashboard
  - **Status:** VERIFIED (local) — see implementation-journal.md Checkpoint 1
  - **Files:** `apps/web/src/app/console/layout.tsx`, `apps/web/src/app/console/page.tsx`, `apps/web/src/components/console/{ConsoleShell,ConsoleSidebar,ConsoleHeader,ModuleCard,EmptyState}.tsx`, CSS terkait
  - **Goal:** sidebar seksi, drawer mobile, breadcrumb, kartu modul jujur, tanpa angka palsu.
  - **Requirements Addressed:** `REQ-012`, `REQ-013`, `REQ-016`, `NFR-005`
  - **Verification:** `pnpm test:browser` (Playwright) persona kasir/supervisor/viewer/no-access di 375/390/768/1024/1440: aria-current, Escape menutup drawer, tidak ada overflow horizontal. Screenshot dilampirkan.
- [x] `TASK-013`: Landing pasca-login berbasis capability
  - **Status:** VERIFIED (local) — see implementation-journal.md Checkpoint 1
  - **Files:** `packages/domain/src/auth/redirect.ts`, `apps/web/src/app/login/LoginForm.tsx`, `apps/web/src/infrastructure/auth/handlers/*` (login response), tests
  - **Goal:** kasir → `/pos`, staf lain → `/console` (flag) atau rute pertama yang diizinkan, `next` aman.
  - **Requirements Addressed:** `REQ-014`, `VAL-001`
  - **Verification:** unit test `//evil`, `/\\evil`, `http:`, karakter kontrol, `next` tanpa izin → fallback. Tidak ada redirect loop (e2e).
- [x] `TASK-014`: Flag & kompatibilitas TOKO
  - **Status:** VERIFIED (local) — see implementation-journal.md Checkpoint 1
  - **Files:** `apps/web/src/infrastructure/config/flags.ts` (atau lokasi config existing), `apps/web/src/components/pos/PosShell.tsx` (tautan Dashboard → `/console` bila flag), `apps/web/tests/route-contract.test.mjs`
  - **Goal:** `CONSOLE_ENABLED=false` memulihkan perilaku lama. Kontrak `/api/pos|sales|products|inventory` dikunci snapshot.
  - **Requirements Addressed:** `REQ-015`, `REQ-017`, `NFR-006`
  - **Verification:** snapshot test respons API sebelum/sesudah. Flag off → `/console` 404. Regression POS Cash/QRIS/Kredit di staging.

## Phase 2 — P1-R: KOSIPA read-first

- [x] `TASK-020`: Tabel console di auth DB + skrip setup
  - **Status:** VERIFIED (local) — implementation-journal.md Checkpoint 3 (console store is a separate DB per owner Option B, not the auth store)
  - **Files:** `apps/web/scripts/setup-console-store.sh` (lokal/staging), `docs/migration/sql/console-store-production.sql` (review-only), `apps/web/src/infrastructure/auth/identity-link-store.ts`, `apps/web/src/infrastructure/auth/audit-store.ts`
  - **Goal:** `console_identity_link`, `console_action_policy`, `console_audit_event`.
  - **Requirements Addressed:** `MIG-003`, `REQ-020`, `OBS-002`
  - **Verification:** setup + teardown idempoten di staging. Unique link aktif ditolak duplikat (test).
- [x] `TASK-021`: Reader KOSIPA + deployment guard
  - **Status:** VERIFIED (local) — implementation-journal.md Checkpoint 3 (console store is a separate DB per owner Option B, not the auth store)
  - **Files:** `apps/web/src/infrastructure/db/prisma-kosipa-read.ts`, `apps/web/src/infrastructure/db/deployment-guard.ts` (DSN baru), `apps/web/scripts/setup-kosipa-read.mjs` (lokal), `docs/migration/sql/kosipa-reader-production.sql` (review-only, SELECT-only grants)
  - **Goal:** koneksi read-only terpisah, pool ≤ 2, timeout.
  - **Requirements Addressed:** `SEC-002`, `NFR-002`, `REQ-022`
  - **Verification:** test deployment-guard (user root/DB salah ditolak). `INSERT` via reader gagal di staging (permission denied).
- [x] `TASK-022`: Identity link UI + capability KOSIPA
  - **Status:** VERIFIED (local) — implementation-journal.md Checkpoint 3 (console store is a separate DB per owner Option B, not the auth store)
  - **Files:** `packages/application/src/identity/*`, `apps/web/src/infrastructure/repositories/kosipa-acl.repository.ts`, `apps/web/src/app/console/settings/pengguna/**`, `apps/web/src/app/api/console/identity-links/route.ts`
  - **Goal:** admin menautkan user, resolver menurunkan capability dari `ref_menu_akses` ∩ policy.
  - **Requirements Addressed:** `REQ-020`, `REQ-021`, `REQ-042`, `SEC-004`
  - **Verification:** test: tanpa link → 0 capability KOSIPA. Link ke user nonaktif ditolak. Capability ⊆ akses legacy (property test dengan fixture menu). Audit tercatat.
- [ ] `TASK-023`: Domain NIK, saldo, kewajiban toko
  - **Status:** IN PROGRESS — domain layer VERIFIED (unit), see implementation-journal.md Checkpoint 2
  - **Files:** `packages/domain/src/kosipa/{nik,savings-balance,store-credit}.ts` + tests
  - **Goal:** fungsi murni BR-010, BR-007 (perhitungan), BR-011.
  - **Requirements Addressed:** `REQ-023`, `REQ-034`, `BR-003`, `BR-010`, `BR-011`, `NFR-004`
  - **Verification:** unit test 100% cabang. Fixture retur Kredit lintas bulan.
- [x] `TASK-024`: Anggota & Anggota 360
  - **Status:** VERIFIED (local) — implementation-journal.md Checkpoint 3 (console store is a separate DB per owner Option B, not the auth store)
  - **Files:** `apps/web/src/infrastructure/repositories/kosipa-member.repository.ts`, `apps/web/src/app/console/kosipa/anggota/**`, `apps/web/src/app/api/kosipa/members/**`, `apps/web/src/components/kosipa/member/*`
  - **Goal:** pencarian, detail, tab simpanan/pinjaman/payroll/toko, masking PII, cetak dokumen terautentikasi (pengganti print root).
  - **Requirements Addressed:** `REQ-022`, `SEC-001`, `SEC-006`, `NFR-003`
  - **Verification:** e2e persona tanpa `kosipa.member.pii` melihat data termasking. p95 pencarian diukur di staging. Tab tanpa capability tidak meminta API.
- [ ] `TASK-025`: Simpanan read
  - **Status:** SISI BACA IMPLEMENTED + VERIFIED (fixture sintetis; smoke baca-saja) — saldo resmi BLOCKED (TASK-003), parity belum, belum staging-accepted (Checkpoint 8)
  - **Files:** `kosipa-savings.repository.ts`, `app/console/kosipa/simpanan/**`, `app/api/kosipa/members/[nik]/savings/route.ts`
  - **Goal:** daftar dokumen per jenis/status, kartu simpanan dengan kolom parity.
  - **Requirements Addressed:** `REQ-023`, `REQ-027`
  - **Verification:** parity sample ≥ 50 anggota × 3 jenis × 2 tahun: delta = 0 atau tercatat sebagai expected delta.
- [ ] `TASK-026`: Pinjaman read + simulasi
  - **Status:** READ SIDE IMPLEMENTED + VERIFIED (synthetic fixtures; read-only smoke on the local 30 Sep copy; Checkpoint 7) — saldo resmi BLOCKED (TASK-003); simulasi/originasi belum (TASK-043); NOT staging-accepted
  - **Files:** `packages/domain/src/kosipa/loan-schedule.ts` + tests, `kosipa-loan.repository.ts`, `app/console/kosipa/pinjaman/**`, `app/api/kosipa/loans/**`
  - **Goal:** daftar/detail/jadwal/outstanding. Simulasi Flat/Anuitas integer.
  - **Requirements Addressed:** `REQ-024`, `REQ-030`, `BR-004`, `VAL-003`, `NFR-004`
  - **Verification:** Σpokok = principal untuk 10.000 kombinasi acak (property test). Parity vs `v_trans_pinjaman_simulasi` untuk sampel. Kasus ANO-K07 dilaporkan.
- [x] `TASK-027`: Payroll read + rekonsiliasi toko
  - **Status:** IMPLEMENTED + VERIFIED (synthetic fixtures; read-only smoke on the local copy of the 30 Sep data) — NOT staging-accepted, NOT production-ready. Lihat implementation-journal.md Checkpoint 6
  - **Files:** `kosipa-payroll.repository.ts`, `app/console/kosipa/payroll/**`, `app/api/kosipa/payroll/[docNo]/store-reconciliation/route.ts`
  - **Goal:** header, matriks per NIK (paginasi server), total, laporan selisih `TOKO_*` vs Kredit − retur.
  - **Requirements Addressed:** `REQ-025`, `REQ-034`, `BR-006`
  - **Verification:** periode `POT202609…`: selisih hanya pada NIK dengan retur Kredit (diharapkan) dan dilaporkan.
- [ ] `TASK-028`: Laporan KOSIPA (14) + ekspor
  - **Files:** `kosipa-report.repository.ts`, `app/console/reports/kosipa/**`, `app/api/kosipa/reports/[type]/route.ts`, utilitas ekspor streaming
  - **Goal:** paritas baris/total dan ekspor XLSX streaming.
  - **Requirements Addressed:** `REQ-026`, `VAL-005`, `SEC-006`, `SEC-007`
  - **Verification:** per laporan: filter sama → total sama dengan legacy (staging). Ekspor tidak menulis file ke disk (test).
- [ ] `TASK-029`: Parity harness & laporan harian
  - **Files:** `apps/web/scripts/kosipa-parity.ts`, `apps/web/src/infrastructure/repositories/kosipa-legacy-oracle.repository.ts`
  - **Goal:** pembanding otomatis + status gate writer.
  - **Requirements Addressed:** `REQ-027`, `OBS-003`, `MIG-005`
  - **Verification:** menjalankan harness di staging menghasilkan laporan. Gate `blocked` bila mismatch tak terjelaskan.
- [ ] `TASK-030`: Registry KOSIPA aktif (read-only) di sidebar
  - **Files:** `apps/web/src/features/console/navigation.ts`
  - **Goal:** item KOSIPA berstatus `read-only` di balik `KOSIPA_READ_ENABLED`.
  - **Requirements Addressed:** `REQ-012`, `REQ-013`
  - **Verification:** e2e: user tanpa link tidak melihat seksi KOSIPA.

## Phase 3 — P1-W: KOSIPA write (per konteks; gate MIG-002 per konteks)

- [ ] `TASK-040`: Domain state machine + maker-checker + idempotency
  - **Status:** IN PROGRESS — domain layer VERIFIED (unit), see implementation-journal.md Checkpoint 2
  - **Files:** `packages/domain/src/kosipa/document-state.ts`, `packages/application/src/kosipa/transition-document.usecase.ts`, `apps/web/src/infrastructure/auth/idempotency-store.ts`, auth DB `console_idempotency`
  - **Requirements Addressed:** `REQ-031`, `BR-008`, `BR-009`, `VAL-006`
  - **Verification:** tabel transisi lengkap (valid/invalid). Maker = checker → 409. Replay key → hasil sama.
- [ ] `TASK-041`: Penomoran dokumen
  - **Files:** `apps/web/src/infrastructure/repositories/kosipa-doc-number.ts`
  - **Requirements Addressed:** `REQ-035`
  - **Verification:** 50 alokasi paralel di staging → 50 nomor unik berurutan tanpa duplikat.
- [ ] `TASK-042`: Jurnal seimbang
  - **Status:** IN PROGRESS — domain layer VERIFIED (unit), see implementation-journal.md Checkpoint 2
  - **Files:** `packages/domain/src/kosipa/journal.ts`, `kosipa-journal.repository.ts`
  - **Requirements Addressed:** `REQ-036`
  - **Verification:** unit test Σdebit = Σkredit. Mapping hilang → tolak. Posting + jurnal rollback bersama saat error.
- [ ] `TASK-043`: Pinjaman write (originasi, approve, disburse, pelunasan, over kredit, rollover)
  - **Files:** `packages/application/src/kosipa/loan-*.usecase.ts`, `apps/web/src/infrastructure/db/prisma-kosipa-loan-write.ts`, `app/console/kosipa/pinjaman/**`, `docs/migration/sql/kosipa-loan-writer-production.sql` (review-only)
  - **Requirements Addressed:** `REQ-030`, `REQ-031`, `BR-005`, `VAL-002`, `VAL-003`, `MIG-002`
  - **Verification:** e2e staging alur lengkap. `m_anggota.gaji` tidak berubah. Rasio gaji diblokir/override tercatat. PHP menu pinjaman dinonaktifkan sebelum flag on.
- [ ] `TASK-044`: Simpanan & penarikan write
  - **Files:** `packages/application/src/kosipa/savings-*.usecase.ts`, `apps/web/src/infrastructure/db/prisma-kosipa-savings-write.ts`, `app/console/kosipa/simpanan/**`, `docs/migration/sql/kosipa-savings-writer-production.sql` (review-only)
  - **Requirements Addressed:** `REQ-032`, `REQ-031`, `REQ-036`, `BR-007`
  - **Verification:** dua penarikan paralel melebihi saldo → hanya satu berhasil. `total_saldo` dari klien diabaikan.
- [ ] `TASK-045`: Payroll write (generate pengganti, approve terbatas, reverse)
  - **Status:** IN PROGRESS — domain layer VERIFIED (unit), see implementation-journal.md Checkpoint 2
  - **Files:** `packages/domain/src/kosipa/payroll-settlement.ts`, `payroll-*.usecase.ts`, `prisma-kosipa-payroll-write.ts`
  - **Requirements Addressed:** `REQ-033`, `REQ-034`, `BR-006`, `BR-011`, `MIG-004`
  - **Verification:** fixture dua group: approve ANGGOTA tidak menyentuh cicilan BMP. Reverse memulihkan persis. Generator pengganti = Kredit − retur; selisih terhadap output procedure legacy hanya pada NIK dengan retur (staging).
- [ ] `TASK-046`: SHU write
  - **Status:** IN PROGRESS — domain layer VERIFIED (unit), see implementation-journal.md Checkpoint 2
  - **Files:** `packages/domain/src/kosipa/shu-allocation.ts`, `shu-*.usecase.ts`, UI
  - **Requirements Addressed:** `REQ-037`
  - **Verification:** property test Σalokasi = pool (unit). Total nol → ditolak.
- [ ] `TASK-047`: Limit kredit & master anggota & status anggota
  - **Files:** `member-*.usecase.ts`, `app/console/kosipa/anggota/**` (form + upload dry-run), job/aksi `deactivate-expired-contracts`
  - **Requirements Addressed:** `REQ-038`, `REQ-040`, `REQ-041`, `BR-012`, `VAL-004`
  - **Verification:** dry-run diff sebelum apply. Token mobile dicabut berdasarkan `user_id`. POS Next.js membaca limit baru tanpa perubahan kode POS.
- [ ] `TASK-048`: Pengajuan mobile
  - **Files:** `mobile-request-*.usecase.ts`, `app/console/kosipa/pengajuan/**`
  - **Requirements Addressed:** `REQ-039`
  - **Verification:** approve → dokumen KOSIPA + status pengajuan berubah atomik. Kegagalan → keduanya tidak berubah.
- [ ] `TASK-049`: Master KOSIPA lain & IAM console
  - **Files:** `app/console/kosipa/master/**`, `app/console/settings/**`
  - **Requirements Addressed:** `REQ-041`, `REQ-042`
  - **Verification:** referensi dipakai → hanya deaktivasi. Semua perubahan teraudit.

## Phase 4 — P2: Warehouse & paritas TOKO

- [ ] `TASK-060`: Reader Gudang + guard `gudang`
  - **Files:** `apps/web/src/infrastructure/db/prisma-gudang-read.ts`, `deployment-guard.ts`, `docs/migration/sql/gudang-reader-production.sql` (review-only), `packages/domain/src/warehouse/*`
  - **Requirements Addressed:** `REQ-050`, `REQ-054`, `SEC-005`, `NFR-002`
  - **Verification:** guard menolak DB selain `smart_kopkar_gudang`. Scope dari link. Jumlah stok per item cocok dengan laporan stok Gudang.
- [ ] `TASK-061`: Halaman Warehouse read
  - **Files:** `app/console/warehouse/**`, `app/console/reports/warehouse/**`, `app/api/warehouse/**`
  - **Requirements Addressed:** `REQ-050`, `REQ-053`
  - **Verification:** ekspor invoice streaming (tanpa file di disk). Parity total laporan.
- [ ] `TASK-062`: Pemetaan barang
  - **Status:** PARTIAL — domain mapping rules + application use cases VERIFIED (unit + in-memory integration, Checkpoint 4); storage (`warehouse_item_map` in the console store), reader of Gudang items and the UI are NOT STARTED. See implementation-journal.md Checkpoint 4.
  - **Files:** auth DB `warehouse_item_map`, `app/console/warehouse/pemetaan/**`
  - **Requirements Addressed:** `REQ-051`
  - **Verification:** saran barcode exact lalu item code. Konfirmasi wajib. Audit.
- [ ] `TASK-063`: Penerimaan toko dari Gudang
  - **Status:** PARTIAL — receiving domain (shipment lifecycle, receipts, discrepancies, reconciliation, quantity intents) + application use cases/ports VERIFIED (Checkpoint 4); the TOKO purchase/stock writer, Gudang reader, console store tables and UI are NOT STARTED; accounting treatment is an open owner decision. See implementation-journal.md Checkpoint 4.
  - **Files:** `packages/domain/src/warehouse/receipt.ts`, `packages/application/src/warehouse/receive-delivery.usecase.ts`, `apps/web/src/infrastructure/db/prisma-receiving-write.ts`, `app/console/toko/penerimaan/**`, `docs/migration/sql/receiving-writer-production.sql` (review-only)
  - **Requirements Addressed:** `REQ-052`, `BR-013`, `MIG-002`
  - **Verification:** penerimaan ganda → 409. Stok toko naik sesuai qty diterima. Selisih tercatat. Kompensasi saat gagal (test fault-injection).
- [ ] `TASK-064`: Writer Gudang per konteks (pembelian, pengiriman, SO + scanner, impor, master)
  - **Files:** `packages/domain/src/warehouse/totals.ts`, use case + adapter per konteks, UI
  - **Requirements Addressed:** `REQ-055`, `VAL-004`
  - **Verification:** total dokumen termasuk pajak/biaya/pembulatan sama dengan fungsi domain. Status bayar diperbarui atomik.
- [ ] `TASK-065`: Pembelian & retur pembelian TOKO (termasuk konsinyasi)
  - **Files:** `app/console/toko/pembelian/**`, `purchase-*.usecase.ts`, `prisma-purchase-write.ts`
  - **Requirements Addressed:** `REQ-060`
  - **Verification:** pembelian Received tidak dapat dihapus. Retur mengurangi stok. Lock order sama dengan POS (test deadlock).
- [ ] `TASK-066`: Supplier/customer + pembayaran, biaya
  - **Files:** `app/console/toko/{supplier,customer,biaya}/**`
  - **Requirements Addressed:** `REQ-061`, `REQ-062`
  - **Verification:** hutang/piutang dari ledger. Overpayment ditolak.
- [ ] `TASK-067`: Laporan TOKO + dashboard supervisor
  - **Files:** `app/console/reports/toko/**`, widget dashboard
  - **Requirements Addressed:** `REQ-063`, `REQ-064`
  - **Verification:** parity total per laporan. Query gagal → "tidak tersedia", bukan 0.
- [ ] `TASK-068`: Master data TOKO, IAM TOKO, impor, sisa fungsi
  - **Files:** `app/console/toko/master/**`, `app/console/settings/**`, `app/console/toko/import/**`, label/barcode, penyesuaian stok, master kasir, hold invoice, void penjualan
  - **Requirements Addressed:** `REQ-065`, `REQ-066`, `REQ-068`
  - **Verification:** dry-run impor. Master brand/kategori/satuan KOSIPA dinonaktifkan (operator) sebelum flag on.
- [ ] `TASK-069`: Catatan retirement
  - **Files:** `endpoint-inventory.md` (kolom status), `docs/migration/MIGRATION_MATRIX.md`
  - **Requirements Addressed:** `REQ-069`
  - **Verification:** setiap baris RETIRE punya alasan dan tanggal keputusan.

## Phase 5 — P3

- [ ] `TASK-080`: PPOB & pesanan mobile (desain terpisah, adapter IAK)
  - **Requirements Addressed:** `REQ-067`
  - **Verification:** spesifikasi terpisah disetujui.
- [ ] `TASK-081`: KPI lintas modul
  - **Requirements Addressed:** `REQ-070`
  - **Verification:** definisi KPI ditandatangani finance.
- [ ] `TASK-082`: PWA anggota (spesifikasi terpisah)
  - **Requirements Addressed:** `REQ-071`
  - **Verification:** spesifikasi terpisah disetujui.

## Phase 6 — Verifikasi & rilis per fase

- [ ] `TASK-090`: Gate rilis per fase
  - **Goal:** jalankan seluruh pemeriksaan di `verification.md`, rehearsal rollback, sign-off owner/operasi/finance (P1-W/P2-W).
  - **Requirements Addressed:** `REQ-017`, `MIG-002`
  - **Verification:** `pnpm lint && pnpm typecheck && pnpm test && pnpm build` + e2e staging. Hasil dicatat dengan SHA.
