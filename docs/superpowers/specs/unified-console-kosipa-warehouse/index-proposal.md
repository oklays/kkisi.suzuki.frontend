# Usulan Indeks KOSIPA (review) — `trans_pinjaman_dtl`, `trans_potongan_matrix`

Tanggal: 16 Oktober 2026. Status: **usulan untuk review. Tidak ada DDL yang dijalankan di mana pun** (bukan di produksi, bukan di staging, bukan di database lokal). Semua pengukuran di bawah adalah `SELECT`/`EXPLAIN`/`SHOW` read-only melalui akun SELECT-only pada salinan staging lokal (data produksi per 30 Sep 2026). Artefak SQL: [`kosipa-read-indexes-proposed.sql`](../../../migration/sql/kosipa-read-indexes-proposed.sql) (DDL, review-only) dan [`kosipa-read-queries-validation.sql`](../../../migration/sql/kosipa-read-queries-validation.sql) (query validasi, read-only).

## 1. Ringkasan dan rekomendasi

1. **Asumsi awal tentang ukuran tabel keliru.** Angka "±3,5 juta" dan "±1,2 juta" adalah nilai `AUTO_INCREMENT` (batas atas), bukan jumlah baris. Terukur: `trans_pinjaman_dtl` **1.198.697** baris (196 MB), `trans_potongan_matrix` **84.924** baris (59 MB).
2. **Rekomendasi (Tier 1): dua indeks pada `trans_pinjaman_dtl` saja** — `(nik_kar, tgl_cicilan)` dan `(doc_no, ke_cicilan)`. Tabel ini dibaca penuh (±190–360 ms pada salinan lokal tanpa kontensi) oleh setiap tampilan rincian angsuran.
3. **Tidak merekomendasikan indeks pada `trans_potongan_matrix` saat ini.** Scan penuh hanya 14–65 ms pada 85 rb baris. Pembacaan payroll (TASK-027) tidak perlu menunggu indeks; indeks dicantumkan sebagai opsi terkomentar bila pengukuran produksi berbeda.
4. **Indeks tidak menyelesaikan kemiringan data.** Tiga NIK memegang ±80% baris `trans_pinjaman_dtl` (635.417 / 262.529 / 61.266 baris; masing-masing 108–150 pinjaman, ±99% `Belum Bayar`, banyak `tgl_cicilan` nol). Query untuk NIK itu tetap berat berapa pun indeksnya: aplikasi **wajib paginasi** (`LIMIT` + keyset) dan tidak boleh memuat semuanya.
5. **Bukti produksi belum lengkap.** Keadaan indeks produksi saat ini belum diverifikasi (lihat §7). Jangan menjalankan DDL sebelum pra-cek read-only di `kosipa-read-indexes-proposed.sql` §1 dilakukan operator.

## 2. Query yang dioptimalkan

| ID | Query | Asal | Status |
|---|---|---|---|
| Q1 | `trans_pinjaman_dtl WHERE nik_kar = ? ORDER BY tgl_cicilan` (rincian angsuran per anggota) | Anggota 360 tab angsuran (TASK-026), saat ini ditandai `INDEX_REQUIRED` | Direncanakan |
| Q2 | `trans_pinjaman_dtl WHERE doc_no = ? ORDER BY ke_cicilan` (jadwal satu pinjaman) | Legacy `pinjaman_c::update_biaya_flat` (`trans_pinjaman_dtl where doc_no=? order by id DESC limit 1`); layar detail pinjaman (TASK-026) | Pola `doc_no` terbukti di legacy; query Next.js direncanakan |
| Q3 | `trans_potongan_matrix m JOIN trans_potongan_bulanan b ON b.doc_no = m.periode WHERE m.nik_kar = ?` | Riwayat potongan per anggota (TASK-027) | Direncanakan |
| Q4 | `trans_potongan_matrix WHERE periode = ?` (SUM dan halaman) | Legacy `payroll/matrix_c` (`SUM(...) WHERE periode='$doc_no'`, `select * ... where periode`) | Legacy terbukti |
| Q5–Q9 | Simpanan, header pinjaman, kredit toko, cari anggota (query Anggota 360 yang sudah ada, Checkpoint 3) | `kosipa-member.repository.ts` | Berjalan |

Catatan: query legacy payroll approval memakai `YEAR(tgl_cicilan)=? AND MONTH(tgl_cicilan)=?`, yang **tidak dapat memakai indeks apa pun** (fungsi pada kolom). Indeks usulan tidak membantu PHP legacy; implementasi Next.js memakai rentang tanggal (`>= ? AND < ?`).

## 3. Bukti terukur (salinan staging lokal, 30 Sep 2026; read-only)

| Fakta | Nilai |
|---|---|
| Indeks pada tabel KOSIPA besar | **Hanya `PRIMARY`** (`trans_pinjaman_dtl`, `trans_potongan_matrix`, `trans_pinjaman`, `trans_simpanan(_dtl)`, `trans_potongan_bulanan`). Konsisten dengan DDL dump 30 Sep |
| `trans_pinjaman_dtl` | 1.198.697 baris; 195,7 MB data; AUTO_INCREMENT 3.589.543; 1.640 NIK; 33.787 `doc_no`; rata-rata 731 baris/NIK, 35,5 baris/pinjaman |
| Kemiringan | NIK teratas 635.417 / 262.529 / 61.266 baris (≈ 80%); satu `doc_no` hingga 354.539 baris |
| Status cicilan | `Belum Bayar` 956.575; `Bayar` 242.122. `type_cicilan` NULL 980.602 |
| Kualitas tanggal | `tgl_cicilan` nol (`0000-00-00`): **513.925 baris (43%)**; maksimum `9999-12-10` |
| Baris yatim | 33.136 baris detail yang `doc_no`-nya tidak ada di `trans_pinjaman` |
| Panjang kunci | `nik_kar` rata-rata & maks 5 karakter; `doc_no` rata-rata 16,5 (maks 24); `periode` rata-rata 13,8 (maks 14). Semua `latin1_swedish_ci`, `varchar(50)` |
| `trans_potongan_matrix` | 84.924 baris; 58,6 MB; 6.136 NIK; 132 periode (6–4.537 baris, rata-rata 643); rata-rata 13,8 baris/NIK |
| Format NIK | Semua NIK distinct di tabel KOSIPA **cocok persis** dengan `m_anggota.nik_kar` (tanpa kecocokan numerik-saja). 93% NIK memiliki nol di depan, sehingga pencocokan harus memakai string apa adanya (sesuai Checkpoint 3), bukan `CONVERT(...)` |

Rencana eksekusi dan latensi saat ini (tanpa indeks; median/rentang 3 kali jalan, SSD lokal, tanpa kontensi):

| Query | Plan | Hasil | Waktu (ms) |
|---|---|---|---|
| Q1 (NIK dengan 718 baris) | `ALL` 1.193.572 baris + filesort | 718 | 210–358 |
| Q2 (pinjaman 12 baris) | `ALL` 1.193.572 baris + filesort | 12 | 189–195 |
| Q3 | `ALL` 135 + join buffer pada `ALL` 81.268 | 8 | 19–65 |
| Q4a total periode | `ALL` 81.268 | 1 | 14 |
| Q4b halaman periode | `ALL` 81.268 + filesort | 50 | 18–21 |
| Q5 simpanan per anggota | `ALL` 109.789 (+ turunan 5.718) | 6 | 22–27 |
| Q6 header pinjaman | `ALL` 31.657 | 10 | 9–25 |
| Q7 kredit toko bulan ini | `ref idx_sales_nik` (indeks hanya ada di staging) | 1 | 1–3 |
| Q8 anggota per NIK | `ref idx_anggota_nik` (hanya staging) | 1 | 1 |
| Q9 cari nama `LIKE '%…%'` | `ALL` 9.450 | 25 | 3–11 |

## 4. Usulan indeks dan urutan kolom

### Tier 1 (direkomendasikan, `trans_pinjaman_dtl`)

| Indeks | Melayani | Alasan urutan kolom |
|---|---|---|
| `idx_nx_pdtl_nik_tgl (nik_kar, tgl_cicilan)` | Q1 | Kesetaraan pada `nik_kar` lalu urutan `tgl_cicilan`: tanpa filesort, dan rentang tanggal (`>= ? AND < ?`) dapat dibaca langsung. Entri sekunder InnoDB otomatis berakhir dengan `id`, sehingga urutan `(tgl_cicilan, id)` untuk keyset pagination sudah tercakup |
| `idx_nx_pdtl_doc_ke (doc_no, ke_cicilan)` | Q2 | Kesetaraan pada `doc_no` lalu urutan angsuran; rata-rata 35 baris/pinjaman |

Sengaja **tidak** mengikutkan `status_cicilan`/`type_cicilan` dalam indeks: kolom itu diubah massal saat approval payroll (legacy `UPDATE ... SET type_cicilan='PAYROLL', status_cicilan='Bayar'`); kolom beterindeks yang berubah memaksa pemeliharaan indeks pada setiap baris. Filter status pada ≤ ±700 baris per anggota murah dilakukan setelah indeks. Indeks `(status_cicilan, tgl_cicilan)` untuk penyelesaian payroll adalah kebutuhan **penulis** payroll (TASK-045, belum diizinkan) dan tidak diusulkan sekarang.

### Tier 2 (hanya catatan, tanpa DDL di sini)

`m_anggota(nik_kar)` dan `db_sales(nik_kar)` mempercepat Q7/Q8 dan jalur Kredit POS, tetapi: (a) terukur sudah 1–3 ms **di staging yang memilikinya** sedangkan DDL dump 30 Sep menunjukkan produksi tanpa indeks itu (belum diverifikasi, §7); (b) `db_sales` berada di jalur checkout POS yang hidup dan mengikuti rencana terpisah (`pos-lock-indexes-production.sql`). Keputusan diserahkan ke pemilik rencana itu setelah pra-cek produksi.

### Tier 3 (tidak direkomendasikan sekarang, `trans_potongan_matrix`)

`(periode, nik_kar)` dan `(nik_kar, periode)`: terkomentar di SQL. Alasan: scan penuh 14–65 ms. Ukuran bila ditambahkan: ±2,5 MB per indeks.

### Yang sengaja tidak diusulkan

- Indeks pada `m_anggota.nama_kar` untuk `LIKE '%x%'`: wildcard di depan tidak dapat memakai B-tree. Alternatif (pencarian prefiks/FULLTEXT) di luar lingkup.
- Indeks pada `tgl_cicilan` saja: 43% nilainya nol, selektivitas buruk.
- Fungsi pada kolom (`CONVERT`, `YEAR()`): tidak pernah dipakai di Next.js.

## 5. Perbaikan perilaku aplikasi yang tidak bergantung pada DDL

1. Paginasi wajib untuk tab angsuran: `LIMIT ≤ 200`, keyset pada `(tgl_cicilan, id)`; abaikan `tgl_cicilan` nol/`9999` saat diurutkan atau tampilkan di bagian terpisah.
2. Tiga NIK dengan ratusan ribu baris perlu penanganan eksplisit (ringkasan agregat, bukan daftar baris) setelah pemilik data menjelaskan siapa mereka (kemungkinan rekening agregat pembiayaan/bank).
3. Laporkan 33.136 baris yatim kepada pemilik data (rekonsiliasi, bukan perbaikan diam-diam).

## 6. Dampak yang diharapkan, ukuran, dan biaya tulis

**Dampak (harapan, BELUM diukur karena tidak ada DDL yang dijalankan):** Q1 dari `ALL` 1,19 jt baris + filesort menjadi `ref` pada `idx_nx_pdtl_nik_tgl` dengan `rows` ≈ jumlah baris anggota (rata-rata ±731; ±635 rb hanya untuk tiga NIK tertentu) tanpa filesort; Q2 menjadi `ref` pada `idx_nx_pdtl_doc_ke` dengan `rows` ≈ 12–35. Dari sisi waktu, tujuan masuk akal adalah satu hingga dua digit milidetik pada salinan lokal; angka produksi (RTT tunnel 24 ms, hosting bersama) harus diukur ulang.

**Perkiraan ukuran** (rumus: panjang kunci rata-rata + 1 byte panjang varchar + PK 4 byte + ±5 byte overhead; faktor 1,3 untuk page fill): `idx_nx_pdtl_nik_tgl` ≈ (1+5)+3+4+5 = 18 B × 1,2 jt ≈ 22 MB → **±28 MB**; `idx_nx_pdtl_doc_ke` ≈ (1+16,5)+4+4+5 ≈ 30 B × 1,2 jt ≈ 36 MB → **±48 MB**. Total **±75 MB (±+38%)** terhadap 196 MB data. Kapasitas disk bebas harus dicek operator.

**Biaya tulis:** jadwal angsuran diinsert massal saat pencairan (12–60 baris/pinjaman); tiap indeks menambah satu penyisipan B-tree per baris (asumsi: dampak kecil; ukur pada validasi). Update massal status/type saat approval payroll **tidak** mengubah kolom beterindeks, sehingga tidak ada pemeliharaan indeks. **Asumsi belum terbukti:** legacy tidak menghapus-dan-menulis ulang baris jadwal secara rutin (bagian `update_biaya_*` yang terlihat mengomentari `DELETE`); bila ya, biaya tulis naik.

**Risiko DDL:** `ALGORITHM=INPLACE, LOCK=NONE` membangun indeks tanpa mengunci tabel, tetapi memakai I/O dan disk sementara di hosting bersama; jalankan di luar jam sibuk dengan backup, dan jangan bersamaan dengan approval payroll PHP.

## 7. Bukti vs asumsi, dan bukti yang masih hilang

| Butir | Status |
|---|---|
| Struktur kolom/tipe dan tidak adanya indeks (selain PK) | **Terbukti** (DDL dump 30 Sep + salinan staging) |
| Jumlah baris, distribusi, kemiringan, kualitas tanggal, format NIK | **Terukur** pada salinan 30 Sep |
| Rencana dan waktu *tanpa* indeks | **Terukur** (lokal) |
| Rencana dan waktu *dengan* indeks | **Asumsi/harapan** (tidak ada DDL dijalankan) |
| Indeks produksi **saat ini** | **Belum diverifikasi.** Dump berumur ±2 minggu; rencana indeks POS dikerjakan sekitar 13 Okt dan produksi dapat berubah. Dijawab oleh pra-cek read-only (`kosipa-read-indexes-proposed.sql` §1, juga TASK-003 `legacy-schema-objects-readonly.sql` §5) |
| Jumlah baris & latensi produksi | **Hilang** (hanya perkiraan `TABLE_ROWS` di produksi yang dapat menjawab) |
| Pola tulis legacy pada `trans_pinjaman_dtl` (hapus/tulis ulang) | **Belum dibaca penuh** |
| Siapa tiga NIK dominan | **Tidak diketahui** (identifikasi perlu pemilik data; tidak ditulis di dokumen publik) |
| Definisi view `v_trans_pinjaman_*` (dapat membaca tabel yang sama) | **Hilang** (TASK-003) |

Tidak ada definisi indeks yang dikarang untuk kolom yang tidak terverifikasi: semua kolom di atas (`nik_kar`, `tgl_cicilan`, `doc_no`, `ke_cicilan`, `periode`) ada pada DDL dump dan salinan staging.

## 8. Metode validasi di staging (aman)

1. Siapkan salinan sekali pakai: `scripts/setup-staging.sh --reset` dari dump (atau dump baru dari operator). Tabel KOSIPA besar di sini hanya memiliki `PRIMARY` (sesuai produksi per 30 Sep); jangan memakai database produksi.
2. **Baseline:** jalankan `kosipa-read-queries-validation.sql` (isi `@nik` anggota biasa dan satu dari tiga NIK dominan, `@loan`, `@per`); catat `EXPLAIN` dan median 3 kali jalan.
3. Terapkan **hanya** §2 pada container staging lokal sebagai root (tidak pernah lewat akun aplikasi), satu `ALTER` per kali; catat durasi build.
4. **Ulangi** langkah 2. Kriteria penerimaan: Q1 dan Q2 `type=ref` pada indeks baru, tanpa `Using filesort`; `rows` ≤ 2× baris hasil; median Q1/Q2 ≤ 50 ms untuk anggota biasa; ukuran indeks ≤ 100 MB; tidak ada hasil query yang berubah (bandingkan checksum hasil sebelum/sesudah).
5. **Konkurensi:** jalankan `UPDATE` massal serupa approval payroll pada salinan sambil membangun indeks; tidak boleh ada tunggu kunci > 1 detik (batas aplikasi `innodb_lock_wait_timeout` 8 detik).
6. **Biaya tulis:** bandingkan `INSERT` 5.000 baris jadwal sebelum/sesudah; selisih > 25% = tinjau ulang.
7. **Rollback:** jalankan `DROP INDEX` dan pastikan rencana kembali ke `ALL`.
8. Setelah lolos: serahkan hasil ke pemilik; eksekusi produksi hanya oleh operator dengan persetujuan terpisah, lalu pantau latensi dan lock wait.

## 9. Pernyataan keselamatan

- **Tidak ada DDL yang dijalankan** pada sistem mana pun oleh pekerjaan ini. File `kosipa-read-indexes-proposed.sql` adalah usulan.
- Pengukuran: hanya `SELECT`/`EXPLAIN`/`SHOW` melalui akun `kkisi_read` (grant: `SELECT` pada `kkisi_staging`) pada container lokal. Tidak ada akses produksi; tidak ada identifier anggota yang dicetak atau disimpan dalam dokumen ini.
- Tidak ada perubahan kode aplikasi selain koreksi teks/komentar pada klaim "tabel besar dan belum berindeks di produksi" yang tidak terbukti.
