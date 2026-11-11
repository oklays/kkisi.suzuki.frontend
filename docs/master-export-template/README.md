# Master Format Export Laporan Penjualan (XLSX & PDF)

Direktori ini menyimpan **Master Template & Generator** standar untuk ekspor Laporan Penjualan Bulanan Koperasi Suzuki Mart (`https://smart.kkisitb2.id/sales`) baik untuk **Satu Cabang Toko (`Single Store`)** maupun **Konsolidasi Seluruh Toko (`All Stores`)**.

## Daftar File Master Generator

1. [`query_all_stores.php`](./query_all_stores.php)
   - Skrip ekstraksi data read-only dari database `n1608204_smart_kopkar` (`db_sales`, `db_salesitems`, `db_salesreturn`, `db_items`, `db_category`, `db_buka_kasir`, `db_kasir`, `m_anggota`).
   - Melengkapi 100% nama anggota berdasarkan `nik_kar` dari master `m_anggota`.
2. [`master_single_store_excel.py`](./master_single_store_excel.py)
   - Generator `.xlsx` untuk laporan **Satu Toko** (contoh: `TOKO S-MART TB II`, `company_id = 1`).
3. [`master_single_store_pdf.py`](./master_single_store_pdf.py)
   - Generator `.html` / `.pdf` (4 halaman A4 Portrait) untuk laporan **Satu Toko**.
4. [`master_all_stores_excel.py`](./master_all_stores_excel.py)
   - Generator `.xlsx` untuk laporan **Konsolidasi Seluruh Toko** (`company_id IN (1, 2, 3)`).
5. [`master_all_stores_pdf.py`](./master_all_stores_pdf.py)
   - Generator `.html` / `.pdf` (4 halaman A4 Portrait) untuk laporan **Konsolidasi Seluruh Toko**.

---

## Standar Struktur Sheet & Rumus Excel (`.xlsx`)

Setiap workbook Excel memiliki **6 Sheet** dengan standar format angka Rupiah (`"Rp"#,##0;("Rp"#,##0);"-"`), angka bulat (`#,##0`), persentase (`0.00%`), `Freeze Panes`, `AutoFilter`, serta rumus dinamis Excel:

1. **Sheet 1: `Ringkasan Eksekutif`**
   - Ikhtisar KPI Utama (10 indikator utama).
   - Perbandingan Kinerja per Cabang Toko (untuk mode Konsolidasi) dengan rumus `=SUM(...)` dan rata-rata struk `=D.../B...`.
   - Rekapitulasi Metode Pembayaran (`Kredit`, `Cash`, `QRIS`) dengan rumus `=SUM(...)` dan `=D.../B...`.
   - Matriks Cabang Toko x Metode Pembayaran dengan rumus `=C...+E...+G...` dan `=SUM(...)`.
   - Rekapitulasi Segmen Pelanggan (`Anggota NIK` vs `Pelanggan Umum Non-NIK`).
   - Tren Penjualan Mingguan (Minggu 1 s/d Minggu 5) dengan rumus `=C...+D...+E...` dan `=SUM(...)`.
   - Rekapitulasi Operator Kasir (`createdBy`) dengan rumus `=E...+F...` dan `=SUM(...)`.
   - Catatan Audit Data, Retur, & Transisi Sistem POS.
2. **Sheet 2: `Rekap Harian (1-31 Okt)`**
   - Rincian 31 hari kalender penuh.
   - Rumus per baris: Total Struk Harian (`=D{r}+F{r}+H{r}`), Total Omzet Gabungan (`=E{r}+G{r}+I{r}`), dan Rata-rata per Struk (`=IF(J{r}>0,N{r}/J{r},0)`).
   - Rumus baris Total: `=SUM(...)` untuk seluruh kolom numerik dan `=N36/J36` untuk rata-rata struk bulanan.
3. **Sheet 3: `Riwayat Transaksi (Final)`**
   - Daftar seluruh struk berstatus `Final` (`status = 1`), lengkap dengan `ID Toko`, `Nama Toko`, `ID Transaksi`, `Nomor Struk`, `Tanggal`, `Hari`, `NIK Anggota`, `Nama Pelanggan (Di Struk)`, `Nama Anggota (Master NIK)`, `Segmen Pelanggan`, `Sumber`, `Mesin Kasir`, `Referensi Sesi Kasir`, `ID Sesi`, `Status Penjualan`, `Metode Pembayaran`, `Status Pembayaran`, `Total Penjualan`, `Nominal Dibayar`, `Kembalian Tunai`, dan `Operator`.
   - Rumus baris Total: `=COUNTA(...)` untuk jumlah struk dan `=SUM(...)` untuk `Total Penjualan`, `Nominal Dibayar`, serta `Kembalian Tunai`.
4. **Sheet 4: `Top Produk & Kategori`**
   - Ringkasan baris item per cabang toko dengan rumus margin kotor (`=G{r}-H{r}`) dan `=SUM(...)`.
   - Rekapitulasi seluruh kategori barang (`db_salesitems`) dengan rumus margin kotor (`=F{r}-H{r}`) dan `=SUM(...)`.
   - Top 100 Produk Terlaris berdasarkan nilai penjualan dengan baris total `=SUM(...)`.
5. **Sheet 5: `Rekap Belanja Anggota`**
   - Peringkat seluruh anggota koperasi unik berdasarkan nilai belanja beserta rincian per cabang toko dan per metode pembayaran.
   - Rumus per baris: Total Belanja Anggota (`=E{r}+F{r}+G{r}`) dan Rata-rata per Struk (`=K{r}/D{r}`).
   - Rumus baris Total: `=SUM(...)` pada seluruh kolom nilai/frekuensi dan `=K.../D...` untuk rata-rata belanja per struk anggota.
6. **Sheet 6: `Quotation & Catatan Audit`**
   - Tabel A: Transaksi `Final` dengan flag `payment_status = 'Unpaid'` beserta rumus `=SUM(...)`.
   - Tabel B: Transaksi Retur Penjualan (`db_salesreturn`) beserta rumus `=SUM(...)`.
   - Tabel C: Transaksi Non-Final berstatus `Quotation` (nilai Rp 0) yang dipisahkan agar tidak mencemari perhitungan omzet Final.

