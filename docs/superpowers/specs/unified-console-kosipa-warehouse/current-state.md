# Current State — KOSIPA, Warehouse (Gudang), dan Console

Audit 16 Oktober 2026. Metode: pembacaan source **read-only** via SSH di server hosting Niagahoster (tanpa menyalin source/konfigurasi, tanpa membuka file kredensial, tanpa request ke endpoint aplikasi), DDL dari dump lokal 30 Sep 2026, dan source Next.js di repo ini (HEAD `81dab9ed`).

Label bukti mengikuti Baseline: **E1** = terlihat di source/DDL; **E1-inferred** = disimpulkan dari beberapa bukti E1 (alasan dicatat); **Unknown** = perlu bukti tambahan.

## 1. Topologi sistem

### 1.1 Aplikasi (akun cPanel produksi, domain → docroot dari `uapi DomainInfo`)

| Aplikasi | Domain | Docroot | Stack | Database | Bukti |
|---|---|---|---|---|---|
| TOKO legacy | `tokonew.kkisitb2.id` | `public_html/tokonew.kkisitb2.id` | CodeIgniter 3.1.11 | `smart_kopkar` | E1, `docs/legacy-reference/` |
| TOKO Next.js | `smart.kkisitb2.id` | DEV host `genesis.web` | Next.js 16, Prisma 6 | `smart_kopkar` (tunnel) + `kkisi_auth` | E1, `GENESIS_DEV_DEPLOYMENT.md` |
| **KOSIPA** | `kosipa.kkisitb2.id` | `public_html/kosipa` | **CodeIgniter 2.1.4** + HMVC (`third_party/MX`), PHP 5.6 (`lsphp56`), Grocery CRUD, dompdf/tcpdf/FPDF, PHPExcel, PHPMailer | `smart_kopkar` | E1-inferred: semua tabel yang dipakai (`m_anggota`, `trans_*`, `ref_*`, `db_sales`, `orders`) ada di dump `smart_kopkar` |
| **Gudang** (Warehouse) | `gudang.kkisitb2.id` | `public_html/gudang` | CodeIgniter 3.1.11, **fork lama** template TOKO, PHP 5.6 | `smart_kopkar_gudang` | E1-inferred: `db_company` di `smart_kopkar` hanya berisi 3 cabang TOKO, tanpa entitas Gudang atau customer "Koperasi Tambun II"; DB Gudang terpisah (78 MB) ada |
| gudangnew | `gudangnew.kkisitb2.id` | kosong (hanya `.htaccess` 0 byte) | — | — | E1 |
| **smartkkisi** | `smartkkisi.kkisitb2.id` | Laravel 8 (marketplace multi-vendor admin/seller/customer, Passport/Sanctum) | `smart_kopkar` | E1-inferred: tabel `users`, `oauth_*`, `orders`, `products`, `sellers`, `*_wallets` ada di dump `smart_kopkar` |
| dev.smartkkisi | `dev.smartkkisi.kkisitb2.id` | salinan dev Laravel | Unknown | E1 |

### 1.2 Database (dari `uapi Mysql list_databases`; hanya nama dan ukuran)

| Database | Ukuran | Konsumen |
|---|---|---|
| `n1608204_smart_kopkar` | 1.040 MB | TOKO legacy + Next.js, KOSIPA, smartkkisi. **283 tabel, 45 view** (dump 30 Sep) |
| `n1608204_smart_kopkar_gudang` | 78 MB | Gudang (E1-inferred) |
| `n1608204_smart_kopkar_toko` | 22,5 MB | **Unknown**: kemungkinan DB TOKO sebelum `tokonew`. Belum ada konsumen terbukti |
| `n1608204_kkisi_auth` | 0,2 MB | Sesi/throttle Next.js |

**Batas dump lokal:** dump 30 Sep **tidak memuat definisi 45 view** (hanya stub kolom `NULL AS …`) dan **tidak memuat stored procedure/function/trigger** kecuali stub `proc_hari_simpanan`. Kalkulasi pinjaman (`v_trans_pinjaman_flat/anuitas/simulasi`), saldo (`v_kartu_simpanan`, `v_saldo_awal`), dan generator payroll (`x_proc_create_matrix`) **hanya ada di produksi**. Database staging yang di-restore dari dump ini memiliki view palsu (lihat `ANO-X03`). SQL pengambilan read-only: `docs/migration/sql/legacy-schema-objects-readonly.sql`.

### 1.3 Pengelompokan tabel di `smart_kopkar`

| Prefix | Jumlah | Pemilik penulis saat ini |
|---|---|---|
| `db_*` | 54 | TOKO (legacy PHP + Next.js per fitur) |
| `m_*` | 34 | KOSIPA (master anggota/simpanan/pinjaman/akuntansi). `m_anggota` juga dibaca TOKO/Next.js |
| `trans_*` | 41 | KOSIPA (simpanan, pinjaman, payroll, SHU, tagihan PPOB, deposito, berjangka, voucher) |
| `ref_*` | 10 | KOSIPA (user, menu, group, akses, site) |
| `app_*` | 8 | KOSIPA (org unit/jabatan/job level, SMTP, LDAP) |
| `oauth_*`, `users`, `orders`, `products`, `sellers`, wallet, refund, shipping, dsb. | ±80 | smartkkisi |
| `inventory*`, `gudang_pembelianproduks`, `temp_stock_barang`, `m_barang` | ±6 | Unknown (indikasi sisa modul gudang/barang lama) |

## 2. KOSIPA

### 2.1 Struktur

`application/modules/<modul>/{controllers,models,views}` (HMVC). Controller modul meng-extend `MZ_Controller` (`third_party/MX/Controller.php`). Ditambah 8 controller cetak/unduh di `application/controllers/` yang meng-extend `MY_Controller`.

| Modul | Controller | Fungsi bisnis |
|---|---|---|
| `admin` | 8 | Pengguna staf, group & hak akses, menu, log akses, profil, pengguna mobile |
| `anggota` | 4 | Master anggota (duplikat `master/anggota_c`), transaksi simpanan/pinjaman/toko per anggota |
| `api` | 1 | `referensi/get_setting` (publik) |
| `auth` | 2 | Login, reset password via email |
| `dashboard` | 1 | KPI pinjaman/simpanan, notifikasi |
| `laporan` | 14 | Kas simpanan/pinjaman, outstanding per jenis (reguler, bank, kasbon, pembiayaan), transaksi kas, ekspor Excel |
| `master` | 22 | Anggota, bagian/divisi/jabatan/lokasi/cabang, jenis simpanan/pinjaman/pembiayaan + akun COA, suku bunga, periode angsuran, rekening bank, mata uang, pajak, jenis dokumen/pembayaran, master surat, barang/brand/kategori/satuan |
| `mobile` | 4 | Approval permintaan dari aplikasi anggota: penarikan, pengajuan simpanan, pinjaman mobile, user mobile |
| `payroll` | 1 | Matriks potongan gaji bulanan (`trans_potongan_*`), upload Excel, proses, slip |
| `pengaturan` | 1 | Pengaturan bisnis (mata uang, timezone) |
| `pinjaman` | 10 | Pinjaman umum, reguler, kasbon, bank, KPR BTN, pembiayaan, gaji minus, over kredit, pelunasan, kartu aktif |
| `ppob` | 5 | Produk, penjualan PPOB (approve/reject/cek status IAK), pembelian, tagihan anggota, laporan |
| `shu` | 1 | Pembagian SHU: jasa simpanan + jasa usaha, upload Excel |
| `simpanan` | 10 | Simpanan (2 versi), payroll simpanan, setoran, penarikan, pengajuan/penarikan mobile, hak & kewajiban, kas anggota, master payroll |
| (root) | 8 | Cetak kartu pinjaman, simpanan, tagihan, surat, form penarikan, unduh receipt |

Daftar method lengkap per controller: [endpoint-inventory.md](endpoint-inventory.md).

### 2.2 Autentikasi dan otorisasi (E1)

- **Login:** `libraries/autentifikasi.php::login()` membandingkan `ref_users.password == md5(md5($password))`. Session (file, cookie `plnpriority_session`, 24 jam, `sess_match_useragent=true`) menyimpan `id_user`, `id_ref_site`, `id_ref_bagian`, `id_toko`, `group_id`, dan `status`. Session diisi **sebelum** status aktif diperiksa (`ANO-K14`).
- **Gate:** `MY_Controller` dan `MZ_Controller` **tidak** memeriksa login (blok dikomentari). Setiap controller modul memanggil `user_m->cekstatushakakses('<modul>/<class>', id_user)` di constructor. Fungsi ini menghitung baris `ref_menu ⨝ ref_menu_akses ⨝ ref_group_akses` dengan `upper(ref_menu.url) = upper('<modul>/<class>')`.
  - Granularitas = **per controller**, bukan per aksi. Pengguna yang boleh membuka halaman dapat memanggil seluruh method (add/delete/approve/posting) (`ANO-K02`).
  - 7 controller modul tanpa gate (wajar: login, reset, error, `api/referensi`). Controller cetak root memiliki risiko otorisasi yang dicatat di register privat (DEFERRED).
- **Menu:** `user_m->create_menu()` merender HTML sidebar dari `ref_menu` (rekursif, satu query per node). Aktif ditentukan oleh `?id_sub_menu=` dari URL.
- **Tidak ada scope cabang:** data KOSIPA berlaku untuk seluruh koperasi. `id_ref_site`/`id_toko` ada di session tetapi tidak dipakai sebagai filter data.
- **CSRF:** `csrf_protection = true` (POST). Endpoint GET tidak terlindungi.
- `autentifikasi::role()` memanggil `user1data()` (typo) sehingga fatal bila dipakai (`ANO-K15`, saat ini tidak dipanggil).

### 2.3 Domain data utama (DDL E1)

- **Anggota:** `m_anggota` (kunci bisnis `nik_kar` varchar; `kd_group` ANGGOTA/BMP/KOPERASI; `status_anggota` AKTIVE/LUAR BIASA/KONTRAK/RESIGN/PENSIUN; `gaji`; **`limit_toko`, `limit_ppob`, `gaji_minus`** yang ditulis KOSIPA via upload Excel dan dibaca TOKO untuk Kredit).
- **Simpanan:** header `trans_simpanan` (doc_no, jenis_simpanan, jenis_transaksi PAYROLL/CASH/TRANSFER, periode, `doc_status` OPEN→APPROVED, akun) + detail `trans_simpanan_dtl` per NIK (`kredit` payroll, `kredit_cash` tunai, `debit` penarikan, `jasa`). `trans_simpanan_saldo` diisi untuk jenis selain POKOK/WAJIB/SUKARELA. Saldo kartu dari view `v_kartu_simpanan`/`v_saldo_awal` (definisi Unknown).
- **Pinjaman:** `trans_pinjaman` (doc_no `PIN{YYYY}{MM}{NNNNN}`, jenis, `jenis_suku_bunga` Flat/Anuitas, plan pinjaman/jangka waktu/angsuran, biaya admin/asuransi %, `doc_status`, `status_pencairan`, `status_bayar` LUNAS/BELUM LUNAS, blokir) + `trans_pinjaman_dtl` (jadwal: `tgl_cicilan`, `status_cicilan` Belum Bayar/Bayar, `type_cicilan`, `sisa_cicilan`) + `trans_pinjaman_rollover`, `trans_pinjaman_kasbon_dtl`, `trans_pinjaman_pengajuan` (mobile).
- **Payroll:** `trans_potongan_bulanan` (header per periode × `kd_group`, OPEN→APPROVED, total, tgl/total cair) + `trans_potongan_matrix` (per NIK: komponen simpanan, angsuran, PPOB, **`TOKO_TAMBUN`, `TOKO_MJ`, `TOKO_GIIC`**, `total_potongan`).
- **SHU:** `trans_shu` (pool jasa simpanan/usaha, total simpanan/usaha) + `trans_shu_dtl` per NIK.
- **Akuntansi:** `m_acc_coa`, `m_acc_jurnal_umum` + `_dtl`, `acc_mapping_akun` (mapping debit/kredit per kode).
- **PPOB:** `trans_tagihan*`, `orders` (smartkkisi, `ppob=1`, `pay_by_wallet`).

### 2.4 Alur bisnis utama (E1, ringkas)

1. **Pengajuan pinjaman** (`pinjaman_*_c::ajax_add`): simpan header dengan `doc_no = get_no_save()`, update `m_anggota.gaji` sebagai efek samping, lalu `update_biaya_flat/anuitas` meng-update `trans_pinjaman` dari view. Simulasi ditampilkan dari `metode_flat/anuitas` (hitung PHP, *float*) dengan indikator 70% gaji (hanya tampilan).
2. **Approval/posting** (`ajax_posting`): `doc_status` diambil langsung dari POST. Bila APPROVED, pinjaman lama di `trans_pinjaman_rollover` ditandai LUNAS. Tanpa transaksi DB, tanpa cek status awal, tanpa pemisahan pembuat/penyetuju.
3. **Simpanan setoran/payroll** (`simpanan_c`, `sim_payroll_c`, `sim_setor_c`): dokumen OPEN → `ajax_proses` dengan `request` dari POST → APPROVED; jurnal via `insert_to_input_jurnal`.
4. **Penarikan** (`penarikan_simpanan_c`): detail ditolak bila `total_saldo − nominal < 0`, **dengan `total_saldo` dari POST** (`ANO-K04`). Approval mengubah status dan menyinkronkan `trans_simpanan_penarikan` bila berasal dari mobile.
5. **Payroll bulanan** (`payroll/matrix_c`): buat header per `kd_group` → `process_simulasi` memanggil `x_proc_create_matrix(doc_no, bl, th, periode, kd_group, toko_start, toko_end)` dengan jendela TOKO = **bulan sebelumnya** → koreksi manual/upload Excel → `ajax_proses` APPROVED: header di-update, lalu **semua** `trans_pinjaman_dtl` bulan tersebut berstatus `Belum Bayar` diubah menjadi `Bayar/PAYROLL` tanpa filter group/anggota (`ANO-K05`), dan pinjaman dengan `sisa_cicilan=0` ditandai LUNAS.
6. **Hak & kewajiban** (`hak_kewajiban_m`): kewajiban toko = `SUM(db_sales.grand_total)` Kredit Final pada periode + PPOB wallet `orders`. **Tidak mengurangi `db_salesreturn`** (`ANO-X01`).
7. **SHU** (`shu_c::ajax_generate_jasa`): `jasa = (simpanan_i / total_simpanan) × pool` + `(usaha_i / total_usaha) × pool`, dibulatkan ke ribuan per anggota. Tanpa guard pembagi nol dan tanpa rekonsiliasi total (`ANO-K09`).
8. **Approval mobile** (`mobile/*`, `simpanan/*_mobile_c`): memproses pengajuan dari smartkkisi ke dokumen KOSIPA.

## 3. Warehouse — aplikasi Gudang

- Fork **lebih lama** dari template TOKO yang sama (CI 3.1.11). Dari 93 file controller/model/helper/core TOKO: 38 berbeda, 11 hanya ada di TOKO (Kasir, PPOB, Sales_mobile, Print_pos, `mysecurity_helper`, Escpos, Uuid, dsb.), 5 hanya ada di Gudang (`api/Api_c` login anggota, `kalkulator`, `menu_model`, `IOFactory`). `MY_Controller` identik, sehingga auth gate dan `permission_check()` sama dengan TOKO legacy.
- **Model stok berbeda dari TOKO:** Gudang memakai `db_items` global + `db_items_stock (item_id, company_id, stock)` (desain asli template). TOKO saat ini memakai `db_items` per `company_id` dengan kolom `stock`. Kedua model **tidak kompatibel langsung**.
- **Fungsi:** Purchase (penerimaan dari supplier, pembayaran, retur, update PO/faktur pajak), Sales (penjualan B2B ke customer, pembayaran, `update_po`, **ekspor Excel invoice**), Stock opname (draft → approve → `update_stock`), Items/labels/barcode, Reports (penjualan, pembelian, retur, P&L, stok, item, pembayaran, kedaluwarsa), Expense, Customers/Suppliers + piutang/hutang, Import CSV, Users/Roles/Company/Site.
- **Tidak ada transfer stok, lokasi rak, atau ledger mutasi** (`grep` transfer/mutasi/warehouse_id hanya menemukan kolom yang dikomentari).
- **Integrasi dengan TOKO:** tidak ada secara teknis. Indikasi kuat alur aktual: Gudang membuat **sales** ke customer "Koperasi Tambun II"/beban "Gudang MJ" (ekspor invoice `Sales::export_excel`), lalu toko mencatat **purchase** dari supplier `db_suppliers.id=70 "GUDANG MANGUN JAYA"` di `smart_kopkar`. Barang dicocokkan manual (`ANO-X02`).
- API login anggota Gudang (`api/Api_c`) tidak berfungsi dan tidak dimigrasikan.
- Skema `smart_kopkar_gudang` **belum didapat** (Unknown).

## 4. smartkkisi (konteks dependensi)

Laravel 8 multi-vendor marketplace (route `admin`, `seller`, `customer`, 150 route web) dengan Passport. Ia menulis tabel yang dibaca KOSIPA: pengajuan simpanan/penarikan/pinjaman mobile dan `orders` PPOB (`pay_by_wallet`) yang masuk ke kewajiban anggota. `oauth_access_tokens` dihapus KOSIPA saat status anggota berubah. **Di luar scope revamp ini**, tetapi kontrak datanya dicatat sebagai dependensi PWA `/anggota` (P3).

## 5. Baseline Next.js (HEAD `81dab9ed`)

- **Sudah dibangun (TOKO):** `/pos` (checkout Cash/QRIS/Kredit, register buka/tutup/rekap, struk), `/sales` (riwayat, detail, pembayaran, cetak ulang), `/sales/returns` (retur), `/products` (list/tambah/edit), `/inventory` (master warehouse global + stock opname), landing `/`, `/login`, `/anggota` (coming soon).
- **Auth:** `validateSession()` memvalidasi ulang sesi (`kkisi_auth`) + `db_users`/`db_roles`/`db_company` per request. Branch dari `session.cid`. Permission via `db_permissions(role, slug)`. Hanya hash **bcrypt** yang diterima (`packages/domain/src/auth/password-candidates.ts`).
- **Guard halaman:** `requirePagePermission(slug | slug[])` (`apps/web/src/infrastructure/auth/page-guard.ts`). Belum ada guard "authenticated-only".
- **Navigasi:** `PosShell.tsx` dengan flag `PosSession.can*` per halaman. "Dashboard Supervisor" dan "Laporan Keuangan" berstatus disabled.
- **DB:** satu datasource Prisma ke `smart_kopkar` (reader) + client writer per fitur (`DATABASE_URL_*_WRITE`, flag `*_WRITES_ENABLED`, `ALLOW_PRODUCTION_DB_WRITE`) + auth DB. `deployment-guard.ts` mengunci host/DB/user per DSN, `MAX_POOL_PER_CLIENT=4`, `MAX_CONNECTION_BUDGET=12` dari limit 20 koneksi Niagahoster yang dibagi dengan PHP.
- **Belum dibangun dari TOKO legacy:** Purchase (+konsinyasi), Purchase return, Suppliers, Customers (+pembayaran), Expense, Reports, Dashboard KPI, Import CSV, Users/Roles/Menu/Company/Site, master data (brand, kategori, satuan, pajak, tipe bayar, dsb.), PPOB, Sales_mobile, label/barcode, penyesuaian stok, edit/hapus/bayar penjualan. Detail di [endpoint-inventory.md §3](endpoint-inventory.md#3-toko-legacy--status-paritas-nextjs).
- `.kiro/specs/pos-kasir-revamp/tasks.md` **stale**: menandai task 1–10 belum selesai, padahal riwayat git menunjukkan POS sudah beroperasi.

## 6. Dokumen lama yang perlu direkonsiliasi

- `docs/migration/SALES_RETURN_IMPLEMENTATION.md`: "generator payroll terpisah, tidak di repo" → sekarang teridentifikasi sebagai `x_proc_create_matrix` di KOSIPA.
- `docs/migration/MIGRATION_MATRIX.md` dan `.kiro/specs/pos-kasir-revamp/tasks.md`: status lama (lihat Baseline R-06).
- `CLAUDE.md` "trans_ (loan tables)": `trans_*` adalah domain KOSIPA (simpanan, pinjaman, payroll, SHU, PPOB), bukan hanya pinjaman.
