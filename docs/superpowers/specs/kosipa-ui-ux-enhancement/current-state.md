# Current state dan baseline aktual

Bukti: source lokal HEAD `e780422a`, 20 Oktober 2026; browser pada `http://127.0.0.1:3201`. Port 3200 dan 3201 sudah berjalan sebelum audit dan tidak dihentikan. Semua data yang dibuka sintetis. Tidak menjalankan reset, seed, grant, revoke atau transaksi finansial. Login dan pembukaan data tetap menulis session/audit normal melalui aplikasi.

## Cakupan teramati

17 file `page.tsx` di `apps/web/src/app/console/kosipa/`; 23 contoh URL/state (termasuk pencarian, duplikat dan jadwal besar) × 3 persona × 2 viewport = **138 screenshot**, 69 pembukaan halaman, tanpa error pengambilan. Semua halaman/state yang diminta merespons HTTP 200; denied/not-linked disampaikan sebagai state halaman (HTTP 200 bukan bukti akses data diizinkan). Pemeriksaan scrollWidth pada 1440/390 menunjukkan nol global overflow pada seluruh 138 pengamatan. Lebar lain, a11y penuh, source outage, revoke, dan after belum diuji oleh audit ini.

Bukti lokal (tidak berisi credential):
- [Manifest baseline](/private/tmp/kkisi-kosipa-uiux-20261020/before/manifest.json), [manifest tambahan](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/manifest.json).
- [Script audit](/private/tmp/kkisi-kosipa-uiux-20261020/baseline.mjs), [script skenario tambahan](/private/tmp/kkisi-kosipa-uiux-20261020/supplement.mjs). Script membaca fixture private tanpa mencetak isinya.
- Direktori screenshot: `/private/tmp/kkisi-kosipa-uiux-20261020/before/` dan `before-supplement/`. Artefak `/private/tmp` lokal dan tidak versioned; arsipkan paket screenshot ke penyimpanan handover yang disetujui sebelum cleanup.

## Alur dan batas layer

`apps/web/src/features/console/navigation.ts` → `ConsoleFrame`/Console layout → server page → `requireConsoleSession()` + capability → `kosipaServices()` → use case `packages/application/src/kosipa/*` → repository `apps/web/src/infrastructure/repositories/kosipa-*.repository.ts` → legacy reader. Keuangan read-side diaudit sebelum read pada use case; member directory `searchMembers` saat ini memeriksa capability dan bounded 25 hasil, tetapi tidak melakukan audit sendiri (jangan mengklaim audit baru yang belum ada). Sumber tidak memakai mock adapter: DEV LOCAL berisi tabel sintetis dengan reader Prisma yang sama.

Payroll list/batch/member, loan list/detail, savings ledger dan reports menggunakan request-scoped guard serta audited use cases. Sumber utama `m_anggota`, `trans_simpanan*`, `trans_pinjaman*`, `trans_potongan*`; Kredit TOKO memakai sumber `db_sales`/retur melalui adapter existing. Auth/identity/audit ada pada store terpisah. KOSIPA memiliki scope koperasi melalui legacy menu capability; **jangan menambahkan asumsi filter company_id TOKO pada query KOSIPA**. TOKO tetap memakai scope cabang existing. Tidak ada queue/worker baru atau external service pada enhancement ini.

Komponen existing: `KosipaNotice`; formatter `payroll-format.ts` (`formatAmount4`, `formatLegacyDate`, `qs`), `loan-format.ts`, `report-format.ts`; gaya `apps/web/src/app/console/console.css`. Token: `--c-blue:#003399`, `--c-ink:#101828`, `--c-muted:#667085`, `--c-border:#e2e5ea`. Table masih dirakit berulang per route. `console-card` dan `console-section` adalah scroll container seluruh section; header numeric tidak mengikuti `.num` cell. `formatAmount4` menerima fixed units integer (1/10000 rupiah); Anggota360 juga memakai formatter sen existing. Jangan mengganti unit atau membulatkan menjadi Number decimal.

## Route dan permission matrix

M = `kosipa.member.view`, S = `kosipa.savings.view`, L = `kosipa.loan.view`, P = `kosipa.payroll.view`, T = `kosipa.store-credit.view`, E = `kosipa.report.export`. Seluruhnya memerlukan sesi, flag dan link yang sah. E bukan otomatis milik semua viewer.

| Route pattern | File di bawah apps/web/src/app/console/kosipa | Guard | synth_koperasi | synth_kasir2 | synth_admin |
|---|---|---|---|---|---|
| `/console/kosipa` | `page.tsx` | salah satu M/S/L/P | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/anggota` | `anggota/page.tsx` | M | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/anggota/[id]` | `anggota/[id]/page.tsx` | M + section masing-masing | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/simpanan` | `simpanan/page.tsx` | M + S | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/simpanan/[id]` | `simpanan/[id]/page.tsx` | M + S | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/pinjaman` | `pinjaman/page.tsx` | L | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/pinjaman/[docNo]` | `pinjaman/[docNo]/page.tsx` | L | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/payroll` | `payroll/page.tsx` | P | Baca | Ditolak | Belum ditautkan |
| `/console/kosipa/payroll/[docNo]` | `payroll/[docNo]/page.tsx` | P | Baca | Ditolak | Belum ditautkan |
| `/console/kosipa/payroll/[docNo]/anggota/[nik]` | `payroll/[docNo]/anggota/[nik]/page.tsx` | P | Baca | Ditolak | Belum ditautkan |
| `/console/kosipa/payroll/[docNo]/rekonsiliasi` | `payroll/[docNo]/rekonsiliasi/page.tsx` | P + T | Baca | Ditolak | Belum ditautkan |
| `/console/kosipa/laporan` | `laporan/page.tsx` | salah satu M/S/L/P | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/laporan/keanggotaan` | `laporan/keanggotaan/page.tsx` | M | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/laporan/simpanan` | `laporan/simpanan/page.tsx` | S | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/laporan/pinjaman` | `laporan/pinjaman/page.tsx` | L | Baca | Baca; section sesuai izin | Belum ditautkan |
| `/console/kosipa/laporan/payroll` | `laporan/payroll/page.tsx` | P | Baca | Ditolak | Belum ditautkan |
| `/console/kosipa/laporan/kualitas-data` | `laporan/kualitas-data/page.tsx` | L atau P; section terpisah | Baca | Baca; section sesuai izin | Belum ditautkan |

Angsuran standalone `/console/kosipa/angsuran` masih planned, bukan halaman implemented; jangan membuat link aktif. Jadwal tersedia di detail pinjaman existing.

API existing: GET `/api/kosipa/loans` dan `/{docNo}`; GET `/api/kosipa/savings/{memberId}`; GET `/api/kosipa/payroll`, `/{docNo}`, `/{docNo}/anggota/{nik}`, `/{docNo}/store-reconciliation`; GET `/api/kosipa/reports/{membership,savings-movements,loans,payroll,data-quality}` beserta `/export` masing-masing. Tidak ada API member search yang existing; directory dirender server page. CSV dibatasi 5000 data rows dan 1000000 pada pemeriksaan panjang body existing, disanitasi, diaudit, throttle per proses. Batas dan byte semantics backend tidak diubah oleh UI.

## Issue inventory berdasarkan screenshot dan source

| ID | Bukti aktual | Perubahan yang diharapkan | Prioritas |
|---|---|---|---|
| UX-01 | Desktop Pinjaman: header Pokok rata kiri, cell nominal kanan; juga angka hitung/tenor belum seragam | Metadata numeric reusable mengatur th/td, tabular numbers | P0 |
| UX-02 | Filter Pinjaman select native persegi sementara input/button rounded; Cari tanpa reset atau chips; payroll pola berbeda | Toolbar konsisten, reset/chips dan field error | P0 |
| UX-03 | Payroll mobile: tabel menggeser seluruh card karena `.console-card {overflow-x:auto}` | Container scroll tabel saja, judul/context tetap pada viewport | P0 |
| UX-04 | Kualitas data: 9 `.console-notice`; detail/loan report mengulang batas saldo | Notice ringkas sesuai konteks dan disclosure; jangan buang anomaly penting | P0 |
| UX-05 | Member/savings initial page selesai pada search tanpa panduan state; GET q menaruh NIK/nama di URL | Guided initial state, submit privat ke server, hasil dan reset eksplisit | P0 |
| UX-06 | Report CSV adalah plain anchor; tidak ada kontrol pending atau inline feedback 403/413/429/503 | Export control authorized dengan feedback tepat, endpoint tetap | P0 |
| UX-07 | Pinjaman list PINSYN9005 muncul dua baris tanpa badge duplikat di list; detail menunjukkan header ganda | Label pada duplikat yang terdeteksi dari data page; batas deteksi dijelaskan, detail tetap authoritative | P0 |
| UX-08 | Invalid date ditampilkan sebagai `0000-00-00 (kosong)`/dash; due date label belum seragam | Label Tanggal tidak tersedia + alasan terjangkau tanpa tebak tanggal | P0 |
| UX-09 | KOSIPA tidak menampilkan label eksplisit DATA SINTETIS pada baseline meski nama data SYNTH | Satu notice module-level hanya pada profil DEV LOCAL tervalidasi | P0 |
| UX-10 | Anggota360 adalah satu kolom panjang dengan table/notice berulang; identifier NIK tampil utuh | Section cards/jump links sesuai izin, masking presentasi daftar dan konteks ringkas | P1 |
| UX-11 | Tidak ada route loading/error khusus KOSIPA; shell memiliki generic loading | Skeleton tabel/states lokal stabil, error persisten | P0 |
| UX-12 | Link detail KOSIPA pada server page banyak tidak menyetel prefetch; sidebar policy terpisah | Explicit no-prefetch sensitive links, audit-aware navigation test | P0 |

Hipotesis yang **tidak terkonfirmasi sebagai defect saat baseline**: global horizontal overflow pada 1440/390 (nol), unauthorized payroll untuk kasir2 (ditolak), admin tanpa link (pesan tepat), import/writer aktif (tidak terlihat). Tetap jadi regression gates. Audit ini tidak membuktikan seluruh notice perlu dihapus, seluruh state error salah, atau finance parity.

## Pemetaan page / screenshot / issue / expected change / priority

Semua temuan global (UX-11 states dan UX-12 sensitive link policy) juga ditangani pada seluruh route yang relevan; contoh screenshot di tabel ini adalah persona authorized. Persona negatif lengkap ada pada inventory berikutnya.

| Page pattern | Screenshot desktop/mobile | Existing issue | Expected change | Priority |
|---|---|---|---|---|
| `/console/kosipa` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-01-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-01-390.png) | UX-04/09 | Satu Informasi data dan marker sintetis, shortcut sesuai izin | P0 (polish P1) |
| `/console/kosipa/anggota` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-02-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-02-390.png) | UX-05 | Initial search guidance, private submit dan filter/reset | P0 (polish P1) |
| `/console/kosipa/anggota/[id]` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-12-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-12-390.png) | UX-01/04/10/12 | Section cards/jump links terizin; exact cells, context ringkas dan no prefetch | P0 (polish P1) |
| `/console/kosipa/simpanan` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-03-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-03-390.png) | UX-05 | Private search dan initial/no-match states | P0 (polish P1) |
| `/console/kosipa/simpanan/[id]` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-13-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-13-390.png) | UX-01/03/04 | Summary Mutasi tercatat dan ledger scroller terpisah | P0 (polish P1) |
| `/console/kosipa/pinjaman` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-04-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-04-390.png) | UX-01/02/07/08 | Period/status toolbar, alignment, tanggal dan duplicate affordance | P0 (polish P1) |
| `/console/kosipa/pinjaman/[docNo]` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-07-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-07-390.png) | UX-03/04/08/12 | Detail duplikat dan schedule exact, notice konsolidasi | P0 (polish P1) |
| `/console/kosipa/payroll` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-05-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-05-390.png) | UX-01/02 | Filter/reset konsisten dan total tercatat | P0 (polish P1) |
| `/console/kosipa/payroll/[docNo]` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-05-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-05-390.png) | UX-01/03/04/05 | Komponen grouped, private member search dan scroll tabel | P0 (polish P1) |
| `/console/kosipa/payroll/[docNo]/anggota/[nik]` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-02-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-02-390.png) | UX-01/03/04/08 | Komponen/angsuran referensi terpisah, data invalid jelas | P0 (polish P1) |
| `/console/kosipa/payroll/[docNo]/rekonsiliasi` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-06-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-06-390.png) | UX-01/03/04 | A/B/C provenance dan review-only ringkas, no red discrepancy | P0 (polish P1) |
| `/console/kosipa/laporan` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-06-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-06-390.png) | UX-09 | Kategori/deskripsi konsisten dan marker sintetis module-level | P0 (polish P1) |
| `/console/kosipa/laporan/keanggotaan` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-07-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-07-390.png) | UX-01/06 | Header numeric dan export feedback authorized | P0 (polish P1) |
| `/console/kosipa/laporan/simpanan` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-08-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-08-390.png) | UX-01/03/04/06 | Year/filter context, single balance explanation, export secondary | P0 (polish P1) |
| `/console/kosipa/laporan/pinjaman` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-09-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-09-390.png) | UX-01/04/06 | Recorded plan, invalid dates, consolidated limits dan export feedback | P0 (polish P1) |
| `/console/kosipa/laporan/payroll` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-10-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-10-390.png) | UX-01/03/04/06 | Period sections, tables scroll sendiri dan link compare ringkas | P0 (polish P1) |
| `/console/kosipa/laporan/kualitas-data` | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-11-1440.png), [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-11-390.png) | UX-01/03/04/06 | Diagnostic categories, sample label, progressive disclosure dan unavailable jelas | P0 (polish P1) |

## Screenshot inventory per pembukaan halaman

Setiap baris mengacu kedua viewport dan issue di atas; screenshot nama `1440`/`390` adalah pasangan before. `KU` berarti akses read sesuai capability; `Denied` tidak memuat data; `Unlinked` meminta tautan akun. Angka monetary tetap angka sintetis.

| Persona | URL/state | H1 | Desktop | Mobile | Status |
|---|---|---|---|---|---|
| synth_koperasi | `/console/kosipa` | Ringkasan KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-01-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-01-390.png) | KU |
| synth_koperasi | `/console/kosipa/anggota` | Keanggotaan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-02-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-02-390.png) | KU |
| synth_koperasi | `/console/kosipa/simpanan` | Simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-03-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-03-390.png) | KU |
| synth_koperasi | `/console/kosipa/pinjaman` | Pinjaman | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-04-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-04-390.png) | KU |
| synth_koperasi | `/console/kosipa/payroll` | Payroll | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-05-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-05-390.png) | KU |
| synth_koperasi | `/console/kosipa/laporan` | Laporan KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-06-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-06-390.png) | KU |
| synth_koperasi | `/console/kosipa/laporan/keanggotaan` | Ringkasan keanggotaan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-07-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-07-390.png) | KU |
| synth_koperasi | `/console/kosipa/laporan/simpanan` | Ringkasan mutasi simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-08-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-08-390.png) | KU |
| synth_koperasi | `/console/kosipa/laporan/pinjaman` | Laporan pinjaman | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-09-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-09-390.png) | KU |
| synth_koperasi | `/console/kosipa/laporan/payroll` | Laporan payroll | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-10-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-10-390.png) | KU |
| synth_koperasi | `/console/kosipa/laporan/kualitas-data` | Kualitas data keuangan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-11-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-11-390.png) | KU |
| synth_koperasi | `/console/kosipa/anggota/9001` | SYNTH ANGGOTA SATU | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-12-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-12-390.png) | KU |
| synth_koperasi | `/console/kosipa/simpanan/9001` | Buku simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-13-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-13-390.png) | KU |
| synth_koperasi | `/console/kosipa/pinjaman/PINSYN9007` | Pinjaman PINSYN9007 | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-14-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-14-390.png) | KU |
| synth_koperasi | `/console/kosipa/payroll/POTSYN202604A` | Batch POTSYN202604A | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-15-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/koperasi-15-390.png) | KU |
| synth_kasir2 | `/console/kosipa` | Ringkasan KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-01-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-01-390.png) | KU |
| synth_kasir2 | `/console/kosipa/anggota` | Keanggotaan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-02-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-02-390.png) | KU |
| synth_kasir2 | `/console/kosipa/simpanan` | Simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-03-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-03-390.png) | KU |
| synth_kasir2 | `/console/kosipa/pinjaman` | Pinjaman | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-04-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-04-390.png) | KU |
| synth_kasir2 | `/console/kosipa/payroll` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-05-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-05-390.png) | Denied |
| synth_kasir2 | `/console/kosipa/laporan` | Laporan KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-06-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-06-390.png) | KU |
| synth_kasir2 | `/console/kosipa/laporan/keanggotaan` | Ringkasan keanggotaan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-07-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-07-390.png) | KU |
| synth_kasir2 | `/console/kosipa/laporan/simpanan` | Ringkasan mutasi simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-08-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-08-390.png) | KU |
| synth_kasir2 | `/console/kosipa/laporan/pinjaman` | Laporan pinjaman | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-09-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-09-390.png) | KU |
| synth_kasir2 | `/console/kosipa/laporan/payroll` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-10-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-10-390.png) | Denied |
| synth_kasir2 | `/console/kosipa/laporan/kualitas-data` | Kualitas data keuangan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-11-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-11-390.png) | KU |
| synth_kasir2 | `/console/kosipa/anggota/9001` | SYNTH ANGGOTA SATU | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-12-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-12-390.png) | KU |
| synth_kasir2 | `/console/kosipa/simpanan/9001` | Buku simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-13-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-13-390.png) | KU |
| synth_kasir2 | `/console/kosipa/pinjaman/PINSYN9007` | Pinjaman PINSYN9007 | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-14-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-14-390.png) | KU |
| synth_kasir2 | `/console/kosipa/payroll/POTSYN202604A` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-15-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/kasir2-15-390.png) | Denied |
| synth_admin | `/console/kosipa` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-01-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-01-390.png) | Unlinked |
| synth_admin | `/console/kosipa/anggota` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-02-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-02-390.png) | Unlinked |
| synth_admin | `/console/kosipa/simpanan` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-03-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-03-390.png) | Unlinked |
| synth_admin | `/console/kosipa/pinjaman` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-04-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-04-390.png) | Unlinked |
| synth_admin | `/console/kosipa/payroll` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-05-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-05-390.png) | Unlinked |
| synth_admin | `/console/kosipa/laporan` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-06-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-06-390.png) | Unlinked |
| synth_admin | `/console/kosipa/laporan/keanggotaan` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-07-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-07-390.png) | Unlinked |
| synth_admin | `/console/kosipa/laporan/simpanan` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-08-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-08-390.png) | Unlinked |
| synth_admin | `/console/kosipa/laporan/pinjaman` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-09-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-09-390.png) | Unlinked |
| synth_admin | `/console/kosipa/laporan/payroll` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-10-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-10-390.png) | Unlinked |
| synth_admin | `/console/kosipa/laporan/kualitas-data` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-11-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-11-390.png) | Unlinked |
| synth_admin | `/console/kosipa/anggota/9001` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-12-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-12-390.png) | Unlinked |
| synth_admin | `/console/kosipa/simpanan/9001` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-13-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-13-390.png) | Unlinked |
| synth_admin | `/console/kosipa/pinjaman/PINSYN9007` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-14-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-14-390.png) | Unlinked |
| synth_admin | `/console/kosipa/payroll/POTSYN202604A` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-15-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before/admin-15-390.png) | Unlinked |
| synth_koperasi | `/console/kosipa/payroll/POTSYN202604A/rekonsiliasi` | Rekonsiliasi kredit toko | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-01-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-01-390.png) | KU |
| synth_koperasi | `/console/kosipa/payroll/POTSYN202604A/anggota/S9002` | Potongan anggota | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-02-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-02-390.png) | KU |
| synth_koperasi | `/console/kosipa/anggota?q=S9001` | Keanggotaan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-03-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-03-390.png) | KU |
| synth_koperasi | `/console/kosipa/simpanan?q=S9001` | Simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-04-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-04-390.png) | KU |
| synth_koperasi | `/console/kosipa/payroll/POTSYN202608A` | Batch POTSYN202608A | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-05-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-05-390.png) | KU |
| synth_koperasi | `/console/kosipa/payroll/POTSYN202608A/rekonsiliasi` | Rekonsiliasi kredit toko | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-06-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-06-390.png) | KU |
| synth_koperasi | `/console/kosipa/pinjaman/PINSYN9005` | Pinjaman PINSYN9005 | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-07-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-07-390.png) | KU |
| synth_koperasi | `/console/kosipa/pinjaman/PINSYN9003` | Pinjaman PINSYN9003 | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-08-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/koperasi-08-390.png) | KU |
| synth_kasir2 | `/console/kosipa/payroll/POTSYN202604A/rekonsiliasi` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-01-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-01-390.png) | Denied |
| synth_kasir2 | `/console/kosipa/payroll/POTSYN202604A/anggota/S9002` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-02-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-02-390.png) | Denied |
| synth_kasir2 | `/console/kosipa/anggota?q=S9001` | Keanggotaan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-03-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-03-390.png) | KU |
| synth_kasir2 | `/console/kosipa/simpanan?q=S9001` | Simpanan | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-04-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-04-390.png) | KU |
| synth_kasir2 | `/console/kosipa/payroll/POTSYN202608A` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-05-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-05-390.png) | Denied |
| synth_kasir2 | `/console/kosipa/payroll/POTSYN202608A/rekonsiliasi` | Akses ditolak | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-06-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-06-390.png) | Denied |
| synth_kasir2 | `/console/kosipa/pinjaman/PINSYN9005` | Pinjaman PINSYN9005 | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-07-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-07-390.png) | KU |
| synth_kasir2 | `/console/kosipa/pinjaman/PINSYN9003` | Pinjaman PINSYN9003 | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-08-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/kasir2-08-390.png) | KU |
| synth_admin | `/console/kosipa/payroll/POTSYN202604A/rekonsiliasi` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-01-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-01-390.png) | Unlinked |
| synth_admin | `/console/kosipa/payroll/POTSYN202604A/anggota/S9002` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-02-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-02-390.png) | Unlinked |
| synth_admin | `/console/kosipa/anggota?q=S9001` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-03-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-03-390.png) | Unlinked |
| synth_admin | `/console/kosipa/simpanan?q=S9001` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-04-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-04-390.png) | Unlinked |
| synth_admin | `/console/kosipa/payroll/POTSYN202608A` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-05-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-05-390.png) | Unlinked |
| synth_admin | `/console/kosipa/payroll/POTSYN202608A/rekonsiliasi` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-06-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-06-390.png) | Unlinked |
| synth_admin | `/console/kosipa/pinjaman/PINSYN9005` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-07-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-07-390.png) | Unlinked |
| synth_admin | `/console/kosipa/pinjaman/PINSYN9003` | Akun belum ditautkan ke KOSIPA | [1440](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-08-1440.png) | [390](/private/tmp/kkisi-kosipa-uiux-20261020/before-supplement/admin-08-390.png) | Unlinked |
