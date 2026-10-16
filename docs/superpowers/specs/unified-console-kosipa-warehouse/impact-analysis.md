# Impact Analysis — Unified Console + KOSIPA + Warehouse

## 1. Ringkasan dampak per fase

| Fase | Perubahan | Risiko utama | Mitigasi |
|---|---|---|---|
| S0 | **DEFERRED** (owner: legacy tidak diubah): hotfix legacy. Tetap: snapshot objek skema read-only oleh operator | Hotfix PHP 5.6 di produksi dapat memutus konsumen yang tidak diketahui (link cetak dari aplikasi mobile/email) | Patch minimal (cek sesi + binding), backup file, uji di salinan, rollback = restore file. Inventaris konsumen dari access log sebelum memblokir |
| P0 | `/console`, registry navigasi, capability resolver, guard authenticated-only, landing pasca-login | Regresi POS (area layar, fokus scanner, register), redirect loop, menu tampil tanpa izin | POS focused mode tanpa sidebar console, test persona, feature flag `CONSOLE_ENABLED` |
| P1-R | Identity link (auth DB), reader KOSIPA (read-only DB user baru), halaman anggota/simpanan/pinjaman/payroll/laporan | Kebocoran data anggota (PII, gaji), beban query pada DB bersama, angka berbeda dari legacy karena view/procedure tidak terbaca | Capability per bagian data, masking PII, pool kecil, batas rentang query, parity harness vs output legacy, label "read-only" |
| P1-W | Writer KOSIPA per bounded context (pinjaman, simpanan, payroll, SHU, master, approval mobile) | **Dual-writer** dengan KOSIPA PHP, salah hitung uang, payroll ganda | Single-writer gate per konteks (menu PHP terkait dinonaktifkan/di-redirect), state machine, idempotency, reversal, rekonsiliasi finance sebelum cutover |
| P2 | Reader Gudang (DB terpisah), pemetaan barang, penerimaan toko dari Gudang, paritas TOKO (pembelian, supplier, laporan, master, IAM) | Model stok berbeda, DB ketiga, writer baru untuk `db_purchase`/stok TOKO | DB user read-only `smart_kopkar_gudang`, adapter terpisah, penerimaan toko memakai writer pembelian baru dengan lock order sama dengan POS |
| P3 | KPI lintas modul, PPOB, PWA anggota | Definisi angka tidak disepakati | Kontrak KPI dengan as-of/sumber/finance sign-off |

## 2. Frontend (`apps/web/src`)

- **Baru:** `app/console/**` (layout, dashboard, `kosipa/**`, `warehouse/**`, `reports/**`, `settings/**`), `components/console/**` (shell, sidebar, breadcrumb, module card, data table, state kosong/error), `features/console/navigation.ts` (registry).
- **Diubah minimal:** `app/login/LoginForm.tsx` + `packages/domain/src/auth/redirect.ts` (landing berbasis capability). `components/pos/PosShell.tsx` tetap untuk halaman TOKO di P0. Tautan "Dashboard Supervisor" diarahkan ke `/console` hanya jika flag aktif.
- **Tidak diubah:** `/pos`, `/sales`, `/products`, `/inventory` dan API-nya (kontrak dikunci oleh regression test).
- Halaman KOSIPA bersifat padat data (tabel besar, jadwal angsuran, matriks payroll ±1.300 baris per periode). Tabel memakai paginasi server dan virtualisasi baris, tanpa memuat seluruh matriks ke klien.

## 3. Backend / layering

| Lapisan | Dampak |
|---|---|
| `packages/domain` | Modul baru: `kosipa/loan-schedule.ts` (flat/anuitas integer), `kosipa/document-state.ts`, `kosipa/savings-balance.ts`, `kosipa/payroll-settlement.ts`, `kosipa/shu-allocation.ts`, `kosipa/journal.ts`, `kosipa/nik.ts`, `console/capabilities.ts`, `warehouse/receipt.ts`. Tanpa dependensi runtime |
| `packages/application` | Use case + port: `console/resolve-capabilities`, `kosipa/*` (query & command), `warehouse/*`, `identity/link-*` |
| `apps/web/src/infrastructure` | Adapter Prisma/`$queryRaw` terparameter: `repositories/kosipa-*.repository.ts`, `repositories/warehouse-*.repository.ts`, `db/prisma-kosipa-read.ts`, `db/prisma-gudang-read.ts`, `auth/identity-link-store.ts`. `deployment-guard.ts` menambah target `gudang` |
| API | `app/api/console/capabilities`, `app/api/kosipa/**`, `app/api/warehouse/**`. Semua memakai guard + capability per handler |

## 4. Database

| Objek | Dampak | Kepemilikan |
|---|---|---|
| `smart_kopkar` tabel KOSIPA (`m_anggota`, `trans_*`, `ref_*`, `m_acc_*`) | P1-R: SELECT saja melalui user DB read-only baru (`kkisi_kosipa_reader`). P1-W: writer per konteks dengan grant kolom/tabel minimum, hanya setelah gate | Tetap PHP KOSIPA sampai cutover per konteks |
| View/procedure produksi (`v_trans_pinjaman_*`, `v_kartu_simpanan`, `v_saldo_awal`, `x_proc_create_matrix`, …) | Dibaca definisinya (S0). Next.js **tidak** bergantung pada view untuk angka baru. Logika dipindah ke domain dan diuji terhadap output view | Tidak diubah oleh Next.js. Procedure tidak diubah; logika pengganti di Next.js |
| `smart_kopkar_gudang` | Reader baru (`kkisi_gudang_reader`), target deployment-guard baru | PHP Gudang sampai P2-W |
| `kkisi_auth` (milik Next.js) | **Tabel baru**: `console_identity_link`, `console_doc_sequence` (bila sequence tidak boleh di DB bisnis), `console_audit_event`, `warehouse_item_map`. Migrasi aditif | Next.js |
| `smart_kopkar` tabel TOKO | P2: writer pembelian/penerimaan (`db_purchase*`, `db_items.stock`, `db_stockentry`) memakai lock order POS | Next.js setelah gate per cabang |
| Index baru (mis. NIK) | Hanya melalui SQL review-only + prosedur off-peak (memori: perubahan DB produksi manual-only) | Operator |

Tidak ada DDL pada tabel bisnis legacy di P0/P1-R. Setiap kolom/tabel baru pada DB bisnis memerlukan keputusan owner terpisah.

## 5. Auth, otorisasi, tenant scope

- P0 memisahkan "terautentikasi" dari "boleh checkout". Console guard baru tidak mewarisi `sales_add`.
- KOSIPA tidak berbasis cabang. Scope = capability + kategori data (PII/gaji/finansial). TOKO tetap `ctx.companyId`. Gudang = scope DB terpisah + `company_id` dari sesi Gudang yang dipetakan (bukan POST).
- Capability KOSIPA diturunkan dari `ref_menu_akses` (controller-level) sebagai **batas atas**, lalu dipersempit oleh kebijakan aksi console (`approve`, `disburse`, `delete`) yang dikelola admin console. Akses tidak pernah lebih luas dari legacy.
- Identity link dibuat admin (dua kunci: admin console + verifikasi pengguna KOSIPA), tidak otomatis dari kesamaan nama.

## 6. Keamanan

Larangan di implementasi baru (pola legacy yang tidak boleh terbawa): SQL dari input (ANO-K13), status dari klien (K03), saldo dari klien (K04), scope dari POST (G02, G06), file ekspor di docroot (G01), md5 (K14). Next.js wajib: query terparameter, CSRF untuk state change, rate limit untuk ekspor, PII masking default, audit setiap perubahan finansial.

## 7. Queue / workers

Saat ini tidak ada job terjadwal (legacy sinkron). Kebutuhan baru:

- Penonaktifan kontrak kedaluwarsa (ANO-T02) → job harian **atau** aksi admin batch. Keputusan owner (`BR-012`).
- Generasi matriks payroll tetap sinkron (operator memicu) dengan batas waktu dan penguncian periode.

Tidak ada worker infrastruktur baru di P0/P1-R.

## 8. Mock data

Repo ini tidak memakai `packages/data` mock. Pengembangan lokal memakai `kkisi-staging` (MariaDB dari dump). **Batas:** dump tanpa view/procedure, sehingga halaman KOSIPA yang bergantung pada view akan salah di staging. Staging harus di-refresh dengan objek skema produksi (S0) sebelum parity test (`MIG-001`).

## 9. Deployment & operasi

- Deployment tetap `genesis.web` (DEV host) + tunnel ke Niagahoster. Reader baru = DSN baru di allowlist `deployment-guard.ts`.
- Anggaran koneksi: total pool Next.js tetap ≤ `MAX_CONNECTION_BUDGET=12`. Reader KOSIPA/Gudang memakai pool 2 dan dibagi dengan reader legacy bila memungkinkan.
- Feature flags: `CONSOLE_ENABLED`, `KOSIPA_READ_ENABLED`, `KOSIPA_<CONTEXT>_WRITES_ENABLED`, `WAREHOUSE_READ_ENABLED`, `WAREHOUSE_RECEIPT_WRITES_ENABLED`.
- Rollback P0/P1-R = matikan flag (tanpa perubahan data). Rollback P1-W/P2-W = matikan flag + aktifkan kembali menu PHP terkait + rekonsiliasi dokumen yang dibuat Next.js (tetap valid di tabel legacy).

## 10. Dokumen yang harus diperbarui saat implementasi

`docs/migration/DATA_OWNERSHIP.md` (tambahkan KOSIPA/Gudang/smartkkisi), `docs/migration/MIGRATION_MATRIX.md` (status berbasis bukti), `docs/migration/SALES_RETURN_IMPLEMENTATION.md` (G3 → `x_proc_create_matrix`), `.kiro/specs/pos-kasir-revamp/tasks.md` (stale), `CLAUDE.md` (KOSIPA/Gudang bukan lagi "unknown").
