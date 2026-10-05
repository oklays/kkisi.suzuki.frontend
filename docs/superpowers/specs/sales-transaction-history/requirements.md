# Requirements — Sales Transaction History

## 1. Tujuan bisnis dan pengguna

Mempermudah pencarian bukti transaksi dan cetak ulang struk, memakai data existing yang sama dengan POS/legacy. Pengguna ditentukan oleh permission existing, bukan nama role: pembaca `sales_view`, pembaca pembayaran tambahan `sales_payment_view`, dan kasir checkout `sales_add` yang alur cetaknya harus tetap berfungsi.

Scope baca tidak mencakup mutasi, aktivitas audit yang tidak tersimpan, PPOB, atau pengelolaan seluruh sesi kasir. Default yang dipilih dalam draft ini dapat direview tanpa menahan penyusunan spec.

## 2. Functional requirements

| ID | EARS acceptance criterion | Tujuan |
|---|---|---|
| REQ-001 | WHEN pengguna memiliki sales_view, THE SYSTEM SHALL menyediakan menu “Riwayat Transaksi” dan halaman `/sales` dengan active state yang tepat di shell existing. | Akses discoverable |
| REQ-002 | WHEN list dibuka tanpa filter, THE SYSTEM SHALL membaca sale cabang aktif dari tabel existing, default source POS, sales_status Final, tanggal awal bulan berjalan sampai hari ini; pengguna dapat memilih source POS/non-POS/semua penjualan barang dan semua status. PPOB tidak termasuk. | Historical visibility |
| REQ-003 | WHEN pengguna memilih rentang tanggal, metode pembayaran, status penjualan/pembayaran, pembuat, atau ID sesi, THE SYSTEM SHALL mengembalikan kombinasi filter AND yang tepat termasuk rentang lintas bulan/tahun. | Menemukan transaksi |
| REQ-004 | WHEN pengguna mencari nomor struk, NIK, atau nama pelanggan, THE SYSTEM SHALL mencari field tersimpan pada header, memperlakukan wildcard sebagai literal, serta mempertahankan filter cabang dan tanggal. | Search aman |
| REQ-005 | WHEN hasil melebihi page size, THE SYSTEM SHALL memberikan pagination server, count sesuai filter, urutan deterministik, dan URL filter yang dipertahankan saat kembali dari detail. | Browsing bounded |
| REQ-006 | WHEN pengguna membuka `/sales/invoice/{id}`, THE SYSTEM SHALL menampilkan header, pelanggan tersimpan, pembuat, metode/status, ringkasan uang tersimpan, item berhalaman, dan status kelengkapan data tanpa membutuhkan master aktif. | Detail transaksi |
| REQ-007 | WHEN pengguna memiliki sales_view AND sales_payment_view dan membuka pembayaran, THE SYSTEM SHALL menampilkan seluruh payment row dalam scope parent/cabang secara read-only, termasuk status/nominal/catatan/pembuat, dengan pagination. Jika tidak berizin panel/endpoint ditolak. | Payment log |
| REQ-008 | WHEN transaksi memenuhi eligibility, THE SYSTEM SHALL menyediakan “Cetak ulang struk” 80 mm memakai halaman receipt existing dan browser print, dengan identitas cetak ulang; preview dibuka melalui klik pengguna. | Reprint |
| REQ-009 | WHEN list/detail/struk menampilkan nominal, THE SYSTEM SHALL memakai nilai header/line/payment tersimpan dengan presisi minor units; Cash paid/change ditampilkan terpisah, QRIS/Kredit tidak menjadi physical cash, dan tidak menghitung ulang harga dari master. | Akurasi uang |
| REQ-010 | WHEN transaksi berstatus non-Final, retur, non-POS, metode tidak dikenal, atau data tidak layak cetak, THE SYSTEM SHALL tetap menampilkan record/detail dan alasan cetak diblokir, tanpa menyulapnya menjadi transaksi Cash normal. | Historical edge cases |
| REQ-011 | WHEN transaksi memiliki sesi kasir valid pada cabang yang sama, THE SYSTEM SHALL menampilkan ID/reference/label kasir dan menyediakan filter sesi; relasi hilang/null/asing diberi “Referensi sesi tidak tersedia” tanpa membocorkan metadata asing. | Link sesi |
| REQ-012 | WHEN pengguna mengakses list/detail/cetak/pembayaran langsung, THE SYSTEM SHALL memeriksa matriks permission di server; sales_view-only dapat detail/cetak, sales_add-only tetap dapat mencetak sesudah checkout. | Konsistensi akses |
| REQ-013 | WHEN admin mengganti cabang melalui flow auth existing, THE SYSTEM SHALL membersihkan hasil/detail/pembayaran lama dan memuat ulang dari company session yang baru; request lama tidak boleh menimpa hasil cabang baru. | Branch switching |
| REQ-014 | WHEN terjadi loading, hasil kosong, invalid query, session expired, forbidden, not found, unsupported print, atau DB unavailable, THE SYSTEM SHALL memberi state yang berbeda, pesan Indonesia, dan retry baca tanpa menjalankan checkout. | Recoverable UI |
| REQ-015 | WHEN halaman digunakan di desktop atau mobile, THE SYSTEM SHALL menyediakan filter/action yang dapat diakses keyboard, label jelas, status tidak hanya warna, dan scroll tabel lokal tanpa overflow halaman. | Usability |
| REQ-016 | WHEN pengguna berizin membaca history tanpa register terbuka atau ketika writer POS/register/inventory tidak tersedia, THE SYSTEM SHALL tetap menyediakan history melalui reader existing, tanpa mengubah stok, limit, payment, atau saldo sesi. | Baca independen |

## 3. Business rules

| ID | Aturan dan enforcement |
|---|---|
| BR-001 | Application mempertahankan raw sales_status/payment_status/payment_type/status/return_bit. Label Paid/Dibayar, Unpaid/Belum dibayar, Partial/Sebagian boleh dinormalisasi untuk display saja. Kredit berstatus Paid tidak berarti kas fisik diterima. Tidak menyimpulkan cancellation dari status=0 saja. |
| BR-002 | Repository mengubah nominal DECIMAL/DOUBLE melalui CAST DECIMAL(18,2) lalu konversi minor units yang aman. Header grand_total adalah nilai otoritatif; paid_amount tidak dikurangi menjadi grand_total seperti legacy list. `round_off` disajikan raw sebagai “Nilai round_off legacy”, bukan adjustment otomatis. |
| BR-003 | Pelanggan historis menggunakan db_sales.customer_name/nik_kar; anggota/master current tidak wajib. Label item menggunakan description jika benar-benar nonempty sebagai deskripsi tersimpan (bukan klaim nama snapshot), lalu item_name current dalam company, lalu “Item #{item_id}”; provenance ditampilkan. Harga/nilai selalu dari line. |
| BR-004 | Tanggal transaksi menggunakan sales_date DATE tanpa jam buatan. created_time tidak dianggap waktu asli transaksi karena dapat berubah saat update. Mode reprint tidak membaca/menampilkan plafon atau penggunaan kredit current/lintas cabang. |
| BR-005 | Eligibility cetak diperiksa ulang di server saat preview; satu row bermasalah tidak menggagalkan seluruh list. Label “Cetak ulang” tidak memiliki nomor urut, print counter, atau klaim print sukses. Data retur/charge/payment yang ambigu membutuhkan format terpisah di backlog. |

## 4. Validation

| ID | Constraints |
|---|---|
| VAL-001 | Query di-allowlist; dates YYYY-MM-DD kalender valid, from <= to, maksimum 93 hari inklusif; page integer >=1, pageSize 1..100 default25, offset <=100000; q trim max100; payment/status/pembuat max50/50/100. Invalid/duplicate/unknown key → 400 INVALID_INPUT, bukan silently wider query. |
| VAL-002 | Sale/register ID decimal positif, safe integer <=2147483647; source pos/nonpos/all; sort terbaru/terlama memakai sales_date lalu id. salesStatus/paymentStatus menerima raw string max50 atau sentinel `all` dengan exact match untuk raw. |
| VAL-003 | Nominal nonfinite/tidak safe minor integer → field null + warning DATA_INCOMPLETE, bukan nol palsu; cetak diblokir jika field wajib invalid. Nilai negatif tersimpan boleh terlihat dengan warning, tidak dikoreksi atau dipakai menghitung change cetak normal. |
| VAL-004 | Detail line dan payment memiliki page/pageSize yang sama-sama bounded; default line50, payment25; max100/page. Receipt maksimum200 line; jumlah lebih besar tetap terlihat berhalaman namun cetak reguler ditolak PRINT_TOO_LARGE. Catatan panjang disajikan sebagai plain text dengan expand, tanpa render HTML. |

## 5. Security

| ID | Enforcement |
|---|---|
| SEC-001 | Session/user/role/company aktif diverifikasi pada setiap page/API melalui helper auth existing sebelum data dibaca; failures fail closed. |
| SEC-002 | sales_view untuk semua route Sales; payment membutuhkan dua permission; receipt existing memakai sales_add OR sales_view. Tidak membuat permission baru/grant otomatis, dan permission tidak bergantung pada flag client. |
| SEC-003 | companyId hanya dari AuthContext; parent, item, payment, register, kasir/master label wajib scoped. Tidak menerapkan admin all-company bypass; not found dan foreign company sama-sama 404. Search OR tetap berada di dalam tenant predicate. |
| SEC-004 | Payload hanya field yang perlu, tanpa password, SID, DSN, system_ip/system_name, plafon anggota, sales_note digest internal, atau HPP. Logs tidak mencatat nama/NIK/invoice/search/payment note atau SQL mentah. |
| SEC-005 | SQL parameterized, sort dari allowlist, LIKE metacharacters escaped; UI escape plain text. API/history/receipt memakai no-store; raw error DB tidak dikirim/log. GET tidak menulis business data; mutasi auth existing tetap memakai CSRF. |

## 6. Non-functional, observability, migration

| ID | Acceptance target |
|---|---|
| NFR-001 | List page25/rentang31 hari pada dataset representatif staging existing: p95 API <=2 detik, detail/payment <=2 detik, receipt <=3 detik, diukur minimal30 request per operasi setelah warm-up. Tanpa N+1 atau download seluruh transaksi untuk count. Benchmark belum dilakukan. |
| NFR-002 | Checkout Cash/QRIS/Kredit, auto-print checkout, stock/register lifecycle dan branch policy existing lulus regression; tidak menambah library/package/queue/worker. |
| NFR-003 | Pembacaan history tidak cached bersama antar-user/cabang. Request lama diabort/diabaikan saat filter/branch berubah; total/page dihitung memakai predicate yang sama. Pagination bukan snapshot lintas request, refresh dapat mengubah jumlah ketika legacy menulis. |
| OBS-001 | Log operasional existing mencatat operation, durasi, error code sanitized tanpa data pelanggan; response print tidak menjadi event sukses fisik. Tidak menambah tabel audit. |
| OBS-002 | Response detail memberi warning terstruktur untuk missing master/session, invalid money, unsupported print; UI menunjukkan batas data, bukan menyembunyikan record atau mengoreksi histori. |
| MIG-001 | Zero database/schema change: tidak CREATE database/table/view/trigger/index, ALTER, db push/migrate/reset, atau migration SQL; semua kebutuhan memakai mapping/tabel existing. |
| MIG-002 | Tanpa seed, backfill, rewrite transaksi, customer-payment cache rebuild, perubahan ownership, atau writer baru. Auth housekeeping yang sudah ada tetap boleh berjalan pada auth store existing. |
| MIG-003 | Sebelum aktivasi, verifikasi reader privileges/schema/index/performance dan permission di target staging existing yang disetujui; rollback hanya kode, tanpa SQL/data rollback. Verifikasi produksi/deployment tidak termasuk task spesifikasi. |
