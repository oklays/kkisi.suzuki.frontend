# Spesifikasi — Unified Console + Revamp KOSIPA & Warehouse (Gudang)

Tanggal: 16 Oktober 2026 (WIB). Status: **spesifikasi untuk review; belum ada kode aplikasi yang diubah.**
Input: [PRD Unified Management Console](../../../../.kiro/specs/unified-sidebar-menu-and-navigation/PRD_KKISI_Unified_Management_Console.md), [Baseline](../../../../.kiro/specs/unified-sidebar-menu-and-navigation/BASELINE_KKISI_Current_State_and_Migration_Readiness.md), audit source legacy read-only di server Niagahoster (16 Okt 2026), DDL dari dump lokal `apps/web/staging/kkisi_full_dump.sql.gz` (30 Sep 2026).

Tujuan: melanjutkan revamp Next.js setelah TOKO/POS dengan (1) console terpadu, (2) onboarding KOSIPA dan Warehouse **berdasarkan bukti source**, (3) memperbaiki anomali logika legacy saat fungsinya dibangun ulang, dan (4) memastikan tidak ada fungsi legacy yang terlewat.

## Dokumen

| # | Dokumen | Isi |
|---|---|---|
| 1 | [current-state.md](current-state.md) | Topologi 4 aplikasi + 4 database, arsitektur KOSIPA/Gudang, alur bisnis, RBAC, baseline Next.js |
| 2 | `legacy-anomalies.md` (privat, gitignored) | Register anomali (`ANO-*`): bukti, dampak, perilaku perbaikan, requirement terkait |
| 3 | [endpoint-inventory.md](endpoint-inventory.md) | Seluruh controller KOSIPA (94), Gudang, dan TOKO legacy → target Next.js, fase, status. Bukti "tidak ada yang terlewat" |
| 4 | [impact-analysis.md](impact-analysis.md) | Dampak lintas frontend, backend, DB, auth, keamanan, deployment |
| 5 | [requirements.md](requirements.md) | `REQ/BR/VAL/SEC/NFR/OBS/MIG` dengan kriteria EARS |
| 6 | [design.md](design.md) | Arsitektur, bounded context, identity link, capability resolver, adapter, state machine, kalkulasi |
| 7 | [tasks.md](tasks.md) | Task atomik per fase dengan file, requirement, dan verifikasi |
| 8 | [verification.md](verification.md) | Matriks traceability dan gate |
| 9 | [implementation-journal.md](implementation-journal.md) | Jurnal checkpoint implementasi: task, file, keputusan, hasil verifikasi, status |
| 10 | [decision-register.md](decision-register.md) | Keputusan owner dan blocker bukti/kapasitas (tidak ada default yang disetujui) |
| 11 | [operational-readiness.md](operational-readiness.md) | Paket kesiapan operasional menuju staging acceptance (bukan produksi) |
| 12 | [warehouse-persistence-architecture.md](warehouse-persistence-architecture.md) | Arsitektur persistensi Warehouse, kontrak integrasi, bukti rehearsal (§8) dan verifikasi lintas-database (§11) |
| 13 | [connection-capacity-analysis.md](connection-capacity-analysis.md) | Kapasitas koneksi (12/12, perlu +2): opsi A/B/C, pengukuran lokal, rekomendasi |
| 14 | [staging-rbac-uat-matrix.md](staging-rbac-uat-matrix.md) | Matriks RBAC 8 persona uji (dibangkitkan dari kode, dicek drift) |
| 15 | [staging-uat-plan.md](staging-uat-plan.md) | Persiapan UAT staging terintegrasi: skenario, bukti sintetis, yang butuh staging |
| 16 | [export-security-assessment.md](export-security-assessment.md) | Penilaian keamanan ekspor CSV, batas rate limiter per proses |
| 17 | [kosipa-evidence-gate-report.md](kosipa-evidence-gate-report.md) | Lima level bukti KOSIPA, tugas yang masih terblokir, alur aman definisi terbatas dan kasus uji tersanitasi |
| 18 | [toko-stock-writer-contract.md](toko-stock-writer-contract.md) | Kontrak penulis stok TOKO: ledger wajib, idempotensi, hak akses minimum, DDL usulan |
| 19 | [staging-role-readiness.md](staging-role-readiness.md) | Ekspor peran nyata (pseudonim) dan validasi dengan aturan runtime console |
| 20 | [owner-operator-action-package.md](owner-operator-action-package.md) | Paket tindakan owner/operator: bukti minimum untuk fase berikutnya |
| — | [`docs/migration/sql/legacy-schema-objects-readonly.sql`](../../../migration/sql/legacy-schema-objects-readonly.sql) | SQL **read-only** untuk operator: ambil definisi view/procedure yang tidak ada di dump |

## Temuan yang mengubah asumsi PRD/Baseline

1. **KOSIPA ditemukan** di `kosipa.kkisitb2.id` (`public_html/kosipa`): CodeIgniter **2.1.4** + HMVC, PHP 5.6, 16 modul, ±59 rb baris controller/model. Ia **berbagi database `n1608204_smart_kopkar` dengan TOKO** (`m_anggota`, `trans_*`, `db_sales`).
2. **"Generator payroll eksternal"** yang disebut di `SALES_RETURN_IMPLEMENTATION.md` adalah **KOSIPA modul `payroll/matrix_c`** yang memanggil stored procedure `x_proc_create_matrix`. Procedure itu **tidak diubah** (keputusan owner); generator pengganti di Next.js wajib mengurangi retur Kredit.
3. **Warehouse = aplikasi Gudang** di `gudang.kkisitb2.id`: fork lama template TOKO (CI 3.1.11) dengan **database terpisah** `n1608204_smart_kopkar_gudang`. Tidak ada mesin transfer stok. Gudang menjual ke toko sebagai *customer*, lalu toko mencatat ulang sebagai pembelian dari supplier "GUDANG MANGUN JAYA" (**input ganda manual**).
4. Ada aplikasi keempat: **smartkkisi** (Laravel 8, marketplace multi-vendor + Passport) di DB bersama, sumber pengajuan mobile anggota dan transaksi PPOB wallet.
5. Identitas staf KOSIPA (`ref_users`, `md5(md5())`, RBAC `ref_menu`) **berbeda** dari TOKO (`db_users`, bcrypt, `db_permissions`). Console memerlukan *identity link*, bukan login kedua.

## Risiko keamanan legacy (DEFERRED)

Audit menemukan beberapa risiko keamanan pada aplikasi legacy yang masih berjalan. Rinciannya hanya ada di register **privat** `legacy-anomalies.md` (gitignored, tidak di-commit ke repo publik). Keputusan owner (16 Okt 2026): **aplikasi legacy tidak diubah**; seluruh perbaikan diwujudkan sebagai perilaku aman di Next.js. `TASK-001`/`TASK-002` berstatus **DEFERRED** dan tetap tercatat sebagai risiko operasional sampai legacy dipensiunkan.

## Keputusan scope

- **P0** = console terpadu sesuai PRD (tanpa write baru, tanpa schema bisnis).
- **P1** = KOSIPA *read-first* (identity link, anggota 360, simpanan, pinjaman, payroll, laporan), lalu write per bounded context dengan perbaikan anomali.
- **P2** = Warehouse *read-first* (DB Gudang terpisah), lalu alur **penerimaan barang toko dari Gudang** yang menggantikan input ganda, serta sisa paritas TOKO (pembelian, supplier, laporan, master, admin).
- PHP legacy **tidak diubah sama sekali** (keputusan owner 16 Okt 2026). Perbaikan logika diterapkan pada implementasi Next.js. Setiap cutover writer mengikuti aturan *single-writer*.
