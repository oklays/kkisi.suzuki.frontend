Fitur retur barang sudah jadi di app Next.js. Hanya tabel retur legacy yang ditulis (`db_salesreturn`, `db_salesitemsreturn`, `db_salespaymentsreturn`), ditambah `db_sales.return_bit` dan `db_items.stock`. Tidak ada tabel atau kolom baru. Semuanya belum di-commit.

## Temuan fatal di retur legacy
1. **Simpan retur legacy praktis selalu gagal.** Kolom `payment_status` bertipe INT tapi diisi teks `'Paid'`, dan beberapa kolom wajib tidak diisi. Di mode STRICT, insert ditolak. Buktinya, dump produksi berisi **0 baris retur**, artinya fitur ini belum pernah berhasil dipakai.
2. **Penyimpanan tidak atomik.** Ada perintah `ALTER TABLE` di tengah transaksi, yang otomatis meng-commit transaksi itu.
3. **Nomor retur salah prefix dan bisa bentrok.** Prefix selalu diambil dari cabang pertama untuk semua cabang, dan nomornya global, bukan per cabang.
4. **Barang bisa di-refund dua kali.** Tidak ada cek jumlah retur terhadap jumlah terjual dikurangi yang sudah diretur.
5. **Retur Kredit tidak mengurangi tagihan.** Hitungan tagihan anggota dan laporan potong gaji legacy hanya membaca `db_sales`, jadi retur Kredit tidak pernah mengurangi potongan gaji.
6. **Rawan SQL injection.** Semua query retur legacy menyisipkan input mentah ke SQL.

Status OPEN/CLOSED per periode payroll ternyata hanya ada untuk tagihan PPOB, bukan penjualan toko. Jadi untuk Kredit saya pakai fallback sesuai arahan Anda: retur hanya boleh di bulan kalender yang sama dengan transaksi.

## Yang dibuat
- **Halaman retur:**
  - Tombol "Retur barang" di detail transaksi membuka form retur.
  - Daftar retur di `/sales/returns`, halaman detail retur, dan nota retur 80mm.
  - Link "Retur Penjualan" di sidebar.
- **Aturan yang dicek ulang di server:**
  - Batas waktu: Cash/QRIS maksimal 7 hari kalender, Kredit hanya di bulan transaksi.
  - Jumlah retur tidak boleh melebihi sisa yang belum diretur.
  - Sesi kasir harus terbuka, dan uang di laci harus cukup untuk refund tunai.
  - Barang yang sedang stock opname ditolak.
  - Kirim ulang permintaan yang sama tidak membuat retur ganda.
- **Uang dan stok:**
  - Transaksi Cash/QRIS dikembalikan tunai dari laci; transaksi Kredit mengurangi tagihan anggota.
  - Penjualan asli tidak diubah, sehingga laporan Laba-Rugi legacy tetap benar.
  - Hitungan stok legacy otomatis ikut menghitung baris retur.

**Perubahan perilaku fitur lain:**
- Tutup kasir sebelumnya **menolak** sesi yang punya transaksi retur. Sekarang tidak lagi, dan saldo akhir laci dikurangi refund tunai.
- Sisa limit kredit di POS dan di struk sekarang ikut dikurangi retur Kredit.
- Cetak ulang struk untuk transaksi yang sudah diretur kini diizinkan, dengan catatan bahwa ada barang yang diretur.

**User database:** `kkisi_pos_return` sudah dibuat di staging lokal dengan grant minimal per tabel/kolom. Dari hasil pengecekan, update kolom lain, DELETE, akses `m_anggota`, dan DDL semuanya ditolak. `kkisi_pos_runtime` tidak diubah. Script setup juga menambahkan `DATABASE_URL_RETURN_WRITE` ke `.env.local`; backup-nya ada di `.env.local.return-backup`.

## Verifikasi
- Typecheck, lint (0 error, 4 warning lama), dan build lolos. Semua test lolos: domain 28, application 22, web 214, dengan 42 test DB opt-in yang memang di-skip.
- Uji retur Cash dan Kredit memakai data asli staging di mode STRICT, dalam transaksi yang di-rollback. Semua insert diterima, stok bertambah, dan setelah rollback tidak ada data yang tersisa.
- Headless Chrome dengan akun sintetis lokal: form, langkah tinjau, dan pesan penolakan server tampil benar; tidak ada error JS dan tidak ada scroll horizontal di lebar 390px. Akun ini tidak punya sesi kasir terbuka, jadi tidak ada retur yang benar-benar tersimpan.
- **Belum diuji:** retur yang benar-benar di-commit sampai tutup kasir, dan cetak fisik nota 80mm.

## Sebelum aktif di produksi
1. Legacy PHP dan Next.js tidak boleh sama-sama menulis untuk cabang yang sama. Ini blocker yang sama dengan checkout.
2. User database produksi dibuat manual dari SQL yang sudah saya siapkan. Kemungkinan perlu bantuan support Niagahoster, karena UI cPanel hanya bisa memberi hak per database, bukan per tabel/kolom.
3. **Hitungan tagihan anggota dan laporan potong gaji legacy harus dipatch** agar mengurangi retur Kredit. Alternatifnya, aktifkan Cash/QRIS saja dulu.
4. Retur hanya untuk sesi kasir yang dibuka dan ditutup lewat Next.js, karena tutup kasir legacy mengabaikan refund.

Detail lengkap ada di handover. Kalau setuju, saya bisa buatkan commit-nya.

File:
- [SALES_RETURN_IMPLEMENTATION.md](docs/migration/SALES_RETURN_IMPLEMENTATION.md)
- [sales-return-writer-production.sql](docs/migration/sql/sales-return-writer-production.sql)
- [prisma-sales-return.repository.ts](apps/web/src/infrastructure/repositories/prisma-sales-return.repository.ts)
- [return.ts](packages/domain/src/sales/return.ts)