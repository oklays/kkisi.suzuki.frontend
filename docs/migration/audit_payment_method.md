# AUDIT & DESIGN REPORT — NEW PAYMENT METHOD: QRIS STATIC FOR POS/KASIR

**Target System:** Koperasi Suzuki Workspace (`apps/web` Next.js Revamp & `tokonew.kkisitb2.id` Legacy CI3)  
**Status:** Audit & Architecture Design (Read-Only — No Code/DB Alterations Applied)  
**Date:** October 2026  

---

## 1. Executive Summary

Berdasarkan audit menyeluruh terhadap arsitektur modern Next.js (`apps/web`), domain packages (`packages/domain`, `packages/application`), serta database MariaDB/MySQL dan integrasi legacy (`tokonew.kkisitb2.id`), penambahan metode pembayaran **QRIS Static** untuk POS/Kasir **dapat dilakukan dengan sangat aman tanpa memerlukan perubahan skema database (Zero DDL Migration)**.

Kondisi transaksi POS saat ini:
1. Skema database existing (`db_sales` dan `db_salespayments`) menggunakan kolom `payment_type VARCHAR(50)` tanpa enum atau foreign key constraint, sehingga secara native dapat langsung menyimpan string `'QRIS'`.
2. Flow checkout pada Next.js saat ini membatasi pembayaran pada union `'Cash' | 'Kredit'` di level domain TypeScript, UI, validasi form, serta query penutupan kasir.
3. QRIS Static bersifat **Non-Cash (Digital)** dan **Seketika (Non-Tempo)**. Sistem POS tidak perlu melakukan verifikasi API atau payment gateway, tetapi kasir melakukan konfirmasi visual manual di HP/alat kasir toko sebelum menekan *Proses Pembayaran*.
4. **Poin Paling Kritis (Cash Reconciliation):** Uang dari transaksi QRIS langsung masuk ke rekening bank/penampung koperasi dan **bukan uang fisik di laci kasir**. Oleh karena itu, nominal QRIS **TIDAK BOLEH** ditambahkan ke `saldo_akhir` (yang merepresentasikan uang fisik/setoran kas) pada tabel `db_buka_kasir`.
5. Kode eksisting saat ini memiliki guard ketat di `PrismaRegisterRepository.close()` yang akan **melempar error `REGISTER_RECAP_UNSUPPORTED`** bila mendeteksi penjualan dengan `payment_type NOT IN ('Cash', 'Kredit')`. Selain itu, sejumlah query rekapitulasi legacy (`Reports_model.php`) menghitung total penjualan sebagai penjumlahan eksplisit `Cash + Kredit`, sehingga QRIS berpotensi tidak terhitung dalam rekap jika titik-titik tersebut tidak diperbarui.

---

## 2. Existing POS Transaction Flow

Alur end-to-end saat kasir menekan tombol **"Proses Pembayaran"** pada sistem POS saat ini:

```
[POS UI: TransactionPanel.tsx]
       ↓ (Validasi form & simpan idempotency ke localStorage)
[POST /api/pos/checkout]
       ↓ (Guard: auth session + CSRF + permission 'sales_add')
[Route Handler: handleCheckout]
       ↓
[Application Use Case: checkout()]
       ↓ (Domain parse & validate: parseCheckout())
[PrismaPosRepository.checkout() -> finalize()]
       ↓ (DB Transaction: ReadCommitted, Timeout 15s)
   1. SELECT db_company FOR UPDATE (Mutex cabang)
   2. SELECT db_users FOR UPDATE (Verifikasi role kasir)
   3. SELECT db_sales (Idempotency check via reference_no)
   4. SELECT db_buka_kasir & db_kasir FOR UPDATE (Validasi shift kasir aktif & tanggal sama)
   5. [Jika Kredit] SELECT m_anggota FOR UPDATE (Lock anggota lintas cabang & cek plafon)
   6. SELECT db_items FOR UPDATE (Lock stok & validasi harga/status SO)
   7. Generate nomor nota sales_code (sales_init + YYMMDD + counter 5 digit)
   8. INSERT db_sales (Header nota, sales_status='Final', payment_status='Paid')
   9. INSERT db_salesitems (Detail barang, snapshot harga HPP & jual)
  10. INSERT db_salespayments (Baris pembayaran, status=1)
  11. UPDATE db_items (Potong stok atomik: stock = stock - qty)
  12. DELETE db_cart (Hapus baris keranjang quotation milik kasir)
       ↓
[Response 200 OK + Struk Snapshot]
```

### Traceability Detail Alur:

- **UI Component & Form State:**
  - File: `apps/web/src/components/pos/TransactionPanel.tsx`
  - Function/Hook: `TransactionPanel()`, state `payment: PreviewPayment`, `paidAmount: string`, function `submit()`
  - Evidence: Mengirim payload JSON berisi `{ items, memberId, paymentType, paidAmount, idempotencyKey }` dengan header `X-CSRF-Token`.

- **API Route & Guard:**
  - File: `apps/web/src/app/api/pos/checkout/route.ts` & `apps/web/src/infrastructure/pos/handlers/checkout.ts`
  - Function: `handleCheckout()`
  - Evidence: `guard(services, request, { permission: 'sales_add', csrf: true })`.

- **Use Case & Domain Policy:**
  - File: `packages/application/src/pos/checkout.usecase.ts` (`checkout()`)
  - File: `packages/domain/src/pos/sale.ts` (`parseCheckout()`)
  - Evidence: `if (body.paymentType !== 'Cash' && body.paymentType !== 'Kredit') throw new PosError('INVALID_INPUT');`.

- **Repository & Database Transaction:**
  - File: `apps/web/src/infrastructure/repositories/prisma-pos.repository.ts`
  - Function: `PrismaPosRepository.checkout()` memanggil `this.finalize(tx, context, input, now)`.

---

## 3. Database Impact Matrix

| Table | Column | Current Purpose | POS Impact Saat Ini | QRIS Impact (Fase Baru) |
|---|---|---|---|---|
| `db_sales` | `payment_type` | Menyimpan jenis pembayaran nota | **INSERT** (`Cash` atau `Kredit`) | **INSERT** nilai `'QRIS'` |
| `db_sales` | `paid_amount` | Nominal yang dibayar | **INSERT** (Cash: input uang bayar; Kredit: `grand_total`) | **INSERT** sama dengan `grand_total` (exact payment) |
| `db_sales` | `grand_total` | Total belanja final | **INSERT** kalkulasi server | **INSERT** sama persis (tidak terpengaruh) |
| `db_sales` | `other_charges_amt` / `other_charges_input` | Menyimpan kembalian kasir | **INSERT** (Cash: `paid - total`; Kredit: `0.00`) | **INSERT** `0.00` (QRIS tidak memiliki kembalian) |
| `db_sales` | `payment_status` | Status pelunasan nota | **INSERT** selalu `'Paid'` | **INSERT** selalu `'Paid'` |
| `db_sales` | `customer_id` & `nik_kar` | Identitas pelanggan / anggota | **INSERT** (Cash: `0` / `'0'`; Kredit: ID & NIK) | **INSERT** default `0` & `'0'` (UMUM) atau ID/NIK jika anggota belanja via QRIS |
| `db_sales` | `id_buka_kasir` | Relasi sesi kasir aktif | **INSERT** ID `db_buka_kasir` | **INSERT** ID `db_buka_kasir` aktif |
| `db_salesitems` | Seluruh kolom | Baris barang per transaksi | **INSERT** batch item | **INSERT** batch item (tidak terpengaruh metode pembayaran) |
| `db_salespayments` | `payment_type` | Jenis pembayaran pada jurnal kasir | **INSERT** (`Cash` atau `Kredit`) | **INSERT** nilai `'QRIS'` |
| `db_salespayments` | `payment` | Nominal uang masuk | **INSERT** (Cash: paidAmount; Kredit: grand_total) | **INSERT** sama dengan `grand_total` |
| `db_salespayments` | `change_return` | Nilai kembalian | **INSERT** (Cash: kembalian; Kredit: `0`) | **INSERT** nilai `0` |
| `db_salespayments` | `payment_note` | Catatan pembayaran | **INSERT** `'Dibayar By Cash'` / `'Dibayar By Kredit'` | **INSERT** `'Dibayar By QRIS'` |
| `db_items` | `stock` | Stok fisik produk | **UPDATE** atomik `stock = stock - qty` | **UPDATE** atomik `stock = stock - qty` (identik) |
| `db_cart` | Seluruh kolom | Draft keranjang kasir | **DELETE** baris quotation aktif kasir | **DELETE** baris quotation aktif kasir (identik) |
| `db_buka_kasir` | `saldo_awal` | Kas awal saat buka register | **READ ONLY** saat transaksi | **READ ONLY** (Tidak berubah) |
| `db_buka_kasir` | `saldo_akhir` | Total kas fisik saat tutup kasir | **UPDATE** saat tutup register (`saldo_awal + cash`) | **TIDAK BOLEH MEMASUKKAN QRIS**. Tetap `saldo_awal + cash` |
| `db_buka_kasir` | `saldo_kredit` | Total akumulasi kredit saat tutup | **UPDATE** saat tutup register (`totals.credit`) | **TIDAK BOLEH MEMASUKKAN QRIS**. Tetap murni kredit |
| `m_anggota` | `limit_toko` / `gaji_minus` | Plafon kredit anggota | **READ ONLY** (hanya dibaca & dihitung) | **READ ONLY** (Jika non-anggota, table ini tidak disentuh) |

---

## 4. Existing Payment Method Model

### Table & Columns:
- `db_sales.payment_type`: `VARCHAR(50) NOT NULL DEFAULT 'Cash'`
- `db_salespayments.payment_type`: `VARCHAR(50) NOT NULL`

### Karakteristik Tipe Data & Skema:
- **Tipe Data:** `VARCHAR(50)` murni (bukan `ENUM`, bukan `BOOLEAN`, bukan `INT FK`).
- **Possible Values Eksisting:** Secara historis dan aplikasi berjalan: `'Cash'`, `'Kredit'`. Di database legacy master ada referensi lain, namun modul POS aktif hanya memakai dua nilai ini.
- **Master Table:** Terdapat master table `db_paymenttypes` (`id`, `payment_type`, `status`), namun **tidak dihubungkan oleh Foreign Key** ke `db_sales` maupun `db_salespayments`. Baik di POS legacy CI3 (`views/pos.php:445`) maupun Next.js (`types.ts`), payment method di-hardcode.
- **Enum di Domain TypeScript:**
  - `packages/domain/src/pos/sale.ts`: `paymentType: 'Cash' | 'Kredit'`
  - `apps/web/src/features/pos/types.ts`: `export type PreviewPayment = "Cash" | "Kredit"`
  - `packages/domain/src/pos/receipt.ts`: `paymentType: 'Cash' | 'Kredit'`
- **Schema Validation:**
  - `parseCheckout()` di `packages/domain/src/pos/sale.ts` memvalidasi secara eksplisit:  
    `if (body.paymentType !== 'Cash' && body.paymentType !== 'Kredit') throw new PosError('INVALID_INPUT');`

---

## 5. Cash Reconciliation Impact (Critical)

Ini adalah aspek paling fundamental dalam audit ini: **QRIS adalah pembayaran non-tunai (digital) yang dananya masuk langsung ke rekening bank koperasi.**

### Dampak Rekonsiliasi:

1. **Saldo Awal Kasir (`saldo_awal`):**
   - **Kondisi:** Merupakan modal uang tunai receh di laci kasir saat shift dibuka.
   - **QRIS Impact:** **TIDAK ADA PERUBAHAN.** Saldo awal tetap 100% uang fisik.

2. **Uang Tunai Diterima vs QRIS:**
   - **Kondisi:** Transaksi Cash menambah uang fisik di laci kasir.
   - **QRIS Impact:** Transaksi QRIS **TIDAK MENAMBAH** sepeser pun uang fisik di laci kasir.

3. **Perhitungan Saldo Akhir / Setoran Kas (`saldo_akhir`):**
   - **Evidence di `PrismaRegisterRepository.close()` (`apps/web`):**
     ```typescript
     const saldoAkhir = register.saldo_awal.plus(totals.cash).toFixed(2);
     ```
   - **Evidence di Legacy `Pos.php:899-906` (`tokonew.kkisitb2.id`):**
     ```php
     $total_cash = $getSales_cash->bayar_cash - $getSales_cash->kemabalian_cash;
     $saldo_akhir = $saldo_awal + $total_cash;
     ```
   - **QRIS Impact:** Rumus `saldo_akhir = saldo_awal + cash` sudah benar **hanya jika QRIS tidak digabung ke dalam `totals.cash`**. Uang fisik yang disetorkan kasir ke brankas/supervisor saat tutup kasir adalah sebesar `saldo_akhir`. Jika QRIS dimasukkan ke `saldo_akhir`, kasir akan dituduh mengalami **selisih kas minus (uang fisik tekor)** karena uang QRIS berada di rekening bank, bukan di laci.

4. **Perhitungan Saldo Kredit (`saldo_kredit`):**
   - **Evidence:** `saldo_kredit` diisi dari total `payment_type = 'Kredit'`.
   - **QRIS Impact:** QRIS **TIDAK BOLEH** dimasukkan ke `saldo_kredit`. Kredit anggota merupakan piutang koperasi yang ditagihkan melalui pemotongan gaji (payroll) di akhir bulan. QRIS adalah transaksi lunas seketika (*instant settlement*).

5. **Guard Register Closing (`PrismaRegisterRepository.close`):**
   - **Critical Finding:**
     ```sql
     SUM(CASE WHEN COALESCE(return_bit,'0')<>'0' OR payment_type NOT IN ('Cash','Kredit') THEN 1 ELSE 0 END) AS unsupported
     ```
     ```typescript
     if (Number(totals.unsupported ?? 0)) throw new PosError('REGISTER_RECAP_UNSUPPORTED');
     ```
   - **Dampak jika QRIS masuk sekarang:** Proses **Tutup Kasir akan gagal total (melempar HTTP 500 / error)** karena mendeteksi ada transaksi di luar `'Cash'` dan `'Kredit'`.

6. **UI Rekap Kasir (`apps/web/src/components/pos/RegisterRecap.tsx`):**
   - **Finding:**
     ```typescript
     const opening = Math.round(Number(recap.saldoAwal) * 100);
     const closing = Math.round(Number(recap.saldoAkhir) * 100);
     const cash = closing - opening;
     const credit = Math.round(Number(recap.saldoKredit) * 100);
     const totalSales = cash + credit;
     ```
   - **Dampak:** Komponen UI menurunkan nominal kas dari `closing - opening`, dan menghitung total penjualan sebagai `cash + credit`. Jika QRIS ada tanpa penyesuaian UI rekap, `totalSales` tidak akan memuat penjualan QRIS!

---

## 6. Reporting Impact

Audit terhadap query dan modul reporting di seluruh sistem:

| Laporan / Query | Lokasi File | Perilaku Saat Ini | Status Kompatibilitas QRIS | Rekomendasi Perubahan |
|---|---|---|---|---|
| **POS Receipt** | `PrismaReceiptRepository.ts:36` | Cek `if (!['Cash', 'Kredit'].includes(first.payment_type))` melempar `RECEIPT_UNSUPPORTED` | **TIDAK SUPPORT (Throw Error)** | Tambahkan `'QRIS'` ke daftar yang diizinkan |
| **Receipt Page UI** | `apps/web/src/app/pos/receipt/[id]/page.tsx:28` | Menampilkan Kembalian hanya jika `paymentType === 'Cash'` | **SUPPORT SECARA VISUAL**, namun butuh penyesuaian tipe domain | Pastikan kembalian tidak muncul untuk QRIS |
| **Tutup Kasir (Next.js)** | `PrismaRegisterRepository.ts:25` | Menghitung `cash`, `credit`, dan melempar error jika ada payment method selain itu | **TIDAK SUPPORT (Throw Error)** | Tambahkan kolom agregasi `qris`, izinkan `'QRIS'` pada field `unsupported` |
| **Struk Tutup Kasir Legacy** | `sal-stuk-buka-kasir.php:175-185` | `total_penjualan = cash_total + kredit_total` | **SALAH HITUNG (Under-reporting)** | Tambahkan agregat `sl_qris` dan masukkan ke `total_penjualan` |
| **Laporan Toko Bulanan** | `Reports_model.php:500-510` (`show_toko_report`) | `$tot_sales = $sales_kredit + $sales_cash;` | **SALAH HITUNG (Omits QRIS)** | Tambahkan query `$sales_qris` dan jumlahkan ke `$tot_sales` |
| **Export Laporan Toko** | `Reports_model.php:920-990` (`get_sales_cash`, `get_sales_kredit`) | Hanya ada breakdown per tab untuk Cash dan Kredit | **PARSIAL (Data hilang di drilldown)** | Tambahkan method/tab `get_sales_qris()` |
| **Sales Report** | `Reports_model.php:54` (`show_sales_report`) | Filter dinamis: `if ($payment_type != '') $this->db->where('a.payment_type', $payment_type)` | **OTOMATIS SUPPORT QUERY**, tapi view form-nya hardcoded | Tambahkan opsi `<option value='QRIS'>` di `report-sales.php` |
| **Sales Payments Report** | `Reports_model.php:287` (`show_sales_payments_report`) | Membaca `db_salespayments.payment_type` langsung | **OTOMATIS SUDAH TERSUPPORT** | Menampilkan string `'QRIS'` langsung di tabel |
| **Profit & Loss Report** | `Reports_model.php:1115` (`show_profit_loss_report`) | Mengambil seluruh `db_sales` dengan `sales_status = 'Final'` tanpa filter payment | **OTOMATIS SUDAH TERSUPPORT** | Tidak ada perubahan (omset dan laba kotor akurat) |
| **Dashboard KPIs** | `Dashboard_model.php:51,73` | Menghitung `sum(grand_total)` dari `db_sales WHERE sales_status='Final'` | **OTOMATIS SUDAH TERSUPPORT** | Angka total penjualan harian/bulanan di dashboard otomatis menyertakan QRIS |

---

## 7. Proposed QRIS Static Flow

Diagram alur transaksi untuk QRIS Static:

```
[1. KASIR / POS UI]
Kasir scan barang belanjaan ke keranjang
       ↓
Kasir memilih metode pembayaran: [ QRIS ]
       ↓
Sistem menampilkan Total Tagihan (Rp XXX.XXX)
       ↓
[2. CUSTOMER & FISIK TOKO]
Customer melakukan scan QRIS Static (stiker / tent card fisik di kasir)
Customer memasukkan nominal sesuai total tagihan di layar POS
Customer menyelesaikan pembayaran di aplikasi bank / e-wallet customer
       ↓
[3. VERIFIKASI MANUAL KASIR]
Customer memperlihatkan layar "Berhasil" / Kasir memeriksa notifikasi masuk di HP toko
Kasir memastikan:
  - Nama Merchant Sesuai
  - Nominal Tepat (Rp XXX.XXX)
  - Tanggal & Jam Cocok
       ↓
[4. FINALISASI TRANSAKSI]
Kasir menekan tombol "Proses Pembayaran"
       ↓
[5. CLIENT CHECKOUT PAYLOAD]
POST /api/pos/checkout
Payload:
{
  "items": [{ "itemId": 101, "quantity": 1 }],
  "paymentType": "QRIS",
  "paidAmount": "0",       // atau otomatis terisi nilai total
  "memberId": null,        // opsi opsional jika customer adalah anggota
  "idempotencyKey": "uuid"
}
       ↓
[6. TRANSACTION EXECUTION (Atomic)]
- Validasi shift register kasir
- INSERT db_sales:
    grand_total = total
    paid_amount = total
    payment_type = 'QRIS'
    other_charges_amt = 0.00 (Kembalian = 0)
    sales_status = 'Final'
- INSERT db_salespayments:
    payment = total
    payment_type = 'QRIS'
    change_return = 0.00
    payment_note = 'Dibayar By QRIS'
- UPDATE db_items: Potong stok
- DELETE db_cart: Bersihkan keranjang
       ↓
[7. OUTPUT & RECEIPT]
Struk tercetak dengan label "Metode: QRIS"
Uang Bayar = Rp XXX.XXX, Kembalian = Rp 0
       ↓
[8. CLOSING & REKONSILIASI]
Saat Tutup Kasir:
- Saldo Fisik di Laci = Saldo Awal + Penjualan Cash (QRIS TIDAK MENAMBAH FISIK KAS)
- Rekapitulasi POS memunculkan rincian:
    Total Penjualan = Cash + QRIS + Kredit
    Setoran Fisik Kas = Saldo Akhir (Kas Murni)
    Rekap Non-Tunai QRIS = Total QRIS
```

---

## 8. Recommended Minimum Change

Perubahan minimum yang nantinya diperlukan saat fase implementasi tiba:

### A. MUST CHANGE (Wajib agar Transaksi QRIS Berhasil & Tidak Merusak Sistem)

1. **Domain Types & Parser (`packages/domain/src/pos/sale.ts`):**
   - Ubah tipe `paymentType` dari `'Cash' | 'Kredit'` menjadi `'Cash' | 'Kredit' | 'QRIS'`.
   - Perbarui fungsi `parseCheckout()` untuk menerima `'QRIS'`.
   - Untuk `'QRIS'`, `paidSen` di-set menjadi `0` (atau sama dengan total) dan tidak memerlukan validasi uang kembalian Cash.
2. **Domain Receipt Type (`packages/domain/src/pos/receipt.ts`):**
   - Ubah `paymentType` pada tipe `Receipt` menjadi `'Cash' | 'Kredit' | 'QRIS'`.
3. **UI State & Types (`apps/web/src/features/pos/types.ts` & `checkout-state.ts`):**
   - Ubah `export type PreviewPayment = "Cash" | "Kredit" | "QRIS"`.
   - Perbarui fungsi `checkoutBlockingReasons()`: Untuk metode `'QRIS'`, checkout diizinkan tanpa input uang tunai (`paidSen`) dan tanpa kewajiban memilih anggota (`memberId`).
4. **UI Transaction Panel (`apps/web/src/components/pos/TransactionPanel.tsx`):**
   - Tambahkan tombol pilihan pembayaran `'QRIS'` pada selector pembayaran (bersama Cash dan Kredit Anggota) lengkap dengan ikon (misal: `QrCode`).
   - Sembunyikan input uang bayar cash dan info limit kredit saat mode QRIS aktif.
   - Sediakan instruksi ringkas: *"Pastikan customer telah sukses scan QRIS fisik dan dana masuk sebelum memproses."*
5. **POS Repository Checkout Persistence (`apps/web/src/infrastructure/repositories/prisma-pos.repository.ts`):**
   - Pada baris penentuan `paid` dan `change`:
     ```typescript
     const paid = input.paymentType === 'Cash' ? input.paidSen : total;
     const change = input.paymentType === 'Cash' ? paid - total : 0;
     ```
     (Logika ini sudah otomatis tepat untuk QRIS karena `change` menjadi 0 dan `paid` menjadi `total`).
   - Masukkan string `input.paymentType` (`'QRIS'`) ke dalam query `INSERT INTO db_sales` dan `INSERT INTO db_salespayments`.
6. **Receipt Repository (`apps/web/src/infrastructure/repositories/prisma-receipt.repository.ts`):**
   - Longgarkan validasi:
     ```typescript
     if (!['Cash', 'Kredit', 'QRIS'].includes(first.payment_type) || first.return_bit !== '0') {
       throw new PosError('RECEIPT_UNSUPPORTED');
     }
     ```
7. **Cashier Closing Logic (`apps/web/src/infrastructure/repositories/prisma-register.repository.ts`):**
   - **Kritis:** Longgarkan query filter `unsupported`:
     ```sql
     SUM(CASE WHEN COALESCE(return_bit,'0')<>'0' OR payment_type NOT IN ('Cash','Kredit','QRIS') THEN 1 ELSE 0 END) AS unsupported
     ```
   - Tambahkan kalkulasi total QRIS:
     ```sql
     CAST(COALESCE(SUM(CASE WHEN payment_type='QRIS' THEN CAST(grand_total AS DECIMAL(18,2)) ELSE 0 END),0) AS DECIMAL(18,2)) AS qris
     ```
   - **Pertahankan formula kas murni:** `const saldoAkhir = register.saldo_awal.plus(totals.cash).toFixed(2);` (QRIS dilarang ditambahkan ke `saldoAkhir`).
   - Teruskan `qris` ke object return summary tutup kasir.
8. **Register Recap UI (`apps/web/src/components/pos/RegisterRecap.tsx`):**
   - Tambahkan `saldoQris` ke tipe data rekap.
   - Perbarui rumus total penjualan: `const totalSales = cash + credit + qris;`.
   - Tampilkan baris baru *"Penjualan QRIS"* pada breakdown rincian keuangan.
9. **Unit & Integration Tests:**
   - Sesuaikan test yang memverifikasi penolakan `'QRIS'` di `packages/domain/tests/pos-sale.test.mjs` agar kini memvalidasi penerimaan `'QRIS'`.

---

### B. SHOULD CHANGE (Disarankan Agar Laporan Konsisten)

1. **Master Data `db_paymenttypes`:**
   - Lakukan satu kali insert via seed/script internal jika belum ada baris:
     `INSERT INTO db_paymenttypes (payment_type, status) VALUES ('QRIS', 1);`
2. **Laporan Penjualan Legacy (`tokonew.kkisitb2.id/application/views/report-sales.php`):**
   - Tambahkan `<option value='QRIS'>QRIS</option>` pada dropdown filter pembayaran.
3. **Laporan Toko Legacy (`tokonew.kkisitb2.id/application/models/Reports_model.php`):**
   - Pada method `show_toko_report`, `show_toko_report_2`, dan `export_lap_toko`: tambahkan query kalkulasi `$sales_qris` agar omset bulanan toko mencakup transaksi QRIS.
4. **Struk Cetak Tutup Kasir Legacy (`tokonew.kkisitb2.id/application/views/sal-stuk-buka-kasir.php`):**
   - Tambahkan baris `QRIS` di struk thermal penutupan shift kasir agar kasir dapat mencocokkan total EDC/QRIS dengan mutasi bank.

---

### C. NO CHANGE REQUIRED (Tidak Perlu Diubah)

1. **Struktur Tabel Database (`ALTER TABLE` / Migrasi):**
   - Tidak ada penambahan kolom baru di tabel mana pun.
2. **Manajemen Stok / Inventory:**
   - Logika pemotongan stok `db_items.stock` terbukti agnostik terhadap metode pembayaran.
3. **Keranjang Kasir (`db_cart`):**
   - Pembersihan antrean draft transaksi tetap berjalan sama.
4. **Dashboard KPI (`tokonew.kkisitb2.id/application/models/Dashboard_model.php`):**
   - Otomatis menghitung omset transaksi final tanpa memandang metode bayar.
5. **Autentikasi, Role, & Permission (`db_permissions`):**
   - Memakai hak akses POS yang sudah ada (`sales_add`).

---

## 9. Risks / Edge Cases & Mitigasi

1. **Human Error: Kasir Tidak Memastikan Pembayaran Berhasil**
   - *Risiko:* Kasir langsung menekan *Proses Pembayaran* sebelum customer selesai melakukan transfer scan QRIS di HP-nya. Transaksi tersimpan di POS dan stok terpotong, tetapi dana belum masuk ke rekening koperasi.
   - *Mitigasi:* Berikan dialog konfirmasi visual atau warna tombol yang mencolok pada UI kasir: *"Pastikan dana QRIS sebesar Rp XXX.XXX telah berhasil masuk pada alat kasir sebelum melanjutkan"*.
2. **QRIS Salah Masuk ke Uang Fisik Kasir (Cash Count Discrepancy)**
   - *Risiko:* Kasir salah paham dan menganggap `saldo_akhir` harus sama dengan total omset (Cash + QRIS). Akibatnya kasir merasa rugi/tekor uang fisik di laci saat dihitung manual.
   - *Mitigasi:* Tampilkan pemisahan tegas di struk & layar tutup kasir:
     - **Setoran Kas Fisik (Uang di Laci): Rp A**
     - **Rekapitulasi QRIS (Non-Fisik): Rp B**
3. **Tutup Kasir Macet Akibat Exception `REGISTER_RECAP_UNSUPPORTED`**
   - *Risiko:* Kasir tidak dapat menutup kasir di akhir shift jika validasi di `PrismaRegisterRepository.close()` belum diperbarui saat transaksi QRIS pertama terjadi.
   - *Mitigasi:* Implementasi Phase Closing/Recap harus dilakukan sebelum atau bersamaan dengan dibukanya opsi pembayaran QRIS di UI.
4. **Identitas Pelanggan (Anggota vs Non-Anggota)**
   - *Risiko:* Apakah anggota koperasi boleh membayar menggunakan QRIS?
   - *Analisis:* Tentu boleh. Jika anggota membayar pakai QRIS, NIK tetap dapat dicatat di `db_sales`, tetapi limit kredit toko miliknya tidak dikurangi (karena dibayar lunas seketika melalui rekening pribadi/bank anggota).
5. **Mixed Payment (Split Bill)**
   - *Risiko:* Customer ingin membayar sebagian Cash dan sebagian QRIS.
   - *Temuan:* Arsitektur database POS eksisting menyimpan 1 baris payment di `db_salespayments` per transaksi checkout POS (`DELETE db_salespayments WHERE sales_id ... INSERT 1 row`). Sistem POS saat ini **tidak mendukung split payment**. Jangan mencoba mendukung split payment pada fase QRIS Static ini.
6. **Pembatalan / Refund Transaksi**
   - *Risiko:* Customer membatalkan transaksi yang sudah dibayar via QRIS.
   - *Analisis:* Sesuai dokumen batasan (`docs/migration/POS_DB_INTEGRATION_PLAN.md`), modul retur kasir memiliki 0 baris pemakaian di staging dan berada di luar lingkup. Pembatalan QRIS diselesaikan secara manual operasional toko sesuai SOP koperasi.

---

## 10. Implementation Plan — NEXT PHASE ONLY

*(Perhatian: Rencana ini hanya untuk fase eksekusi berikutnya setelah audit ini disetujui. TIDAK ada kode yang diubah pada fase audit ini).*

```
+-----------------------------------------------------------------------------------+
| Phase 1: Domain Core & Contracts                                                  |
| - Perbarui packages/domain/src/pos/sale.ts (tambahkan 'QRIS' ke CheckoutInput)    |
| - Perbarui parseCheckout() policy & packages/domain/src/pos/receipt.ts            |
| - Perbarui packages/domain/tests/pos-sale.test.mjs                                |
+-----------------------------------------------------------------------------------+
                                          ↓
+-----------------------------------------------------------------------------------+
| Phase 2: Transaction Persistence & Receipt Repositories                           |
| - Perbarui apps/web/src/infrastructure/repositories/prisma-pos.repository.ts      |
| - Perbarui apps/web/src/infrastructure/repositories/prisma-receipt.repository.ts  |
| - Tulis unit test untuk PrismaPosRepository dengan skenario QRIS                  |
+-----------------------------------------------------------------------------------+
                                          ↓
+-----------------------------------------------------------------------------------+
| Phase 3: Register Closing & Cash Reconciliation                                   |
| - Perbarui PrismaRegisterRepository.close() di apps/web                           |
| - Pastikan QRIS diizinkan di filter 'unsupported'                                 |
| - Pastikan saldoAkhir (fisik kas) tetap murni (saldo_awal + cash)                 |
| - Teruskan qrisTotal ke return data recap                                         |
+-----------------------------------------------------------------------------------+
                                          ↓
+-----------------------------------------------------------------------------------+
| Phase 4: POS UI Frontend Integration                                              |
| - Tambahkan opsi 'QRIS' di PaymentMethodSelector (TransactionPanel.tsx)           |
| - Atur validasi checkoutBlockingReasons agar QRIS bebas validasi cash tender      |
| - Perbarui RegisterRecap.tsx untuk menampilkan baris Penjualan QRIS                |
| - Sesuaikan receipt display di app/pos/receipt/[id]/page.tsx                       |
+-----------------------------------------------------------------------------------+
                                          ↓
+-----------------------------------------------------------------------------------+
| Phase 5: Legacy Reports & Print Sync                                              |
| - Tambahkan opsi QRIS pada filter views/report-sales.php                          |
| - Sesuaikan kalkulasi total penjualan di Reports_model.php & sal-stuk-buka-kasir  |
| - Pastikan baris QRIS ada di db_paymenttypes                                      |
+-----------------------------------------------------------------------------------+
                                          ↓
+-----------------------------------------------------------------------------------+
| Phase 6: Automated Verification & Manual Staging Acceptance                       |
| - Jalankan pnpm check (lint & typecheck workspace)                                |
| - Jalankan pnpm test (unit tests)                                                 |
| - Uji transaksi simulasi di staging & verifikasi rekonsiliasi saldo kas            |
+-----------------------------------------------------------------------------------+
```

---

## Traceability Evidence Matrix

```
Finding 1:
Struktur tabel db_sales dan db_salespayments mampu menampung string 'QRIS' tanpa migrasi DDL.
Evidence:
- apps/web/prisma/schema.prisma (line 152: `paymentType String @map("payment_type") @db.VarChar(50)`)
- apps/web/tests/fixtures/pos-schema.sql (line 183: `payment_type varchar(50) NOT NULL DEFAULT 'Cash'`)
Database:
- Table: db_sales, Column: payment_type (VARCHAR(50))
- Table: db_salespayments, Column: payment_type (VARCHAR(50))
Impact for QRIS:
Aman disimpan langsung. Zero schema migration needed.

Finding 2:
Domain layer POS saat ini menolak string selain 'Cash' dan 'Kredit' dengan error INVALID_INPUT.
Evidence:
- packages/domain/src/pos/sale.ts (line 42: `if (body.paymentType !== 'Cash' && body.paymentType !== 'Kredit') throw new PosError('INVALID_INPUT');`)
- packages/domain/tests/pos-sale.test.mjs (line 7: assert.throws bila paymentType:'QRIS')
Database:
- Tidak sampai ke level database karena dihentikan di validation layer.
Impact for QRIS:
Wajib diubah pada Phase 1 agar domain mengizinkan 'QRIS'.

Finding 3:
Proses Tutup Kasir (Register Close) saat ini melempar error jika mendeteksi penjualan selain Cash dan Kredit.
Evidence:
- apps/web/src/infrastructure/repositories/prisma-register.repository.ts (line 28-32)
  `SUM(CASE WHEN COALESCE(return_bit,'0')<>'0' OR payment_type NOT IN ('Cash','Kredit') THEN 1 ELSE 0 END) AS unsupported`
  `if (Number(totals.unsupported ?? 0)) throw new PosError('REGISTER_RECAP_UNSUPPORTED');`
Database:
- Table: db_sales (id_buka_kasir, sales_status, payment_type)
Impact for QRIS:
Wajib diubah agar 'QRIS' dimasukkan ke dalam daftar payment method yang valid.

Finding 4:
Saldo Akhir pada Tutup Kasir hanya menambahkan transaksi Tunai (Cash).
Evidence:
- apps/web/src/infrastructure/repositories/prisma-register.repository.ts (line 33)
  `const saldoAkhir = register.saldo_awal.plus(totals.cash).toFixed(2);`
- tokonew.kkisitb2.id/application/controllers/Pos.php (line 905)
  `$saldo_akhir = $saldo_awal + $total_cash;`
Database:
- Table: db_buka_kasir, Column: saldo_akhir
Impact for QRIS:
Sangat penting dipertahankan agar QRIS tidak menambah saldo_akhir (karena QRIS bukan kas fisik).

Finding 5:
Laporan bulanan legacy toko menghitung total penjualan hanya dari Cash dan Kredit.
Evidence:
- tokonew.kkisitb2.id/application/models/Reports_model.php (line 500-510)
  `$sales_kredit = ... a.payment_type='Kredit'`
  `$sales_cash = ... a.payment_type='Cash'`
  `$tot_sales = $sales_kredit + $sales_cash;`
Database:
- Table: db_sales
Impact for QRIS:
QRIS berpotensi hilang dari total omset toko jika query Reports_model.php tidak disesuaikan.
```

---

## FINAL GATE — JAWABAN 8 PERTANYAAN KUNCI

1. **Saat transaksi POS selesai, data masuk ke table mana saja?**
   - **`db_sales`** (INSERT 1 baris header nota transaksi).
   - **`db_salesitems`** (INSERT baris detail produk yang dibeli).
   - **`db_salespayments`** (INSERT 1 baris rincian pembayaran).
   - **`db_items`** (UPDATE stok barang: `stock = stock - qty`).
   - **`db_cart`** (DELETE baris draft quotation kasir).
   - *(Catatan: `m_anggota` dan `db_buka_kasir` TIDAK di-INSERT/di-UPDATE saat checkout).*

2. **Table/column mana yang saat ini merepresentasikan payment method?**
   - Tabel **`db_sales`**, kolom **`payment_type`** (`VARCHAR(50)`).
   - Tabel **`db_salespayments`**, kolom **`payment_type`** (`VARCHAR(50)`).

3. **Apakah schema existing sudah mampu menyimpan `QRIS`?**
   - **YA, SUDAH MAMPU.** Kolom `payment_type` bertipe `VARCHAR(50)`, tidak dibatasi oleh enum database, dan tidak ada foreign key constraint ke master table.

4. **Apakah penambahan QRIS membutuhkan schema/database change?**
   - **TIDAK BUTUH (Zero Schema / DDL Change).** Skema database tetap persis seperti yang berjalan sekarang. Rekapitulasi QRIS dapat ditarik secara dinamis dari `db_sales` berdasarkan relasi `id_buka_kasir` yang sudah ada.

5. **Apakah transaksi QRIS saat ini berpotensi dianggap sebagai CASH?**
   - **BERPOTENSI YA** pada modul rekap/laporan tertentu jika pengembang menggabungkan QRIS ke dalam `saldo_akhir` kasir, atau pada komponen UI `RegisterRecap.tsx` yang saat ini menurunkan cash dari selisih `closing - opening`. Pada backend register closing eksisting, sistem malah menolaknya dengan error `REGISTER_RECAP_UNSUPPORTED`.

6. **Bagaimana QRIS harus diperhitungkan pada Tutup Kasir?**
   - QRIS harus dicatat dan direkap sebagai **Penjualan Non-Tunai**.
   - Formula penutupan kasir yang benar:
     - **Penjualan Tunai:** $\sum \text{Grand Total (Cash)}$
     - **Penjualan QRIS:** $\sum \text{Grand Total (QRIS)}$
     - **Penjualan Kredit:** $\sum \text{Grand Total (Kredit)}$
     - **Total Penjualan:** $\text{Tunai} + \text{QRIS} + \text{Kredit}$
     - **Saldo Akhir / Setoran Kas Fisik:** $\text{Saldo Awal} + \text{Penjualan Tunai}$ *(QRIS TIDAK masuk ke fisik kas)*.

7. **Bagaimana QRIS harus muncul dalam reporting?**
   - Muncul sebagai kelompok/metode pembayaran tersendiri yang terpisah dari Tunai dan Kredit.
   - Pada filter transaksi (`report-sales`), tersedia opsi `QRIS`.
   - Pada rekap kasir dan laporan toko bulanan, muncul sebagai baris/kolom *Penjualan QRIS* yang ikut menambah total omset penjualan kotor, namun terpisah dari rekonsiliasi kas tunai.

8. **Apa perubahan minimum yang diperlukan untuk implementasi selanjutnya?**
   - **Domain & UI:** Tambahkan opsi `'QRIS'` pada enum TypeScript, izinkan checkout tanpa input uang tender cash.
   - **Persistence:** Teruskan nilai `'QRIS'` ke `db_sales` dan `db_salespayments`.
   - **Closing:** Update `PrismaRegisterRepository.close()` untuk mengizinkan `'QRIS'` dalam kalkulasi rekap tanpa memasukkannya ke `saldoAkhir` kas fisik.

---

*(Audit dan rekomendasi desain selesai. Tidak ada implementasi kode yang dijalankan sesuai batasan STRICT CONSTRAINTS).*