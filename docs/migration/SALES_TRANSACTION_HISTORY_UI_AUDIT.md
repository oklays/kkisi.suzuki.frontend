# Audit dan polish Riwayat Transaksi

Tanggal: 5 Oktober 2026. Scope: implementasi Sales pada checkout lokal, dari menu dan entry langsung sampai filter, detail, pembayaran, dan cetak ulang. Audit memakai source aplikasi/mapping yang sudah didokumentasikan, unit/contract tests, dan browser lokal. Tidak melakukan audit ulang menyeluruh source PHP atau pemeriksaan produksi.

## Temuan dan perbaikan

| Area | Penyebab / anomali | Perbaikan dan bukti |
| --- | --- | --- |
| Filter normal ditolak | Form GET selalu mengirim `registerId=` walaupun opsional. Parser memperlakukannya sebagai angka invalid. | Blank dianggap tidak memilih sesi; UI menghilangkan parameter opsional kosong. Nilai invalid dan duplicate tetap ditolak. Regression red/green domain + submit browser. |
| Sidebar kehilangan menu | Session Sales tidak mengisi `canProducts` dan `canInventory`. | Shared server capability projection mengikuti permission/policy cabang existing. List, detail, loading dan error memakai layout Sales yang sama. Unit permission matrix dan browser parity dengan Produk. |
| Direct entry berbeda tampilan | Komponen Sales sebelumnya tidak memuat stylesheet shell POS. | Layout mengimpor stylesheet shell dan Sales secara eksplisit. Browser fresh navigation memeriksa layout flex. |
| Sidebar/body ikut scroll | Shell responsif melepaskan batas tinggi dan konten tidak memiliki scroll owner. Overflow scaling juga menambah scroll dokumen di mobile. | Shell Sales ditambatkan ke viewport pada zoom 80% existing; `.sales-scroll` mengelola scroll konten. Table horizontal scroll lokal. Browser mengukur scroll dokumen, sidebar dan konten di 375/390/768/1280/1440 px. Scope CSS hanya Sales. |
| Toolbar admin mobile bertabrakan | Nama cabang panjang dan logout berada dalam container absolut dengan ukuran intrinsic yang melebar. | Toolbar memakai grid logo/kontrol dengan select bounded, lalu navigasi pada baris terpisah; error cabang dapat wrap. Browser layout-only variant memakai markup branch picker sintetis di 375px, tanpa role grant atau branch mutation. Live branch policy tetap gate terpisah. |
| Loading/error menghilangkan navigasi | Halaman menampilkan card bergaya login di luar shell. | Persistent layout, skeleton workspace, pending pencarian/link, recovery error, not-found dan invalid URL di dalam shell. Permission/session unavailable tetap fail closed, tanpa membuat session palsu. |
| Filter kurang jelas / stale input | Error umum; semua filter selalu terbuka; defaultValue dapat mempertahankan isian lama setelah navigasi. | Validasi sebelum navigasi, pesan tanggal/rentang spesifik, fokus error, periode cepat, filter lanjutan, sort/page size, key dari query. Reset juga membersihkan edit yang belum diterapkan. Status/metode legacy custom tetap dipertahankan. Browser submit/reset/preset/back/pagination/delayed navigation. |
| Tabel sulit dibaca | Metode/status pembayaran teks biasa; nominal/action kurang dibedakan; empty table terlalu lebar di mobile. | Chips metode Cash/QRIS/Kredit + status raw, status nonaktif/retur, rupiah exact dan rata kanan, tanggal lokal, tautan nomor struk, action column sticky desktop, empty state terpisah dengan reset/recovery. Unknown method/status memakai gaya netral. SSR checks dan screenshot review. |
| Halaman di luar hasil | Hasil kosong tanpa jalan kembali yang jelas. | Recovery ke halaman pertama tanpa membuang filter. Terapkan filter selalu memulai page 1. Detail item menyediakan recovery halaman pertama. |
| Pagination detail salah | Total baris memakai all-company count sementara rows sudah scoped ke company aktif. | Total/hasNext memakai scoped count; all-company count hanya untuk integrity gate reprint. Foreign data tetap tersembunyi. Regression red/green repository. |
| Duplicate query detail diterima | Array `linePage` dikonversi menjadi undefined lalu dianggap page 1. | Page detail menolak duplicate/unknown parameter dan offset berlebihan. Return link hanya `/sales` atau `/sales?...`. Browser invalid/not-found dan unit return path validation. |
| Pembayaran race/retry | Tidak ada abort; retry memakai page sukses lama, bukan page gagal. | Abort ketika tutup/unmount atau request baru; stale response tidak diterapkan; retry page yang diminta; paging mengikuti `hasNext` API. Loading/error tidak menampilkan cached rows. 401 memberi link login, 403 memberi pesan izin. Browser cancellation + request sequence `[1,2,2]` + 401/403 interception. |
| Detail pembayaran kurang lengkap | Kembalian/catatan/status record kurang mudah diperiksa. | Tabel nominal/kembalian exact, chips metode dan record aktif/nonaktif, disclosure catatan, warning nilai, accessible disclosure target tetap ada ketika ditutup. Tidak menyimpulkan lunas dari catatan pembayaran. |
| Cetak ulang normal terblokir | `round_off !== 0` dan input biaya Cash nonzero selalu dianggap ambigu. Checkout existing menyimpan rounded grand total dan kembalian pada field ini. | Shared pure policy menerima round_off zero atau nilai rounded grand total, serta input Cash zero/absent/exact change. Nilai ini tidak ditambah/dikurang dari total struk. Tiga metode dan pecahan rupiah diuji red/green; browser mewajibkan fixture checkout normal eligible dan tombol print eksplisit. |
| Amount null/negatif tidak konsisten | Missing charge amount diubah menjadi zero dalam facts; negative line amount belum diblokir seragam. | Missing amount tetap unknown, negative/unsafe amounts memblokir reprint. Aggregate integrity memeriksa seluruh item, termasuk di luar halaman aktif. Detail tetap memperlihatkan saved data. Regression red/green adapter dan receipt. |
| Ketergantungan master anggota saat reprint | Query masih menyebut master anggota walaupun join selalu false pada reprint; reader tetap memerlukan izin tabel tersebut. | Query reprint sekarang menghilangkan join/projection master anggota sepenuhnya; snapshot pelanggan digunakan. Checkout tetap memakai master/current credit behavior existing. Regression red/green memastikan SQL reprint tidak mereferensikan `m_anggota`. |
| Regresi checkout receipt | Tambahan reprint sebelumnya menghilangkan predicate Final dan memasang LIMIT 201 pada checkout. | Checkout kembali memakai predicate header/line Final dan tidak dipotong. Reprint tetap bounded dan gate ulang. Regression red/green receipt repository; tidak mengubah checkout writer. |

## Batas dan validasi

- Daftar/detail/pembayaran tetap membaca tabel legacy existing lewat repository SELECT-only. Semua API/page menjaga authorization server dan company dari sesi, bukan parameter pengguna. Session capabilities hanya untuk UX; endpoint tidak mempercayainya.
- Tidak ada database, tabel, index, migration, seed, grant, perubahan schema, atau perubahan writer transaksi/stock/register. Login browser memakai akun uji existing; session housekeeping existing dibedakan dari business writes.
- Sidebar Dashboard Supervisor dan Laporan Keuangan masih placeholder existing. Menu Produk/Inventory yang berizin tidak ikut dinonaktifkan lagi saat membuka Sales.
- Screenshot list lima viewport dan detail desktop/mobile ditinjau secara visual. Keyboard Tab, fokus validasi, disclosure native, table region/caption/headers dan reduced-motion tersedia.
- Browser suite memakai GET lokal existing untuk Sales/detail/payment dan interception synthetic untuk slow/network/error/payment-page scenarios. Interception tidak membuat row database. Tidak mengganti response aplikasi dengan fixture fallback pada penggunaan normal.
- `window.print()` diuji dengan spy: tidak dipanggil otomatis pada preview reprint, dipanggil satu kali setelah klik. Ini bukan bukti printer fisik atau dialog OS/PDF 80 mm sudah diterima.

## Commands

```sh
pnpm check
pnpm build
node apps/web/tests/sales-history-browser.mjs
git diff --check
```

Browser membutuhkan Chrome lokal, aplikasi pada `127.0.0.1:3000`, dan file credential uji existing yang diabaikan Git. Script tidak memprovision/seed dan gagal jika dataset uji yang dibutuhkan tidak tersedia. Credentials/payload pelanggan tidak dicetak ke laporan. Screenshot hanya disimpan ke temporary directory.

Hasil final lokal: `pnpm check` lulus (domain 22, application 20, web 184; 0 gagal; 42 skip opt-in existing). Empat lint warning existing tetap ada. `pnpm build`, browser suite, dan `git diff --check` lulus.

## Gates terpisah yang masih perlu dilakukan

1. Reader privilege dan schema/index compatibility pada staging existing yang disetujui; tidak membuat schema baru jika unavailable.
2. Sample historis representatif, matriks role/cabang live, expired/revoked sessions antar-tab. Unit/contract authorization sudah tersedia; browser lokal memakai satu akun existing.
3. Benchmark 30 warm reads per operasi serta EXPLAIN pada volume staging representatif. Tidak menambah index diam-diam.
4. Review PDF/printer fisik 80 mm dan rehearsal rollback kode pada environment yang disetujui.
5. Format struk untuk transaksi dengan charge/tax/totals yang benar-benar ambigu, multi-payment, retur atau >200 item tetap backlog; detail tetap tersedia dengan alasan penolakan cetak yang eksplisit.

Tidak ada commit, push, deploy, atau klaim acceptance produksi dari audit lokal ini. TASK-001/TASK-009/TASK-010 tetap partial/open untuk gates environment yang tercantum pada spec.
