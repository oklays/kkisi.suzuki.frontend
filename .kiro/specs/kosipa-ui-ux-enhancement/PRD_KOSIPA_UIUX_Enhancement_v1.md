# PRD — KOSIPA UI/UX Enhancement & Content Experience

**Produk:** KKISI TB2 — Unified Management Console  
**Modul:** KOSIPA (Management Console, bukan PWA anggota)  
**Versi:** 1.0 — Draft untuk Owner Review & Engineering Implementation  
**Tanggal:** 20 Oktober 2026  
**Status:** DRAFT — belum disetujui owner / bukan implementasi  
**Target branch:** `feat/unified-console` (lokal)  
**Dokumen rujukan:** `docs/superpowers/specs/unified-console-kosipa-warehouse/`, `owner-uat-checklist.md`, `decision-register.md`, existing design system dan KOSIPA routes.  
**Metode:** Gunakan repo skill **`frontend-engineer`** yang tersedia pada AI Agent sebelum design review/implementasi. Skill tersebut tidak tersedia dalam sesi penyusunan PRD ini, sehingga ketentuan spesifiknya harus dibaca agent dari lokasi resmi di repo, bukan diasumsikan.

---

## 1. Executive Summary

Implementasi KOSIPA telah memiliki navigation, Ringkasan KOSIPA, Anggota 360, Simpanan read, Pinjaman read, Payroll read, laporan, diagnostik kualitas data dan CSV export pada DEV Local. Namun pengalaman antarmuka dirasakan **terlalu basic, tidak rapi dan belum konsisten**: komposisi tabel, warning, informasi, tombol export/import, filter, hirarki visual, loading/error, serta mobile belum membentuk pengalaman administrasi koperasi yang solid.

PRD ini menetapkan **peremajaan komprehensif presentation layer KOSIPA** agar modern, profesional, mudah dipindai, efisien untuk staf keuangan, konsisten dengan Unified Console dan TOKO, namun **tidak mengubah business logic, formula, sumber data, API semantics, RBAC, query finansial, atau database**.

**Outcome:** pengguna mengetahui konteks halaman, tindakan yang aman/diperbolehkan, arti angka dan status, menemukan dokumen lebih cepat, membaca tabel dengan nyaman, serta tidak salah menganggap nilai derived sebagai saldo resmi.

## 2. Problem Statement

Masalah yang akan diverifikasi melalui screenshot dan live inspection DEV Local:

1. Kepadatan dan penempatan komponen tidak seragam antarhalaman.
2. Heading, filter, tab, CTA dan informasi data bersaing secara visual.
3. Tabel data besar sulit dipindai, kolom numeric/tanggal/status belum konsisten; mobile rentan melebar.
4. Banner warning/informasi terlalu dominan atau berulang, sehingga pesan kritis kehilangan prioritas.
5. Export/import tampak ambigu; action yang belum tersedia tidak boleh tampak aktif.
6. Read-only/official balance unavailable/review-only/synthetic tidak dikomunikasikan secara konsisten.
7. State empty/loading/error/permission denied sering terasa seperti layout mentah.
8. Status finansial, data anomaly, exact decimal dan sumber data kurang jelas secara visual.

Ini merupakan *hipotesis masalah* dari feedback owner; agent wajib membuat baseline screenshot dan issue inventory dari aplikasi aktual, bukan mengklaim semua masalah terkonfirmasi sebelum inspeksi.

## 3. Goals & Non-Goals

### Goals
- Menyediakan gaya UI enterprise-finance yang bersih, modern, konsisten dan mudah digunakan.
- Menyatukan pola Page Header, Toolbar, Filter Panel, Data Table, Status, Notice, Detail Section dan Empty State.
- Memastikan setiap halaman memiliki satu primary action yang benar-benar tersedia, atau tidak memiliki CTA bila read-only.
- Meningkatkan keterbacaan nominal rupiah, waktu, status dan data anomaly tanpa kehilangan presisi.
- Menyederhanakan task utama Anggota → Simpanan/Pinjaman/Payroll → Laporan.
- Menyediakan responsive desktop/tablet/mobile dan keyboard accessibility.
- Memastikan export dibedakan dari import serta dari permission view.
- Memperkuat kejelasan *recorded*, *derived*, *review-only*, *unavailable*, dan *synthetic*.

### Non-Goals
- Tidak menambah workflow posting simpanan, pencairan pinjaman, payroll approval, SHU, ataupun Warehouse.
- Tidak mengubah rumus keuangan, query, view/procedure, database, account links, RBAC, atau data ownership.
- Tidak mengubah skema autentikasi, role granting, export allow-list, connection pool.
- Tidak membangun import pipeline baru hanya karena tombol import diinginkan.
- Tidak merombak TOKO POS, shared Console shell global, atau member PWA.
- Tidak mengklaim production/staging acceptance dari synthetic data.

## 4. Users & Top Tasks

| Persona | Tujuan utama | Hak akses | Fokus UX |
|---|---|---|---|
| Pengurus/Operator KOSIPA | Mencari anggota, meninjau simpanan, pinjaman, payroll | Berdasarkan link identitas + capability | Cepat, jelas, tidak salah membaca data |
| Staf KOSIPA read-only | Mengakses data yang diperbolehkan | Limited grant | Tidak melihat CTA mutasi/ekspor yang tak diizinkan |
| Auditor/Reviewer berizin | Menelusuri ketidaksesuaian & export terotorisasi | Reporting + separate export grant | Provenance, status review, audit |
| Admin Console | Mengelola platform, bukan otomatis membaca finansial | Console admin | State "akun belum ditautkan" yang informatif |

**Top tasks:** (T1) cari anggota; (T2) lihat mutasi dan status saldo; (T3) telusuri pinjaman/jadwal; (T4) filter payroll per periode dan lihat komponen; (T5) evaluasi data quality; (T6) export laporan yang diizinkan; (T7) menavigasi antarmodul tanpa kehilangan konteks.

## 5. Design Principles & Visual Direction

- **Quiet enterprise finance:** whitespace terstruktur, permukaan terang, aksen biru KKISI yang konsisten dengan Console; jangan membuat desain penuh warna/kartu dekoratif.
- **Hierarchy before decoration:** judul → konteks → status data → filter → hasil → detail.
- **Data-first:** tabel dan angka menjadi fokus; bukan ilustrasi atau kartu KPI tanpa arti.
- **One obvious action:** hanya tampilkan CTA nyata sesuai izin; pilihan sekunder sebagai outline/menu overflow.
- **Honest status:** nilai *unavailable* bukan nol; hasil *review-only* bukan discrepancy final.
- **Accessible by default:** fokus terlihat, semantik elemen benar, label yang dapat dibaca screen reader.
- **Reusable without overgeneralizing:** gunakan existing token/components, hindari membangun design system kedua khusus KOSIPA.

**Visual tokens (proposal, wajib diturunkan dari design system existing):** background `surface/subtle`, card `surface`, border tipis netral; brand blue sebagai primary; success, warning, danger dan info hanya untuk makna semantik. Border radius medium, subtle shadow jika perlu, grid spacing 4/8/12/16/24/32 px; body sekitar 14–16 px, title 24–30 px sesuai responsive. Typography tabular numerals untuk currency dan angka. Warna, radius dan font final harus mengambil token yang sudah ada — angka di sini acuan visual, bukan perintah mengganti tema aplikasi.

## 6. Information Architecture & Page Anatomy

**KOSIPA (menu yang sudah tersedia):** Ringkasan; Keanggotaan/Anggota 360; Simpanan; Pinjaman; Payroll; Laporan (Keanggotaan, Mutasi Simpanan, Pinjaman, Payroll, Kualitas Data). Item detail, rekonsiliasi payroll dan jadwal angsuran mengikuti parent/page context. Jangan ciptakan tautan untuk fitur belum ada.

Anatomi standar halaman:

```
Breadcrumb > KOSIPA > [Domain] > [Page]
[Title]                    [Allowed secondary action] [Primary action if legitimate]
[1-line purpose and data status]
[Contextual notice: 0 or 1 dominant message, expandable details as needed]
[Filter/search toolbar + active filter chips + reset]
[Summary strip only when verified and meaningful]
[Data table / structured detail / visualization]
[Pagination + record count + source timestamp/provenance where verified]
```

Global synthetic notice DEV Local tampil terpusat satu kali pada area module/page yang jelas, bukan berulang di setiap widget. Tidak boleh menggantungkan pengamanan hanya pada banner frontend.

## 7. Shared Component Requirements

### FR-UI-001 — Page Header & Breadcrumb
- Heading H1 tunggal dan deskripsi ringkas yang menginformasikan pekerjaan pengguna.
- Breadcrumb clickable sesuai permission; detail page punya link kembali yang mempertahankan konteks filter jika aman.
- Primary CTA hanya jika workflow benar-benar tersedia dan terotorisasi.
- Pada data read-only gunakan label `Mode baca saja` secara proporsional, bukan tombol nonfungsional.

### FR-UI-002 — Data Table (high priority)
- Column definitions reusable: title, key, type, align, min width, formatter, optional tooltip, visibility priority.
- Sticky table header jika kontainer tinggi; horizontal scroll hanya di area tabel pada mobile; jangan menyebabkan global horizontal scroll.
- Numeric right-aligned, tabular figures; nama/doc no left-aligned; tanggal dan status konsisten.
- Search/filter server-side atau existing verified mechanism; debounced pencarian bila request mahal, pagination tetap authoritative.
- Page-size options hanya jika API mendukung, total records tampil bila diketahui; jangan mengarang total count.
- Row hover/focus, keyboard-operable link, distinct clickable affordance (bukan seluruh row clickable tanpa semantik).
- Empty result vs no data vs error vs timeout vs restricted scan harus berbeda.
- Sorting hanya pada kolom yang didukung API; jika tidak didukung jangan tampilkan chevron palsu.
- Detail via link/drawer hanya bila akses sah; financial data jangan prefetch tanpa audit contract.
- Saved view preference lokal non-sensitif opsional, tidak membocorkan filter data anggota.
- No generic auto-export of complete financial tables.

### FR-UI-003 — Filter & Search Toolbar
- Satu baris pencarian/period/status (desktop), stacked/accordion (mobile).
- `Terapkan` / `Reset` bila query tidak auto-apply; satu pola konsisten per jenis halaman.
- Filter chips untuk state aktif, tampilan hasil `Menampilkan X–Y` jika server menyediakan.
- URL query parameters boleh mempertahankan filter non-sensitif; jangan menaruh NIK, data finansial atau secrets di URL.
- Validasi tanggal/periode, search minimal/max length, empty selection dan invalid status; error dekat field.

### FR-UI-004 — Notices, Warnings & Data Trust
- **Info**: penjelasan biasa, misalnya `Saldo resmi belum tersedia` dengan tautan `Mengapa?`.
- **Warning**: perlu perhatian/review, misalnya mapping cabang belum disahkan.
- **Error**: permintaan gagal/audit gagal/query unavailable dengan retry hanya bila aman.
- **Success**: tindakan non-finansial yang benar-benar selesai (mis. export generated), bukan data financial "valid" tanpa parity.
- Warning tidak memakai warna merah kecuali memang kritis; hindari beberapa banner full-width sekaligus.
- Gunakan inline message dekat nilai terdampak; consolidated disclosure untuk batasan yang sama di banyak baris.
- Pesan status singkat dengan `Apa artinya`/`Lihat batasan data` saat perlu; tidak memasukkan detail keamanan exploitable.

### FR-UI-005 — Buttons / Actions / Export / Import
- Button hierarchy: primary filled, secondary outline, tertiary text/icon + label aksesibel; ukuran konsisten dan responsivitas.
- `Export CSV` hanya muncul jika feature flag, KOSIPA link, report view grant, dan separate export grant terpenuhi. Disabled vs hidden mengikuti security/UX conventions; backend tetap enforce.
- Export berdasarkan current validated filters; sebelum file besar tampilkan batas ukuran jika berguna; loading, success, 403, 413, rate-limit, audit failure harus jelas.
- Import **tidak tersedia** pada scope sekarang: **jangan tampilkan tombol aktif, dummy upload, atau fake import modal**. Jika product owner memerlukan import, buat discovery PRD terpisah termasuk preview, validation, duplicate handling, maker-checker, rollback dan security.
- Jangan memberi kesan financial posting aktif pada read-only forms.
- Action menu per row hanya untuk tindakan yang benar-benar implemented dan authorized.

### FR-UI-006 — Currency, Dates & Status
- Currency labels `Rp` dengan pengelompokan id-ID dan angka tabular. Gunakan authoritative decimal string; jangan melalui JS float sehingga sub-sen hilang. Jika komponen UI mengharuskan rounding, ungkapkan presisi yang ditampilkan dan sediakan exact source value pada detail/export (sesuai izin).
- Missing/zero/placeholder due date ditampilkan `Tanggal tidak tersedia` atau status data-quality; jangan dikonversi menjadi tanggal kalender yang tampak sah.
- Badge status harus mengikuti enumerasi domain existing, tidak infer dari warna; teks status manusiawi.
- Source indicator: `Tercatat`, `Hasil perhitungan`, `Untuk tinjauan`, `Tidak tersedia`, `Data sintetis`; tampilkan di level yang tepat.

### FR-UI-007 — States & Feedback
- Standard skeleton layout selama loading, bukan jumpy spinner di banyak lokasi.
- Empty state dengan judul, penjelasan ringkas, tombol clear filters jika sesuai.
- Error/timeout dengan request reference aman, try again bila aman; jangan pernah tunjukkan angka 0 untuk scan gagal.
- Permission-denied dan account-not-linked harus berbeda dari data kosong.
- Audit-unavailable KOSIPA tampil fail-closed tanpa fallback data.
- Toast hanya untuk umpan balik aksi terukur; error penting bertahan secara inline.

### FR-UI-008 — Accessibility & Responsive
- Target WCAG 2.2 AA (kontras teks normal >=4.5:1, visible focus, semantik forms, labels, programmatic table headers, errors announced).
- Interactive target ideal >=44x44 px atau alternatif setara pada layout compact.
- Tab order logis, Escape menutup drawer/dialog, keyboard navigation untuk tabel & menu.
- Test widths 375, 390, 768, 1024, 1440 px; tidak ada global x-overflow. Tabel boleh scroll di containernya dengan petunjuk kolom tambahan.
- Animasi singkat, hormati prefers-reduced-motion. Jangan gunakan warna sebagai satu-satunya pembeda.

## 8. Page-by-Page Requirements

### 8.1 Ringkasan KOSIPA — FR-PAGE-01 (P0)
- Hero non-dekoratif berisi nama modul, tujuan, status akses / mode baca.
- Quick action cards yang mengarah ke Anggota, Simpanan, Pinjaman, Payroll dan Laporan **hanya jika authorized**.
- Tidak menampilkan nominal saldo, outstanding, total kewajiban atau KPI agregat yang belum authoritative.
- Tampilkan satu compact status panel `Informasi data` (read-only, angka resmi unavailable) dengan link penjelasan.
- No giant "Segera Hadir" pada fitur yang telah ada.

### 8.2 Keanggotaan & Anggota 360 — FR-PAGE-02 (P0)
- Header + pencarian anggota yang jelas, tanpa membocorkan sensitive identifiers ke URL/logs.
- Result table: identifier masked sesuai kebijakan, nama/label aman, status, tindakan `Lihat Profil`.
- Detail profile: identitas dan status, metadata terverifikasi, section cards/tab `Simpanan`, `Pinjaman`, `Payroll`, `Kredit TOKO` jika authorized.
- Masked phone/email/bank tetap; salary/address/KTP tidak boleh ditambahkan.
- Profile sections tidak boleh memuat data yang tidak diizinkan saat prefetch/navigation.
- Compact limitation note bila angka official tidak tersedia.

### 8.3 Simpanan — FR-PAGE-03 (P0)
- Gunakan summary `Mutasi tercatat` bukan `Saldo resmi`.
- Type filter yang mencerminkan jenis simpanan real; no withdraw/add buttons karena writer belum ada.
- Ledger table: tanggal, jenis, doc reference, masuk/keluar, nominal, status sumber, keterangan terbatas; hanya tampilkan kolom supported.
- Debit/credit dipisahkan format, negative sign konsisten, presisi akurat.
- Empty state membedakan belum ada mutasi vs filter tidak cocok.
- Official balance unavailable tampil sekali pada konteks yang tepat.

### 8.4 Pinjaman — FR-PAGE-04 (P0)
- List: nomor dokumen (duplikat tetap ditandai), anggota sesuai izin, principal tercatat, tenor, status, tanggal dokumen yang valid, link detail.
- Filter per periode/status, safe pagination pada borrower dengan histori besar.
- Detail: header pinjaman, schedule, alert bila orphan/invalid date/duplikat; tidak mengklaim `Outstanding` jika belum ada parity.
- Installment table: nomor angsuran, jatuh tempo, principal/interest sesuai verified fields, status sumber dan link/keterangan jika ada.
- Akses langsung tidak melompati scoped permission.

### 8.5 Payroll — FR-PAGE-05 (P0)
- List batch berdasarkan periode, status, total tercatat, jumlah baris yang sah; no approval/generate UI.
- Detail table dan breakdown component grouped; preserve recorded vs derived distinction.
- Comparison: tepat bedakan recorded TOKO component dengan derived Kredit netto hanya saat mapping authoritative; jika belum, badge `Untuk tinjauan` dan explanatory content.
- Informational A−B tidak diberi red error treatment.
- Row anomalies dipresentasikan sebagai review note, bukan disembunyikan.
- Semua read diaudit sebelum akses, termasuk list batch.

### 8.6 Reporting — FR-PAGE-06 (P0)
- Reporting landing/index dengan kategori dan description, bukan dinding button.
- Consolidate shared report filter experience; period, date validation, clear filters, results context.
- Loan report, payroll report, membership summary, savings movement summary, data quality diagnostics — gunakan exact routes found in repo, not imaginary.
- `Export CSV` prominent namun secondary relative to reading/filter; permission-aware, with no generic `Import` action.
- Data-quality diagnostic cards: `Terdeteksi`, `Perlu pemeriksaan`, `Scan tidak tersedia`, `Presisi wajar`, `Belum terverifikasi` dengan count hanya bila scan sukses. 20-row sample max per existing baseline; show `sample, bukan seluruh data`.
- Kualitas data tidak menggunakan green `0 masalah` saat scan missing/truncated/fail.

### 8.7 Cross-page — FR-PAGE-07 (P1)
- Consistent detail page link-back and breadcrumbs.
- Context-preserving navigation without sensitive URL params.
- Popovers/tooltips untuk definisi finansial dengan konten singkat.
- Unified responsive table and states across all KOSIPA routes.

## 9. Interaction & Content Writing Standards

Bahasa produk: Bahasa Indonesia sederhana, istilah teknis/keuangan sesuai business vocabulary. Judul aksi pakai verba spesifik: `Cari anggota`, `Terapkan filter`, `Reset filter`, `Unduh CSV`, `Lihat detail`. Hindari `Submit`, `Process`, `Action`, `Failed!` tanpa konteks.

| Situasi | Copy yang disarankan | Yang dihindari |
|---|---|---|
| Data resmi belum tervalidasi | `Saldo resmi belum tersedia. Nilai berikut adalah total mutasi tercatat.` | `Saldo: Rp0` |
| Recon branch unverified | `Perbandingan untuk tinjauan — mapping cabang belum dikonfirmasi.` | `Selisih salah!` |
| Tidak ada result filter | `Tidak ada data yang cocok dengan filter ini.` | `Data tidak ditemukan` tanpa arah |
| Scan gagal | `Pemeriksaan belum berhasil. Jumlah temuan belum dapat ditentukan.` | `0 masalah` |
| Tidak punya izin | `Anda tidak memiliki akses ke halaman ini.` | `Terjadi kesalahan` |
| KOSIPA not linked | `Akun ini belum ditautkan ke identitas KOSIPA.` | `Segera hadir` |
| Export terlalu besar | `Data melebihi batas ekspor. Persempit filter lalu coba lagi.` | `Error 413` saja |
| DEV Local data | `DATA SINTETIS — UNTUK PENGUJIAN` | Label menyerupai production data |

## 10. UX Research & Screenshot Inventory (pre-implementation gate)

AI Agent wajib membuka seluruh route KOSIPA yang implemented di DEV Local, mengambil screenshot desktop (1440) dan mobile (390), serta mendokumentasikan issue inventory `page / screenshot / existing issue / expected change / priority`. Lakukan dengan role `synth_koperasi` dan `synth_kasir2`, serta negative `synth_admin`; jangan mengekspor credential atau data sensitif. Cocokkan semua halaman, sumber komponen saat ini, action availability, dan permission. Jika page tidak ada, catat sebagai feature gap, bukan fake UI.

Gunakan repo skill `frontend-engineer` sebagai *mandatory design and engineering workflow* saat melakukan tugas di repository. Jika skill tidak tersedia, laporkan blocker skill, gunakan standar engineering existing, dan jangan berpura-pura skill telah dieksekusi.

## 11. Component Architecture & Technical Requirements

Komponen reusable yang dipertimbangkan sesuai kode nyata: `KOSIPAPageHeader`, `ContextNotice`, `DataProvenanceLabel`, `FilterToolbar`, `FinancialDataTable`, `CurrencyCell`, `DateCell`, `StatusChip`, `PermissionAction`, `SectionCard`, `LoadingSkeleton`, `EmptyState`, `ErrorState`, `DataQualitySummary`, `ExportMenu`. Penamaan tidak preskriptif dan harus menyesuaikan shared Console components.

- Tidak meng-copy table implementations antar-route.
- Gunakan formatter server/client yang tidak merusak decimal source strings.
- Feature flags dan capability existing tetap authoritative.
- Prefetch sensitive KOSIPA tidak boleh memicu read di luar audit contract atau membuka unauthorized data.
- Tidak mengubah endpoint contracts kecuali additive presentation metadata yang benar-benar dibutuhkan dan punya test.
- Tidak memasukkan React state berlebihan untuk data remote; mengikuti pola app existing.
- Hindari dependency UI baru jika komponen desain existing cukup.
- No breaking changes for TOKO or Console Admin.

## 12. Functional & Nonfunctional Acceptance Criteria

### Global (AC-G)
- **AC-G01**: Semua route KOSIPA existing tersusun dalam route inventory; tidak ada link mati di sidebar, card dan breadcrumb.
- **AC-G02**: Tidak ada CTA aktif untuk financial writers/import yang belum tersedia.
- **AC-G03**: Tidak ada unauthorized navigation/detail/export; backend existing guards tetap dipakai.
- **AC-G04**: Ringkasan, simpanan, loan, payroll dan reports menggunakan konsistensi header/filter/table/states.
- **AC-G05**: Tidak ada global horizontal overflow 375–1440px, tabel dapat discroll secara lokal bila perlu.
- **AC-G06**: Keyboard tab, focus, Escape, labels, heading hierarchy dan WCAG 2.2 AA spot checks lolos.
- **AC-G07**: Nilai monetary exact, sub-sen dan invalid dates dipertahankan / dilabeli dengan benar.
- **AC-G08**: `0`, `unavailable`, `unverified`, `scan failed`, `no results` tidak tercampur.
- **AC-G09**: DEV Local flag states, reader outage, console audit outage dan role variants tetap fail-safe.
- **AC-G10**: Semua perubahan UI diverifikasi dengan screenshot before/after dan browser tests; TOKO regressions hijau.

### Tables (AC-T)
- **AC-T01**: 100% table yang dicakup memakai alignment numeric yang konsisten dan real header labels.
- **AC-T02**: Search, filter, pagination bekerja dengan existing API (bukan client-side slicing untuk data besar).
- **AC-T03**: Empty, error, loading, permission dan partial data mempunyai visual/copy berbeda.
- **AC-T04**: Sort hanya tersedia bila backend benar-benar mendukung.
- **AC-T05**: Table numeric/financial readable pada desktop dan aksesibel di mobile.

### Notices & Export (AC-N/E)
- **AC-N01**: Tidak ada repeated full-width warning identik pada tiap kartu/baris.
- **AC-N02**: Setiap informational financial label bisa dimengerti pengguna nonteknis.
- **AC-E01**: Export tersedia hanya bagi synthetic export-allowed user dan existing report permission.
- **AC-E02**: 403, 413, throttle dan audit failure punya feedback yang dapat ditindaklanjuti.
- **AC-E03**: Tidak ada active Import button dan tidak ada fake uploader.
- **AC-E04**: Export CSV tetap exact-decimal, sanitized, bounded, audited.

### Test Coverage
- Automated screenshot diff/regression untuk halaman utama jika sudah ada infra yang sesuai.
- Playwright/browser test user journeys: `synth_koperasi`, `synth_kasir2`, `synth_admin`, `synth_kasir1`.
- Viewports 375, 390, 768, 1024, 1440.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, existing UAT suite, KOSIPA nav/browser suites, TOKO regression.
- Synthetic DEV Local UAT hanya engineer-verified; owner sign-off terpisah.

## 13. Delivery Plan & Task Breakdown

| Phase | Task IDs (baru, tidak bentrok dengan specs existing) | Scope | Prioritas | Exit gate |
|---|---|---|---|---|
| 0 | KUX-001..003 | Skill read, screenshot inventory, component/route audit, UX baseline | P0 | Baseline reviewed |
| 1 | KUX-010..014 | Shared page header, notices, filter, table, currency/status format, loading/empty/error | P0 | Component tests, no regression |
| 2 | KUX-020..025 | Ringkasan, Anggota 360, Savings, Loans, Payroll, Reports refinements | P0 | Each page visual+functional |
| 3 | KUX-030..032 | Secure export UX, mobile/responsive, accessibility | P0/P1 | Security/viewport tests |
| 4 | KUX-040..042 | Cross-page polish, copy, performance + browser screenshot suite | P1 | Green regression |
| 5 | KUX-050..052 | DEV Local walkthrough, owner UAT intake, defect closeout, handover | P0 | Owner review-ready (not owner accepted automatically) |

Task execution in small local commits; do not reset owner test data or kill unrelated local services; no production push/merge/deploy.

## 14. QA & Owner Manual UAT Scenarios

1. Operator menemukan Anggota 360 dalam maksimal beberapa tindakan navigasi jelas tanpa harus tahu route.
2. Staff membedakan official balance unavailable dari transaction/movement totals.
3. Payroll reviewer bisa mengetahui perbedaan recorded vs derived tanpa mengira semua A−B error.
4. Report viewer tanpa export grant tidak bisa export, baik melalui UI maupun direct API.
5. Export allowed user berhasil unduh CSV valid yang mengikuti filter; error 413 dan throttle tetap jelas.
6. Data-quality failed scan tidak dinyatakan `0 issue`.
7. Tabel loan dengan nomor dokumen duplikat dan tanggal invalid tetap bisa dimengerti.
8. Mobile 390px: halaman tidak melebar; tabel dapat discroll; CTA tidak bertumpuk.
9. KOSIPA link revoked: protected content hilang / gagal tertutup dengan state jelas.
10. Admin Console tanpa KOSIPA link: informasi `Akun belum ditautkan`, bukan `Segera hadir`.
11. TOKO cashier menjalankan POS tanpa perubahan; login/landing tetap sesuai flag dan permission.
12. Browser back/refresh, empty filter, no results dan unavailable source bersikap konsisten.

## 15. Success Metrics (targets; require baseline measurement)

- 0 dead/unavailable action yang tampak aktif pada semua halaman in-scope.
- 100% in-scope tables menggunakan standard financial number formatting, consistent labels dan defined states.
- 0 critical accessibility violations pada automated checks ditambah keyboard spot-check.
- 0 cross-permission exposure dari perubahan presentation layer.
- 0 TOKO regression dari enhancement.
- Task completion time untuk cari anggota → lihat pinjaman / payroll diukur sebelum dan sesudah, target penurunan >=20% **jika baseline mendukung**; bukan klaim hasil sekarang.
- Owner menerima visual consistency dan clarity melalui manual UAT; tanda tangan/keputusan eksplisit dibutuhkan.
- No significant performance regression versus measured DEV Local baseline; label synthetic measurement appropriately.

## 16. Risks & Mitigations

| Risiko | Mitigasi |
|---|---|
| Merombak business logic saat UI polish | UI-only scope, golden regression, no financial writer |
| UI memanipulasi angka/desimal | Preserve decimal strings, exact formatting tests |
| Nampak saldo resmi padahal belum verified | Copy+provenance constraints, audit sample screens |
| Export jadi terlalu mudah diakses | Separate capability preserved, direct API negative tests |
| Import button palsu | Excluded entirely until separately specified |
| Duplicate design system | Reuse existing Console components and tokens |
| Mobile table sulit dibaca | Bounded table scroll, prioritized columns, tested widths |
| DEV Local data hilang saat testing | No reset without check, isolated visual fixtures |
| User hak akses tidak sama | Role matrix screenshot and fail-closed tests |
| Scope creep seluruh KOSIPA | Explicit existing read-only pages and phased implementation |

## 17. Dependencies, Approvals & Release Boundaries

Design work can start now in DEV Local. No dependence on O1/O5 or D7 for pure UI, but official balances and warehouse integration remain blocked. Production roles O3 and owner UAT must be verified before broader rollout. The independent login security hotfix remains a separate urgent release path. KOSIPA writers continue disabled. Do not push/merge/deploy without separately requested authorization.

**Owner approvals requested for PRD:** preferred aesthetic direction (modern enterprise blue consistent with KKISI), acceptable data density (`comfortable` as default), role/permission presentation, and import control policy (`not shown until supported`). No new financial/accounting policy approval is implied.

## 18. Definition of Done & Handover

Deliver code and before/after screenshots of every KOSIPA page, reusable UI component mapping, route menu/permissions matrix, tested responsive and accessibility states, test results, performance baseline comparison, open UX defects, and explicit owner UAT checklist. Work counts as **implemented/verified locally** only when the applicable acceptance criteria pass; it is **not** owner accepted, staging accepted or production ready until those gates separately complete.

## 19. Agent Kickoff Instruction (for implementation, after PRD review)

> In the local `feat/unified-console` workspace, load and follow the repository's `frontend-engineer` skill. Read this PRD and existing Unified Console specs, inspect every current KOSIPA route on DEV Local, capture before screenshots, and make a concrete component/UX issue inventory. Implement KUX phases 0–5 incrementally, preserving every KOSIPA backend business rule, auth gate, audit-before-read, data classification, export security, and TOKO behavior. No fake/import/financial mutation buttons. Use existing design tokens and shared components, verify responsive/accessibility and browser tests, capture after screenshots and report owner-reviewable diffs. Do not reset owner test data, kill unrelated dev processes, push, merge or deploy.

---

**Document status:** DRAFT. PRD content was authored from checkpoint reports and owner feedback; latest unpushed local branch and real UI screenshots were not directly inspected in the authoring environment. Phase 0 must establish screenshot-backed ground truth.
