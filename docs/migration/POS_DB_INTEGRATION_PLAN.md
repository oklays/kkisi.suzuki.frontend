# Rencana Integrasi POS Next.js ↔ Database Staging

> Status: **rencana, belum ada kode diubah.** Tanggal audit: 2026-09-30.
> Sumber aturan bisnis: kode CI3 di `tokonew.kkisitb2.id/` (bukan dokumen ringkasan).
> Semua query/`ANALYZE` dijalankan di staging `kkisi_staging` (MariaDB 11.4, `127.0.0.1:3307`) dengan user SELECT-only. Tidak ada write, tidak menyentuh produksi. Tidak ada kredensial/data pribadi di dokumen ini.

## 0. Metode dan batasan

- Yang dibaca: `controllers/Pos.php`, `models/Pos_model.php`, `helpers/custom_helper.php`, `views/pos.php` (JS di dalamnya), `controllers/Kasir.php`, `models/Sales_model.php`, `models/Sales_return_model.php`, `core/MY_Controller.php`, `views/sal-invoice-pos.php`.
- Yang dibaca di sisi baru: seluruh `kkisi.web/src`, `prisma/schema.prisma`, `tests/`, `README.md`.
- Angka waktu = **median 15 kali** (setelah 2 kali warm-up) dari `ANALYZE FORMAT=JSON` di staging. Angka satu kali jalan tidak dipakai karena berisik (contoh: query yang sama terukur 15 ms dan 146 ms pada run pertama).
- Staging = snapshot; angka data (jumlah baris dsb.) adalah **snapshot**, bukan angka produksi hidup.
- **Produksi tidak punya indeks sekunder** (dari ringkasan staging). Semua benchmark di bawah memakai 28 indeks yang sudah ditambahkan di staging. Di produksi, angka "lama" bisa jauh lebih buruk.

### Dokumen vs kode/data aktual (jangan dipercaya begitu saja)

| Klaim dokumen | Kenyataan | Bukti |
|---|---|---|
| `characterization-tests.md` CT-POS-001: `db_items.unit_price`, `db_cart(invoice, qty, user_id, company_id)`, `id_kasir=10` | Kolom asli: `sales_price`; `db_cart(sales_code, sales_qty, price_per_unit)`, **tanpa** `company_id`/`user_id`/`invoice` | DDL staging |
| CT-POS-002: "block-on-insufficient-credit", pajak Exclusive dihitung | Blokir limit **hanya di JS browser**; total = `(harga − diskon) × qty`, **pajak tidak dihitung** | `views/pos.php:2040-2130`, `Pos.php:729-785` |
| CT-POS-004 / IMP-022: Hold invoice | `db_hold` & `db_holditems` **0 baris**; alur baru pakai `Quotation` + `db_cart` | staging |
| IMP-011: "stock increment/decrement" | Stok **dihitung ulang dari ledger** tiap transaksi, bukan di-decrement | `Pos_model.php:1033-1115` |
| README: staging = DB sintetis, user SELECT-only | Sekarang salinan penuh produksi (283 tabel); ada user `kkisi_app` tulis | ringkasan user |
| `tests/prisma-item-repository.test.mjs` lulus (13/13) | **1 dari 13 gagal** (`repository scopes product search…`, field `barcode/barcodePack/discount/discountPersen` tidak ada di ekspektasi tes) | `npm test` |

---

## 1. Ringkasan alur POS lama dan tabel yang berubah

### 1.1 Alur langkah demi langkah

| # | Langkah | Endpoint / fungsi (bukti) | Query / perubahan data |
|---|---|---|---|
| 1 | Buka POS | `Pos::index` (`Pos.php:25`) `permission_check('sales_add')` | Cek `db_buka_kasir` (sesi terbuka hari ini). Jika ada sesi dari hari lalu yang belum ditutup → paksa tutup (`Pos.php:74-78`). Jika tidak ada sesi → `pilih_kasir` |
| 2 | Buka kasir | `Pos::buka_toko` (`Pos.php:844`) | `INSERT db_buka_kasir` (`noref='KRS-'+Ymd+MAX(id)+1`, `id_kasir`, `saldo_awal`, `tgl_buka`, `user_id`, `company_id`, `status=1`) |
| 3 | Draft invoice | `Pos::new_invoice` (`Pos.php:940`) | `SELECT MAX(RIGHT(sales_code,5))` per company+bulan → kode `sales_init + ymd + 5 digit`; `INSERT db_sales` status **`Quotation`**, `customer_id=0`, `nik_kar='0'`, `id_kasir`, `id_buka_kasir`, `pos=1`. Jika sudah ada Quotation hari itu di sesi yang sama → dihapus, dibuat ulang |
| 4 | Cari produk | `Pos::search_item` → `Pos_model::search_item` (`:19`) | `db_items WHERE company_id=? AND status=1 AND (upper(item_name)/custom_barcode/custom_barcode_pack LIKE %x%)` tanpa LIMIT |
| 5 | Detail produk | `Pos::detailitems` (`Pos.php:546`) | `db_items` per id. `type='Produk Jadi'` → stok asli; selain itu (PPOB) stok dipalsukan `9999999999`. JS menolak bila `status_so==1` (sedang stock opname) atau `stock<1` (`views/pos.php:1372-1395`) |
| 6 | Tambah keranjang | `add_to_cart_new` (`Pos.php:729`) | Baris ada → `UPDATE db_cart qty+1,total_cost`; baru → `INSERT db_cart` (snapshot `purchase_price`, `price_per_unit=sales_price`, `discount_amt=item.discount`, tax_* disalin tapi tidak dipakai). `total_cost=(price−discount)×qty`. **Tidak ada cek stok di server** |
| 7 | Ubah qty / hapus | `update_qty_pos_new` (`:323`), `removerow_new` (`:253`) | `UPDATE/DELETE db_cart`. Tidak ada cek stok di server (cek hanya di JS `views/pos.php:1963-1972`) |
| 8 | Pilih anggota | `getnik` / `getidcard` / `getnik_qr` (`Pos_model.php:421/386/457`), lalu `detailanggota` (`Pos.php:383`) | `m_anggota LIKE %x%`. `detailanggota` menghitung limit: `effective = gaji_minus>0 ? gaji_minus : limit_toko`; `tagihan = SUM(grand_total)` Kredit+Final bulan ini per `nik_kar` **lintas cabang** (`custom_helper.php:209`); `sisa = effective − tagihan`. JS hanya menerima `status_anggota=='AKTIVE'`. **Efek samping**: anggota KONTRAK yang `tgl_keluar` lewat → `UPDATE m_anggota` jadi `PENSIUN`, limit 0, dan menonaktifkan `users` mobile + hapus token (`Pos.php:439-464`) |
| 9 | Pilih pembayaran | `update_payment`, `update_anggota` (`Pos.php:577/603`) | `UPDATE db_sales payment_type, customer_id, nik_kar, payment_status='Unpaid'`. Pilihan hanya **Cash** atau **Kredit** (`views/pos.php:444-448`). UMUM (`nik=0`) otomatis Cash di UI |
| 10 | Validasi bayar | JS F1/F2 (`views/pos.php:2040-2230`) | Kredit: blok jika `sisa_kredit<0`. Cash: blok jika `bayar==0` atau `kembalian<0`. **Semua di browser** |
| 11 | Simpan | `pos_save/{company_id}` → `Pos_model::pos_save` (`:39-213`) | Lihat 1.2. **Tanpa transaksi DB**, `company_id` dari URL, total/bayar/tanggal dari POST |
| 12 | Struk | `print_invoice_pos/{sales_id}` → `views/sal-invoice-pos.php` | Baca `db_company`, `db_sales`, `m_anggota`, `db_salesitems` + `db_items` + `db_units`. Varian lain: `pos2`, `posa4`, `posa4_new`, `mobile` |
| 13 | Tutup kasir | `Pos::tutup_kasir` (`Pos.php:880`), `Kasir::ajax_tutup_kasir` (`Kasir.php:187`) | Rekap Cash (`paid_amount − kembalian`) + Kredit per `id_buka_kasir`; `UPDATE db_buka_kasir saldo_akhir, saldo_kredit, status=0`; hapus draft `Quotation` sesi itu (+ `db_cart`-nya). Catatan: `Kasir::ajax_tutup_kasir` mengisi `tgl_tutup = tgl_buka` (bukan waktu tutup) |
| 14 | Hapus/batal | `Sales_model::delete_sales` (`:515`) | Hard delete `db_salespayments`, `db_sales`, `db_salesitems` + hitung ulang stok. Diblokir bila ada retur. Perm `sales_delete` |
| 15 | Retur | `Sales_return_model::verify_save_and_update` (`:100-336`) | Punya transaksi (`trans_begin/commit`). Insert `db_salesreturn`, `db_salesitemsreturn`, `db_salespaymentsreturn`, set `db_sales.return_bit=1`, hitung ulang stok. **0 baris di staging → fitur tidak pernah dipakai** |

### 1.2 Isi `pos_save` (Final) — tabel yang berubah

Urutan aktual (`Pos_model.php:73-210`), semua statement terpisah (autocommit):

1. `SELECT db_cart WHERE sales_code`.
2. Per baris cart: `SELECT db_items` (untuk `type`) lalu `INSERT db_salesitems` (`sales_status='Final'`, `sales_qty`, `purchase_price`, `price_per_unit`, `discount_amt`, `unit_total_cost = price − discount` **per unit**, `total_cost`, `status=1`, `company_id`, `item_type`). Kolom `tax_*`, `discount_type/input`, `id_kasir`, `id_buka_kasir` **tidak diisi** (default). Bukti data: 19.888 dari 19.958 baris terbaru punya `id_buka_kasir` NULL; 49.544 dari 49.863 baris terbaru `tax_id=0`.
3. `SELECT nama_kar,no_telp FROM m_anggota WHERE nik_kar=?` (hasil tidak dipakai; error bila NIK `0`).
4. `UPDATE db_sales`: `sales_date` (dari POST), `sales_status='Final'`, `customer_id`, `nik_kar`, `payment_type`, `type_order`, `subtotal`, `tot_discount_to_all_amt`, `grand_total`, `round_off=ROUND(grand_total)`, `paid_amount` (**Kredit = grand_total; Cash = bayar**), `other_charges_input/amt = kembalian`, `payment_status='Paid'`.
5. `DELETE db_cart WHERE sales_code`.
6. Per baris `db_salesitems`: `UPDATE db_salesitems ... WHERE sales_id` (pernyataan sama diulang N kali) lalu `update_items_quantity` (kecuali item `PPOB`).
7. `update_items_quantity` (`:1033`): 5 `SELECT SUM` (stockentry, purchase Received ≥2025, purchase return ≥2025, sales Final ≥2025, sales return ≥2025) → `UPDATE db_items SET stock=` hasil → `SELECT db_items` → `SELECT products` (tabel sinkron VPS/mobile) → `UPDATE products.current_stock`.
8. `subtotal_hpp = SUM(purchase_price × sales_qty)` → `UPDATE db_sales`.
9. `DELETE db_salespayments WHERE sales_id` lalu `INSERT db_salespayments` **1 baris** (`payment=paid_amount`, `payment_type`, `payment_note='Dibayar By Cash|Kredit'`, `change_return=kembalian`, `payment_date`, `company_id`, `status=1`).

Tabel yang berubah per transaksi: `db_sales` (draft insert + final update), `db_cart` (insert/update/delete), `db_salesitems`, `db_salespayments`, `db_items.stock`, `products.current_stock`. **`m_anggota` tidak berubah** (lihat 1.3).

### 1.3 Aturan bisnis yang terbukti dari kode + data

| ID | Aturan | Bukti |
|---|---|---|
| R1 | **Stok per cabang = baris `db_items` per `company_id`**. Item yang sama punya baris berbeda tiap cabang (6.733 barcode muncul di >1 cabang) → **semua query wajib `company_id`**. Item aktif: cabang 1 = 5.123, cabang 2 = 8.598, cabang 3 = 6.768 | staging |
| R2 | `stock` = cache dari ledger: `SUM(db_stockentry status=1) + pembelian Received (tgl ≥ 2025) − retur beli (≥2025) − penjualan Final (≥2025) + retur jual`. Diverifikasi: dihitung ulang di staging cocok untuk 20.440 dari 20.462 item aktif "Produk Jadi"; 22 item selisih (cabang 1: 5, cabang 2: 17, cabang 3: 0), total selisih absolut 320 unit | `Pos_model.php:1033`, query set-based |
| R3 | **Limit anggota = tidak ada saldo tersimpan.** `sisa = (gaji_minus>0 ? gaji_minus : limit_toko) − SUM(grand_total Kredit+Final bulan berjalan, per nik_kar, semua cabang)`. "Mengurangi limit" = menyisipkan baris `db_sales` Kredit+Final. 175 anggota belanja kredit di >1 cabang bulan ini | `custom_helper.php:209`, staging |
| R4 | Kredit boleh jika `sisa − grand_total ≥ 0` (JS blok hanya bila `< 0`, jadi pas nol lolos) | `views/pos.php:2061, 2533` |
| R5 | Anggota harus `AKTIVE`. KONTRAK: boleh bila `hari ini < tgl_keluar`; jika tidak, auto-`PENSIUN` (mutasi di jalur baca) | `Pos.php:421-464`, `views/pos.php:1168` |
| R6 | UMUM = `customer_id 0`, `nik_kar 0`, dipaksa Cash **hanya di UI**. Data: 1.232 penjualan Kredit Final dengan `nik_kar` kosong/`0` → server tidak memblokir | staging |
| R7 | Metode bayar hanya **Cash** dan **Kredit**. Cash: `paid_amount=bayar`, `kembalian=bayar−total`. Kredit: `paid_amount=grand_total`, tanpa kembalian | `Pos_model.php:67-71` |
| R8 | Harga jual = `db_items.sales_price` disalin ke keranjang; diskon = `db_items.discount` (nominal per unit, hanya 35 item aktif); **diskon header tidak pernah dipakai** (0 dari 56.318 penjualan 2026); pajak **tidak** masuk total | `Pos.php:729`, staging |
| R9 | `type_order` selalu 0 (56.718 baris 2026); select Offline/Mobile di UI `disabled` | staging |
| R10 | Sesi kasir: satu sesi terbuka per user+company per hari; sesi hari lalu wajib ditutup sebelum jual; nomor kasir dari `db_kasir` (5 baris) | `Pos.php:74`, `custom_helper.php:282` |
| R11 | Item `PPOB` tidak mengurangi stok; `custom_barcode='SALDOPPOB'` bukan produk jual. 865 dari ~100 rb baris terbaru | `Pos_model.php:160`, staging |
| R12 | Produk dalam stock opname (`status_so=1`) tidak boleh dijual (saat ini 0 item) | `views/pos.php:1373` |
| R13 | Kode invoice: `sales_init(company) + yymmdd + counter bulanan 5 digit` (contoh format 15 karakter) | `Pos.php:968-977` |
| R14 | Otorisasi: `sales_add` (buka POS), `sales_edit`, `sales_delete`, `sales_return_add`; Admin (`inv_userid==1`) melewati semua. Role 1-4 punya semuanya. Role >2 dibatasi ke `company_id` sesi | `MY_Controller.php:113-135`, `db_permissions` |

---

## 2. Matriks gap: POS lama vs POS Next.js (saat ini)

Legenda: ✅ sudah berfungsi · ❌ belum ada · ⚠️ berbeda perilaku · ❔ belum terverifikasi.
"Saat ini" = kode di `kkisi.web/src` per audit; seluruh halaman `/pos` memakai `fixtures.ts`.

| # | Kemampuan POS lama | POS Next.js sekarang | Status | Catatan |
|---|---|---|---|---|
| 1 | Cari produk (nama/kode/barcode) | Filter di memori atas fixture; repo Prisma `search/findByBarcode/findById` ada tapi **tidak dipanggil UI** | ⚠️ | Perilaku pencarian mirip (contains), sumber data belum staging |
| 2 | Scan barcode → tambah 1 | `scan()` cocokkan `code`/`barcode` fixture | ⚠️ | Legacy cocokkan `custom_barcode`/`custom_barcode_pack`; makna qty untuk barcode pack ❔ |
| 3 | Harga jual dari DB | `unitPriceRp` fixture | ❌ | Harus dari `db_items.sales_price` di server |
| 4 | Diskon per item (nominal) | "Promo: belum tersedia" | ❌ | Hanya 35 item aktif; total legacy `(harga−diskon)×qty` |
| 5 | Diskon header | Tidak ada | ❌ (tidak dibutuhkan?) | 0 pemakaian 2026 → usul di luar scope |
| 6 | Pajak | "Belum dihitung" | ✅ selaras | Legacy juga tidak menghitung pajak di total |
| 7 | Cek stok per baris | Cek di UI vs stok fixture | ⚠️ | Legacy hanya di browser; server harus jadi otoritas |
| 8 | Keranjang persisten (`db_cart`) | State React, hilang saat refresh | ⚠️ | Keputusan D9 |
| 9 | Ubah qty / hapus / hapus semua | Berfungsi (memori) | ✅ (UI) | |
| 10 | Blok item stock-opname (`status_so`) | Tidak ada | ❌ | Kolom belum ada di Prisma |
| 11 | Pilih anggota via NIK/ID card/QR | Cari di array fixture | ⚠️ | QR legacy = `decrypt_url` (helper dilaporkan bermasalah, ❔) |
| 12 | Validasi status anggota AKTIVE/KONTRAK | Hanya label status | ❌ | R5 |
| 13 | Limit + sisa limit lintas cabang | "Limit belum terhubung" | ❌ | R3, R4 |
| 14 | Bayar Cash: input bayar & kembalian | **Tidak ada input bayar/kembalian** | ❌ | R7 |
| 15 | Bayar Kredit | Tombol aktif, tanpa logika | ❌ | |
| 16 | QRIS / Debit-Credit / Wallet / Payroll / Kombinasi | Tombol disabled | ⚠️ | **Tidak ada di legacy** → menyesatkan; sembunyikan atau tandai fase mendatang |
| 17 | Simpan transaksi (Final) | Tombol disabled | ❌ | |
| 18 | Struk cetak | Tidak ada | ❌ | Perlu template (D13) |
| 19 | Buka/tutup kasir + saldo awal + rekap | "Sesi kasir belum terhubung" | ❌ | R10 |
| 20 | Hold invoice | Tidak ada | ❌ (kemungkinan vestigial) | 0 baris `db_hold` |
| 21 | Batal/hapus transaksi | Tidak ada (hanya kosongkan keranjang) | ❌ | Legacy = hard delete |
| 22 | Retur penjualan | Tidak ada | ❌ | 0 baris data → prioritas rendah |
| 23 | Edit invoice (`pos_update`, `sales_edit`) | Tidak ada | ❌ | Perlu keputusan scope |
| 24 | Login, RBAC, scoping `company_id` | Tidak ada; `companyId` dipercaya dari parameter | ❌ | Prasyarat semua write (D1) |
| 25 | PPOB (item PPOB, `Pos_ppob`) | Tidak ada | ❌ | Di luar scope tahap 1 (D11) |
| 26 | Filter kategori | Ada | ✅ (baru) | Tidak ada di POS lama |
| 27 | Hotkey F1/F2/F4 | Tidak ada | ❌ | Nice-to-have |
| 28 | Aksesibilitas, responsif, empty/loading/error state | Ada, diuji browser | ✅ | |

---

## 3. Temuan performa dan integritas

Prioritas: **P0** = harus selesai sebelum ada write di Next.js; **P1** = dikerjakan bersama fitur; **P2** = opsional/ukur dulu.
Semua "sesudah" di bawah adalah **target pengukuran**, bukan hasil implementasi.

### F-01 (P0) Penyimpanan tidak atomik
- **Bukti kode**: `pos_save` tanpa `trans_begin` (`Pos_model.php:39-213`); 12+ statement autocommit. `delete_sales` dan retur memang memakai transaksi, POS tidak.
- **Bukti data (staging)**: penjualan Final **tanpa baris pembayaran**: Apr=2, Mei=5, Jun=6, Jul=45, Agu=68, Sep=89 (naik terus). Penjualan Final tanpa item: 5. Bulan ini 34 penjualan dengan `subtotal ≠ SUM(total_cost)`. Sejak 2026-01: 28 penjualan punya baris item ganda (konsisten dengan submit ganda; **tidak terbukti** sebagai penyebab tunggal).
- **Dampak**: kas dan laporan tidak cocok; stok/limit bisa terpotong tanpa pembayaran tercatat.
- **Rekomendasi**: satu transaksi DB (semua tulisan atau tidak sama sekali); pembayaran dan item ditulis di transaksi yang sama dengan perubahan status.
- **Ukur**: jumlah "Final tanpa pembayaran/item" untuk transaksi baru = 0 pada uji 1.000 checkout, termasuk yang digagalkan sengaja di tengah jalan (fault injection).

### F-02 (P0) Nomor invoice: race condition + full scan
- **Bukti kode**: `SELECT MAX(RIGHT(sales_code,5))… MONTH()/YEAR()` lalu `+1` (`Pos.php:968`), tanpa kunci; `idx_sales_code` **tidak unik**.
- **Bukti data**: 16 `sales_code` duplikat (ID berurutan, misal 220458/220459) → dua kasir/tab menghasilkan kode sama.
- **Bukti EXPLAIN**: `access=ALL`, 230.846 baris dibaca, **median 39,8 ms** (vs `sales_date` range: 1,95 ms; prefix `LIKE 'TBII2609%'`: 0,40 ms).
- **Rekomendasi**: alokasi nomor atomik di dalam transaksi checkout (baris penghitung per company+bulan dengan `SELECT … FOR UPDATE`, atau tabel sequence baru), ditambah pengecekan tabrakan terhadap `MAX` legacy selama dua aplikasi menulis (D2, D7). `UNIQUE(sales_code)` tidak bisa dipasang sebelum 16 duplikat dibereskan.
- **Ukur**: uji 50 checkout paralel per cabang → 0 duplikat; latensi alokasi < 5 ms.

### F-03 (P0/P1) Hitung ulang stok dari ledger di tiap penjualan (N+1 berat)
- **Bukti kode**: `update_items_quantity` per item: 5 `SELECT SUM` + `UPDATE` + `SELECT` + `SELECT products` (+ `UPDATE products`) ≈ 8-9 query (`Pos_model.php:1033-1115`), ditambah `UPDATE db_salesitems WHERE sales_id` yang identik diulang N kali (`:150-158`).
- **Jumlah query per checkout** (dihitung dari kode): `≈ 9 + 11,5 × N`. Rata-rata 2,97 baris/transaksi → **~43 query**; transaksi terbesar (80 baris) → **~930 query**.
- **Bukti EXPLAIN**: jumlah penjualan item terlaris (6.676 baris) median **12,2 ms** per `SUM` penjualan saja (`idx_salesitems_item`, PK-lookup ke `db_sales`). Menghapus `year(sales_date)` **tidak** mempercepat (12,16 ms sama) → jangan diklaim sebagai perbaikan.
- **Bahaya konkurensi**: dua checkout item sama menghitung ulang bersamaan; hasil bergantung urutan commit. Tidak ada `stock >= qty` di mana pun.
- **Rekomendasi**: `UPDATE db_items SET stock = stock - :qty WHERE id=:id AND company_id=:co AND stock >= :qty` (cek `affectedRows = 1`) di transaksi yang sama, item diurutkan naik untuk mencegah deadlock. Baris `db_salesitems` (Final, `sales_date ≥ 2025`) tetap ditulis agar rumus ledger PHP tetap menghasilkan angka yang sama. Laporan rekonsiliasi `stock` vs ledger (22 item selisih saat ini) dijalankan berkala, bukan per transaksi.
- **Ukur**: query per checkout (target ≈ 10 + N: sesi, baca item batch, nomor, insert sale, insert item batch, payment, N decrement, begin/commit; dibandingkan ≈ 9 + 11,5N sekarang), waktu DB per checkout N=3 dan N=80, dan rekonsiliasi stok setelah 10.000 checkout acak = 0 selisih baru.

### F-04 (P1) Pencarian produk
- **Bukti kode**: `upper(col) LIKE upper('%x%')` pada 3 kolom, **tanpa LIMIT** (`Pos_model.php:26-27`); untuk term `a` di cabang 2 mengembalikan **7.525 baris** ke browser.
- **Bukti EXPLAIN** (median): legacy **12,24 ms** `access=ALL` 20.498 baris; query polos `LIKE` + `LIMIT 20` + `company_id,status` → **1,02 ms** `range idx_items_company_status`; barcode persis → **0,026 ms** `ref idx_items_barcode`. Kolasi `latin1_swedish_ci` sudah case-insensitive, jadi `upper()` tidak diperlukan.
- **Rekomendasi**: jalur scanner = cocok persis `custom_barcode` lalu `custom_barcode_pack` (sudah ada `findByBarcode`); jalur ketik = `LIKE %x%` + `LIMIT 20` + debounce + minimal 2 karakter; jangan ubah semantik "mengandung". **Verifikasi dulu** SQL yang benar-benar dihasilkan Prisma (`contains` + `OR`) dengan `EXPLAIN`.
- **Catatan**: `findByBarcode` sekarang dua `findFirst` berurutan; bila barcode dan barcode-pack sama-sama cocok, hasil tergantung urutan → harus deterministik.
- **Ukur**: p95 latensi pencarian < 5 ms di DB, ukuran respons ≤ 20 baris.
- **Tidak perlu** indeks baru; **tidak perlu** cache sebelum pengukuran di beban nyata (katalog satu cabang hanya 5-8 rb baris, proyeksi penuh 5,8 ms).

### F-05 (P1) Pencarian anggota
- **Bukti kode**: `nik_kar LIKE '%x%'` / `id_card LIKE '%x%'` tanpa LIMIT (`Pos_model.php:395,430`).
- **Bukti EXPLAIN**: `LIKE %x%` **10,84 ms** membaca 9.276 baris; persis `=` → **0,015 ms** (`idx_anggota_nik`).
- **Data**: 5.544 anggota `id_card` kosong; 8 nilai `id_card` ganda; 1.427 anggota `status_anggota='0,00'` (artefak import).
- **Rekomendasi**: input dari scanner/QR = cocok persis; ketik manual = prefix/`LIKE` dengan LIMIT dan minimal 3 karakter. Pencarian `id_card` yang menghasilkan >1 baris harus ditolak sebagai ambigu, bukan memilih baris pertama.
- **Ukur**: p95 < 2 ms untuk cocok persis.

### F-06 (P1) N+1 dan chatty per aksi kasir
- **Bukti kode**: tiap scan/ubah qty memanggil `detailitems` + `add_to_cart_new` (4 query) + `getData` → `getinvoice` (sales + `m_anggota` per baris + `tagihan_anggota`) + `getdetailinvoice_new` ≈ **9 query per aksi**, ditambah `SELECT * FROM db_hold` tanpa filter di setiap buka POS (`Pos.php:1045`).
- **Rekomendasi**: keranjang di klien; server hanya dipanggil untuk (a) lookup produk/harga (1 query), (b) lookup anggota+limit (2 query, dipanggil sekali saat memilih anggota), (c) checkout. Tidak ada `db_cart`/`Quotation` sehingga tidak ada lagi 1.345 draft yatim (`Quotation` tertinggal, sejak 2023).
- **Ukur**: query DB per scan = 1 (sebelumnya ≈ 9); jumlah baris `Quotation` baru = 0.

### F-07 (P1) `products` (sinkron VPS/mobile) tanpa indeks
- **Bukti**: `SELECT * FROM products WHERE code=? AND user_id=?` → `ALL` 18.009 baris, median **13,95 ms**, dipanggil **per item per penjualan** (`Pos_model.php:1099`). Tabel hanya punya PK.
- **Rekomendasi**: tentukan pemilik/konsumen tabel `products` (D3). Jika tetap harus disinkronkan, lakukan asinkron/batch setelah commit atau tambah indeks `(user_id, code)` (perubahan skema → butuh persetujuan). Jika tidak dipakai, keluarkan dari jalur POS.
- **Ukur**: waktu sinkron per checkout, dan bukti konsumen `products` masih membaca kolom `current_stock`.

### F-08 (P1) Alur baca yang bermutasi & sesi tidak deterministik
- `detailanggota` (dipakai saat memilih anggota) **menulis** `m_anggota` dan `users` mobile (`Pos.php:439-464`). Di staging 5 anggota KONTRAK sudah lewat `tgl_keluar` tapi masih `AKTIVE`, jadi mutasi ini bergantung pada siapa yang kebetulan memilih mereka.
- `SELECT * FROM db_buka_kasir WHERE user_id=?` tanpa `status`/`ORDER BY` (`Pos.php:64, 947`) mengambil baris pertama (sesi terlama). 1 user punya >1 sesi terbuka; 2 sesi terbuka basi (16-17 Sep) di cabang 1.
- **Rekomendasi**: jalur baca murni (menolak, tidak menulis); perubahan status anggota lewat proses eksplisit di luar POS (D5). Sesi = `user_id + company_id + status=1` terbaru.
- **Ukur**: uji: user dengan 2 sesi → memilih sesi hari ini; anggota kontrak kedaluwarsa → ditolak tanpa write.

### F-09 (P2) `tagihan_anggota` memakai `year()/month()/day()`
- Non-sargable, tetapi **median 0,403 ms vs 0,396 ms** (sargable) untuk anggota kredit paling aktif (243 baris via `idx_sales_nik`). **Tidak ada keuntungan terukur** → tulis ulang sebagai rentang tanggal hanya demi kebersihan, tanpa klaim performa. Aturan bisnis (bulan kalender berjalan, lintas cabang) tidak boleh berubah.

### F-10 (P2) Detail kecil
- `gethostbyaddr()` (reverse DNS) per pembuatan invoice dan per pembayaran (`Pos.php:1005`, `Pos_model.php:198`): bisa menahan request hingga timeout DNS; tidak diukur. Di Next.js simpan IP saja.
- `SELECT * FROM db_hold` global tiap buka POS (`Pos.php:1045`): 6,3 ms saat dingin, tabel kosong. Hilang sendiri bila hold tidak dibawa.
- `db_cart` tidak punya indeks `sales_id` (akses `index` 294 baris); tidak relevan bila keranjang di klien.
- `db_sales.created_time` bertipe `timestamp ON UPDATE CURRENT_TIMESTAMP` → berubah tiap `UPDATE`. Jangan dipakai sebagai waktu transaksi tanpa menuliskannya eksplisit.

### F-11 (P0, keamanan/integritas) Nilai dipercaya dari klien
`grand_total`, `subtotal`, `bayar`, `kembalian`, `sales_date`, `customer_id`/`nik_kar` (tidak dicek konsisten) dan **`company_id` dari URL** dipakai apa adanya; `pos_save` tidak memanggil `permission_check`; CSRF nonaktif (`config.php:475`). Di Next.js: server menghitung ulang harga/diskon/total dari `db_items`, `company_id`/`user_id` hanya dari sesi terverifikasi.

### F-12 (info) Indeks
Tidak ada indeks baru yang direkomendasikan saat ini: semua query POS yang bermakna sudah memakai indeks yang ada (`idx_items_barcode`, `idx_anggota_nik`, `idx_sales_code`, `idx_sales_buka_kasir`, `idx_salesitems_item`, `idx_salesitems_sales`, dsb.). Kandidat yang **hanya** dipertimbangkan bila `EXPLAIN` di beban nyata menunjukkan perlu: `products(user_id, code)` (F-07), `db_sales` pada kombinasi `(nik_kar, payment_type, sales_status, sales_date)` (F-09, saat ini tidak perlu). Penggunaan indeks (unused index) **belum bisa dievaluasi** tanpa statistik beban nyata; jangan menghapus indeks berdasarkan asumsi. **Catatan produksi**: 28 indeks staging belum ada di produksi; penerapannya butuh persetujuan terpisah.

### Tabel benchmark ringkas (median 15×, staging, ms)

| Query | Sebelum | Alternatif | Catatan |
|---|---:|---:|---|
| Cari produk (cabang 1, "mie") | 12,24 | 1,02 | polos `LIKE` + `LIMIT 20` |
| Barcode persis | — | 0,026 | index |
| Cari anggota `LIKE %x%` | 10,84 | 0,015 | persis `=` |
| Nomor invoice berikut | 39,81 | 1,95 (range) / 0,40 (prefix) | tetap butuh atomicity (F-02) |
| `products` lookup | 13,95 | — | tanpa indeks |
| Penjualan item terlaris (SUM) | 12,16 | 12,16 | `year()` bukan masalah |
| Tagihan anggota | 0,403 | 0,396 | tidak signifikan |

---

## 4. Keputusan / pertanyaan yang harus dikonfirmasi sebelum coding

Setiap butir diberi **rekomendasi** agar bisa dijawab "setuju/tidak".

| ID | Pertanyaan | Rekomendasi |
|---|---|---|
| D1 | **Autentikasi & RBAC Next.js**: POS tulis butuh `user_id`, `company_id`, `role_id`, izin `sales_add`. Belum ada (IMP-003/004). Pakai `db_users` + bcrypt yang sama? | Buat minimal login + `sales_add` + scoping company dulu; endpoint tulis ditolak tanpa sesi valid. Tidak menerima `company_id` dari klien |
| D2 | **Siapa penulis di tiap cabang selama transisi?** Bila PHP dan Next menulis ke tabel yang sama (nomor invoice, hitung stok) → tabrakan. *Koreksi review 2026-09-30:* pembelian/opname/retur PHP tetap menulis `db_items.stock` (13 file legacy), jadi "satu penulis" hanya berlaku untuk **jalur jual POS**; hitung ulang stok PHP (`SUM` lalu `UPDATE` absolut) bisa menimpa decrement Next dalam jendela puluhan ms (lost update) | Cutover per cabang untuk jalur jual POS; pembelian/opname PHP jalan terus; risiko lost update ditutup laporan rekonsiliasi. 13 pasangan `sales_code` Final/Final ganda sejak 2026-07-01 membuktikan race PHP masih terjadi |
| D3 | **Semantik stok**: decrement atomik (rekomendasi) vs meniru hitung-ulang ledger. Apakah tabel `products` (18 rb baris) masih dibaca aplikasi mobile/VPS, dan siapa pemiliknya? *Koreksi review:* konsumennya (`Sales_mobile`) tampak dorman — `orders` barang hanya 2 baris (terakhir 2024-08), penjualan mobile di `db_sales` terakhir 2023-11; `current_stock` = `db_items.stock` pada 98,4% baris. Pemakaian oleh aplikasi mobile **perlu verifikasi dengan pemiliknya** (tidak bisa dari DB) | Decrement atomik + tulis ledger yang kompatibel + rekonsiliasi berkala. Next **tidak menulis** `products` di Tahap 4 |
| D4 | **Stok negatif**: saat ini 101 item aktif bernilai negatif dan 22 item selisih ledger (replay ledger 30 hari, baca-saja: 32 dari 21.130 baris = 0,15%, 23 item, akan ditolak; perkiraan kasar karena urutan dalam satu hari tidak pasti). Server harus menolak penjualan bila `stock < qty` (sesuai permintaan) — item yang stok catatannya salah akan tidak bisa dijual sampai dikoreksi | Setuju blokir. Siapkan alur koreksi (stock opname/penyesuaian) dan laporan item bermasalah sebelum cutover |
| D5 | **Limit** (terbukti: 32 anggota tepat di limit pada Sept → "pas nol lolos" dipakai nyata): konfirmasi (a) rumus R3 lintas cabang & bulan kalender; (b) lolos bila `sisa − total ≥ 0`; (c) status non-AKTIVE ditolak; (d) KONTRAK: `hari ini < tgl_keluar`; (e) auto-`PENSIUN` + nonaktifkan user mobile **tidak** dilakukan di jalur POS Next.js | Setuju semua; pindahkan (e) ke proses terpisah yang disetujui pemilik bisnis |
| D6 | **Kredit UMUM/`nik_kar` 0**: ditolak di server. *Koreksi review:* 1.232 adalah total sepanjang masa; di 2026 hanya **1** kejadian (Jan, Rp 6.500) | Tolak |
| D7 | **Penomoran invoice**: format tetap `init+yymmdd+5 digit (counter bulanan)`. Perlu tabel counter baru / indeks unik → perubahan skema (staging dulu; 16 duplikat harus dibereskan sebelum unik di produksi) | Tabel counter atomik di transaksi; pengecekan tabrakan terhadap `MAX` legacy selama transisi |
| D8 | **Izin perubahan skema** di staging (tabel counter, kunci idempotensi) dan kelak di produksi | Staging: ya. Produksi: proses terpisah |
| D9 | **Keranjang & hold**: keranjang klien (+ simpan di `localStorage` agar tahan refresh) tanpa `Quotation`/`db_cart`; hold tidak dibawa (0 baris, tampak vestigial). Ada kasir yang memakai hold di lapangan? | Keranjang klien; hold ditunda sampai ada bukti pemakaian |
| D10 | **Batal & retur**: retur 0 baris di data; batal lama = hard delete. Prioritas dan bentuk (soft-cancel butuh nilai status baru yang dibaca laporan lama) | Fase terakhir; soft-cancel hanya setelah pemilik laporan setuju nilai status |
| D11 | **Di luar scope tahap 1**: PPOB/`SALDOPPOB`, diskon header, `type_order`, pajak, edit invoice (`pos_update`). Filter katalog ke `type='Produk Jadi'` untuk sementara? | Ya, dikeluarkan dan didokumentasikan |
| D12 | **Metode bayar**: hanya Cash dan Kredit. Tombol QRIS/Card/Wallet/Payroll/Kombinasi di UI baru tidak punya padanan lama | Sembunyikan atau beri label "fase mendatang" (sekarang tampil "Belum tersedia") |
| D13 | **Struk**: pakai template `sal-invoice-pos` (thermal)? Lebar kertas (58/80 mm) dan cara cetak (`window.print` vs ESC/POS)? | Mulai dari `window.print` mengikuti field `sal-invoice-pos.php`; tanyakan lebar kertas |
| D14 | **Presisi uang**: `grand_total` double(18,2), `paid_amount` decimal(18,2), `db_salespayments.payment` **decimal(10,0)**; 2 harga jual non-bulat; grand_total 2026 semuanya bulat; Prisma memetakan `Float`. Batas `payment` ≈ 9,99 miliar | Hitung dengan `Decimal`/rupiah bulat, hindari `Float` untuk transaksi; ubah tipe Prisma untuk kolom tulis |
| D15 | **Zona waktu**: legacy PHP `Asia/Bangkok`; DB `SYSTEM`. `sales_date` bertipe `date`; `sales_date` legacy dikirim klien | Server yang menentukan tanggal (Asia/Bangkok), bukan klien |
| D16 | Prisma `kkisi_app` (tulis) akan dipakai hanya di jalur tulis; user `kkisi_read` untuk baca. Dua koneksi terpisah? | Ya |
| D17 | Uji harus dibuat ulang: 22 characterization test di `characterization-tests.md` memakai kolom/perilaku yang salah (tabel Bab 0) | Tulis ulang CT POS berdasarkan skema aktual sebelum Tahap 4 |

---

## 5. Rencana bertahap

Prinsip: setiap tahap bisa diuji sendiri; **tidak ada write ke DB sebelum Tahap 2 selesai (auth) dan D1-D8 dijawab**. Semua uji di staging; data uji ditandai (mis. `created_by='e2e-test'`) dan dibersihkan lewat reset (`scripts/setup-staging.sh --reset`).

### Tahap 0 — Fondasi uji & skema aktual
- **File**: `kkisi.web/prisma/schema.prisma` (tambah model tulis: `Sales`, `SalesItem`, `SalesPayment`, `BukaKasir`, `Kasir`, `StockEntry`, `User`, `Permission`; ubah harga/uang ke `Decimal`; tambah `statusSo`), `tests/prisma-item-repository.test.mjs` (perbaiki 1 tes gagal), `docs/migration/characterization-tests.md` (tulis ulang CT-POS).
- **Kerja**: `prisma validate`; pastikan `Decimal` konsisten dengan DDL; pisahkan `DATABASE_URL` (baca) dan `DATABASE_URL_WRITE`.
- **Penerimaan**: `npm test` 13/13 hijau; `prisma validate` lulus; tidak ada `db push/migrate` terhadap DB.
- **Uji**: `npm test`, `npm run typecheck`, `npm run lint`.

### Tahap 1 — Baca: produk & harga dari staging
- **File**: `src/app/api/pos/products/route.ts` (GET), `src/application/pos/use-cases/search-products.usecase.ts` (baru), `src/infrastructure/repositories/prisma-item.repository.ts` (LIMIT, urutan deterministik `findByBarcode`, kolom `stock`, `discount`, `type`, `statusSo`), `src/app/pos/page.tsx` + `PosScreen.tsx` (ganti fixture dengan data server; pertahankan status loading/error), `src/components/pos/preview.ts` (hapus logika harga otoritatif dari klien).
- **Kerja**: scanner → cocok persis; ketik → LIKE + LIMIT 20 + debounce; hasil hanya kolom yang dipakai UI.
- **Penerimaan**: harga/stok sama persis dengan `db_items` untuk 50 sampel per cabang; hanya `company_id` sesi; item non-`Produk Jadi` dan `SALDOPPOB` tidak muncul; `EXPLAIN` SQL Prisma memakai `idx_items_barcode` / `idx_items_company_status`.
- **Uji**: unit (use case), integrasi ke staging (30+ barcode acak, barcode ganda di cabang lain, barcode tidak ada), benchmark: p95 pencarian < 5 ms DB, barcode < 1 ms.

### Tahap 2 — Auth, RBAC, sesi kasir *(direvisi, dipecah 2A/2B/2C — lihat Bab 6)*
Rencana lama (satu tahap, login + buka + tutup kasir sekaligus) **diganti** oleh Bab 6: **2A** login/RBAC/baca sesi kasir (baca-saja), **2B** buka kasir (tulis, butuh izin tambahan), **2C** tutup kasir (ditunda). Belum disetujui, belum diimplementasi.

### Tahap 3 — Anggota & limit (baca)
- **File**: `src/application/member/use-cases/get-member-credit.usecase.ts`, `src/domain/member/credit-limit.ts` (fungsi murni), `src/app/api/pos/members/route.ts`, `TransactionPanel.tsx` (`MemberSearch` menampilkan limit & sisa).
- **Kerja**: cocok persis NIK/ID card/QR (QR: verifikasi mekanisme dulu, D-QR); tolak ambigu; hitung R3 dengan rentang tanggal; **tanpa mutasi** (D5e).
- **Penerimaan**: sisa limit identik dengan `detailanggota` untuk 100 anggota sampel (perbandingan langsung SQL vs PHP-formula); non-AKTIVE/kedaluwarsa ditolak tanpa write; `id_card` ganda → error ambigu.
- **Uji**: unit domain (gaji_minus override, batas bulan, kontrak), integrasi 100 sampel, `EXPLAIN` memakai `idx_anggota_nik`.

### Tahap 4 — Checkout Cash (atomik)
- **File**: `src/domain/pos/{sale,money}.ts`, `src/application/pos/use-cases/checkout.usecase.ts`, `src/infrastructure/repositories/prisma-sales.repository.ts` (satu `$transaction`), `src/infrastructure/repositories/invoice-sequence.repository.ts`, `src/app/api/pos/checkout/route.ts`, `TransactionPanel.tsx` (input bayar + kembalian, tombol proses aktif, kunci idempotensi per percobaan).
- **Kerja dalam satu transaksi**: (1) validasi sesi + izin; (2) baca ulang harga/diskon/`status=1`/`status_so`/tipe dari `db_items` (abaikan harga klien); (3) alokasi nomor (F-02); (4) `INSERT db_sales` (Final, semua kolom sesuai 1.2 poin 4 + `id_buka_kasir`), `INSERT db_salesitems` batch, `INSERT db_salespayments`; (5) decrement stok atomik terurut naik per `id` dengan `stock >= qty`; (6) hitung `subtotal_hpp`; commit. Kegagalan mana pun → rollback penuh; retry otomatis pada deadlock/lock-wait.
- **Idempotensi**: kunci dari klien disimpan bersama transaksi (D7/D8) atau, bila skema tidak boleh diubah, dipetakan ke draf; percobaan ulang dengan kunci sama mengembalikan hasil transaksi pertama.
- **Penerimaan**: baris `db_sales/db_salesitems/db_salespayments` sama bentuk dengan transaksi PHP Cash (dibandingkan kolom demi kolom pada 10 sampel historis); `stock` turun tepat `qty` sekali; total server = total dihitung ulang; kembalian benar; tidak ada ledger yang membuat rumus PHP menghitung angka berbeda (jalankan `update_items_quantity` PHP secara read-only/salinan untuk item yang sama dan cocokkan).
- **Uji**: normal; stok tidak cukup (tidak ada baris tertulis); harga dimanipulasi klien; bayar < total; sesi tertutup; `company_id` palsu; **fault injection** di tiap langkah (rollback bersih); kirim ganda 2× berurutan dan 20× paralel (satu transaksi); 50 checkout paralel item sama (stok akhir = awal − total, tidak negatif); 50 paralel per cabang (nomor unik).
- **Metrik**: query per checkout (≈ 43 → target ≈ 13 untuk N=3), waktu DB per checkout N=3 dan N=80, deadlock count = 0/1.000.

### Tahap 5 — Checkout Kredit anggota
- **File**: menambah `checkout.usecase.ts`, `prisma-sales.repository.ts` (kunci baris anggota), `TransactionPanel.tsx` (tampilan limit, blokir).
- **Kerja**: dalam transaksi Tahap 4: `SELECT … FROM m_anggota WHERE id=? FOR UPDATE` (serialisasi per anggota lintas kasir/cabang) → hitung tagihan bulan berjalan → tolak bila `tagihan + total > limit` → tulis `paid_amount = grand_total`, `payment_type='Kredit'`, `nik_kar`, `customer_id`. Tidak ada tulisan ke `m_anggota`.
- **Penerimaan**: identik dengan R3/R4; anggota non-AKTIVE/kedaluwarsa/UMUM ditolak; limit pas nol lolos; tidak pernah melampaui limit pada 20 checkout paralel dua cabang untuk anggota yang sama.
- **Uji**: limit cukup/tidak cukup/pas; gaji_minus; dua cabang bersamaan; kredit UMUM; bulan berganti (tanggal disimulasikan lewat `now` yang diinjeksi).
- **Metrik**: latensi checkout Kredit tambahan < 5 ms; lock-wait p95 < 50 ms pada 20 paralel.

### Tahap 6 — Struk
- **File**: `src/app/pos/receipt/[id]/page.tsx`, `src/application/pos/use-cases/get-receipt.usecase.ts` (1 query gabungan `db_sales`+`db_salesitems`+`db_items`/`db_units`+`db_company`+`m_anggota`), CSS cetak.
- **Penerimaan**: field sama dengan `sal-invoice-pos.php` (header toko, kode, tanggal, kasir, anggota/UMUM, item, total, bayar, kembalian/Kredit); hanya bisa dibuka untuk `company_id` pemilik; cetak berhasil di lebar kertas yang disetujui (D13).
- **Uji**: snapshot HTML untuk 5 transaksi (Cash, Kredit, UMUM, diskon item, banyak baris), uji akses lintas cabang.

### Tahap 7 — Batal / retur (opsional, setelah D10)
- **File**: `src/application/pos/use-cases/{void-sale,create-return}.usecase.ts` dan repository terkait.
- **Penerimaan**: mengikuti keputusan D10; stok dikembalikan tepat sekali; retur memblokir batal seperti legacy; semua dalam satu transaksi; laporan lama tetap benar.
- **Uji**: batal, batal ganda, retur parsial, retur > terjual (ditolak).

### Tahap 8 — Rekonsiliasi, pengukuran akhir, kesiapan cutover
- **Kerja**: laporan rekonsiliasi (stok vs ledger, penjualan tanpa pembayaran/item, nomor ganda); ulangi seluruh benchmark F-01…F-07 dan bandingkan dengan tabel Bab 3; latihan paralel di staging (kasir PHP dan Next bergantian) untuk memastikan nomor/stok tidak tabrakan (D2).
- **Penerimaan**: semua metrik target Bab 3 tercapai atau ada catatan alasan; nol anomali integritas pada 1.000 transaksi uji; persetujuan D1-D17.
- **Bukan bagian rencana ini**: cutover produksi, perubahan skema/indeks produksi.

### Urutan dan ketergantungan
`0 → 1` (selesai) `→ 2A` (DB legacy baca-saja; butuh D1, S2-1…S2-6 dan S2-10…S2-13; **belum disetujui**, menunggu topologi deployment) `→ 3` (baca; hanya butuh 2A) `→ 2B` (tulis; butuh S2-7…S2-9) `→ 4 → 5 → 6`; `2C`, `7`, `8` menyusul. Tahap 3 tidak menunggu 2B karena hanya membaca; Tahap 4 membutuhkan 2B dan D2–D8.

## 6. Revisi Tahap 2 — login, RBAC, sesi kasir *(revisi 2026-09-30, rev. 2 setelah 2A-0)*

**Status persetujuan (jawaban pemilik proyek, putaran 2):**
- **Disetujui:** D1 (login memakai hash bcrypt legacy; sesi = ID acak opak, persisten, dicabut saat logout); S2-1 (idle 2 jam, absolut 12 jam); S2-2 (throttle persisten per username; per-IP/pasangan hanya bila IP dari reverse proxy tepercaya yang menimpa header klien); S2-3 (katalog dapat dibaca setelah login meski sesi kasir belum terbuka); S2-4 + S2-12 (`bcryptjs` di *worker thread*; respons login gagal generik); S2-5 (tanpa bypass `user id 1`); S2-6 (role ≤2 boleh memilih cabang, ditolak bila ada sesi kasir terbuka di cabang lain; role >2 hanya cabangnya); S2-13 (password legacy tak-kompatibel → gagal generik; reset lewat prosedur admin terpisah; akun nyata tidak diuji).
- **S2-10:** topologi produksi **belum diketahui** → aplikasi dibatasi ke **staging lokal**; endpoint auth/POS tidak boleh dipublikasikan.
- **S2-11:** auth store = **skema MariaDB terpisah di staging**; tidak menulis ke tabel legacy. **DDL dan GRANT menunggu persetujuan eksplisit atas rancangan di Bab 6.12.**
- **Belum ada izin:** implementasi yang membutuhkan auth store, 2B, tulis ke tabel legacy, user uji di tabel legacy, deployment produksi.

Belum ada kode produk, skema staging, atau data yang diubah (Bab 6.12 dibuktikan pada container MariaDB sekali-pakai, bukan staging). Bab ini menggantikanBelum ada kode produk, skema, atau data yang diubah. Bab ini menggantikan "Tahap 2" lama di Bab 5.

### 6.0 Pembagian dan prinsip

| Bagian | Isi | DB | Prasyarat keputusan |
|---|---|---|---|
| **2A** | Login, logout, sesi **persisten yang dapat dicabut**, throttling, CSRF, RBAC, batas cabang, **membaca** sesi kasir | DB legacy: **baca-saja** (`kkisi_read`), tanpa tabel/kolom baru. Satu-satunya yang ditulis adalah **auth store terpisah** milik aplikasi Next (6.2.4-a) | D1, S2-1…S2-6, S2-10…S2-13 **disetujui/diputuskan** (staging lokal saja); **DDL/GRANT auth store menunggu persetujuan rancangan 6.12** |
| **2B** | **Membuka** sesi kasir (`INSERT db_buka_kasir`) | Tulis (staging saja) | 2A selesai + S2-7, S2-8, S2-9 (+ D8 bila tabel baru dipakai) |
| **2C** | Menutup sesi kasir (rekap Cash/Kredit) | Tulis | Ditunda; S2-14 (rumus tutup kasir) |

Prinsip: *fail closed* (kegagalan apa pun = akses ditolak); server yang berwenang atas identitas, izin, dan cabang (klien tidak pernah menentukannya); tidak ada rahasia/hash/password di respons, log, atau cookie; tes awal memakai **fake** (tanpa DB), dan **tidak ada user staging yang dibuat tanpa izin terpisah (S2-9)**; kredensial nyata anggota/kasir tidak pernah dipakai di tes.

### 6.1 Bukti baru yang membentuk desain (staging + kode lama)

| Temuan | Bukti | Dampak pada desain |
|---|---|---|
| 12 user, semua hash bcrypt `$2y$` (60 karakter), **cost 10** | `db_users.password` (hanya awalan/cost yang dibaca) | Butuh pustaka bcrypt (Node tidak punya bcrypt bawaan); verifikasi ~puluhan-ratusan ms → perlu pembatas konkurensi login |
| Legacy menjalankan `xss_clean(html_escape($password))` **sebelum** `password_verify` (`Login_model.php:33-34`); hash dibuat juga dari POST yang sudah di-`html_escape`/`xss_clean` (`Users_model.php:11,74`) | kode | Password yang mengandung `& < > " '` tersimpan sebagai hash dari bentuk ter-*escape*. Login Next **harus meniru transformasi ini** atau pengguna tertentu tidak bisa masuk. **Perlu verifikasi (2A-0)** |
| Jalur OTP `change_password` menyimpan `md5(...)` (`Login_model.php:147-165`) | kode | Hash md5 tak bisa diverifikasi `password_verify`; data sekarang 12/12 `$2y$`. Next **hanya menerima hash berawalan `$2`**, sisanya = gagal tertutup |
| `db_users.updated_time` NULL pada 12/12 baris, tanpa `ON UPDATE` | information_schema | Tidak bisa dipakai sebagai penanda "password berubah". Diganti *password fingerprint* di token (6.2.4), tanpa penyimpanan |
| Sesi PHP `files`, kedaluwarsa 7200 dtk, tanpa cocok-IP; CSRF **mati**; `buka_toko` menerima `company_id` dari POST tanpa validasi dan tanpa `permission_check` | `config.php`, `Pos.php:844` | Next tidak boleh mewarisi satupun; sesi PHP tak bisa dipakai bersama |
| Tidak ada duplikat `(role_id, permissions)`; username unik (tanpa memandang huruf besar/kecil); semua user punya company aktif dan role valid | staging | Cek izin cukup `EXISTS`; pencarian username memakai kolasi DB yang sama, tetapi kunci throttle wajib dinormalisasi (huruf kecil + trim) |
| Role 1 punya 107 dari 119 slug izin; user `id=1` melewati semua cek izin di legacy (`MY_Controller.php:113-121`) | `db_permissions`, kode | Bypass berdasar `id=1` **tidak** ditiru; `sales_add` dimiliki role 1–4 (S2-5) |
| Role 2 membuka register di cabang lain dari cabangnya: 59 dari 616 sesi; role 4: 1 dari 3.719; role 1: 0 dari 17 | join `db_buka_kasir`×`db_users` | Cabang role ≤2 memang dipilih; 1 kasus role 4 lintas cabang tidak bisa dibedakan antara pindah tugas dan manipulasi (legacy tidak memvalidasi) |
| Sesi kasir: 274 dari 598 sesi sejak 2026-07-01 **tumpang tindih** dengan user lain pada `id_kasir` yang sama (rata-rata 70 menit, maks 664); 107 hari-user punya >1 sesi; 594/594 sesi tertutup di hari yang sama; `saldo_awal` = 0 di semua sesi sejak Juli; 1 user dengan 2 sesi terbuka basi; 1 sesi milik user yang sudah tidak ada | staging | `id_kasir` dipakai **bersama** → jangan batasi "satu sesi terbuka per `id_kasir`" (S2-8); batasan cukup per user |

### 6.2 Desain keamanan 2A

#### 6.2.1 Port (agar bisa diuji dengan fake)
`UserRepository.findById/findByUsername` (kolom eksplisit: `id, username, password, role_id, company_id, status`), `PermissionRepository.has(roleId, slug)`, `CompanyRepository.findActive/listActive`, `RegisterRepository.findOpenForUser/listKasir`, `PasswordVerifier.verify(plain, hash)`, `Clock`, `Random`, `SessionStore`, `ThrottleStore`. Adapter Prisma, mesin bcrypt, dan auth store ada di `infrastructure/`; use case tidak mengimpor satupun. Adapter auth store nyata baru dibuat setelah topologi jelas (S2-10/S2-11); sebelum itu tes memakai fake.

#### 6.2.2 Alur login
1. Hanya `POST /api/auth/login`, `Content-Type: application/json`, isi ≤ 1 KB; wajib lolos pemeriksaan Origin (6.2.6, lapis 1–4).
2. Validasi bentuk: `username` 1–100 karakter, `password` 1–128 karakter (bcrypt hanya memakai 72 byte pertama — perilaku PHP sama); selain itu 400 generik.
3. Normalisasi kunci throttle: `trim().toLowerCase()`. Periksa throttle (6.2.3) **sebelum** menyentuh DB/bcrypt.
4. Ambil user aktif (`status=1`, join `db_roles`); jika tidak ada/nonaktif → tetap jalankan **satu** verifikasi terhadap hash dummy (cost 10) agar waktu respons tidak membocorkan keberadaan username.
5. Verifikasi password: kandidat 1 = password apa adanya; jika kandidat 1 gagal dan password mengandung `& < > " '`, kandidat 2 = `html_escape` ala CI (replikasi terbukti 100% pada 32.789 input, Bab 6.10). Hash berawalan `$2y$` dinormalkan sesuai mesin bcrypt yang dipilih (S2-12); awalan selain `$2` ditolak. Password yang masuk **kelas tak-terdukung** (Bab 6.10.2) tidak bisa diverifikasi dan diperlakukan sebagai gagal + dicatat. Semuanya dihitung **satu** percobaan throttle.
6. Gagal (username salah, password salah, user nonaktif, hash tidak didukung) → respons **identik**: `401 {"error":"INVALID_CREDENTIALS"}`. Terkunci → `429` + `Retry-After`, tanpa membedakan kunci mana yang terpicu.
7. Berhasil: cek company user aktif; buat `sid` baru (anti *session fixation*), set cookie (6.2.4), reset hanya penghitung `pair` (6.2.3). Respons berisi `{userId, role, companyId, csrfToken}`; tidak pernah hash.
8. Batasi konkurensi verifikasi bcrypt (maks 2 bila memakai `bcryptjs` di *worker thread*, maks 4 bila memakai mesin native; sisanya `503` + `Retry-After: 1`). Terukur di 2A-0: satu verifikasi cost 10 ≈ 115–120 ms; `bcryptjs` di thread utama membuat event loop macet hingga ±420 ms untuk 4 verifikasi bersamaan (Bab 6.10.1), sehingga wajib dijalankan di luar thread utama.

#### 6.2.3 Login throttling *(revisi: persisten dan sadar-topologi; final setelah topologi jelas)*
Penghitung disimpan di **auth store persisten** (skema MariaDB `kkisi_auth_staging`, Bab 6.12), bukan memori proses: tidak hilang saat restart. Kunci = HMAC(subkunci `throttle`, `kind|nilai`) sehingga isi store tidak membuka username/IP. **Jendela tetap** 15 menit sejak kegagalan pertama (bukan jendela geser): kegagalan ke-N dalam jendela mencapai ambang → kunci 15 menit; kegagalan setelah jendela lewat memulai jendela baru. Pencatatan = `INSERT IGNORE` lalu `UPDATE` bersyarat, dua pernyataan atomik (terbukti tepat pada 100 kegagalan paralel; **`INSERT … ON DUPLICATE KEY UPDATE` tidak dipakai** karena ditolak MariaDB bila hak `UPDATE` dibatasi per-kolom, Bab 6.12.4). Entri dibersihkan berbatas (6.12.3).

| Kunci | Batas | Akibat | Syarat |
|---|---|---|---|
| `user` (username-normal, semua sumber) | **10** gagal / jendela 15 menit | Kunci 15 menit sejak ambang tercapai | Selalu aktif. **Trade-off:** penyerang dapat mengunci kasir tertentu (S2-2) |
| `pair` (username-normal + IP) | 5 gagal / 15 menit | Kunci 15 menit | **Hanya bila IP klien tepercaya** (di bawah) |
| `ip` | 30 gagal / 15 menit | Kunci 15 menit | **Hanya bila IP klien tepercaya** |

**Fakta terukur di 2A-0 yang mengubah desain:** pada `next start` tanpa reverse proxy, route handler **tidak punya `request.ip`**; header `X-Forwarded-For` diisi dari socket bila kosong, tetapi **nilai yang dikirim klien dipertahankan apa adanya** (`X-Forwarded-For: 6.6.6.6` sampai ke handler tanpa diubah). Akibatnya:
- Jika server terekspos langsung → IP **tidak dapat dipercaya**; kunci `pair` dan `ip` **dinonaktifkan** (bila tidak, penyerang melewati batas hanya dengan mengganti header). Perlindungan tinggal kunci `user` (batas lebih ketat → risiko penguncian akun lebih tinggi).
- Jika di belakang reverse proxy/CDN yang **menimpa** `X-Forwarded-For`: baca IP dari `TRUSTED_PROXY_HOPS` hop terakhir (dihitung dari kanan) dan aktifkan ketiga kunci.
- Nilai `TRUSTED_PROXY_HOPS`, dan apakah proxy benar-benar menimpa header, **wajib diverifikasi di lingkungan deploy** (S2-10).

Lainnya: sukses menghapus kunci `user` dan `pair` milik username itu (kunci `ip` tidak direset); bila kunci `user` sedang terkunci, login benar pun ditolak (tanpa membedakan penyebab); `429` + `Retry-After` generik; log `[auth] login_failed reason=<bad_credentials|throttled|unsupported_password_class|unsupported_hash> u=<8 hex HMAC username>` tanpa password/hash/username mentah, dengan alarm bila kunci `user` terpicu.

#### 6.2.4 Sesi server-side yang dapat dicabut secara persisten *(memenuhi syarat D1; menggantikan cookie bertanda-tangan tanpa-status)*
**a. Auth store — diputuskan (S2-11): skema MariaDB terpisah** `kkisi_auth_staging` di server staging yang sama, akun sendiri `kkisi_auth`, klien Prisma kedua. Tidak ada tabel baru dan tidak ada penulisan ke `kkisi_staging` (legacy). Opsi lain (SQLite lokal, Redis, tabel di DB legacy) **tidak dipilih**. Skema, hak akses minimum, dan pembuktiannya ada di **Bab 6.12**; akses lewat port `SessionStore`/`ThrottleStore` sehingga tes awal tetap memakai fake.

**b. Bentuk sesi.** Cookie berisi **ID acak opak 256-bit** (bukan token bertanda-tangan). Store menyimpan `SHA-256(sid)` (kebocoran store tidak memberi sesi yang bisa dipakai): `sid_hash` (kunci utama), `user_id, company_id, pwf, created_at, last_seen_at, idle_expires_at, abs_expires_at, revoked_at, revoked_reason, purge_after` (definisi final di 6.12.2). `pwf` = 8 byte pertama `SHA-256(hash password saat login)` (tanpa secret, sehingga rotasi secret tidak menggugurkan sesi). Tidak menyimpan IP/User-Agent mentah.

**c. Siklus hidup.**
- **Login**: `sid` baru (anti *fixation*), baris dibuat; sesi lama user tetap berjalan (tidak ada batas jumlah sesi di 2A).
- **Tiap request**: satu pencarian `sid_hash` (kunci utama) → tolak bila tidak ada / `revoked_at` terisi / lewat `idle_expires_at` atau `abs_expires_at`; lalu validasi ulang user (`status=1`, role, `company_id` bila role >2, `pwf` cocok) langsung dari DB legacy. `last_seen`/`idle_expires_at` diperbarui paling sering tiap 300 dtk (mengikuti `sess_time_to_update` legacy) agar tulis ke store minimal.
- **Masa berlaku** (S2-1): idle 7.200 dtk, absolut 12 jam.
- **Logout**: `POST /api/auth/logout` (wajib CSRF) → `revoked_at = now` **persisten** + cookie dihapus; token yang dicuri ikut mati seketika, juga setelah restart.
- **Logout semua perangkat / cabut paksa**: `UPDATE … SET revoked_at WHERE user_id=?` (fungsi tersedia di use case; UI admin ditunda).
- **Store tidak tersedia** → login dan seluruh request terautentikasi **ditolak (503, gagal tertutup)**. Ini pertukaran sadar: ketersediaan POS bergantung pada store (SQLite lokal paling kecil risikonya).
- **Pembersihan**: baris kedaluwarsa/dicabut > 7 hari dihapus *lazy* saat login.

| Peristiwa | Mekanisme | Efek |
|---|---|---|
| Logout | `revoked_at` persisten | Ditolak seketika, tahan restart |
| User dinonaktifkan / role diubah / cabang (role >2) berubah | Validasi ulang per request | Efektif di request berikutnya |
| Password diganti (di PHP atau Next) | `pwf` tak cocok | Semua sesi lama gugur, tanpa aksi tambahan |
| Cabut paksa satu user | `revoked_at` massal | Seketika |
| Store hilang/dikosongkan | — | Semua user login ulang (aman) |
| Cookie dicuri | Idle/absolut habis, atau cabut/ logout | Terbatas oleh masa berlaku; pendeteksi anomali ditunda |

**d. Cookie.** Produksi `__Host-kkisi_sid` (`Secure`, `Path=/`, tanpa `Domain`), lokal `kkisi_sid`; `HttpOnly`; `SameSite=Lax`; cookie sesi. Semua respons auth `Cache-Control: no-store`.

#### 6.2.5 Rotasi secret *(disederhanakan oleh sesi opak)*
Sesi opak tidak lagi butuh secret untuk tanda tangan. Secret tinggal dipakai untuk: HMAC kunci throttle, dan token CSRF turunan (6.2.6).
- `AUTH_SECRETS="k2:<base64>,k1:<base64>"` (entri pertama = aktif; tiap kunci ≥ 32 byte acak dari `openssl rand -base64 48`; hanya di env, `.env.local` mode 600, gitignored, tidak `NEXT_PUBLIC_*`, tidak dilog). Subkunci per tujuan lewat HKDF-SHA256 (`kkisi/csrf/v1`, `kkisi/throttle/v1`).
- Startup **gagal tertutup**: env kosong, kunci < 32 byte, `kid` ganda/format salah → autentikasi tidak dilayani.
- **Rotasi terjadwal** (90 hari / pergantian staf): tambah `k2` di depan → deploy → token CSRF ber-`kid` `k1` tetap diterima sampai masa sesi absolut + 1 jam berlalu → hapus `k1`. Penghitung throttle ber-kunci lama kadaluarsa sendiri dalam 15 menit (efek: batas reset — dapat diterima).
- **Rotasi darurat** (secret bocor): hapus kunci itu; token CSRF lama gugur (klien mengambil ulang lewat `GET /api/auth/session`); karena sesi tak bergantung secret, **pencabutan sesi massal dilakukan terpisah** dengan `revoked_at` massal bila ada dugaan pencurian cookie.
- Uji: `kid` tak dikenal ditolak; token CSRF diubah 1 bit ditolak; rotasi `k1→k2→hapus k1`; rotasi tidak menggugurkan sesi.

#### 6.2.6 Perlindungan CSRF
Berlapis (semua harus lolos untuk metode selain GET/HEAD):
1. **Cookie `SameSite=Lax`**: cookie tidak ikut POST lintas-situs.
2. **Metode aman**: GET/HEAD/OPTIONS tidak boleh mengubah data (diuji otomatis: tidak ada handler GET yang menulis; `/api/auth/logout` dan semua perubahan = POST).
3. **Origin**: header `Origin` harus persis sama dengan `APP_ORIGIN` (env eksplisit, bukan dari `Host`); jika `Origin` tidak ada, `Referer` harus berasal dari origin itu; keduanya tidak ada → tolak.
4. **Content-Type** harus `application/json` (formulir HTML lintas-situs tak bisa mengirim ini tanpa preflight) dan tidak ada header CORS `Access-Control-Allow-*` sama sekali.
5. **Token**: header `X-CSRF-Token` = `kid.` + HMAC(subkunci `csrf`, `sid_hash`) — diturunkan, tanpa penyimpanan tambahan; diberikan lewat `POST /api/auth/login` dan `GET /api/auth/session`; dibandingkan waktu-konstan; berubah tiap login.
6. Login (belum punya `sid`) dilindungi lapis 1–4. Parameter pengalihan pasca-login hanya path relatif berawalan `/` dan bukan `//` (cegah *open redirect*).

#### 6.2.7 RBAC
- `requireSession()` dan `requirePermission(slug)` dipakai oleh setiap halaman dan route handler; **tolak-secara-bawaan**: tes memindai semua `src/app/api/**/route.ts` dan `page.tsx` non-publik dan gagal bila ada yang tidak memanggil guard (daftar putih: `auth/login`, `auth/session`).
- Proxy Next (`proxy.ts`, nama baru `middleware.ts` di Next 16 — **perlu verifikasi** nama berkas untuk versi terpasang) hanya lapis pertama (ada/tidaknya cookie → arahkan ke `/login`); **bukan** satu-satunya gerbang, karena cek izin butuh DB.
- Izin: `EXISTS (db_permissions WHERE role_id=? AND permissions=?)`. 2A memakai `sales_add` (halaman POS, katalog); `master_kasir` baru relevan di 2B/2C. Bypass `inv_userid==1` tidak ditiru (S2-5).
- Kegagalan DB saat cek izin → 503 tertutup, bukan "diizinkan".

#### 6.2.8 Batas akses cabang
Sumber tunggal: **`session.cid`**. Tidak pernah dari query/body/header klien (parameter `company_id`/`companyId` diabaikan — sudah diuji di Tahap 1 dan tetap diuji).

| Role | Cabang efektif | Ganti cabang |
|---|---|---|
| `role_id > 2` (Kepala Toko, Kasir) | `db_users.company_id` — tetap; wajib aktif di `db_company` | Tidak ada; upaya apa pun → 403 |
| `role_id ≤ 2` (Administrator, Admin Koperasi) | Bawaan = `db_users.company_id`; boleh memilih cabang aktif lain | `POST /api/auth/company {companyId}` (CSRF + `sales_add`), divalidasi ke `db_company.status=1`, token diterbitkan ulang; **ditolak selama ada sesi kasir terbuka di cabang lain** (2B, S2-6) |

Semua query POS memakai `session.cid`; catatan lain (sesi kasir, id `db_buka_kasir`) selalu difilter `user_id = session.uid AND company_id = session.cid` — tidak ada endpoint yang mengembalikan sesi milik user lain.

#### 6.2.9 Membaca sesi kasir (2A)
`GET /api/pos/register` → `{open: {id, noref, idKasir, noKasir, tglBuka, stale} | null, warnings: ["MULTIPLE_OPEN"?], kasir: [{id, noKasir}]}`:
- Sesi terbuka = `db_buka_kasir WHERE user_id=? AND company_id=? AND status=1 ORDER BY id DESC LIMIT 1` (memakai `idx_bukakasir_user_company`); >1 baris terbuka → ambil yang terbaru **dan** beri peringatan (jangan memperbaiki data).
- `stale` = tanggal `tgl_buka` (Asia/Bangkok) lebih awal dari hari ini → aturan legacy "tutup dulu"; 2A hanya **menampilkan** status ini.
- Daftar kasir = `db_kasir WHERE company_id=? AND status=1` (baris `company_id=0` diabaikan).
- Halaman POS menampilkan banner "Sesi kasir belum dibuka" bila `open=null`; katalog tetap bisa dilihat (S2-3); checkout (Tahap 4) wajib sesi terbuka yang tidak basi.
- Header POS menampilkan nama cabang dan kasir asli (menggantikan "Mart Utama / Kasir contoh"); `POS_COMPANY_ID` **dihapus** dan tes memastikan variabel itu tidak berpengaruh.

#### 6.2.10 Sengaja tidak masuk 2A
OTP/reset password, manajemen user/role, UI admin untuk cabut sesi (fungsi cabut ada, UI ditunda), penyimpanan sesi/throttle **di DB legacy**, audit log persisten, CSP/header keamanan lain, tutup kasir, apa pun yang menulis ke DB legacy.

### 6.3 Sub-tahap 2A: penerimaan dan tes keamanan

Semua tes 2A memakai **fake** (tanpa DB) kecuali 2A-7 yang membaca staging tanpa login. Tidak ada user staging yang dibuat.

| Sub-tahap | File (rencana) | Kriteria penerimaan | Tes keamanan |
|---|---|---|---|
| **2A-0 Verifikasi** — **SELESAI 2026-09-30, hasil di Bab 6.10** | — | (1) `bcryptjs` memverifikasi hash `$2y$` (uji: hash `$2b$` dibuat lokal lalu awalan diganti `$2y$`; catat waktu verifikasi cost 10); (2) perilaku `xss_clean(html_escape())` CI untuk himpunan karakter password (jalankan `system/core/Security.php` lewat kontainer `php:cli` bila Docker bisa menarik citra; jika tidak, tinjau kode dan tandai risiko); (3) nama berkas proxy/middleware Next terpasang; (4) tidak ada perubahan pada repo/DB | Hasil dicatat di dokumen; bila (1) atau (2) gagal → hentikan dan minta keputusan (S2-4) |
| **2A-1 Sesi server-side** | `src/domain/auth/session.ts`, `src/application/auth/ports.ts` (`SessionStore`), `src/infrastructure/auth/{keys,csrf,prisma-session-store}.ts`, `src/infrastructure/db/prisma-auth.ts` | Siklus hidup 6.2.4-c dan SQL 6.12.4; uji dengan **fake** dulu, lalu **kontrak yang sama** terhadap skema `kkisi_auth_staging`; `AUTH_SECRETS` divalidasi saat startup | Sesi dicabut (logout) → ditolak, **tetap ditolak setelah instance aplikasi dibuat ulang**; `revoked_at` menang atas masa berlaku; idle dan absolut habis; `pwf` berubah → ditolak; hanya `SHA-256(sid)` di store; kunci < 32 byte / `kid` ganda → startup gagal; token CSRF diubah 1 bit ditolak; rotasi `k1→k2→hapus k1` tidak menggugurkan sesi; store error → 503 tertutup; sesi ke-11 milik user mencabut yang tertua; `touch` maksimal sekali per 300 dtk; akun auth tidak bisa mengubah `user_id/pwf/abs_expires_at` |
| **2A-2 Throttle** | `src/infrastructure/auth/{throttle,prisma-throttle-store,client-ip}.ts` | Sesuai 6.2.3 dengan `FakeClock`, lalu terhadap skema auth; kunci `pair`/`ip` aktif hanya bila IP tepercaya (bawaan: mati) | Kunci `user` terpicu tepat di ambang; jendela tetap; huruf besar/kecil & spasi username tidak menghindari batas; **IP tak tepercaya** → header `X-Forwarded-For` dipalsukan tidak mengubah hasil; **IP tepercaya** → hop dihitung dari kanan; kunci di-HMAC (username tak muncul di store/log); 50 kegagalan paralel (koneksi ≤ 8) terhitung tepat; sukses menghapus kunci `user`+`pair`; error 1226/1213/1205 → retry terbatas lalu 503 |
| **2A-3 Login/logout** | `src/application/auth/{login,logout}.usecase.ts`, `src/app/api/auth/{login,logout,session}/route.ts`, `src/app/login/page.tsx` | Alur 6.2.2; respons gagal identik; `sid` baru tiap login; logout mencabut sesi secara persisten (terhadap fake store) | Enumerasi username: respons dan jumlah panggilan verifikator identik untuk username tak ada/nonaktif/password salah; hash `$2` saja diterima (md5 ditolak); password >128 ditolak; body >1 KB ditolak; 5× gagal → 429 tanpa memanggil DB/verifikator; konkurensi melebihi batas mesin (2/4) → 503; verifikasi berjalan di luar thread utama (event loop tidak macet > 50 ms pada 4 login bersamaan); kandidat `html_escape` dihitung 1 percobaan; **hash/password tidak muncul di respons, log, cookie**; token pra-login tak diterima setelah login (fixation); token lama ditolak setelah logout |
| **2A-4 Guard sesi + RBAC + cabang** | `src/infrastructure/auth/session.ts`, `guards.ts`, `src/proxy.ts`, `src/app/pos/page.tsx`, `src/app/api/pos/products/route.ts` (pakai `session.cid`) | Tanpa sesi → 401/redirect `/login`; tanpa `sales_add` → 403; katalog memakai `session.cid`; `POS_COMPANY_ID` dihapus | User dinonaktifkan di tengah sesi → 401 berikutnya; role diubah → izin baru; password diganti (`pwf`) → 401; role >2 dengan `?company_id=`/`?companyId=`/header palsu tetap melihat cabangnya (IDOR); role >2 memanggil `auth/company` → 403; role ≤2 memilih cabang nonaktif/tak ada → 400/403; kegagalan DB pada cek izin → 503 (bukan izinkan); pemindai tolak-bawaan gagal bila ada route tanpa guard; proxy dilewati (panggilan langsung) tetap ditolak handler |
| **2A-5 CSRF & cookie** | `src/infrastructure/auth/{csrf,origin}.ts`, dipakai wrapper route | Lapis 1–6 (6.2.6); atribut cookie sesuai 6.2.4 | POST tanpa `Origin`/`Referer` ditolak; `Origin` asing ditolak; `Origin` sama tapi tanpa token / token milik `sid` lain ditolak; `Content-Type: text/plain`/form ditolak; GET tak pernah menulis (pemindai); atribut `HttpOnly/Secure(prod)/SameSite=Lax/__Host-` diverifikasi; tak ada header CORS; parameter pengalihan `//evil`, `https://evil`, `/\evil` → `/pos`; semua respons auth `no-store` |
| **2A-6 Baca sesi kasir** | `src/infrastructure/repositories/prisma-register.repository.ts`, `src/application/pos/use-cases/read-register.usecase.ts`, `src/app/api/pos/register/route.ts`, `PosHeader`/banner | 6.2.9; hanya baca | Hanya sesi milik `session.uid` di `session.cid` (sesi user lain tak pernah muncul); >1 terbuka → yang terbaru + peringatan; `stale` benar di batas tengah malam Asia/Bangkok (`FakeClock`); kasir `company_id=0` tak muncul; tanpa sesi → `open:null`; tak ada query tulis (spy pada klien Prisma) |
| **2A-7 Integrasi staging, baca-saja, tanpa login** | `tests/auth-staging-readonly.test.mjs` (opt-in `AUTH_STAGING_DB_TEST=1`, menolak URL non-lokal/non-"staging") | Untuk setiap user: role valid, cabang aktif, himpunan izin dapat dihitung; keluaran hanya **agregat** (jumlah), tanpa username/hash/nama | Keluaran tes tidak mengandung username/hash (grep); tes gagal bila klien memiliki hak tulis di jalur ini; tidak ada `INSERT/UPDATE/DELETE` |

**Definisi selesai 2A**: semua tes fake hijau; 2A-0 lulus (sudah); keputusan S2-1…S2-6 dan S2-10…S2-13 tercatat (staging lokal); skema auth (6.12) disetujui dan dipasang; adapter MariaDB auth store lulus tes kontrak terhadap skema staging; `npm test`, lint, typecheck, `next build` hijau; pemindai tolak-bawaan hijau; tidak ada perubahan skema/data; tidak ada dependency baru selain mesin bcrypt yang disetujui (S2-12); `POS_COMPANY_ID` hilang dari kode dan `.env.example`; laporan verifikasi 2A-0 dan daftar risiko sisa (6.5) disampaikan.

### 6.4 Tahap 2B — buka kasir (tulis; hanya setelah 2A selesai dan izin diberikan)

**Prasyarat** (semua harus disetujui): S2-7 (izin tulis staging + akun/hak khusus), S2-8 (aturan sesi), S2-9 (data uji), dan D8 bila memilih tabel baru. 2B **tidak** dimulai sebelum 2A ditutup.

Desain:
- `POST /api/pos/register/open {idKasir, saldoAwal}` (CSRF + `sales_add`; `master_kasir` bukan syarat karena legacy `buka_toko` tidak memeriksanya — konfirmasi di S2-8).
- Klien tulis **terpisah** (`DATABASE_URL_WRITE`), hanya diimpor oleh repository register (aturan ESLint `no-restricted-imports` mencegah pemakaian lain). Rekomendasi hak: akun khusus dengan `INSERT, UPDATE` **hanya** pada `db_buka_kasir` di `kkisi_staging` (S2-7).
- Satu transaksi: kunci baris user (`SELECT … FROM db_users WHERE id=? FOR UPDATE`) sebagai mutex per user (tanpa skema baru) → periksa sesi terbuka user di cabang itu: **ada → kembalikan sesi itu (idempoten), bukan membuat baru**; sesi basi (tanggal lebih awal) → tolak dengan pesan "tutup sesi lama di aplikasi kasir yang aktif" (penutupan baru ada di 2C).
- Validasi server: `idKasir ∈ db_kasir(company_id = session.cid, status=1)`; `saldoAwal` bilangan bulat rupiah 0…999.999.999 (legacy memakai `FILTER_SANITIZE_NUMBER_INT` yang memperbolehkan tanda minus; data nyata selalu 0); `company_id` tidak dari klien.
- `INSERT db_buka_kasir` (`id_kasir, saldo_awal, tgl_buka` = jam server Asia/Bangkok, `user_id`, `company_id`, `status=1`), lalu `noref = 'KRS-' + yyyymmdd + id 4 digit` **dari id hasil insert** (legacy memakai `MAX(id)+1` yang rentan tabrakan) dalam transaksi yang sama.
- **Tidak** membatasi satu sesi terbuka per `id_kasir` (46% sesi tumpang tindih di data; S2-8).

| Kriteria penerimaan | Tes keamanan |
|---|---|
| Buka sesi valid membuat tepat 1 baris dengan `noref` konsisten; panggilan ulang mengembalikan sesi yang sama | 20 permintaan paralel dari user sama → tepat 1 baris (tidak ada `noref` ganda); `idKasir` milik cabang lain → 400/403 (IDOR); `company_id`/`companyId` di body diabaikan; `saldoAwal` negatif/non-numerik/>batas → 400; sesi basi → ditolak tanpa menulis; user tanpa `sales_add` → 403; CSRF (tanpa Origin/token) → ditolak; kegagalan di langkah `noref` → rollback, tidak ada baris; akun tulis tidak bisa `UPDATE` tabel lain (uji hak); tidak ada baris ber-`user_id` lain; data uji ditandai dan dibersihkan dengan reset staging |

### 6.5 Tahap 2C — tutup kasir (ditunda; S2-14)
Legacy punya **dua** implementasi yang berbeda: `Pos::tutup_kasir` (`tgl_tutup` = sekarang; rekap Cash = `paid_amount − kembalian`), `Kasir::ajax_tutup_kasir` (`tgl_tutup = tgl_buka`), dan `Pos_model::pos_update` (memakai `round_off+paid_amount`). Rumus, cara memperlakukan `Quotation` sisa, dan siapa yang boleh menutup sesi orang lain harus diputuskan dulu. Penerimaan nanti: rekap sama dengan sesi historis (dibandingkan baca-saja pada 20 sesi) dan tes keamanan serupa 2B.

### 6.6 Risiko sisa 2A (diterima bila disetujui)
1. **Ketergantungan pada auth store**: bila MariaDB (skema auth) tidak tersedia, POS tidak bisa login/dipakai (gagal tertutup). Sekarang server MariaDB-nya sama dengan DB legacy staging, jadi kegagalannya berkorelasi (bila keduanya mati, akses toh ditolak).
2. Penyerang bisa mengunci username tertentu 15 menit (kunci `user`, 10 gagal); lebih rawan bila IP tidak tepercaya (kunci `pair`/`ip` nonaktif).
3. Password kelas tak-terdukung (`%` + 2 digit heksa, karakter kontrol, token *naughty* seperti `javascript:`/`eval(`) tidak bisa login di Next sampai diganti (Bab 6.10.2).
4. Tidak ada audit log persisten dan tidak ada UI admin untuk cabut sesi (fungsinya ada, UI ditunda).
5. Akun `root@%` ada di container staging (pra-ada, hanya terjangkau lewat port yang dipublikasikan ke `127.0.0.1`); jangan diulang di produksi.
6. Topologi deployment (HTTPS, proxy, domain, jumlah instance) belum diketahui → `Secure`/`__Host-`, `APP_ORIGIN`, `TRUSTED_PROXY_HOPS`, pilihan store hanya teruji secara lokal.

### 6.7 Keputusan tambahan (S2-x) — status per putaran 2

| ID | Keputusan | Status |
|---|---|---|
| S2-1 | Idle 2 jam; absolut 12 jam | **Disetujui** |
| S2-2 | Throttle persisten per username; IP/pair hanya bila IP dari reverse proxy tepercaya | **Disetujui** (parameter: user 10 / pair 5 / ip 30; jendela tetap 15 menit — detail di 6.2.3 dan 6.12) |
| S2-3 | Katalog boleh dibaca setelah login tanpa sesi kasir terbuka | **Disetujui** |
| S2-4 | Meniru `html_escape` password; kelas tak-terdukung = gagal | **Disetujui** (dengan S2-13) |
| S2-5 | Tanpa bypass `user id 1` | **Disetujui** |
| S2-6 | Role ≤2 memilih cabang; ditolak bila ada sesi kasir terbuka di cabang lain; role >2 hanya cabangnya | **Disetujui** |
| S2-7 | (2B) Izin tulis staging + hak akun | **Ditolak untuk saat ini** |
| S2-8 | (2B) Aturan buka sesi | Ditunda (2B) |
| S2-9 | User uji di staging/legacy | **Ditolak**; tes memakai fake dan hash sintetis |
| S2-10 | Topologi deployment | **Belum diketahui** → hanya staging lokal; endpoint auth/POS tidak dipublikasikan (dipaksa: bind `127.0.0.1` + `APP_ORIGIN` wajib loopback) |
| S2-11 | Auth store | **Skema MariaDB terpisah di staging**; DDL/GRANT **menunggu persetujuan eksplisit** rancangan 6.12 |
| S2-12 | Mesin bcrypt | **`bcryptjs` di worker thread** |
| S2-13 | Password kelas tak-terdukung | **Gagal generik**; reset lewat prosedur admin terpisah; tanpa uji akun nyata |
| S2-14 | (2C) Rumus tutup kasir | Ditunda |

### 6.8 Kebijakan pengujian
1. Urutan: fake (unit) → adapter dengan klien Prisma palsu → staging baca-saja agregat (2A-7) → (setelah izin S2-9) e2e login → (2B) tulis staging.
2. Tidak ada mode uji/*backdoor* di kode produksi (mis. flag yang melewati login); fake hanya lewat injeksi dependensi di tes.
3. Tes tidak mencetak username, hash, password, NIK, atau nama; keluaran agregat.
4. `bcryptjs` diuji dengan hash sintetis yang dibuat di tes — bukan hash user staging.
5. Semua tes baca-saja menegaskan tidak ada `INSERT/UPDATE/DELETE` dan tidak ada koneksi selain `127.0.0.1`/`localhost` ber-nama DB mengandung `staging`.

### 6.9 Persetujuan yang diminta
Lihat **Bab 6.12.10** (daftar jawaban untuk DDL/GRANT dan implementasi 2A).

### 6.10 Hasil 2A-0 (dijalankan 2026-09-30; tanpa mengubah repo, dependency proyek, atau DB)

Semua skrip dan artefak ada di direktori scratch sesi (di luar repo). Verifikasi bahwa proyek tidak berubah: `git status` identik dengan sebelum 2A-0; `package.json` dan `package-lock.json` (md5) identik; tidak ada paket `bcrypt*` di `node_modules` proyek; tidak ada query ke DB.

#### 6.10.1 Kompatibilitas hash dan performa bcrypt
| Uji | Hasil |
|---|---|
| Vektor `$2y$` dari **PHP manual** (hash buatan PHP asli, cost 07): password benar/salah | `bcryptjs` 3.0.3 **lulus** (benar → true, salah → false) |
| Hash sintetis cost 10 (sama dengan 12 hash staging) diberi awalan `$2y$` | Lulus benar/salah |
| Pemotongan 72 byte (sama seperti PHP): input 72 dan 100 byte | Lulus (cocok) |
| Nilai bergaya md5 sebagai "hash" | Ditolak (`false`), tanpa *throw* |
| Password UTF-8 | Lulus |
| **Performa** `bcryptjs` cost 10, thread utama | median verifikasi **118–120 ms**; 4 bersamaan selesai 441–514 ms; **event loop macet hingga 416–419 ms** |
| `bcryptjs` di 1 *worker thread* | median 117 ms; 4 bersamaan 532 ms; **macet event loop ≤ 8 ms** |
| `@node-rs/bcrypt` 1.10.9 (Rust, prebuilt) | menerima `$2y$` apa adanya (lulus vektor PHP); median 113 ms; 4 bersamaan **148 ms**; macet ≤ 10 ms |
| `bcrypt` 6.0.0 (native) | **menolak `$2y$` apa adanya** (vektor PHP → `false`, 0 ms); benar jika `$2y$` diganti `$2b$`; tidak memblokir event loop |

**Kesimpulan:** hash lama dapat dipakai. `bcryptjs` di thread utama **tidak boleh** dipakai (memblokir server ±0,4 dtk per 4 login); pilih worker (S2-12). Jangan memakai `bcrypt` native tanpa normalisasi awalan.

#### 6.10.2 Transformasi password legacy (`xss_clean(html_escape())`)
Metode: CodeIgniter 3.1.11 **asli** (`system/core/Common.php` + `Security.php` legacy, dimount hanya-baca) di PHP 7.4.33, `charset=UTF-8`, atas korpus sintetis 32.789 string (kasus tepi + 30.000 string acak ASCII cetak 6–16 karakter + varian dengan karakter khusus). Tidak ada password nyata.

| Temuan | Angka |
|---|---|
| `html_escape` di JS (`& < > " '` → `&amp; &lt; &gt; &quot; &#039;`) = CI | **32.789 / 32.789 identik** |
| `xss_clean(html_escape(x))` = `html_escape(x)` | 32.591 / 32.789 (**99,40%**) — jadi untuk `& < > " '` cukup `html_escape` (entitas tidak disentuh `xss_clean`) |
| Berbeda | 198 input, **semuanya** dalam 3 kelas: (a) `%` + 2 digit heksa (didecode; 186 input berisi `%`, 4,9% dari input berisi `%`); (b) karakter kontrol/tab (tab→spasi, kontrol dihapus); (c) token *naughty* (`javascript:`, `vbscript:`, `document.cookie`, `window.location`, `expression(` → `[removed]`; `eval(`/`alert(` → tanda kurung jadi entitas) |
| Tak terjelaskan | 0 |
| Tiruan sederhana kelas (a) (decode `%hh` di JS) | hanya **26,1%** cocok: CI memproses byte mentah (hasil decode bisa bukan UTF-8 valid; kontrol hasil decode dihapus; `%3Cscript%3E` → `[removed]`) — **tidak bisa ditiru sederhana** |
| Set kandidat {raw, `html_escape`} | mereproduksi CI untuk 99,40% korpus; {+ decode sederhana} hanya 99,56% |
| Share input acak seragam yang terpengaruh xss_clean | 0,56% (182 dari 32.700) |

**Dampak:** password yang hanya berisi huruf/angka/simbol umum, atau `& < > " '`, akan bisa login di Next dengan kandidat {raw, `html_escape`}. Password yang mengandung `%` diikuti dua digit heksa, karakter kontrol, atau kata seperti `javascript:`/`eval(`/`document.cookie` **tidak bisa diverifikasi** sampai diganti (S2-13). Seberapa banyak dari 10 user aktif yang terdampak **tidak dapat diketahui** tanpa password mereka — dan tidak boleh dicoba. Catatan masa depan: bila Next kelak menyetel password, hash harus dibuat dari bentuk **hasil transformasi legacy** agar user tetap bisa login di PHP.

#### 6.10.3 Versi Next dan konvensi proxy
- Terpasang **Next 16.3.7 / React 19.3.0**. Dokumentasi bawaan (`node_modules/next/dist/docs`): `middleware` **deprecated → `proxy`**; berkas `proxy.ts` di root atau di `src/` sejajar `app/`; **runtime Node.js secara bawaan** (opsi `runtime` tidak tersedia di proxy).
- Build scratch (webpack) dengan `src/proxy.ts` yang memakai `node:crypto` **berhasil** dan melaporkan `ƒ Proxy (Middleware)`. (Turbopack menolak scratch karena symlink `node_modules` di luar root — bukan masalah proyek.)
- Dokumen Next secara eksplisit: proxy bukan untuk pengambilan data lambat dan **jangan mengandalkan proxy saja** untuk autentikasi/otorisasi → sesuai 6.2.7 (guard di setiap handler; proxy hanya cek awal keberadaan cookie).

#### 6.10.4 Temuan tambahan yang memengaruhi desain
- **IP klien**: `request.ip` tidak ada; `X-Forwarded-For` klien dipertahankan (lihat 6.2.3) → IP tepercaya hanya di belakang proxy yang menimpa header.
- **`node:sqlite`** tersedia di Node 22.23.0 (peringatan *experimental*): dasar opsi A auth store.
- Docker berfungsi di mesin ini (citra `php:7.4-cli-alpine` ditarik untuk uji 6.10.2; DB `kkisi-staging` tidak disentuh).

### 6.11 Pertanyaan topologi (tidak lagi memblokir 2A di staging lokal; **memblokir produksi**)
1. **Di mana Next berjalan di produksi?** VPS/kontainer (satu atau banyak instance), layanan serverless (Vercel/sejenis), atau hosting bersama cPanel (Node/Passenger)? Versi Node-nya?
2. **Akses**: internet publik atau jaringan internal/VPN? Ada **reverse proxy/CDN** (nginx, Cloudflare)? Apakah ia **menimpa** `X-Forwarded-For` dan berapa hop-nya?
3. **Domain/HTTPS**: domain atau subdomain apa (sama induk dengan `tokonew.kkisitb2.id`)? HTTPS dijamin? (menentukan `__Host-`/`Secure` dan `APP_ORIGIN`)
4. **Penyimpanan untuk sesi**: ada disk persisten lokal (opsi A)? Boleh membuat skema/DB terpisah di MariaDB yang sama (opsi B)? Ada Redis (opsi C)? Siapa yang mengelolanya?
5. **Skala**: perkiraan kasir bersamaan (data staging: hingga 3 user bersamaan di cabang 1) dan apakah satu instance cukup?
6. **Restart/deploy**: seberapa sering proses di-restart (menentukan seberapa penting persistensi sesi dan throttle)?
7. **DB legacy dari Next**: koneksi Next→MariaDB produksi kelak lewat jaringan mana (menentukan TLS dan akun baca)?

### 6.12 Rancangan auth store, hak akses, dan rencana implementasi 2A *(menunggu persetujuan DB; tidak ada DDL/GRANT yang dijalankan di staging)*

**Bukti:** rancangan ini dijalankan pada **container MariaDB 11.4 sekali-pakai** (`127.0.0.1:3399`, tanpa volume, password acak yang tidak dicetak) dengan skema tiruan `legacy_stub` dan akun `stub_read` sebagai pengganti `kkisi_read`. Container dihapus setelah uji. `kkisi-staging` tidak disentuh (diperiksa sesudahnya: database yang ada tetap `kkisi_staging`, 0 akun `kkisi_auth*`, 328 objek di `kkisi_staging`).

#### 6.12.1 Verifikasi isi rencana terhadap kode dan skema staging saat ini
| # | Temuan | Dampak pada rencana |
|---|---|---|
| 1 | `next dev`/`next start` **bind `0.0.0.0` secara bawaan** (`--help`); skrip `package.json` tidak mengaturnya | S2-10: skrip `dev`/`start` diubah `-H 127.0.0.1`, dan konfigurasi auth **menolak start** bila `APP_ORIGIN` bukan `127.0.0.1`/`localhost` |
| 2 | `db_roles`: role 3 (Kepala Toko) `status=0`; login legacy **tidak** memeriksa status role (hanya `db_users.status=1` dan join ke role) | Ditiru (tidak memeriksa `db_roles.status`); satu-satunya user role 3 nonaktif. Butuh konfirmasi (6.12.10 #4) |
| 3 | `db_permissions`: hanya PK, 397 baris, tanpa duplikat `(role_id, permissions)` | Satu `EXISTS` per request cukup; tidak ada indeks baru |
| 4 | Prisma belum punya model `db_users`, `db_roles`, `db_permissions`, `db_buka_kasir`, `db_kasir`; `db_company` sudah ada (kolom `status` ada) | Tambah model baca dengan kolom seperlunya (`password` = `text`); id `int(11)` bertanda |
| 5 | Rencana lama (6.2.3) menyebut jendela geser dan sukses mereset hanya `pair` | Diganti: jendela tetap; sukses menghapus `user`+`pair` (6.2.3 sudah diperbarui) |
| 6 | Rencana lama menawarkan SQLite sebagai opsi A | Diputuskan MariaDB terpisah (S2-11) |
| 7 | **`INSERT … ON DUPLICATE KEY UPDATE` gagal (error 1143 pada kolom `key_hash`)** bila akun hanya punya `UPDATE` per-kolom; berhasil hanya bila kolom kunci ikut diberi `UPDATE` | Throttle memakai `INSERT IGNORE` + `UPDATE` bersyarat (dua pernyataan atomik, terbukti); hak `UPDATE` per-kolom dipertahankan |
| 8 | Server default `utf8mb3`/`utf8mb3_general_ci`; `time_zone=SYSTEM`; `sql_mode` STRICT | DB auth dibuat eksplisit `utf8mb4`/`utf8mb4_bin`; semua waktu **UTC dari aplikasi** (`DATETIME`, tanpa `NOW()` DB); mode strict menolak nilai negatif (teruji) |
| 9 | Akun yang ada: `kkisi_read` (SELECT `kkisi_staging.*`), `kkisi_app` (SELECT/INSERT/UPDATE/DELETE `kkisi_staging.*`), `root@%`; port hanya `127.0.0.1:3307` | Auth **tidak** memakai `kkisi_app`; akun baru khusus; `DATABASE_URL_WRITE`/`kkisi_app` tidak dipakai 2A |
| 10 | `setup-staging.sh --reset` menghapus container **dan volume** (semua skema/akun) | Skrip provisioning terpisah yang idempoten wajib dijalankan ulang setelah reset (6.12.6) |
| 11 | `.env.local` hanya berisi `DATABASE_URL` dan `POS_COMPANY_ID`; kode yang memakai `POS_COMPANY_ID`: `catalog-reader.ts`, `pos/page.tsx`, `api/pos/products/route.ts`, `tests/pos-catalog.test.mjs`, README, `.env.example` | Semuanya diubah ke `session.cid`; env baru: `DATABASE_URL_AUTH`, `AUTH_SECRETS`, `APP_ORIGIN`; `TRUSTED_PROXY_HOPS` tidak diisi |
| 12 | `tests/pos-browser.mjs` memerlukan halaman POS terbuka | Halaman kini butuh login; tes browser hanya memverifikasi pengalihan ke `/login` (skenario terautentikasi tidak bisa dijalankan tanpa user nyata/uji — lihat 6.12.9) |
| 13 | Docker berfungsi dan hanya `127.0.0.1` yang dipublikasikan | Akun auth memakai host `%` seperti akun lain (koneksi dari host datang dari gateway Docker); di produksi wajib dibatasi (6.12.9) |

#### 6.12.2 Rancangan tabel (target: database `kkisi_auth_staging`)
Target database: **`kkisi_auth_staging`** di container `kkisi-staging` (server yang sama, skema **terpisah** dari `kkisi_staging`); `CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`. Dua tabel InnoDB. DDL (teruji pada container sekali-pakai):

```sql
CREATE DATABASE IF NOT EXISTS kkisi_auth_staging CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

CREATE TABLE IF NOT EXISTS kkisi_auth_staging.auth_session (
  sid_hash        BINARY(32)   NOT NULL COMMENT 'SHA-256 dari ID sesi opak; ID-nya sendiri tidak pernah disimpan',
  user_id         INT UNSIGNED NOT NULL COMMENT 'kkisi_staging.db_users.id (tanpa FK: skema berbeda, legacy tak disentuh)',
  company_id      INT UNSIGNED NOT NULL COMMENT 'cabang terpilih untuk sesi ini (db_company.id)',
  pwf             BINARY(8)    NOT NULL COMMENT '8 byte pertama SHA-256(hash password) saat login',
  created_at      DATETIME     NOT NULL COMMENT 'UTC, dari aplikasi',
  last_seen_at    DATETIME     NOT NULL,
  idle_expires_at DATETIME     NOT NULL,
  abs_expires_at  DATETIME     NOT NULL,
  revoked_at      DATETIME     NULL,
  revoked_reason  ENUM('logout','forced','user_disabled','password_changed','superseded') NULL,
  purge_after     DATETIME     NOT NULL COMMENT 'baris boleh dihapus setelah ini (abs_expires_at + 24 jam)',
  PRIMARY KEY (sid_hash),
  KEY ix_auth_session_user  (user_id, revoked_at),
  KEY ix_auth_session_purge (purge_after),
  CONSTRAINT ck_auth_session_times  CHECK (abs_expires_at >= created_at AND idle_expires_at >= created_at AND purge_after >= abs_expires_at),
  CONSTRAINT ck_auth_session_revoke CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS kkisi_auth_staging.auth_throttle (
  key_hash         BINARY(32)   NOT NULL COMMENT 'HMAC-SHA256(subkunci throttle, kind|nilai): username/IP tak terbaca dari dump',
  kind             ENUM('user','pair','ip') NOT NULL,
  failures         INT UNSIGNED NOT NULL,
  first_failure_at DATETIME     NOT NULL COMMENT 'awal jendela tetap saat ini',
  last_failure_at  DATETIME     NOT NULL,
  locked_until     DATETIME     NULL,
  purge_after      DATETIME     NOT NULL,
  PRIMARY KEY (key_hash),
  KEY ix_auth_throttle_purge (purge_after)
) ENGINE=InnoDB;
```

| Aspek | Rancangan |
|---|---|
| **Indeks** | `auth_session`: PK `sid_hash` (pencarian tiap request: `const`, 0,29 ms); `ix_auth_session_user (user_id, revoked_at)` untuk cabut-semua dan batas per-user; `ix_auth_session_purge` untuk pembersihan. `auth_throttle`: PK `key_hash`; `ix_auth_throttle_purge`. EXPLAIN pada 200.000 baris: purge = `range` di indeks purge; lookup sesi = `const`; cabut per user = `range` di indeks user; cek throttle 3 kunci = `range` di PK |
| **Expiry** | Tiap baris membawa `idle_expires_at` (geser, ≤ sekali per 300 dtk) dan `abs_expires_at` (tetap; akun auth **tidak punya hak mengubahnya**). Sesi sah bila `revoked_at IS NULL` dan `now < LEAST(idle_expires_at, abs_expires_at)`; kedaluwarsa = ditolak walau barisnya belum dihapus |
| **Revocation** | `revoked_at`+`revoked_reason` persisten: `logout`, `forced` (cabut paksa/semua-perangkat), `user_disabled`, `password_changed` (`pwf` tak cocok), `superseded` (batas per-user). Teruji tetap tercabut setelah **restart MariaDB**; logout kedua = no-op; sesi tercabut tidak bisa "dihidupkan" lewat `touch`. CHECK menjamin `revoked_at` dan alasannya selalu berpasangan |
| **Pembatasan pertumbuhan** | (1) `purge_after` + indeks; (2) **pembersihan berbatas 500 baris** per pemanggilan, dijalankan oportunistik pada tiap login (sukses/gagal) — terukur 3–7 ms sisi server pada 200.000 baris; (3) **maks 10 sesi aktif per user** (yang ke-11 mencabut yang tertua dengan alasan `superseded`; teruji); (4) baris throttle hanya dibuat saat gagal, dihapus saat sukses, `purge_after` = gagal terakhir + 2 jam; (5) **batas keras 200.000 baris per tabel**: bila pembersihan tidak mengejar (batch penuh terus-menerus) pembuatan sesi/kunci baru **ditolak 503 + alarm** (gagal tertutup); (6) tidak bergantung `event_scheduler` (OFF di server) |
| **Perkiraan ukuran** | Terukur: `auth_session` 327 B/baris termasuk indeks, `auth_throttle` 201 B/baris; pada 200.000 baris masing-masing ≈ 62 MB dan ≈ 39 MB. Volume nyata (12 user, ≤ 10 sesi aktif/user, retensi ≤ 36 jam) ≈ ratusan baris (< 0,2 MB). Serangan penyemprotan username acak dibatasi CPU bcrypt (±115 ms/verifikasi per worker, ≈ 9/dtk) → ≲ 65.000 baris/worker dalam jendela retensi 2 jam, di bawah batas keras |

#### 6.12.3 Retensi dan siklus pembersihan
| Data | Disimpan sampai | Dihapus oleh |
|---|---|---|
| Sesi aktif | `abs_expires_at` (maks 12 jam) | Tidak dihapus selama sah |
| Sesi kedaluwarsa/tercabut | `purge_after` = `abs_expires_at` + 24 jam (≤ 36 jam sejak login) | `DELETE … WHERE purge_after < :now LIMIT 500` pada login berikutnya |
| Baris throttle | gagal terakhir + 2 jam (jendela 15 menit + kunci 15 menit + margin) | Sukses login (`user`,`pair`) atau pembersihan berbatas |

#### 6.12.4 SQL kritis (semua terparameter; waktu dari aplikasi, UTC)
- **Buat sesi:** *SQL pada versi ini DIGANTI oleh 6.13.10* (versi awal mengurutkan berdasarkan `created_at` dan menghitung sesi idle-kedaluwarsa sebagai aktif, sehingga bisa mencabut sesi lama yang masih aktif; juga rawan deadlock pada login serentak).
- **Validasi tiap request**: `SELECT … FROM auth_session WHERE sid_hash = :h` (PK), cek `revoked_at`/`idle`/`abs` di aplikasi.
- **Touch** (paling banyak sekali per 300 dtk): `UPDATE … SET last_seen_at, idle_expires_at WHERE sid_hash=:h AND revoked_at IS NULL AND last_seen_at <= :now-300s` (0 baris = tidak perlu; teruji).
- **Logout**: `UPDATE … SET revoked_at, revoked_reason='logout' WHERE sid_hash=:h AND revoked_at IS NULL` (idempoten). **Cabut semua user**: `… WHERE user_id=:u AND revoked_at IS NULL`.
- **Ganti cabang (role ≤2)**: `UPDATE auth_session SET company_id=:c WHERE sid_hash=:h AND revoked_at IS NULL`, setelah pemeriksaan legacy (tidak ada `db_buka_kasir status=1` milik user di cabang lain) lewat `kkisi_read`.
- **Throttle — cek**: `SELECT kind, locked_until FROM auth_throttle WHERE key_hash IN (…) AND locked_until > :now`.
- **Throttle — catat gagal** (dua pernyataan atomik):
  ```sql
  INSERT IGNORE INTO auth_throttle (key_hash,kind,failures,first_failure_at,last_failure_at,locked_until,purge_after)
    VALUES (:k,:kind,0,:now,:now,NULL,:purge);
  UPDATE auth_throttle SET
    failures         = IF(first_failure_at < :windowStart, 1, failures+1),
    locked_until     = IF(failures >= :limit, :lockUntil, locked_until),   -- MariaDB mengevaluasi kiri→kanan: memakai `failures` baru
    first_failure_at = IF(first_failure_at < :windowStart, :now, first_failure_at),
    last_failure_at  = :now, purge_after = :purge
  WHERE key_hash = :k;
  ```
  Teruji: ambang tepat di kegagalan ke-3 (limit 3), jendela baru memulai dari 1, **100 kegagalan paralel = tepat 100**, 40 kunci × 4 paralel (koneksi ≤ 8) = tepat 160.
- **Sukses**: `DELETE FROM auth_throttle WHERE key_hash IN (:user,:pair)`.
- **Konkurensi/koneksi**: akun dibatasi `MAX_USER_CONNECTIONS 10`; pool Prisma `connection_limit=8`. Terukur: di atas batas, pernyataan **ditolak seluruhnya (error 1226), tidak pernah setengah-diterapkan** (53 dari 160 pada uji tanpa batas; sisanya tercatat tepat) → aplikasi memetakan 1226 → 503, dan `1213/1205` → retry ≤ 2 kali lalu 503.

#### 6.12.5 Hak akses minimum
| Akun | Basis data | Hak | Dipakai oleh |
|---|---|---|---|
| `kkisi_read` (ada) | `kkisi_staging.*` | `SELECT` saja — **tidak berubah**, tanpa hak apa pun pada `kkisi_auth_staging` | Membaca legacy: `db_users`, `db_roles`, `db_permissions`, `db_company`, `db_buka_kasir`, `db_kasir`, `db_items`, dll. |
| **`kkisi_auth`** (baru) | hanya `kkisi_auth_staging.auth_session` dan `.auth_throttle` | `SELECT, INSERT, DELETE` tabel; **`UPDATE` hanya kolom**: `auth_session(company_id, last_seen_at, idle_expires_at, revoked_at, revoked_reason)`, `auth_throttle(failures, locked_until, first_failure_at, last_failure_at, purge_after)`; `MAX_USER_CONNECTIONS 10`; host `%` (staging lokal) | Auth store saja |
| `kkisi_app` (ada) | `kkisi_staging.*` R/W | tidak dipakai 2A (tidak ada `DATABASE_URL_WRITE`) | — |
| `root` | semua | hanya skrip provisioning (di dalam container) | — |

```sql
CREATE USER IF NOT EXISTS 'kkisi_auth'@'%' IDENTIFIED BY '<dibuat skrip, tidak pernah dicetak>' WITH MAX_USER_CONNECTIONS 10;
GRANT SELECT, INSERT, DELETE ON kkisi_auth_staging.auth_session  TO 'kkisi_auth'@'%';
GRANT UPDATE (company_id, last_seen_at, idle_expires_at, revoked_at, revoked_reason) ON kkisi_auth_staging.auth_session TO 'kkisi_auth'@'%';
GRANT SELECT, INSERT, DELETE ON kkisi_auth_staging.auth_throttle TO 'kkisi_auth'@'%';
GRANT UPDATE (failures, locked_until, first_failure_at, last_failure_at, purge_after) ON kkisi_auth_staging.auth_throttle TO 'kkisi_auth'@'%';
```
**Uji batas hak (lulus di container sekali-pakai; diulang di staging setelah provisioning):** `kkisi_auth` tidak dapat `SELECT`/`INSERT` ke skema legacy (1142), `CREATE/DROP/ALTER/TRUNCATE` (1142), `GRANT` (1045), membaca `mysql.*` (1142), mengubah `user_id`/`pwf`/`sid_hash`/`abs_expires_at`/`purge_after` (1143); akun baca-saja tidak dapat `SELECT` skema auth (1142) dan tetap dapat membaca legacy. Nilai negatif ditolak (mode strict, 1264), `sid_hash` ganda (1062), CHECK melanggar (4025).

#### 6.12.6 Provisioning, reset, dan pengembalian
1. **(Setelah persetujuan)** buat `scripts/setup-auth-store.sh` — idempoten; membaca `MARIADB_ROOT_PASSWORD` dari `.env.staging`; membuat password `kkisi_auth` acak bila belum ada dan **menyimpannya hanya di `.env.staging` (`MARIADB_AUTH_PASSWORD`) dan `.env.local` (`DATABASE_URL_AUTH`, dengan `?connection_limit=8`), keduanya mode 600 dan gitignored, tanpa pernah mencetaknya** (dipasok lewat variabel lingkungan `MYSQL_PWD` di dalam container, bukan argumen); menjalankan DDL 001 dan GRANT 002; lalu tes hak (di atas) dan hanya mencetak PASS/FAIL dan `SHOW GRANTS` tanpa materi password.
2. **Reset:** `setup-staging.sh --reset` menghapus volume (skema + akun auth ikut hilang) → jalankan `setup-auth-store.sh` lagi (sesi hilang = semua user login ulang; aman).
3. **Pengembalian** (hanya objek auth; legacy tidak terpengaruh): `DROP DATABASE kkisi_auth_staging; DROP USER 'kkisi_auth'@'%';` (+ hapus `DATABASE_URL_AUTH`).
4. Perubahan skema berikutnya = berkas SQL bernomor (`db/auth/00N_*.sql`) yang ditinjau dan dijalankan admin; aplikasi **tidak pernah** menjalankan DDL.

#### 6.12.7 Daftar file yang akan diubah/dibuat (setelah persetujuan; semuanya di `kkisi.web/`)
| Kelompok | Berkas |
|---|---|
| DB auth | **baru:** `db/auth/001_auth_schema.sql`, `db/auth/002_auth_grants.sql.tpl`, `scripts/setup-auth-store.sh`, `prisma/auth.prisma` (klien Prisma kedua, `output` ke `src/generated/auth-client`, gitignored) |
| Prisma legacy | **ubah** `prisma/schema.prisma` (tambah `DbUser`, `Role`, `Permission`, `BukaKasir`, `Kasir`; kolom seperlunya) |
| Domain | **baru** `src/domain/auth/{session.ts,password-candidates.ts,throttle-policy.ts}` |
| Aplikasi | **baru** `src/application/auth/{ports.ts,login.usecase.ts,logout.usecase.ts,validate-session.usecase.ts,select-company.usecase.ts}`, `src/application/pos/use-cases/read-register.usecase.ts` |
| Infrastruktur | **baru** `src/infrastructure/auth/{config.ts,keys.ts,csrf.ts,origin.ts,cookies.ts,client-ip.ts,password-verifier.ts,password-worker.ts,throttle.ts,guards.ts,container.ts,prisma-session-store.ts,prisma-throttle-store.ts,prisma-user.repository.ts,prisma-permission.repository.ts,prisma-company.repository.ts}`, `src/infrastructure/db/prisma-auth.ts`, `src/infrastructure/repositories/prisma-register.repository.ts`, `src/infrastructure/auth/handlers/{login,logout,session,company,register}.ts` (logika handler dengan impor relatif agar dapat diuji) |
| Rute dan halaman | **baru** `src/app/api/auth/{login,logout,session,company}/route.ts`, `src/app/api/pos/register/route.ts`, `src/app/login/page.tsx`, `src/proxy.ts`; **ubah** `src/app/pos/page.tsx`, `src/app/api/pos/products/route.ts`, `src/infrastructure/pos/catalog-reader.ts` (hapus `posCompanyId`) |
| UI | **ubah** `src/components/pos/{PosShell,PosScreen}.tsx`, `pos.css` (nama cabang/kasir nyata, tombol logout, pemilih cabang untuk role ≤2, banner "Sesi kasir belum dibuka") |
| Konfigurasi | **ubah** `package.json` (dependency `bcryptjs`; skrip `dev`/`start` `-H 127.0.0.1`; skrip `db:generate:auth`), `eslint.config.mjs` (`no-restricted-imports`: klien auth hanya dari `infrastructure/auth`, dan `kkisi_app`/`DATABASE_URL_WRITE` tak boleh diimpor), `.env.example`, `.gitignore` (`src/generated/`), `README.md` |
| Tes | **baru** `tests/auth-*.test.mjs` (lihat 6.12.8); **ubah** `tests/pos-catalog.test.mjs` (hapus tes `posCompanyId`), `tests/pos-browser.mjs` |

#### 6.12.8 Tes keamanan yang akan dijalankan
Tingkat: **F** = fake (tanpa DB), **A** = terhadap skema `kkisi_auth_staging` (setelah persetujuan), **L** = pembacaan legacy `kkisi_read` (agregat, tanpa data pribadi). Tidak ada user uji di tabel legacy; user, hash, dan password semuanya **sintetis** (dibuat di tes).

| Area | Tes | Tingkat |
|---|---|---|
| Fixation | Cookie pra-login tidak menjadi sesi sah; `sid` baru tiap login; sesi lama tidak berubah statusnya | F, A |
| Logout | Logout mencabut persisten; token yang sama ditolak setelah container aplikasi dibuat ulang ("restart"); logout ganda idempoten; logout tanpa CSRF ditolak | F, A |
| Expiry | Idle 2 jam dan absolut 12 jam (jam palsu); `touch` tidak memperpanjang melewati absolut; sesi kedaluwarsa ditolak sebelum dipurge | F, A |
| Password berubah | `pwf` beda → semua sesi user gugur di request berikutnya, tanpa aksi lain | F |
| User nonaktif / role / cabang berubah | Efek di request berikutnya (validasi ulang legacy per request) | F, L |
| Enumerasi username | Username tak ada/nonaktif/password salah/hash tak didukung/kelas tak-terdukung → **respons identik** (status, badan, header) dan **jumlah panggilan verifikator identik** (hash dummy) | F |
| Throttle | Ambang `user`; jendela tetap; kunci `pair`/`ip` mati saat IP tak tepercaya (header palsu tak berpengaruh) dan aktif hanya dengan `TRUSTED_PROXY_HOPS`; sukses menghapus `user`+`pair`; kapitalisasi/spasi tak menghindari batas; 100 kegagalan paralel tepat; kunci tak memuat username | F, A |
| bcrypt/worker | Hash sintetis `$2y$` lulus; awalan non-`$2` ditolak; password > 128 ditolak; event loop tidak macet > 50 ms pada 4 login; melebihi batas konkurensi → 503 | F |
| Password legacy | Kandidat raw + `html_escape` (korpus CI dari 6.10.2 dipakai sebagai fixture sintetis); kelas tak-terdukung → gagal generik + log `unsupported_password_class` | F |
| CSRF | Tanpa/asing `Origin`; `Origin` sama tanpa token; token milik sesi lain; `Content-Type` non-JSON; GET tak pernah menulis (pemindai); redirect terbuka (`//evil`, `https://evil`, `/\evil`) → `/pos`; tanpa header CORS | F |
| Cookie | `HttpOnly`, `SameSite=Lax`, tanpa `Domain`, `no-store` (lokal: tanpa `Secure`/`__Host-` — dicatat sebagai batas produksi) | F |
| Akses lintas cabang | Role >2 dengan `company_id`/`companyId`/header palsu tetap cabangnya; role >2 memanggil ganti cabang → 403; role ≤2 memilih cabang nonaktif/tak ada → 4xx; ganti cabang ditolak bila ada sesi kasir terbuka di cabang lain; sesi kasir user lain tak pernah terbaca (IDOR) | F, L |
| RBAC | Tanpa sesi 401; tanpa `sales_add` 403; tanpa bypass `id=1`; kegagalan cek izin → 503 (bukan izinkan) | F, L |
| **Kegagalan DB** | Auth store mati → 503 tertutup (login dan request); DB legacy mati → 503; keduanya mati; timeout; 1226/1213/1205 → retry terbatas → 503; tak ada detail koneksi/kredensial di badan respons atau log | F, A |
| **Route terlewat guard** | Pemindai statis atas `src/app/api/**/route.ts` dan `src/app/**/page.tsx`: setiap berkas non-publik memanggil guard (putih: `auth/login`, `auth/session` bagian login, `/login`); proxy dilewati (panggilan langsung ke handler) tetap ditolak | F |
| Hak DB (negatif) | Semua tes 6.12.5: `kkisi_auth` tak bisa menyentuh legacy/DDL/GRANT/kolom terlarang; `kkisi_read` tak bisa menyentuh skema auth **dan tak bisa menulis apa pun** | A, L |
| Pertumbuhan | Pembersihan berbatas 500; sesi ke-11 mencabut tertua; batas keras 200.000 → 503 + alarm; `touch` ≤ sekali/300 dtk | A |
| Kebocoran | Grep log/keluaran tes: tidak ada password, hash, `sid`, `AUTH_SECRETS`, URL DB berkredensial; `pwf`/hash tidak pernah di objek respons | F |
| Loopback | Konfigurasi menolak start bila `APP_ORIGIN` bukan `127.0.0.1`/`localhost`; skrip `dev`/`start` bind `127.0.0.1` | F |
| Rotasi secret | `k1→k2→hapus k1`; `kid` tak dikenal/ganda; kunci < 32 byte → startup gagal; rotasi tak menggugurkan sesi | F |
| Kepatuhan | Tes tak memuat hash/password nyata (pemindai fixture: hash hanya dibuat saat runtime) | F |

Setelah tes: `npm test`, `npm run lint`, `npm run typecheck`, `next build` (dan `prisma validate` untuk kedua skema), laporan hasil beserta batasan produksi.

#### 6.12.9 Batasan yang masih menghalangi produksi (dilaporkan, bukan diselesaikan di 2A)
1. **Topologi produksi tidak diketahui (S2-10):** proxy/HTTPS/domain/jumlah instance; karena itu `Secure`, awalan `__Host-`, `APP_ORIGIN` non-loopback, dan penentuan IP tepercaya **belum pernah dijalankan**; guard loopback sengaja mencegah publikasi.
2. Auth store di produksi butuh DDL/GRANT/akun terpisah dan pembatasan host akun (bukan `%`), serta TLS koneksi DB; `root@%` seperti di container staging tidak boleh ada.
3. Login end-to-end atas **user nyata tidak diuji** (dilarang): alur login dites lewat fake `UserRepository` dan hash sintetis; adapter `UserRepository` Prisma hanya diuji agregat terhadap staging. Skenario browser terautentikasi belum ada.
4. Password kelas tak-terdukung tidak bisa login; belum ada prosedur reset di Next (ditangani admin di luar 2A). Jika Next kelak menyetel password, hash harus dibuat dari bentuk transformasi legacy.
5. Belum ada UI admin untuk cabut sesi, audit log persisten, alarm operasional (hanya log), dan header keamanan lain (CSP dll.).
6. Ketersediaan: POS bergantung pada dua sumber (auth store dan DB legacy); belum ada pemantauan/*failover*.
7. Kerentanan lama di sisi PHP (SQL injection, CSRF mati, `Api_c` tanpa auth) tidak disentuh dan tetap ada di produksi.
8. `bcryptjs` dalam worker: throughput login terbatas (~9 verifikasi/dtk/worker); cukup untuk 12 user, belum diuji di beban produksi.

#### 6.12.10 Persetujuan yang diminta (jawab per butir) — **direvisi oleh rekomendasi Bab 6.13; jawab lewat 6.13.5**
```
1. DDL 001 (database kkisi_auth_staging, 2 tabel, utf8mb4) pada container kkisi-staging: setuju/tidak
2. Akun kkisi_auth@'%' + GRANT 002 (SELECT/INSERT/DELETE tabel; UPDATE per-kolom; MAX_USER_CONNECTIONS 10): setuju/tidak
3. Skrip scripts/setup-auth-store.sh dijalankan dengan kredensial root dari .env.staging (di dalam container); password kkisi_auth dibuat acak, disimpan di .env.staging dan .env.local (mode 600), tidak pernah dicetak: setuju/tidak
4. Tidak memeriksa db_roles.status saat login (meniru legacy; role 3 berstatus 0): setuju/tidak
5. Batas: maks 10 sesi aktif per user; pembersihan 500 baris per login; batas keras 200.000 baris per tabel (503 + alarm): setuju/tidak
6. Throttle jendela tetap 15 menit; sukses menghapus kunci user+pair: setuju/tidak
7. Klien Prisma kedua (prisma/auth.prisma -> src/generated/auth-client, gitignored) untuk auth store: setuju/tidak
8. package.json dev/start bind 127.0.0.1 + guard APP_ORIGIN loopback + aturan ESLint pembatas klien: setuju/tidak
9. Dependency baru hanya bcryptjs: setuju/tidak
10. Batas uji (login nyata tidak diuji; browser hanya memeriksa pengalihan ke /login): diterima/tidak
11. Setelah 1–3 disetujui, izin memulai implementasi 2A (semua butir 6.12.7): ya/tidak
```

## 6.13 Tinjauan pra-provisioning — **keputusan bersyarat (putaran 4)**; DDL/GRANT/provisioning/implementasi 2A **belum dijalankan**

Semua bukti di bawah dikumpulkan dengan baca-saja pada staging (`kkisi_read`, introspeksi root hanya-baca) dan pada **container MariaDB sekali-pakai** yang sudah dihapus. Staging tetap: hanya `kkisi_staging`, 0 akun tambahan, 328 objek; `git status` dan `package*.json` identik dengan sebelum 2A.

### 6.13.1 `db_roles.status` (role 3)
| Bukti | Temuan |
|---|---|
| `Roles.php:77-80`, `Roles_model.php:132-135` | Daftar role menampilkan label **Active/Inactive yang bisa diklik**, memanggil `update_status` (ditolak untuk role 1). Ini satu-satunya penulis kolom |
| `views/users.php:121` | Satu-satunya pembaca: dropdown role saat **membuat/mengubah user** hanya menampilkan `status=1` → arti praktisnya "role dipensiunkan, tidak boleh ditetapkan lagi" |
| `Login_model.php:37`, `MY_Controller.php:113-121` | Login (join `db_roles` tanpa filter status) dan cek izin (hanya `role_id` di `db_permissions`) **tidak membaca** status role → mengubah role ke Inactive **tidak memblokir** pemegangnya di PHP |
| Next.js | Tidak ada pemakaian role sama sekali |
| Data | Role 3 `status=0` memiliki 1 user, yang sudah `status=0`; role 3 masih punya 96 baris izin (termasuk `sales_add` dan `master_kasir`), 0 sesi kasir, 11 penjualan Final historis atas namanya. Role 1/2/4 aktif dengan 1/3/6(+1 nonaktif) user; total 10 user aktif |

**Kebijakan aman (usulan): tolak login bila `db_roles.status ≠ 1`** — respons tetap generik, log `role_inactive` (tanpa username). **Dampak menolak role 3: nol user hari ini** (satu-satunya pemegang sudah nonaktif; UI PHP tidak bisa menetapkan role 3 lagi). **Risiko:** menyimpang dari PHP — user yang role-nya di-Inactive-kan masih bisa masuk PHP tetapi tidak Next; dan satu klik tidak sengaja pada label Inactive di role Kasir (4) mengunci seluruh kasir dari Next (bukan dari PHP). Karena itu ditambah alarm log `role_inactive` dan dicatat di runbook. Alternatif: meniru PHP (abaikan status) — paling paritas, tetapi mengabaikan niat admin dan membuka role "pensiun" bila kelak ada user tersisa.

### 6.13.2 Asal koneksi dan pembatasan host `kkisi_auth`
| Bukti | Temuan |
|---|---|
| `SELECT USER()` lewat koneksi `kkisi_read` dari jalur nyata aplikasi (host → `127.0.0.1:3307`) | MariaDB melihat klien sebagai **`kkisi_read@172.17.0.1`**, cocok dengan akun `kkisi_read@%` |
| `docker exec` di dalam container | terlihat sebagai `root@localhost` (socket) — bukan jalur aplikasi |
| `docker info` / `network inspect bridge` | Docker Desktop 29.1.3; bridge `172.17.0.0/16`, gateway `172.17.0.1`; `kkisi-staging` = `172.17.0.2`; port hanya `127.0.0.1:3307` |
| `@@skip_name_resolve = ON` | Pola host **harus IP**, bukan nama |
| Uji container sekali-pakai (GRANT staging tidak diubah), koneksi dari **host** via Prisma | `@'172.17.0.1'` ✅, `@'172.17.%'` ✅, `@'%'` ✅, `@'10.9.9.9'` ❌, `@'localhost'` ❌ |
| Uji dari **container lain** di bridge yang sama | `@'172.17.0.1'` ❌ (ditolak, sumber `172.17.0.3`), `@'172.17.%'` ✅ |

**Kesimpulan:** akses Docker-ke-host **tidak rusak** bila host dibatasi ke `172.17.0.1`. Nilai tambahnya bukan melawan penyerang di mesin yang sama (mereka juga terlihat sebagai `172.17.0.1`), melainkan pertahanan berlapis bila port kelak dipublikasikan ke `0.0.0.0`: klien LAN tampil dengan IP-nya sendiri dan ditolak. **Rekomendasi:** `'kkisi_auth'@'172.17.0.1'` yang **dideteksi skrip provisioning** (skrip melakukan `SELECT USER()` lewat jalur host dengan `kkisi_read`, bukan hardcode); bila deteksi gagal atau Docker memakai subnet lain, skrip berhenti dengan pesan jelas (tidak jatuh ke `%`). Konsekuensi: **gagal tertutup** bila gateway berubah (login ditolak sampai skrip dijalankan ulang) — bukan celah. Tes negatif hak harus lewat jalur host (via `docker exec` sumbernya `localhost`, tidak cocok akun). Aplikasi yang kelak berjalan di container mendapat IP `172.17.0.x` dan butuh akun/host baru (atau `172.17.%`). Akun lama `kkisi_read`/`kkisi_app` tetap `%` (tidak diubah).

### 6.13.3 Throttle mengunci kasir: pemulihan admin, enumerasi, restart
- **Sifat dasar:** kunci kedaluwarsa sendiri (15 menit); persisten → tidak hilang saat restart aplikasi maupun MariaDB (sesi teruji; tabel sama, InnoDB). Reset volume (`--reset`) menghapus semua penghitung — diterima.
- **Pemulihan tanpa mematikan perlindungan (tingkat):**
  1. **Tunggu** ≤ 15 menit.
  2. **Buka kunci terarah** oleh operator: `npm run auth:unlock -- --username <u> [--ip <ip>]` (berkas baru `scripts/auth-unlock.ts`) menghitung HMAC kunci yang sama (butuh `AUTH_SECRETS` + `DATABASE_URL_AUTH`, akun `kkisi_auth` sudah punya `DELETE`) dan **menghapus tepat kunci itu**. Teruji: membuka 1 username menghapus 1 baris; 4 username terkunci lainnya tetap terkunci. Tidak ada endpoint HTTP di 2A; setiap pemakaian mencetak baris log audit (tanpa username mentah).
  3. **Darurat massal** (semua admin terkunci): `DELETE FROM auth_throttle` oleh admin DB — hanya mereset penghitung, fitur tetap aktif. **Tidak boleh ada saklar "matikan throttle"**.
  4. Endpoint admin di aplikasi (role 1, CSRF) ditunda ke tahap setelah 2A.
- **Kunci "kadaluwarsa mustahil":** jam aplikasi yang melompat bisa menulis `locked_until` jauh di depan. Pembacaan lock dibatasi: aktif hanya bila `now < locked_until ≤ now + 15 menit + 60 dtk`; di luar itu diabaikan dan dihapus. Teruji: lock 10 tahun ke depan akan mengunci 10 tahun dengan cek naif, dan diabaikan oleh cek terbatas.
- **Enumerasi username:** (a) kunci `user` dibuat untuk username **ada maupun tidak ada**, ambang sama → 429 identik; (b) respons gagal identik (badan, header, jumlah panggilan verifikator; hash dummy); (c) legacy **membocorkan**: `Login_model.php:12` "Invalid Password!" (username ada) vs `Login.php`/model "Invalid username!" (tidak ada) — Next menutupnya, tetapi PHP di produksi tetap membocorkan; (d) pemeriksaan kunci sebelum bcrypt membuat respons terkunci lebih cepat, tetapi sama untuk username nyata maupun fiktif sehingga tidak membedakan keberadaan; (e) DoS penguncian bergantung pada tahu username — di staging lokal diterima; untuk produksi tinjau ulang (kunci `pair`/`ip` sebagai utama, ambang `user` jauh lebih tinggi atau berupa penundaan, bukan kunci).
- **Restart:** tidak ada status di memori; validasi/kunci selalu dari store, jadi restart tidak mengosongkan maupun menambah kunci.

### 6.13.4 Batas 10 sesi / 500 baris / 200.000 baris
Bukti kebutuhan nyata: 10 user aktif; maks 6 user aktif per hari (rata-rata 3,7); **maks 3 sesi kasir terbuka bersamaan oleh satu user** (proxy jumlah perangkat); 26 sesi kasir/hari maks. Volume normal ≈ ratusan baris. Skenario terburuk yang terukur: login berulang oleh **satu akun valid** (klien bug atau kredensial dicuri) ≈ 8,5 login/dtk/worker × retensi 36 jam ≈ **1,1 juta baris ≈ 360 MB** (327 B/baris).
| Aturan | Kebutuhan nyata | Kegagalan yang dicegah | Respons bila aturan gagal | Rekomendasi |
|---|---|---|---|---|
| **Batas sesi aktif** | maks legit 3 per user | Token sah menumpuk (kredensial dicuri tetap hidup); tabel membengkak | Berjalan dalam transaksi login: **error → login 503 (gagal tertutup)**; saat tercapai: sesi tertua dicabut `superseded` (perangkat itu login ulang) | **Pertahankan, turunkan 10 → 5** (3 + margin); satu pernyataan |
| **Pembersihan berbatas per login** | Tidak ada penjadwal (`event_scheduler=OFF`) | Retensi tak terbatas | **Best-effort:** kegagalan dicatat dan diabaikan (tidak memblokir login); kegagalan berkelanjutan terlihat dari alarm jumlah baris | **Sederhanakan 500 → 100 baris** (laju kadaluarsa ≈ laju sisip, 100 ≫ 3 baris per login; biaya < 2 ms) |
| **Batas keras 200.000 baris global → 503** | **Tidak ada**: throttle otomatis terbatas ±120–130 ribu baris (≈ 25 MB) oleh CPU bcrypt × retensi 2 jam; sesi butuh kredensial valid | Disk penuh | **Penyebab DoS**: setelah tercapai, *semua* user tak bisa login — penyerang dengan satu akun valid mematikan seluruh login | **HAPUS.** Ganti (a) **batas baris per user = 50** (sesi aktif + tercabut; baris tercabut tertua dihapus saat login) dan (b) **alarm-saja** (log) bila total > 100.000 baris |
Teruji pada container sekali-pakai: 3.000 login berturut-turut oleh satu user → **50 baris**, 5 aktif; 20 sesi user lain utuh.

### 6.13.5 Pengujian e2e dengan identitas sintetis, tanpa menyentuh akun/data nyata
**Mekanisme (tanpa perubahan kode aplikasi):** skema **legacy-tiruan** `kkisi_e2e_legacy` berisi 8 tabel **struktur-saja** (DDL diambil dari staging lewat `SHOW CREATE TABLE`, 0 baris) dan **data sintetis**: 4 cabang, 4 role (role 3 `status=0` seperti produksi), izin, 7 user (`id ≥ 900001`, jauh dari id nyata 1–17: admin, koperasi, kepala, kasir1, kasir2, nonaktif, kelas-tak-terdukung), register (terbuka/basi/di cabang lain), 60 item (harga pecahan, harga 0, stok 0). Hash bcrypt `$2y$` cost 10 **dibuat saat runtime** dari password acak yang disimpan di berkas mode 600 gitignored, tidak pernah dicetak. Aplikasi dijalankan dengan `DATABASE_URL` → skema tiruan (hanya konfigurasi); auth store nyata `kkisi_auth_staging`.
**Terbukti** pada container sekali-pakai: kode Tahap 1 (`PrismaItemRepository`, katalog, kategori, barcode) berjalan **tanpa perubahan**; login (raw/`html_escape`), user nonaktif/tak ada, kelas tak-terdukung gagal generik, izin per role (role 1 tanpa `master_kasir` seperti produksi), cabang, sesi kasir terbuka/basi/di cabang lain (S2-6) — 18 dari 18 lulus lewat akun SELECT-only; jalur hapus (`DROP DATABASE` + `DROP USER`) menghapus semuanya. Sesi user sintetis di auth store ditolak bila aplikasi diarahkan ke DB nyata (user tidak ditemukan) → terisolasi.
**Pengaman:** skrip seed/cleanup menolak target selain `^kkisi_e2e_` dan menegaskan `SELECT DATABASE()`; tes e2e menolak jalan bila DSN bukan `kkisi_e2e_*`; tidak ada saklar/backdoor di kode aplikasi.

**Izin dipisah:**
| ID | Izin | Objek | Efek |
|---|---|---|---|
| **E1** | DDL + GRANT | `CREATE DATABASE kkisi_e2e_legacy` + 8 tabel struktur-saja; akun `kkisi_e2e_read` SELECT-only pada skema itu (host `172.17.0.1`) | Tidak menyentuh `kkisi_staging`, `kkisi_read`, `kkisi_app` |
| **E2** | Buat data uji | `INSERT` baris sintetis hanya ke `kkisi_e2e_legacy` (root di dalam container, lewat skrip bertarget-terkunci) | Data sintetis; tidak ada baris nyata disalin |
| **E3a** | Hapus data uji per-eksekusi | `DELETE` baris sintetis di `kkisi_e2e_legacy`; di auth store hanya `user_id ≥ 900000` (dan kunci throttle nama sintetis lewat `auth:unlock`) | Dapat diulang tiap eksekusi |
| **E3b** | Teardown penuh | `DROP DATABASE kkisi_e2e_legacy; DROP USER kkisi_e2e_read` | DDL; izin terpisah tiap kali |
Tanpa E1 tidak ada e2e nyata; tanpa E2 skema kosong. **Tidak ada izin yang menulis ke `kkisi_staging`.** Jika E1–E3 ditolak: e2e memakai fake di tingkat handler (kehilangan uji cookie/CSRF di browser sungguhan dan integrasi Prisma↔legacy).

### 6.13.6 Rekomendasi per butir 6.12.10 (1–11) dan daftar keputusan
| # | Rekomendasi | Catatan |
|---|---|---|
| 1 | **Setuju** DDL 001 tanpa perubahan | Batas 5/100/per-user 50 bersifat aplikasi, DDL sama |
| 2 | **Setuju dengan revisi:** host `'172.17.0.1'` (terdeteksi) sebagai pengganti `%`; UPDATE per-kolom dan `MAX_USER_CONNECTIONS 10` tetap | Bukti 6.13.2 |
| 3 | **Setuju dengan revisi:** skrip mendeteksi host, tes negatif lewat jalur host, opsi `--drop-auth`, tidak mencetak rahasia | |
| 4 | **Ubah:** tolak login bila `db_roles.status ≠ 1` (generik + log `role_inactive`) | Dampak 0 user hari ini; risiko klik tak sengaja tercatat |
| 5 | **Ubah:** sesi aktif 5; pembersihan 100 baris best-effort; **hapus batas keras 200.000**, ganti batas 50 baris per user + alarm-saja 100.000 | Menghilangkan vektor DoS global |
| 6 | **Setuju + tambah:** cap pembacaan lock (≤ 15 menit + 60 dtk), `auth:unlock` terarah, tanpa saklar mati | |
| 7 | **Setuju** klien Prisma kedua | |
| 8 | **Setuju** bind `127.0.0.1` + guard `APP_ORIGIN` + ESLint | |
| 9 | **Setuju** `bcryptjs` saja | |
| 10 | **Ganti** "login nyata tidak diuji" → e2e sintetis (E1–E3) bila disetujui; jika tidak, fake saja | Batas produksi tetap: tidak ada login akun nyata |
| 11 | **Ya**, setelah 1–3 (dan bila diinginkan E1–E2) disetujui | |

**Jawaban yang perlu diisi:**
```
1. DDL 001 pada kkisi-staging: setuju/tidak
2. Akun kkisi_auth dengan host terdeteksi (172.17.0.1) + GRANT 002: setuju/tidak
3. scripts/setup-auth-store.sh (deteksi host, tanpa cetak rahasia, --drop-auth): setuju/tidak
4. Kebijakan role: tolak db_roles.status<>1 / tiru PHP (abaikan status)
5. Batas: sesi aktif 5; purge 100 best-effort; 50 baris per user; alarm-saja 100.000; tanpa batas keras global: setuju/tidak
6. Throttle: cap pembacaan lock + auth:unlock terarah + tanpa saklar mati: setuju/tidak
7. Klien Prisma kedua untuk auth store: setuju/tidak
8. Bind 127.0.0.1 + guard APP_ORIGIN + aturan ESLint: setuju/tidak
9. Dependency baru hanya bcryptjs: setuju/tidak
10. E2E sintetis: E1 (DDL+GRANT skema tiruan): ya/tidak | E2 (buat data uji): ya/tidak | E3a (hapus data per-eksekusi): ya/tidak | E3b (DROP saat teardown): ya/tidak (izin terpisah tiap kali)
11. Izin memulai implementasi 2A (setelah 1–3 dijalankan): ya/tidak
```


### 6.13.7 Keputusan pemilik (putaran 4) dan pemenuhan syaratnya
| # | Keputusan | Syarat | Pemenuhan / bukti |
|---|---|---|---|
| 1 | DDL 001 (`kkisi_auth_staging`): **setuju, hanya di container staging lokal** | Target hanya `kkisi-staging` | Nama container **dikunci** di `scripts/lib/auth-store-common.sh` (`LOCAL_STAGING_CONTAINER`, tanpa override lingkungan; nama lain ditolak sebelum panggilan Docker); port 3306 wajib hanya `127.0.0.1`; 001 berkualifikasi penuh tanpa `USE`/database default |
| 2 | Akun `kkisi_auth` + GRANT 002: **setuju bersyarat** | Host **dideteksi** dari jalur koneksi aplikasi, **bukan `%`**; hak minimum dipertahankan | Skrip mendeteksi host (`SELECT USER()` lewat driver dan DSN yang sama dengan aplikasi), menolak non-IPv4/non-privat/wildcard; 002 tidak memuat `%` (dicek statis + mutasi); hak identik dengan rancangan (15/15 pemeriksaan verifikasi lulus pada rehearsal, termasuk deteksi hak berlebih) |
| 3 | Provisioning idempoten: **setuju bersyarat** | **Tanpa `--drop-auth`**; teardown skrip terpisah dengan konfirmasi target eksplisit | `setup-auth-store.sh` tidak punya opsi hapus (dicek statis + mutasi); default **dry-run**, `--apply` untuk eksekusi; `teardown-auth-store.sh` terpisah: butuh `--container`, `--database`, `--user`, `--host` persis + `--confirm "DROP kkisi_auth_staging ON kkisi-staging"` + `--execute` |
| 4 | Tolak login bila `db_roles.status <> 1`, respons generik | — | Dicatat sebagai keputusan final untuk 2A (log `role_inactive` tanpa username) |
| 5 | Batas 5 sesi aktif dan purge 100 best-effort, tanpa batas keras global | (a) **buktikan** batas 50 baris/user tidak mencabut sesi aktif yang sah; (b) tetapkan penerima alarm 100.000 baris + prosedur, atau tandai belum siap produksi | (a) **Terbukti** di 6.13.10 (S1–S6). (b) 6.13.11: penerima ditetapkan untuk staging lokal; **produksi: belum siap** |
| 6 | Throttle: cap waktu lock, `auth:unlock` terarah, tanpa saklar mati | — | Dicatat final (6.13.3); tidak ada opsi/variabel untuk menonaktifkan throttle |
| 7–9 | Klien Prisma auth terpisah; bind loopback; guard `APP_ORIGIN`; ESLint; hanya dependency `bcryptjs` | — | Dicatat final; belum diimplementasikan (menunggu izin 2A) |
| 10 | E1 dan E2 **hanya untuk skema tiruan lokal**; E3a **hanya** menghapus data sintetis **setelah memeriksa skema target dan rentang ID**; E3b **belum disetujui** | E3b butuh izin tersendiri | 6.13.12; E3b tidak ditulis dan tidak boleh dijalankan |
| 11 | Implementasi 2A **belum** disetujui | — | Tidak dimulai |

### 6.13.8 DDL/GRANT final, target persis, operasi, dan verifikasi baca-saja
**Berkas final** (ditulis, **belum dijalankan**; semuanya di `kkisi.web/`): `db/auth/001_auth_schema.sql` (DDL persis seperti yang disetujui pada 6.12.2; tidak berubah), `db/auth/002_auth_grants.sql.tpl`, `db/auth/003_verify.sql.tpl` (15 pemeriksaan SELECT), `scripts/lib/auth-store-common.sh`, `scripts/setup-auth-store.sh`, `scripts/verify-auth-store.sh`, `scripts/teardown-auth-store.sh`.
**GRANT final** (`__AUTH_HOST__` = host terdeteksi, contoh saat ini `172.17.0.1`; `__AUTH_PW__` = 48 karakter heksa acak, tidak dicetak):
```sql
CREATE USER IF NOT EXISTS 'kkisi_auth'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 10;
ALTER USER 'kkisi_auth'@'__AUTH_HOST__' IDENTIFIED BY '__AUTH_PW__' WITH MAX_USER_CONNECTIONS 10;
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'kkisi_auth'@'__AUTH_HOST__';        -- konvergen: buang hak liar sebelum memberi hak
GRANT SELECT, INSERT, DELETE ON `kkisi_auth_staging`.`auth_session`  TO 'kkisi_auth'@'__AUTH_HOST__';
GRANT UPDATE (`company_id`,`last_seen_at`,`idle_expires_at`,`revoked_at`,`revoked_reason`) ON `kkisi_auth_staging`.`auth_session` TO 'kkisi_auth'@'__AUTH_HOST__';
GRANT SELECT, INSERT, DELETE ON `kkisi_auth_staging`.`auth_throttle` TO 'kkisi_auth'@'__AUTH_HOST__';
GRANT UPDATE (`failures`,`locked_until`,`first_failure_at`,`last_failure_at`,`purge_after`) ON `kkisi_auth_staging`.`auth_throttle` TO 'kkisi_auth'@'__AUTH_HOST__';
```
**Target persis:** container `kkisi-staging` (`127.0.0.1:3307`→3306, terpasang hanya loopback); database `kkisi_auth_staging` (baru); akun `kkisi_auth@<host terdeteksi>` (baru); `kkisi_staging`, `kkisi_read`, `kkisi_app`, `root` **tidak diubah**.
**Operasi `setup-auth-store.sh --apply` (berurutan; tanpa `--apply` hanya dry-run baca-saja):**
1. Prakondisi baca-saja: container hanya `kkisi-staging` dan berjalan; port hanya `127.0.0.1`; DSN aplikasi loopback; deteksi host; tidak ada akun `kkisi_auth` di host lain (jika ada → berhenti); catat jumlah objek `kkisi_staging` (sebelum).
2. Tulis `MARIADB_AUTH_PASSWORD` ke `.env.staging` dan `DATABASE_URL_AUTH` ke `.env.local` (mode 600, atomik, nilai tidak dicetak).
3. Jalankan `001_auth_schema.sql` (root di dalam container, tanpa database default).
4. Jalankan `002` yang sudah dirender (host + password lewat stdin, bukan argumen).
5. Jalankan `verify-auth-store.sh`; berhenti bila jumlah objek `kkisi_staging` berubah.
**Perintah verifikasi baca-saja setelah provisioning:** `bash scripts/verify-auth-store.sh` (hanya SELECT; 15 pemeriksaan hak/skema + 5 pemeriksaan jalur aplikasi: host terlihat = host terdeteksi dan akun tidak `%`; `kkisi_auth` dapat membaca tabelnya, **ditolak SELECT ke legacy**; `kkisi_read` **ditolak SELECT ke skema auth** dan tetap membaca legacy), ditambah `bash scripts/setup-auth-store.sh` (dry-run) dan `docker exec kkisi-staging sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "SHOW GRANTS FOR \"kkisi_auth\"@\"<host>\""' | sed 's/ IDENTIFIED.*//'`. Verifikasi tidak pernah mencoba pernyataan tulis terlarang (hak diperiksa lewat `information_schema`).

### 6.13.9 Hasil uji berkas (tanpa menjalankan skrip)
| Uji | Hasil |
|---|---|
| `bash -n` semua skrip | Lulus |
| Cek statis 19 butir (tanpa `--drop`, tanpa DROP di setup/verify/002, tanpa host wildcard, 001 tanpa objek legacy, semua GRANT hanya `kkisi_auth_staging`, tanpa `GRANT ALL`/`ON *.*`, verify tanpa pernyataan tulis, setup default dry-run, teardown butuh konfirmasi eksak, tanpa rahasia dicetak, tanpa `set -x`, container terkunci) | **Semua lulus**; **10 mutan** (mis. `--drop-auth` kembali, host `%`, `DROP` di setup, `GRANT ALL`, penulisan di verify, rahasia dicetak, default `--apply`, `xtrace`, override container) **semuanya tertangkap** |
| Fungsi murni pustaka (validasi IPv4/privat 24 kasus, penulisan env, pembacaan DSN, render template) | Lulus (bash 3.2) |
| **Rehearsal berkas SQL** di container sekali-pakai dengan `kkisi_staging`/`kkisi_read`/`kkisi_app` tiruan | 001+002 diterapkan; **15/15** pemeriksaan; **idempoten**; hak liar (INSERT ke tabel legacy, UPDATE kolom tambahan) **terdeteksi lalu diperbaiki** oleh 002; akun duplikat di `%`, grantee lain di skema auth, `kkisi_read`/`kkisi_app` diberi akses, `MAX_USER_CONNECTIONS` salah, dan tipe kolom berubah **semuanya membuat verifikasi GAGAL**; skema legacy tiruan **tidak berubah** |
| Pemeriksaan jalur aplikasi (5) terhadap container sekali-pakai | 5/5 lulus |
| **Kejadian:** saat menguji, `verify-auth-store.sh` sempat **berjalan tanpa sengaja terhadap staging asli** (trik `source` yang menyamakan `$0`). Hanya SELECT (dikonfirmasi statis); hasilnya sesuai harapan sebelum provisioning (semua cek skema auth GAGAL; 328 objek legacy). Sesudahnya diperiksa ulang: database, akun, jumlah objek, GRANT `kkisi_read`, dan file env **tidak berubah**. Penyebab diperbaiki (skrip menemukan direktori lewat `BASH_SOURCE`, bukan `$0`) | Tidak ada perubahan pada staging |
Skrip `setup`/`teardown` **tidak pernah dijalankan** (hanya sintaks, cek statis, dan fungsi murni); rehearsal skrip utuh terhadap container sekali-pakai **belum** dilakukan (butuh izin, lihat 6.13.14).

### 6.13.10 Aturan sesi final dan bukti (batas 5 aktif, 50 baris/user, purge 100)
Rehearsal menemukan **dua cacat** pada SQL 6.12.4 awal dan memperbaikinya: (1) mengurutkan menurut `created_at` dan menganggap sesi idle-kedaluwarsa sebagai "aktif" → sesi lama yang masih **dipakai** bisa dicabut, sedangkan sesi baru yang sudah mati menempati jatah; (2) tanpa serialisasi, login serentak oleh user yang sama sering **deadlock (1213)**.
**Definisi:** sesi *valid* = `revoked_at IS NULL AND idle_expires_at > :now AND abs_expires_at > :now`. **SQL final** (satu transaksi, `READ COMMITTED`, timeout/retry ≤ 2 kali pada 1213/1205 lalu 503):
```sql
SELECT sid_hash FROM auth_session WHERE user_id = :u FOR UPDATE;                 -- serialisasi per user
INSERT INTO auth_session (...) VALUES (...);                                     -- sesi baru (last_seen_at = now)
UPDATE auth_session SET revoked_at = :now, revoked_reason = 'superseded'         -- pertahankan 5 valid yang PALING BARU AKTIF
 WHERE user_id = :u AND <valid> AND sid_hash NOT IN (SELECT sid_hash FROM (SELECT sid_hash FROM auth_session
       WHERE user_id = :u AND <valid> ORDER BY last_seen_at DESC, created_at DESC LIMIT 5) keep);
DELETE FROM auth_session WHERE user_id = :u AND NOT <valid>                      -- pangkas HANYA baris mati sampai total 50
   AND sid_hash NOT IN (SELECT sid_hash FROM (SELECT sid_hash FROM auth_session WHERE user_id = :u
       ORDER BY (<valid>) DESC, created_at DESC LIMIT 50) keep);
```
Purge best-effort: `DELETE FROM auth_session WHERE purge_after < :now LIMIT 100` (kegagalan dicatat, tidak memblokir login).
**Hasil uji** (container sekali-pakai; akun `kkisi_auth` lewat driver Prisma dari host):
| Skenario | Hasil |
|---|---|
| S1: sesi lama tetapi aktif + 5 sesi idle-kedaluwarsa + 55 baris tercabut (61 baris) | Sesi lama **tetap valid dan tidak dicabut**; sesi baru valid; baris → 50; hanya 2 valid; tidak ada yang dicabut sebagai `superseded` |
| S2: 5 valid, yang **paling lama dibuat justru paling baru aktif**; login ke-6 | V1 (tertua dibuat) **selamat**; yang dicabut = **paling lama tidak aktif** (V2); tepat 5 valid |
| S3: 5 valid + 55 baris mati | Baris 60 → 50; **hanya baris mati dipangkas**; 5 valid tetap (4 paling baru aktif + yang baru) |
| S4: batas per user | 60 baris milik user lain **utuh** |
| S5: 8 login serentak oleh satu user (12 ronde × 8 = 96 login per varian) | RR tanpa kunci 75/96 sukses; RR + `FOR UPDATE` 96/96 (23 retry); RC tanpa kunci 50/96; **RC + `FOR UPDATE` 96/96, 0 retry (dipilih)**; tanpa transaksi 96/96, 0 retry. **Sesi valid selalu tepat 5 pada semua varian** (integritas terjaga) |
| S6: purge | ≤ 100 baris per panggilan; **sesi valid semua user tidak berubah** (25 sebelum = sesudah); hanya baris lewat `purge_after` yang hilang. Purge bersifat **global** (membersihkan baris mati semua user) |
Konsekuensi respons: bila transaksi login gagal setelah retry → **login 503 (tidak ada sesi setengah jadi)**; bila batas 5 tercapai → perangkat yang paling lama tidak aktif keluar ("sesi berakhir, login ulang"); bila trim 50 gagal → transaksi rollback, login 503 (dicatat).

### 6.13.11 Alarm 100.000 baris: penerima dan prosedur
- **Pemicu:** total baris `auth_session` **atau** `auth_throttle` ≥ **50.000 (peringatan)** / **100.000 (alarm)**. Dihitung dari estimasi `information_schema.tables.table_rows` (murah, ±40%) paling sering tiap 10 menit di jalur login; keluaran log `[auth][ALARM]` dibatasi sekali per jam per proses. **Tidak ada penolakan login** (tanpa batas keras global).
- **Penerima — staging lokal:** **pemilik proyek/operator mesin lokal** (yang menjalankan aplikasi), melalui log server dan `npm run auth:status` (skrip baru saat implementasi: jumlah baris per tabel, per `kind`, 5 user teratas menurut jumlah baris (hanya id), baris terlama `purge_after`).
- **Penerima — produksi: BELUM DITETAPKAN → alarm ditandai BELUM SIAP PRODUKSI.** Belum ada nama/rotasi on-call, kanal notifikasi (email/chat/pager), jam layanan, atau SLA respons. Ini blokir produksi.
- **Prosedur respons (staging lokal; berlaku sebagai draf runbook):** (1) jalankan `auth:status`, tentukan tabel dan `kind`; (2) `auth_throttle` tumbuh → periksa laju login gagal di log; bila purge tidak mengalir (`purge_after < now` menumpuk) jalankan pembersihan manual berbatas `DELETE … LIMIT 1000` berulang; (3) `auth_session` tumbuh atau ada user dengan baris > 50 (seharusnya mustahil) → cabut semua sesi user itu (`revoked_reason='forced'`), atur ulang password lewat prosedur admin, dan periksa log login; (4) bila purge tidak berjalan → jalankan `verify-auth-store.sh` (hak `DELETE`) dan periksa disk; (5) catat kejadian dan penyebab di catatan operasi.

### 6.13.12 E1/E2/E3a: menguji izin tanpa kemungkinan menulis ke `kkisi_staging`
Semua lapisan di bawah terbukti pada container sekali-pakai dengan `kkisi_staging` tiruan berisi baris berid "nyata" 1–17 (sentinel: 17 baris, jumlah id 153 — identik sebelum dan sesudah semua uji).
| Lapisan | Mekanisme | Bukti |
|---|---|---|
| Akun | Data uji ditulis oleh **akun khusus `kkisi_e2e_seed`** dengan hak hanya `SELECT, INSERT, DELETE` pada `kkisi_e2e_legacy.*` (host terdeteksi); **bukan root**, bukan `kkisi_app` | Privilege-nya hanya pada skema itu; **ditolak** `INSERT/SELECT/DELETE` ke legacy, `UPDATE`, `CREATE/DROP/ALTER/TRUNCATE`, dan skema auth |
| DDL E1 | DDL legacy diambil struktur-saja (`SHOW CREATE TABLE`, 0 baris) lalu **dikualifikasi** menjadi `CREATE TABLE IF NOT EXISTS kkisi_e2e_legacy.<t>` dan dijalankan **tanpa database default** | DDL tak-terkualifikasi ke koneksi tanpa database default **gagal** ("No database selected") dan `kkisi_staging` tidak mendapat tabel apa pun; kejadian serupa muncul spontan saat seeding tiruan |
| Guard target | Sebelum pernyataan apa pun: nama harus `^kkisi_e2e_[a-z0-9_]{1,40}$`, ≠ `kkisi_staging`, akun terhubung = `kkisi_e2e_seed`, `DATABASE()` = target, dan tabel penanda `_e2e_marker` (`synthetic-only`) ada di target | Menolak `kkisi_staging`, `kkisi_auth_staging`, injeksi `…; DROP DATABASE …`, huruf besar, `kkisi_e2e_`, `mysql`, nama lain, dan kosong; menerima skema tiruan yang sah |
| Rentang ID (E3a) | Sebelum `DELETE`: baris di luar rentang sintetis `900001–900999` → **batal**; `DELETE` dalam **transaksi** yang dibandingkan sebelum/sesudah dan di-*rollback* bila ada kejanggalan | Baris berid 5 di skema tiruan → E3a **abort tanpa menghapus apa pun**; setelah dibuang, tepat 3 baris sintetis terhapus |
| Auth store (E3a) | `DELETE … WHERE user_id BETWEEN 900001 AND 900999` dalam transaksi + hitungan baris di luar rentang harus sama; batal bila legacy memuat id ≥ 900000 | 3 sesi sintetis terhapus, 2 sesi berid nyata dan sesi user 3 dan 12 **utuh**; id 900500 di legacy tiruan → pembersihan **menolak** |
**Cara pakai aman di staging sebenarnya:** E1 dijalankan root di dalam container dengan DDL terkualifikasi (tanpa database default); E2 dan E3a memakai `kkisi_e2e_seed` (DSN terpisah, tidak pernah root/`kkisi_app`); aplikasi e2e memakai `kkisi_e2e_read` dan `DATABASE_URL` ke skema tiruan; pelari tes menolak DSN yang nama databasenya bukan `kkisi_e2e_*`. Karena akun seed **secara fisik** tidak punya hak apa pun pada `kkisi_staging`, kesalahan skrip pun tidak dapat menulis ke sana. **E3b** (`DROP DATABASE`/`DROP USER` skema tiruan) memerlukan hak DDL (root) dan **tidak** dibuat/dijalankan tanpa izin tersendiri. Catatan: seed nyata harus menyertakan semua kolom NOT NULL legacy (mis. `cd_usr`, `nik_account`) — divalidasi di rehearsal E1/E2.

### 6.13.13 Risiko tersisa
1. **Skrip `setup`/`teardown` belum pernah dijalankan** (hanya sintaks, cek statis, fungsi murni, dan rehearsal SQL yang sama). Risiko: bug pada perekatan (deteksi host via Prisma, parsing `docker port`, penulisan env). Mitigasi: dry-run dulu; rekomendasi rehearsal skrip utuh pada salinan pohon terhadap container sekali-pakai sebelum `--apply`.
2. Host `172.17.0.1` adalah gateway bridge Docker Desktop saat ini; bila berubah (jaringan Docker diubah/runtime lain), login auth **gagal tertutup** sampai `setup` dijalankan ulang.
3. `kkisi_auth` menghapus di tabel bersama: E3a mengandalkan pemeriksaan rentang di aplikasi (hak DB tidak dapat dibatasi per baris).
4. Estimasi `table_rows` untuk alarm bisa meleset ±40%; hanya untuk peringatan, bukan penegakan.
5. Alarm produksi belum siap (penerima/kanal/prosedur on-call belum ada).
6. Purge global dan trim per-user berjalan pada jalur login; kegagalan keduanya **best-effort** (login tetap 503 hanya jika transaksi utama gagal).
7. `root@%` di container staging (pra-ada) tetap ada; akun `kkisi_read`/`kkisi_app` tetap `%` (tidak diubah).
8. Login serentak sangat tinggi oleh satu user tetap bisa memicu retry; batasnya 2 retry lalu 503.

### 6.13.14 Gerbang persetujuan berikutnya (terpisah; tidak ada yang berjalan otomatis)
```
G0. Rehearsal skrip setup/verify/teardown UTUH pada salinan pohon terhadap container sekali-pakai (bukan staging): SELESAI (6.13.15)
G1. Menjalankan `scripts/setup-auth-store.sh` tanpa --apply (dry-run; baca-saja terhadap staging): SELESAI, tidak ada perubahan (6.13.15)
G2. Menjalankan `scripts/setup-auth-store.sh --apply` (DDL 001 + akun/GRANT 002 di kkisi-staging): SELESAI (6.13.16)
G3. Transaksi login final (READ COMMITTED + FOR UPDATE + retry<=2 -> 503) diterima: YA (keputusan pengguna, sesi 2026-09-30); diterapkan dan diuji unit/kontrak + MariaDB sekali-pakai (6.14). Belum diuji: putus koneksi di tengah transaksi pada jaringan nyata.
G4. Alarm: penerima staging = pemilik proyek/operator lokal; produksi = BELUM SIAP: YA untuk staging lokal (diterapkan sebagai alarm log, 6.14); produksi/DEV TETAP BELUM SIAP (penerima belum ada, lihat 6.16 no. 9).
G5. Izin eksekusi E1 dan E2 (skema tiruan lokal, akun kkisi_e2e_seed/kkisi_e2e_read): YA, dijalankan setelah 2A bersama E3a (6.15). Hasil browser: 8 skenario lulus (313 request) dengan batas bukti di 6.15/6.17.
G6. Izin implementasi 2A (setelah G2): YA, lokal saja (6.14); tidak mencakup DEV, 2B, checkout, stok/limit.
E3b (teardown skema tiruan): TIDAK disetujui; butuh izin tersendiri. DITAHAN oleh pemilik (2026-09-30): tidak ada DROP, pencabutan akun, atau penghapusan berkas.
Gerbang A (E2E lokal): SELESAI dengan batas bukti (6.15, 6.17.2); residu E1 masih ada.
B0 (desain perubahan kode dan konfigurasi), Gerbang B (provisioning DEV), Gerbang C (rilis dan smoke test DEV): BELUM DISETUJUI; draf di 6.17 tidak memberi izin eksekusi. Fakta A1–C3 belum dikonfirmasi: keputusan TERTAHAN (6.17.7–6.17.8).
```


### 6.13.15 Hasil G0 dan G1 (2026-09-30)
**Status gerbang:** G0 selesai; G0-fix diterapkan; G1 (dry-run terhadap `kkisi-staging`) dijalankan; **G2 (`--apply`), provisioning, E1–E3, dan implementasi 2A belum disetujui dan belum dijalankan.**

**G0 — rehearsal skrip utuh (container sekali-pakai `kkisi-g0-rehearsal`, `127.0.0.1:3394`, salinan pohon dengan env acak sendiri; satu-satunya beda dari repo = nama container yang dikunci):**
- **Pengaman:** shim `docker` (hanya `inspect`/`port`/`exec`; memblokir semua panggilan yang menyebut `kkisi-staging` atau `3307` dan SQL berisi `DROP`); skrip berjalan dengan `env -i` dan menemukan env lewat `BASH_SOURCE`; nama container tidak dapat dioverride dari lingkungan. Tidak ada panggilan yang menyebut staging asli yang lolos; tidak ada DROP yang mencapai MariaDB.
- **Hasil:** dry-run tidak membuat skema/akun/secret; `--apply` membuat tepat 1 skema (2 tabel) dan 1 akun `kkisi_auth@172.17.0.1` dan lulus verifikasi; `verify` gagal sebelum dan lulus sesudah provisioning; `--apply` berulang tidak mengubah secret, `DATABASE_URL_AUTH`, sesi, maupun lock, dan tetap dapat login lewat jalur aplikasi; hak liar terdeteksi dan diperbaiki. 12 kegagalan prakondisi berhenti dengan pesan jelas tanpa perubahan; 5 kegagalan di tengah `--apply` (001 rusak, 002 rusak, legacy berubah, over-grant, proses dibunuh) meninggalkan keadaan parsial yang **terdeteksi verify** dan dipulihkan dengan menjalankan ulang `--apply` (secret yang sama dipakai ulang); kasus "legacy berubah" menghentikan skrip sebelum verify dan pemulihannya **sengaja manual**. Guard teardown menolak 34 kombinasi target/frasa/flag salah tanpa mengirim SQL; dry-run hanya membaca; dengan argumen benar guard lolos dan DROP hanya sampai ke shim (kontrol positif). 0 kebocoran secret.
- **Kejadian tes (sudah dilaporkan):** satu kali `verify-auth-store.sh` sempat berjalan terhadap staging asli karena trik `source` di harness (hanya SELECT; tidak ada perubahan; penyebab diperbaiki dengan `BASH_SOURCE`).

**Bug ditemukan:** `teardown-auth-store.sh` dengan `--host` yang **salah** (akun ada di host lain) tetap lolos guard dan mencapai `DROP DATABASE`. **Perbaikan (disetujui dan diterapkan ke repo, 2 baris):** bila akun `kkisi_auth` ada di host mana pun tetapi bukan di `--host`, berhenti dengan "wrong --host, refusing to drop anything"; bila tidak ada akun sama sekali (keadaan parsial) guard tetap lolos agar pemulihan bisa berjalan. **Uji ulang setelah patch** (salinan dibangun ulang dari repo): host salah → exit 1, tanpa upaya DROP, juga di dry-run; keadaan parsial → guard lolos dan DROP hanya sampai ke shim; 7/7 lulus; cek statis 19 butir lulus pada pohon repo. **Teardown tidak pernah dijalankan** pada staging.

**G1 — `scripts/setup-auth-store.sh` (tanpa `--apply`) terhadap `kkisi-staging`:** exit 0. Melaporkan: container `kkisi-staging` (3306/tcp hanya loopback), database `kkisi_auth_staging` belum ada, akun target `kkisi_auth@172.17.0.1` (terdeteksi dari jalur aplikasi, bukan `%`), objek legacy 328, dan 4 operasi yang akan dilakukan; "DRY RUN: nothing was changed". Sesudahnya snapshot baca-saja **identik**: database, akun (tidak ada `kkisi_auth*`/`kkisi_e2e*`), GRANT `kkisi_read`, jumlah objek 328, jumlah baris `db_users`/`db_sales`, waktu start container dan port, isi/mode/kunci `.env.local` dan `.env.staging` (md5 sama, tanpa berkas sementara), serta skrip repo. 0 kemunculan secret di keluaran.

**Batas uji (yang belum terbukti):** (1) `--apply` dan `teardown --execute` **belum pernah dijalankan pada staging asli**; rehearsal memakai container MariaDB 11.4 yang sama dan gateway `172.17.0.1` yang sama, tetapi legacy-nya tiruan (2 tabel), jadi perilaku terhadap 283 tabel/45 view hanya diperiksa lewat hitungan objek. (2) DROP nyata tidak pernah dijalankan (dicegat shim). (3) Rehearsal memakai salinan pohon yang hanya berbeda nama container; lolosnya nama-terkunci `kkisi-staging` pada `--apply` asli baru terbukti oleh G1 (dry-run) dan tidak oleh eksekusi tulis. (4) Runtime Docker lain/gateway berbeda → skrip gagal tertutup (teruji secara logika, bukan pada runtime lain). (5) Node dipilih dari PATH (bukan x64 v26 yang tidak cocok dengan mesin Prisma): skrip mengandalkan `node` yang sama dengan proyek — perlu dicatat di runbook.

**Gerbang berikutnya:** G2 `--apply` pada `kkisi-staging`; G5 E1/E2; G6 implementasi 2A; E3b tetap tidak disetujui.


### 6.13.16 Hasil G2 — provisioning auth store pada `kkisi-staging` (2026-09-30)
- **Dijalankan:** `scripts/setup-auth-store.sh --apply` satu kali; exit 0 pada percobaan pertama, tanpa kegagalan atau kondisi parsial. Prapemeriksaan: container `kkisi-staging`, port `127.0.0.1:3307`, legacy `kkisi_staging` (328 objek), host klien terdeteksi `172.17.0.1`, Node 22.23.0 arm64 (mesin Prisma darwin-arm64 termuat); dry-run diulang sebelum apply.
- **Hasil:** database `kkisi_auth_staging` (2 tabel InnoDB, kosong), akun `kkisi_auth@172.17.0.1` dengan hak persis rancangan (SELECT/INSERT/DELETE + UPDATE per-kolom, `MAX_USER_CONNECTIONS 10`). `verify-auth-store.sh`: 20 PASS, 0 FAIL, dijalankan di dalam apply dan mandiri. Uji hak lewat jalur aplikasi: `kkisi_auth` dapat operasi 2A (dalam transaksi yang di-rollback; tabel kembali kosong) dan **ditolak** SELECT/INSERT/UPDATE/DELETE ke legacy, DDL, GRANT, `mysql.*`, serta mengubah `user_id`/`pwf`/`abs_expires_at`; `kkisi_read` ditolak ke skema auth, tetap SELECT-only di legacy.
- **Tidak berubah:** 328 objek legacy, jumlah baris acuan (users 12, sales 230.846, items 20.498, anggota 9.276, salesitems 746.767, payments 229.445), checksum 7 tabel referensi, GRANT `kkisi_read`/`kkisi_app`. Perbedaan snapshot hanya database dan akun baru.
- **Env:** `.env.local` +1 baris (`DATABASE_URL_AUTH`, `connection_limit=8`), `.env.staging` +1 baris (`MARIADB_AUTH_PASSWORD`, 48 heksa); semua baris lama identik; mode 600; tanpa berkas sementara; keduanya di-gitignore; 0 kebocoran secret pada keluaran.
- **Pemulihan (bila diperlukan nanti):** jalankan ulang `--apply` (idempoten; secret dipakai ulang) hanya atas instruksi; kembali ke keadaan awal = `teardown-auth-store.sh` (belum disetujui). Cadangan env sebelum apply ada di scratch sesi (mode 600).
- **Belum:** implementasi 2A (G6), E1/E2 (G5), teardown, deployment DEV.


### 6.14 Hasil implementasi 2A lokal (2026-09-30) dan Gerbang A

**Status:** 2A diimplementasikan dan diuji **lokal** (loopback). 2B, checkout, stok/limit, E1/E2/E3a, dan deployment DEV **belum** dilakukan. Keputusan yang diterapkan: G3 (`READ COMMITTED` + `FOR UPDATE`, retry ≤ 2 pada 1213/1205/P2034, lalu 503), G4 (alarm log untuk operator lokal: peringatan 50.000 / alarm 100.000 baris, tanpa penolakan login; produksi belum siap), G6 (implementasi lokal).

**Yang dibangun** (`kkisi.web/`): domain (`src/domain/auth/*`), use case (`src/application/auth/*`, `src/application/pos/use-cases/read-register.usecase.ts`), infrastruktur (`src/infrastructure/auth/*`: config, HKDF/CSRF, origin, cookie, IP, worker bcrypt, store sesi dan throttle, repository legacy baca-saja, guard, handler, container, page-guard), rute (`/api/auth/{login,logout,session,company}`, `/api/pos/{register,products}`), `src/proxy.ts` (gerbang awal saja), halaman `/login` dan `/pos` terlindungi, `SessionControls`, `scripts/auth-unlock.ts`, `scripts/auth-status.ts`, aturan ESLint, `dev`/`start` bind `127.0.0.1`. `POS_COMPANY_ID` dihapus. Dependency baru: `bcryptjs@3.0.3`.
**Deviasi dari rancangan 6.12.7 (disengaja):** klien Prisma auth = **instance kedua kelas `PrismaClient` yang sama** dengan `DATABASE_URL_AUTH` (pool dan akun sendiri, SQL mentah terparameter), bukan `prisma/auth.prisma` dengan klien yang digenerate ke `src/generated`: auth store tidak memakai model, dan klien tergenerate di luar `node_modules` berisiko pada build Next.

**Hasil uji:** `npm test` 107 lulus / 0 gagal / 16 dilewati (opt-in); dengan MariaDB sekali-pakai (DDL/GRANT final, legacy nyata-struktur + data sintetis): 118 lulus / 0 gagal, termasuk kontrak store yang sama dijalankan pada fake dan MariaDB nyata, 100 kegagalan throttle paralel = tepat 100, 8 login serentak = 8 sukses dan tepat 5 sesi valid, full-stack login/sesi/register/cabang/logout-setelah-restart/lockout. Tes kegagalan: koneksi mati, retry habis (1213/1205/P2034 → 3 percobaan → 503), pool penuh (1226), verifier penuh dan timeout, tiap dependency mati → 503 di setiap rute. Browser (Playwright, aplikasi terbangun + DB sekali-pakai, identitas sintetis): 6 skenario lulus (anonim, kasir satu cabang, IDOR cabang, cookie HttpOnly/Lax, CSRF, logout persisten dengan replay id lama, cabang role 2, lockout, layout 5 lebar). Konfigurasi tidak aman (origin publik/LAN, secret hilang/pendek, DSN legacy penulis, DSN auth non-lokal) → login 503 dan `/pos` menampilkan halaman "tidak tersedia". Konfigurasi asli boot normal (`/login` 200, `/pos` 307, API 401, POST tanpa Origin 403) dan tidak menulis apa pun ke auth store. `npx eslint`, `tsc`, `prisma validate`, `next build` bersih. Tes katalog staging baca-saja: 5/5.
**Bukan bagian bukti:** login akun nyata (dilarang), `npm audit` (endpoint audit npm gagal dijangkau), staging asli tidak pernah dipakai untuk uji tulis.

**Gerbang A — rancangan E2E lokal (belum dijalankan; butuh persetujuan terpisah E1, E2, E3a; E3b tidak disetujui):**
| Item | Rancangan |
|---|---|
| Target | container `kkisi-staging`, `127.0.0.1:3307`; skema baru `kkisi_e2e_legacy` (latin1) **terpisah** dari `kkisi_staging` dan `kkisi_auth_staging` |
| E1 (DDL/GRANT) | 8 tabel struktur-saja hasil `SHOW CREATE TABLE` (db_users, db_roles, db_permissions, db_company, db_kasir, db_buka_kasir, db_items, db_category) + `_e2e_marker`, DDL terkualifikasi `kkisi_e2e_legacy.<t>`, dijalankan root tanpa database default; akun `kkisi_e2e_seed@<host terdeteksi>` (SELECT/INSERT/DELETE **hanya** skema itu) dan `kkisi_e2e_read@<host>` (SELECT hanya skema itu); tidak ada hak pada `kkisi_staging`/auth |
| E2 (data) | 7 user `synth_*` (id 900001–900007; hash bcrypt `$2y$` dibuat saat runtime, password acak di berkas mode 600), 4 cabang sintetis (1 nonaktif), 4 role (role 3 nonaktif), izin `sales_add`/`master_kasir`, kasir, 3 register (terbuka, terbuka cabang lain, basi), 4 item berharga pecahan/diskon; tanpa data nyata |
| Aplikasi e2e | proses terpisah di port 3100 dengan `DATABASE_URL` → `kkisi_e2e_legacy` (akun `kkisi_e2e_read`) dan **auth store nyata** `kkisi_auth_staging` (sesi/throttle sintetis, `user_id ≥ 900001`) |
| E3a (cleanup) | hanya baris sintetis: `kkisi_e2e_legacy` diperiksa dulu (nama `^kkisi_e2e_`, tabel penanda, akun seed, id di luar 900001–900999 = batal) lalu `DELETE` dalam transaksi; auth store: `DELETE ... WHERE user_id BETWEEN 900001 AND 900999` dalam transaksi + hitungan baris di luar rentang harus sama; batal bila legacy asli memuat id ≥ 900000. Diuji pada container sekali-pakai (6.13.12) |
| Tidak mungkin menulis ke `kkisi_staging` karena | akun seed/e2e secara fisik tanpa hak; nama target dikunci; DDL terkualifikasi tanpa database default; guard target + marker; rentang id; sentinel legacy sebelum/sesudah |
| E3b | `DROP DATABASE kkisi_e2e_legacy; DROP USER ...` — **tidak disetujui**, izin tersendiri |

**Fase 2 (DEV) — fakta topologi yang HARUS diisi pemilik (tidak boleh diasumsikan; Gerbang B/C belum terbuka):** (1) tempat Next.js berjalan, jumlah instance, versi Node (klaim "butuh Node ≥ 22" di sini **tanpa sumber**, lihat 6.17.6; mesin Prisma `linux-*` harus digenerate untuk OS target); (2) domain, HTTPS dan terminasi TLS; (3) reverse proxy, apakah menimpa `X-Forwarded-For`, jumlah hop (`TRUSTED_PROXY_HOPS`); (4) lokasi MariaDB DEV, versi, apakah terpisah dari produksi, jaringan dan TLS; (5) penyimpanan persisten dan pengelola secret (`AUTH_SECRETS`, `DATABASE_URL_AUTH`), backup, rotasi; (6) cara membatasi akses DEV (VPN/IP allowlist/basic auth); (7) penerima alarm dan on-call. *(Penomoran (1)–(7) ini ringkasan lama; nomor yang berlaku untuk fakta DEV adalah 12 butir di 6.16.)* **Perubahan kode yang pasti dibutuhkan untuk DEV** (belum dikerjakan; desainnya diputuskan di B0, penerapannya di DEV butuh izin Gerbang B, lihat 6.17.4 dan 6.17.8): pelonggaran terkontrol guard loopback `APP_ORIGIN`/DSN (kini sengaja menolak non-loopback), pembatasan host akun auth (bukan `172.17.0.1`), worker bcrypt untuk build `standalone`, dan pilihan store throttle bila > 1 instance.


### 6.15 Hasil Gerbang A — E2E lokal dengan identitas sintetis (2026-09-30)

**Yang dijalankan (disetujui: E1, E2, E3a; E3b tidak):** pada `kkisi-staging` (`127.0.0.1:3307`) — E1: skema `kkisi_e2e_legacy` (8 tabel struktur-saja + `_e2e_marker`), akun `kkisi_e2e_seed@172.17.0.1` (SELECT/INSERT/DELETE **hanya** skema itu) dan `kkisi_e2e_read@172.17.0.1` (SELECT hanya skema itu); E2: 7 user `synth_*` (id 900001–900007, hash `$2y$` dibuat saat runtime, password acak di `.e2e-fixture.json` mode 600), cabang 9001–9004, role 1–4, izin, kasir, 3 register, 6 item; E3a: hapus semua baris sintetis dan sesi/kunci throttle sintetis. **Tidak ada `DROP`** dan tidak ada tulis ke `kkisi_staging`. Skrip: `scripts/e2e-setup.sh`, `e2e-seed.mjs`, `e2e-cleanup.mjs`, `e2e-guards.mjs`, `e2e-timewarp.sh`, `e2e-run.sh`; DDL/GRANT: `db/e2e/`; tes: `tests/pos-browser.mjs`, `tests/e2e-local.mjs`. Skrip dilatih dulu pada container sekali-pakai (36/36, termasuk 5 guard E3a dan baris asing yang harus selamat) sebelum dijalankan pada staging.
**Pra-E1:** container, port, tiga nama database (`kkisi_e2e_legacy` belum ada), GRANT, 328 objek legacy, jumlah baris 18 tabel utama, checksum 7 tabel referensi, agregat `db_items`, `MAX(db_users.id)=17`, auth store 0/0 — snapshot identik saat E1 dijalankan.
**Hasil browser (aplikasi terbangun pada `127.0.0.1:3100`, legacy = `kkisi_e2e_legacy` lewat `kkisi_e2e_read`, auth store nyata):** `pos-browser` 6 skenario lulus; `e2e-local` 8 skenario lulus (313 request): (A) akses anonim ditolak dan tanpa cookie; (B) katalog cabang sesi: harga pecahan Rp 4.000,10 dan total Rp 10.000,10 tepat, diskon nominal, item tanpa harga tak bisa ditambah, item stok 0 hanya di pencarian, filter kategori di server, barcode cabang lain tidak ditemukan, checkout tetap nonaktif; (C) idle dan absolut expiry pada sesi nyata (tenggat sintetis digeser ke masa lalu), login ulang berfungsi, POS keluar sendiri saat sesi berakhir; (D) throttle: username fiktif, role nonaktif dan password salah tak terbedakan, kunci di 10 gagal, `auth:unlock` terarah membuka tepat satu username; (E) CSRF dari halaman lintas-situs sungguhan: fetch JSON diblokir browser, form POST ditolak, sesi korban dan cabangnya tidak berubah; (F) izin dicabut → 403 seketika, **tanpa bypass administrator**, cabang dihapus → 401, user dihapus → 401 dan hidup lagi bila baris kembali, password diganti → semua sesi mati dan tetap mati; (G) auth store tak terjangkau dan kredensial legacy salah → 503 di semua rute, `/pos` hanya menampilkan "Layanan tidak tersedia", tanpa detail koneksi; (H) tidak ada request checkout/stok/penjualan/pembayaran/keranjang/buka-tutup kasir; semua request tulis yang teramati = `POST /api/auth/{login,logout,company}`.
**Insiden selama uji (semua di skema sintetis, sudah dipulihkan):** pemulihan baris `db_company` 9001 gagal pada run F pertama (kolom NOT NULL tanpa default) sehingga baris itu sempat hilang; dipulihkan manual dari nilai seed dan diverifikasi sama dengan seed sebelum run ulang; tes diperbaiki (`sql_mode=''` pada restore). Beberapa run gagal lebih awal karena asumsi tes (logout anonim = 200 idempoten, prefetch RSC `GET /?_rsc=`, race filter) — bukan cacat aplikasi. Kunci throttle sintetis direset dengan `auth:unlock` terarah antar-run.
**E3a:** `E3a done`: legacy sintetis 7 user/4 cabang/4 role/7 izin/2 kasir/3 register/2 kategori/6 item terhapus; auth store 43 sesi (semua `user_id` 900002–900005, 0 di luar rentang) dan 5 kunci throttle terhapus; baris asing tersisa 0/0 (memang kosong sebelumnya). Setelah itu: auth store **0/0**, 8 tabel e2e kosong, marker tetap ada; E3a diulang → 0 baris (idempoten).
**`kkisi_staging` dan data acuan identik dengan pra-E1:** 328 objek, hash nama tabel, jumlah baris 18 tabel, checksum 7 tabel referensi, agregat item, `MAX(id)`, GRANT `kkisi_read`/`kkisi_app`/`kkisi_auth`. Satu-satunya perbedaan snapshot = residu E1 di bawah.
**Perubahan DB yang masih tertinggal (E1; E3b tidak disetujui):** database `kkisi_e2e_legacy` (9 tabel kosong termasuk `_e2e_marker`) dan akun `kkisi_e2e_seed@172.17.0.1` serta `kkisi_e2e_read@172.17.0.1`. Berkas lokal git-ignored: `.env.e2e` (URL dua akun e2e, mode 600) dan `.e2e-fixture.json` (password user sintetis yang kini tak cocok baris mana pun).
**Risiko tersisa:** (1) request yang dibuat lewat API context Playwright tidak masuk daftar bukti request (bukti H mencakup request yang diinisiasi halaman; ketiadaan rute checkout/stok juga terbukti statis lewat pemindai dan tidak adanya rute itu di build); (2) uji expiry memakai penggeseran tenggat oleh root pada baris sintetis, bukan menunggu 2/12 jam; logika waktu sendiri teruji unit dengan jam palsu; (3) uji kegagalan DB memakai instance dengan DSN salah/tak terjangkau, bukan mematikan container (agar staging tak terganggu); (4) HTTPS/`__Host-`/`Secure` dan proxy tepercaya tetap belum pernah dijalankan (loopback HTTP saja); (5) proses `next dev` milik pengguna pada `127.0.0.1:3000` berjalan dengan konfigurasi asli dan tidak disentuh; (6) residu E1 menunggu izin E3b.

### 6.16 Fakta topologi DEV yang BELUM tersedia (tidak boleh ditebak; guard loopback tidak diubah)
Rencana DEV (Gerbang B/C) belum boleh disusun sampai pemilik mengisi ini. (Draf bersyarat atas permintaan pemilik ada di 6.17 dan formulir pengumpulan fakta di 6.17.7; keduanya tidak membuka B0/B/C.) Tidak satu pun diasumsikan sama dengan MacBook atau tersedia di cPanel.
| # | Fakta yang dibutuhkan | Mengapa menentukan |
|---|---|---|
| 1 | Tempat Next.js berjalan (VM/kontainer/PaaS/serverless/cPanel Node), jumlah instance, versi Node dan OS/arsitektur | Mesin Prisma yang digenerate, worker bcrypt (string eval bergantung `node_modules` di cwd), `standalone` vs `next start`, store throttle/sesi bersama bila > 1 instance |
| 2 | Domain DEV, sertifikat/HTTPS dan siapa yang terminasi TLS | `APP_ORIGIN`, cookie `__Host-`/`Secure`, `sec-fetch-site`; guard loopback perlu diganti kebijakan terkontrol |
| 3 | Reverse proxy/CDN: ada/tidak, menimpa `X-Forwarded-For` atau tidak, jumlah hop | `TRUSTED_PROXY_HOPS`, aktifnya throttle per-IP/pair; tanpa itu hanya kunci per-username |
| 4 | MariaDB DEV: host, versi, apakah terpisah dari produksi dan dari DB Docker MacBook, jaringan dan TLS koneksi, siapa admin | Target DDL/GRANT, host akun (bukan `172.17.0.1`), sumber data legacy DEV (salinan? sintetis?) |
| 5 | Sumber data legacy untuk DEV: salinan produksi yang dianonimkan, atau data sintetis | Kebijakan data pribadi; `kkisi_read` atas data apa |
| 6 | Penyimpanan persisten, backup dan retensi untuk auth store | Prosedur pemulihan, RPO/RTO |
| 7 | Pengelola secret (`AUTH_SECRETS`, `DATABASE_URL_AUTH`, `DATABASE_URL`) dan jadwal rotasi | Rotasi kunci, akses siapa |
| 8 | Cara membatasi akses DEV: VPN, allowlist IP, basic auth di proxy, SSO | Kebijakan akses; endpoint auth/POS tidak boleh publik |
| 9 | Penerima alarm dan on-call (`ALARM_store_rows`, `auth_status`), kanal, jam layanan | Alarm produksi/DEV belum siap tanpa ini |
| 10 | Monitoring/log: ke mana log aplikasi dikirim, retensi, siapa yang membaca | Log auth hanya berisi kode aman, tapi tujuan dan retensinya perlu diputuskan |
| 11 | Proses deploy dan rollback (CI/CD, artefak, migrasi skema auth), zona waktu server | Rencana rilis; `Asia/Bangkok` untuk stale-register bergantung jam DB/app |
| 12 | Keputusan tindak lanjut residu E1 (`kkisi_e2e_*`): pertahankan untuk uji berulang atau E3b | E3b butuh izin tersendiri |

### 6.17 Asesmen kesiapan DEV dan draf Gerbang B/C (2026-09-30; hanya dokumen)

**Status.** Ini asesmen dan **draf**, bukan izin eksekusi. Persetujuan atas draf tidak membuka B0, Gerbang B, atau Gerbang C; setiap tindakan bertanda ◆ butuh persetujuan eksplisit tersendiri yang menyebut target dan daftar objek. Bab 6.16 menyatakan rencana DEV belum boleh disusun sebelum pemilik mengisi fakta topologi; draf ini disusun atas permintaan pemilik dan **bersyarat**: seluruh isinya gugur bila jawaban pemilik bertentangan. Tidak ada kode, konfigurasi, DB, akun, secret, atau lingkungan DEV yang diubah untuk menyusun bab ini; tidak ada perintah operasional DEV yang ditulis; guard loopback tidak dilonggarkan. Satu snapshot baca-saja atas `kkisi-staging` lokal dijalankan untuk memastikan residu E1 (hasil di 6.17.1). **Revisi 2026-10-01 (hanya dokumen):** temuan F1–F9 diperbaiki, daftar di 6.17.9; status Gerbang A tidak diubah.

#### 6.17.1 Rekonsiliasi laporan Gerbang A dengan bukti

| Klaim (6.15) | Status | Dasar |
|---|---|---|
| `e2e-local` 8 skenario (A–H) lulus, 313 request | **Terverifikasi** | Berkas run akhir di scratchpad sesi memuat `{"result":"PASS","requests":313}` dan daftar skenario A–H |
| `pos-browser` 6 skenario lulus | **Klaim belum diverifikasi dari berkas** | Keluarannya tidak ada di berkas scratchpad yang diperiksa; hanya di keluaran percakapan |
| Enam run e2e sebelumnya gagal karena asumsi tes/insiden restore | **Terverifikasi sebagian** | Enam berkas run gagal ada; satu berkas (run 2) tidak memuat baris galat yang cocok pola pencarian, perlu dibaca manual |
| `kkisi_staging` identik dengan pra-E1 (328 objek, jumlah baris, GRANT, auth store 0/0) | **Terverifikasi** | Baris kunci snapshot pra-E1 dan pasca-E3a identik; snapshot live baca-saja (2026-09-30) juga identik dengan pasca-E3a, jadi tidak ada perubahan sejak Gerbang A |
| Checksum 7 tabel acuan, agregat `db_items`, `MAX(id)=17` tidak berubah | **Klaim belum diverifikasi ulang** | Ada di snapshot tersimpan; hanya baris kunci yang dibandingkan pada asesmen ini |
| E3a menghapus 43 sesi (user 900002–900005), 5 kunci throttle, dan baris sintetis | **Klaim belum diverifikasi dari berkas** | Angka historis hanya di keluaran percakapan; kondisi akhir auth store 0/0 terverifikasi |
| Rehearsal G0 36/36 | **Terverifikasi** | Berkas log rehearsal memuat `36 passed, 0 failed` |
| Residu E1 masih ada | **Terverifikasi (live, baca-saja)** | Database `kkisi_e2e_legacy` ada; 2 akun e2e ada; auth store 0/0 |
| Tidak ada request checkout/stok | **Terverifikasi dengan batas** | Hanya request yang dipantau Playwright; lihat 6.17.2 no. 4. Ketiadaan rute checkout/stok di build juga dibuktikan statis (6.15) |

**Asumsi (bukan bukti):** perilaku di belakang proxy nyata; perilaku cookie `__Host-`/`Secure` di HTTPS; portabilitas terhadap Node/OS target; anggapan bahwa akun/host `172.17.0.1` berlaku di lingkungan lain (tidak berlaku).

**Ketidaksesuaian yang dilaporkan, tidak dipilih diam-diam:**
1. Daftar periksa 6.13.14 semula memuat G3–G6 sebagai "ya/tidak" walau sudah diputuskan/dilaksanakan; sudah diselaraskan pada 2026-09-30 berdasarkan 6.14/6.15 dan keputusan pengguna (kini L936–939).
2. Versi Node: dua klaim berbeda cakupan dan sumber (README 20.9+; 6.14 L993 ≥ 22 tanpa sumber, bukan 6.16 no. 1 seperti tertulis semula), dan 2A hanya diuji pada Node 22.23 arm64. Rincian dan koreksi atribusi di 6.17.6; tidak ada minimum runtime baru yang ditetapkan.
3. Mesin Prisma yang ter-generate darwin-arm64; target DEV belum diketahui.

#### 6.17.2 Batas bukti Gerbang A
1. HTTPS, cookie `__Host-kkisi_sid`, atribut `Secure`, dan proxy **belum diuji** (semua uji HTTP loopback; jalur itu hanya teruji tingkat unit).
2. Kedaluwarsa idle 2 jam / absolut 12 jam diuji dengan **menggeser tenggat** baris sintetis oleh root, bukan menunggu waktu sungguhan atau menguji perilaku browser.
3. Kegagalan DB diuji dengan **DSN salah/instance tak terjangkau**; bukan putus koneksi di tengah transaksi pada jaringan nyata.
4. Pemantauan request Playwright **tidak mencakup request API context**; bukti H berlaku untuk request yang diinisiasi halaman.
5. **Residu E1 masih ada:** skema `kkisi_e2e_legacy` (9 tabel kosong termasuk `_e2e_marker`), akun `kkisi_e2e_seed@172.17.0.1` dan `kkisi_e2e_read@172.17.0.1`, serta berkas lokal git-ignored `.env.e2e` dan `.e2e-fixture.json`.

#### 6.17.3 Matriks fakta DEV (numbering sama dengan 6.16; semua **belum diketahui**)
Nilai: **belum diketahui** untuk seluruh baris. Tidak ada nilai yang diturunkan dari staging, localhost, nama lingkungan, atau hosting produksi lama (Niagahoster, `docs/migration/kkisi-cpanel-sshkeys.md`; itu produksi, bukan DEV). Jawaban pemilik A1–C3 belum ada dan akan diisi bersama pengelola infrastruktur.

| # (6.16) | Fakta | Risiko bila belum diketahui | Keputusan/kontrol yang diperlukan |
|---|---|---|---|
| 4 | MariaDB DEV: host, versi, isolasi dari produksi dan dari Docker MacBook, TLS koneksi, admin | Provisioning ke DB yang salah; guard "DSN lokal" tak dapat dipakai; akun terikat `172.17.0.1` tak berlaku | DB DEV terpisah; daftar host/DB yang diizinkan eksplisit; host akun dari jalur aplikasi nyata, tidak `%` |
| 5 | Sumber data legacy DEV | Data pribadi anggota di lingkungan yang lebih longgar; data usang atau tidak representatif | Putusan: salinan teranonimkan atau sintetis; pemilik data dan retensi |
| 2 | Domain, TLS, terminasi TLS | Cookie `__Host-`/`Secure` dan CSRF (Origin = `APP_ORIGIN`) tak bisa dikonfigurasi; cookie bisa terkirim lewat HTTP | Satu origin HTTPS tetap; ganti guard loopback dengan allowlist eksplisit (B0) |
| 3 | Reverse proxy/CDN, penimpaan `X-Forwarded-For`, jumlah hop | Header klien lolos (terbukti pada `next start`); throttle bisa dilewati atau semua pengguna berbagi satu IP | `TRUSTED_PROXY_HOPS` pasti; uji header palsu setelah proxy nyata |
| 8 | Pembatasan akses DEV (VPN/allowlist/basic auth/SSO) | Endpoint auth/POS terbuka ke publik | Pembatasan jaringan aktif sebelum aplikasi menerima login |
| 7 | Pengelola secret dan jadwal rotasi | Secret tercecer; rotasi `AUTH_SECRETS` tak terencana | Mekanisme penyimpanan dan akses terdefinisi; prosedur rotasi |
| 6 | Penyimpanan persisten, backup, retensi auth store | Sesi/throttle hilang atau tak terpulihkan; RPO/RTO tak jelas | Snapshot sebelum DDL; prosedur restore teruji |
| 11 | Proses deploy dan rollback, zona waktu server | Rilis tak dapat dibatalkan; `Asia/Bangkok` untuk register basi bergantung jam DB/app | Artefak versi tetap, build sebelumnya dapat dipulihkan |
| 9 | Penerima alarm/on-call | Alarm 50.000/100.000 baris dan 503 tak terlihat; alarm DEV/produksi belum siap (G4) | Penerima dan kanal ditetapkan, atau alarm ditandai belum siap |
| 10 | Tujuan log dan retensi | Kegagalan auth tak terpantau; retensi tak jelas | Tujuan, retensi, pembaca log |
| 1 | Runtime Next.js, jumlah instance, Node, OS/arsitektur | Mesin Prisma dan worker bcryptjs belum teruji di platform itu; multi-instance mengubah asumsi | Versi Node dan platform dipin; build di platform yang sama |
| 12 | Tindak lanjut residu E1 | Akun/skema e2e tertinggal | Keputusan pemilik: **ditahan** (D1 2026-09-30) |

Kontrol lintas-baris yang diperlukan tetapi bukan fakta: nama pemberi persetujuan Gerbang B dan C.

#### 6.17.4 Draf Gerbang B dan C (bersyarat; tanpa perintah operasional)
**B0 — desain perubahan kode dan konfigurasi untuk DEV (belum dikerjakan, belum disetujui).** B0 hanya **desain**: persetujuan desain bukan izin mengubah kode atau konfigurasi dan bukan izin menerapkannya; mengubah kode butuh izin tersendiri, menerapkannya ke DEV butuh izin Gerbang B. Cakupan desain (dari 6.14 L993): (a) pengganti guard loopback: `APP_ORIGIN` loopback, kedua DSN lokal, host akun `172.17.0.1`, dan bind `127.0.0.1` kini membuat DEV non-lokal mustahil, penggantinya harus allowlist eksplisit, bukan penghapusan guard; (b) pembatasan host akun auth; (c) worker bcrypt untuk build `standalone` bila dipakai; (d) pilihan store throttle bila lebih dari 1 instance. Jawaban yang wajib untuk mendesain B0: A1, A2, B1 (dan A3 untuk ada/tidaknya proxy). Bila belum tersedia, keputusan B0 **tertahan**; tidak diisi asumsi.

**Gerbang B — provisioning DEV** (hanya setelah fakta dan izin operasional lengkap; izin tersendiri)
- Prasyarat: fakta 1, 4, 5, 2, 8, 7, 6, 9 terisi dan tercatat (fakta 1 ditambahkan: host akun auth bergantung pada alamat asal koneksi aplikasi, 6.14 L993); pemberi persetujuan ditetapkan; desain B0 disetujui dan perubahan kode/konfigurasi yang diperlukan sudah dikerjakan dengan izin tersendiri; snapshot/backup DB DEV ada dan pemulihannya terbukti.
- Tindakan yang kelak butuh persetujuan eksplisit ◆: membuat skema auth store DEV; membuat akun DB hak minimum (akun baca legacy hanya SELECT, akun auth terpisah tanpa tulis ke tabel legacy); memuat data legacy sesuai putusan fakta 5; menyimpan secret di pengelola secret; menerapkan konfigurasi hasil B0 ke DEV (mengubah kode adalah izin tersendiri di B0).
- Lulus: skema dan akun persis sesuai daftar objek yang disetujui; verifikasi hak positif dan negatif lulus; tidak ada akun aplikasi yang dapat menulis tabel legacy; secret tidak ada di log/repo; restore snapshot teruji.
- Gagal (berhenti, lapor, jangan ulang otomatis): target berbeda dari yang disetujui; hak berlebih; host akun tak sesuai; data pribadi terbawa di luar putusan.
- Bukti yang disimpan: snapshot sebelum/sesudah (objek, jumlah baris, GRANT), keluaran verifikasi dengan secret disamarkan, daftar objek dibuat, waktu, persetujuan tertulis.
- Rollback: restore snapshot; teardown terpisah dengan konfirmasi target; tidak ada `DROP`/pencabutan tanpa izin dan daftar objek terdampak.

**Gerbang C — rilis dan smoke test DEV** (hanya setelah Gerbang B lulus dan ada izin tersendiri)
- Prasyarat: Gerbang B lulus; identitas uji DEV diputuskan (6.17.5); fakta 1, 2, 3, 8, 10, 11 terisi; akses DEV dibatasi di lapisan jaringan; rencana uji HTTPS/`__Host-`/`Secure`/proxy siap; pemantauan mencakup request API context (menutup batas 6.17.2 no. 4).
- Tindakan yang kelak butuh persetujuan eksplisit ◆: deploy build; mengaktifkan `TRUSTED_PROXY_HOPS`; membuka URL DEV bagi pengguna tertentu; menentukan dan memakai identitas uji DEV (keputusan terbuka, 6.17.5).
- Lulus (smoke test tanpa checkout, tanpa operasi stok, tanpa 2B): login/logout dan RBAC; batas cabang; role nonaktif ditolak; CSRF lintas situs ditolak; cookie `__Host-` + `Secure` teruji lewat HTTPS nyata; `X-Forwarded-For` palsu tidak menggeser IP terpercaya; kegagalan DB = 503; akses anonim ditolak; katalog sesuai cabang.
- Gagal: cookie tanpa `Secure` di HTTPS; header palsu dipercaya; akses tanpa login tembus; ada penulisan ke tabel legacy.
- Bukti yang disimpan: URL DEV, hasil smoke test, bukti pemantauan penuh termasuk API context, log akses tanpa secret, versi build.
- Rollback: kembalikan build sebelumnya; cabut akses DEV; cabut sesi lewat auth store.

#### 6.17.5 E3b dan risiko terbuka
**E3b: ditahan** (keputusan pemilik 2026-09-30): tidak ada `DROP`, pencabutan akun, atau penghapusan berkas. Bila kelak diminta, daftar objek terdampak: skema `kkisi_e2e_legacy` (9 tabel kosong termasuk `_e2e_marker`); akun `kkisi_e2e_seed@172.17.0.1` dan `kkisi_e2e_read@172.17.0.1`; berkas lokal `.env.e2e` dan `.e2e-fixture.json`.

Risiko terbuka: (1) seluruh topologi DEV belum diketahui sehingga keamanan proxy/TLS/IP hanya asumsi; (2) guard loopback menghalangi DEV dan pelonggarannya berisiko; (3) sumber data legacy DEV belum diputuskan; (4) alarm DEV/produksi belum siap; (5) residu E1 tertinggal; (6) klaim Node ≥ 22 tanpa sumber vs syarat dependensi 20.9 (6.17.6); (7) portabilitas Prisma/bcryptjs ke platform target belum diuji; (8) identitas uji DEV belum diputuskan.

**Keputusan terbuka: identitas uji DEV.** Belum ditetapkan identitas apa yang dipakai untuk smoke test DEV. Belum ada akun nyata yang dipilih, belum ada akun sintetis yang dibuat, dan belum ada rencana penulisan ke data legacy. Keputusan ini tidak boleh diambil sebelum sumber data DEV (B2) dan otorisasi pemilik data jelas. Di Gerbang A identitas sintetis berada di skema tiruan terpisah; itu tidak otomatis berlaku untuk DEV, dan akun aplikasi tidak boleh menulis tabel legacy (kriteria lulus Gerbang B).

**Pertanyaan terbuka A1–C3:** didefinisikan mandiri di 6.17.7; belum dikonfirmasi; dijawab bersama pengelola infrastruktur sebelum keputusan B0, B, atau C. Semua fakta dipertahankan sebagai "belum diketahui".

#### 6.17.6 Versi Node: syarat dependensi, klaim dokumen, platform teruji (koreksi atribusi 2026-10-01)
| Kategori | Isi | Sumber / status |
|---|---|---|
| Syarat dependensi | Next 16.3.7 `engines.node >=20.9.0`; `prisma` dan `@prisma/client` 6.12.0 `>=18.18`; `bcryptjs` 3.0.3 tanpa `engines`; `@types/node ^22` hanya definisi tipe | `kkisi.web/package-lock.json`; **terverifikasi** 2026-10-01 |
| Pin versi di repo | `package.json` tanpa `engines`; tidak ada `.nvmrc`, `.node-version`, `.tool-versions`, Dockerfile, atau konfigurasi CI | **terverifikasi** (pencarian berkas) |
| Klaim dokumen 1 | README L7: "Requires Node.js 20.9+ (Node 22 recommended)" | Tidak berubah sejak commit awal `d97099a`; selaras dengan `engines` Next. README tidak diubah di revisi ini |
| Klaim dokumen 2 | 6.14 L993: "aplikasi butuh Node ≥ 22" | **Tanpa sumber** di dokumen. Atribusi sebelumnya ke "bab 6.16 no. 1" keliru: 6.16 no. 1 tidak menyebut versi minimum |
| Platform teruji | Node 22.23.0 arm64 (macOS) saja | Tercatat di 6.14/6.17.1; tidak ada bukti uji pada Node 20.x, Node ≥ 24, maupun Linux |
| Pengamatan belum diverifikasi | Skrip npm dan skrip lokal memakai `--experimental-strip-types` dan `--env-file`; dugaan bahwa flag itu mensyaratkan Node 22 ke atas **belum diverifikasi** | Kalaupun benar, menyangkut alat uji/operasi, bukan syarat runtime `next start` |
**Kesimpulan:** tidak ada minimum runtime baru yang ditetapkan. Bukti yang dibutuhkan sebelum menetapkannya: build, `npm test`, dan worker bcryptjs pada versi kandidat di platform target. Keputusan versi **tertahan** pada A1 (6.17.7).

#### 6.17.7 Formulir fakta DEV A1–C3 (mandiri; untuk diteruskan ke pengelola infrastruktur)
Aturan: **jangan** mengirim password, token, DSN lengkap, private key, atau nilai secret. Nama host, port, versi, kebijakan, nama produk, dan diagram boleh. Bukti yang diminta berupa kebijakan atau topologi. Jawaban per butir: `Diketahui (isi)` / `Belum ada` / `Belum diketahui`; jangan menebak. Semua butir saat ini **belum diketahui** (belum dikonfirmasi pemilik).

| Butir | Fakta 6.16 | Pertanyaan | Bukti yang diminta |
|---|---|---|---|
| A1 | 1 | Platform Next.js DEV (VM/kontainer/PaaS/serverless/hosting Node bersama); jumlah instance dan autoscaling; versi Node yang tersedia dan dapat dipaku, OS, arsitektur CPU; apakah build dibuat di OS/arsitektur yang sama dengan runtime; `next start` atau `standalone` | Dokumen arsitektur atau spesifikasi platform |
| A2 | 2 | Origin persis yang dipakai browser (skema, host, port), satu atau lebih; siapa yang mengakhiri TLS dan menerbitkan sertifikat; apakah HSTS dapat diaktifkan | Nama domain, kebijakan sertifikat |
| A3 | 3 | Ada/tidak reverse proxy atau CDN; jumlah hop klien ke aplikasi; apakah menimpa (bukan menambahkan) `X-Forwarded-For` dan header host/proto; apakah aplikasi dapat dijangkau tanpa proxy; rentang IP proxy | Diagram jaringan atau potongan konfigurasi proxy tanpa secret |
| B1 | 4 | MariaDB DEV: alias/host, port, versi; terpisah dari produksi dan dari DB lokal pengembang; jaringan privat/publik; TLS koneksi aplikasi; alamat atau rentang sumber koneksi aplikasi yang terlihat oleh MariaDB; siapa admin dan siapa yang boleh menjalankan DDL/GRANT | Diagram jaringan, ringkasan aturan firewall/security group |
| B2 | 5 | Sumber data legacy DEV: salinan produksi penuh, teranonimkan, sintetis, atau kosong; tanggal pengambilan; pemilik data; memuat data pribadi anggota atau tidak; siapa yang menyetujui; retensi | Kebijakan data, metode anonimisasi |
| B3 | 6 | Auth store (sesi dan throttle): instance penyimpan; frekuensi dan retensi backup; RPO/RTO; tanggal uji restore terakhir; siapa yang dapat membuat snapshot sebelum perubahan skema | Kebijakan backup, hasil uji restore |
| C1 | 8 | Siapa yang boleh mengakses DEV (peran/jumlah) dan lewat mekanisme apa (VPN/IP allowlist/SSO/basic auth); dapatkah dibatasi di jaringan sebelum aplikasi menerima login; ada akses publik atau tidak; siapa yang punya akses admin ke server dan DB, dan apakah tercatat | Kebijakan akses atau diagram |
| C2 | 7 | Pengelola secret (nama produk/kategori); siapa yang dapat membaca/menulis; cara penyuntikan ke runtime; jadwal dan prosedur rotasi (aplikasi memakai key ring bertanda kunci) | Kebijakan atau nama alat; **bukan nilai** |
| C3 | 9, 10, 11 | (a) penerima alarm/on-call, kanal, jam layanan; (b) tujuan log aplikasi, retensi, siapa yang membaca, dan apakah log proxy/akses mencatat request API; (c) proses deploy dan rollback (CI/CD, artefak berversi, pelaksana); (d) zona waktu server aplikasi dan DB; (e) nama atau peran pemberi persetujuan provisioning dan rilis DEV | Dokumen proses, daftar peran |
Fakta 12 (tindak lanjut residu E1) bukan pertanyaan ke pengelola: keputusan pemilik = E3b ditahan.

#### 6.17.8 Batas gerbang dan keputusan tertahan
| Gerbang | Batas | Syarat untuk dibuka |
|---|---|---|
| B0 | **Desain** perubahan kode dan konfigurasi saja. Persetujuan desain bukan izin mengubah kode/konfigurasi dan bukan izin menerapkannya | Izin tersendiri; jawaban A1, A2, B1 (dan A3 untuk ada/tidaknya proxy) |
| B | Provisioning DEV (skema, akun, data, secret, penerapan konfigurasi hasil B0) | Fakta dan izin operasional lengkap (6.17.4), desain B0 disetujui dan perubahan kodenya dikerjakan dengan izin tersendiri; izin tersendiri untuk B |
| C | Rilis dan smoke test DEV | Gerbang B lulus; identitas uji DEV diputuskan; izin tersendiri untuk C |
Persetujuan atas draf ini atau atas satu gerbang tidak otomatis membuka gerbang lain.

| Keputusan | Menunggu | Status (2026-10-01) |
|---|---|---|
| Ruang lingkup dan allowlist B0 | A1, A2, B1 (A3) | **TERTAHAN** |
| Gerbang B | A1, A2, B1, B2, B3, C1, C2, C3(a), C3(e); B0 | **TERTAHAN** |
| Gerbang C | A1, A2, A3, C1, C3(b)–(d); B lulus; identitas uji DEV | **TERTAHAN** |
| Identitas uji DEV | B2, C1, otorisasi pemilik data | **TERBUKA** (lihat 6.17.5) |
| Versi Node minimum runtime | A1 dan bukti kompatibilitas (6.17.6) | **TERTAHAN** |
| E3b | Izin tersendiri dan daftar objek (6.17.5) | **DITAHAN** |

#### 6.17.9 Catatan revisi 2026-10-01 (hanya dokumen)
Salinan pembanding: `docs/migration/_baseline/POS_DB_INTEGRATION_PLAN.before-2026-10-01.md` (1.114 baris; SHA-256 di `SHA256SUMS.txt`). Status Gerbang A tidak diubah; tidak ada klaim yang belum diverifikasi dinyatakan lulus.
| Temuan | Perbaikan |
|---|---|
| F1 atribusi Node | 6.17.1 butir 2 dan 6.14 L993 dikoreksi; rincian di 6.17.6 |
| F2 cakupan B0 | 6.17.4 B0 mencakup empat perubahan dari 6.14 (guard, host akun auth, worker bcrypt `standalone`, store throttle multi-instance); 6.14 L993 menunjuk B0 |
| F3 tumpang tindih B0/B | B0 = desain; B = penerapan konfigurasi hasil B0 ke DEV; batas di 6.17.8 |
| F4 prasyarat B | Fakta 1 ditambahkan (host akun bergantung pada alamat asal koneksi aplikasi) |
| F5 identitas uji DEV | Dinyatakan keputusan terbuka di 6.17.5; 6.17.4 Gerbang C disesuaikan |
| F6 A1–C3 tak terdefinisi | Didefinisikan mandiri di 6.17.7; 6.17.5 menunjuk ke sana |
| F7 penunjuk dari 6.16 | Ditambahkan di 6.16 |
| F8 kala usang | 6.17.1 butir 1 dan status 6.17 diperbaiki |
| F9 penomoran ganda | Catatan di 6.14 L993: nomor yang berlaku = 12 butir 6.16 |

## Lampiran A — Ringkasan data staging yang dipakai

| Metrik | Nilai (snapshot) |
|---|---|
| Item aktif per cabang (1/2/3) | 5.123 / 8.598 / 6.768; stok negatif 35 / 39 / 27 |
| Penjualan Final POS | ~230 rb; Kredit ≈ 68%, Cash ≈ 32% |
| Rata-rata baris per transaksi | 2,97 (maks 80) |
| Puncak transaksi harian per cabang (Agu-Sep 2026) | 199 |
| Kredit bulan berjalan | 4.182 transaksi, 735 anggota, Rp 410.156.000 |
| Anggota Kredit di >1 cabang bulan ini | 175 |
| Anggota | 9.276; AKTIVE 5.459 (ada 1.785 tanpa `status_karyawan`), `status_anggota='0,00'` 1.427 |
| `db_salesreturn`, `db_hold`, `db_holditems` | 0 baris |
| Sesi kasir terbuka (`status=1`) | Cabang 2 dan 3: 1 sesi hari ini; cabang 1: 2 sesi basi (16-17 Sep), tidak ada sesi hari ini |
