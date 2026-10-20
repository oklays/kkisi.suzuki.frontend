# PRD coverage — setiap butir sumber tetap tercatat

Status terbaru: implementasi lokal dan bukti per requirement ada di implementation-evidence.md; owner acceptance tetap terpisah. Tabel mempertahankan seluruh butir sumber. PRD tetap tidak diubah. Source fingerprint SHA-256: `f6221ca409ccb000f25140ac50af707f5a2b401dd3941b5f79b57a1336612195`.

Pemetaan requirements → desain → task → verifikasi ada pada requirements/design/tasks/verification. Tabel berikut menambahkan trace per bagian dan per bullet/numbered item asli agar sub-bullet tidak hilang karena hanya heading FR yang dibaca. Baris tabel sumber (persona/copy/phase/risk) dirujuk oleh inventory 19 bagian serta dokumen detail di bawah.

## Inventory semua bagian PRD

| Bagian | Cakupan | Requirement | Disposisi |
|---|---|---|---|
| 1 (L14) | Executive Summary | REQ-021 | Target implementasi/verifikasi; belum accepted |
| 2 (L22) | Problem Statement | REQ-016 | Audit source/screenshots tersedia; baseline review pending |
| 3 (L37) | Goals & Non-Goals | REQ-021 | Target implementasi/verifikasi; belum accepted |
| 4 (L57) | Users & Top Tasks | REQ-010, REQ-020 | Target implementasi/verifikasi; belum accepted |
| 5 (L68) | Design Principles & Visual Direction | REQ-001, REQ-004, REQ-008 | Target implementasi/verifikasi; belum accepted |
| 6 (L80) | Information Architecture & Page Anatomy | REQ-001, REQ-015 | Target implementasi/verifikasi; belum accepted |
| 7 (L99) | Shared Component Requirements | REQ-001 | Target implementasi/verifikasi; belum accepted |
| 8 (L165) | Page-by-Page Requirements | REQ-009 | Target implementasi/verifikasi; belum accepted |
| 9 (L219) | Interaction & Content Writing Standards | REQ-004, REQ-006 | Target implementasi/verifikasi; belum accepted |
| 10 (L234) | UX Research & Screenshot Inventory (pre-implementation gate) | REQ-016 | Audit source/screenshots tersedia; baseline review pending |
| 11 (L240) | Component Architecture & Technical Requirements | REQ-002, REQ-017, REQ-021 | Target implementasi/verifikasi; belum accepted |
| 12 (L253) | Functional & Nonfunctional Acceptance Criteria | REQ-018 | Target implementasi/verifikasi; belum accepted |
| 13 (L289) | Delivery Plan & Task Breakdown | REQ-020 | Target implementasi/verifikasi; belum accepted |
| 14 (L302) | QA & Owner Manual UAT Scenarios | REQ-020 | Target implementasi/verifikasi; belum accepted |
| 15 (L317) | Success Metrics (targets; require baseline measurement) | REQ-019 | Target implementasi/verifikasi; belum accepted |
| 16 (L328) | Risks & Mitigations | REQ-021 | Target implementasi/verifikasi; belum accepted |
| 17 (L343) | Dependencies, Approvals & Release Boundaries | REQ-021 | Target implementasi/verifikasi; belum accepted |
| 18 (L349) | Definition of Done & Handover | REQ-020 | Target implementasi/verifikasi; belum accepted |
| 19 (L353) | Agent Kickoff Instruction (for implementation, after PRD review) | REQ-020, REQ-021 | Target implementasi/verifikasi; belum accepted |

Persona dan tugas T1–T7: current-state permission matrix, design page detail, verification owner1–12. Copy table §9: D4/D6/D7/D13/D14. Phase table §13: semua 23 task KUX dipertahankan tasks.md. Risk table §16: impact-analysis. Boundaries/dependencies/approvals §17: D21 dan README. DoD §18: D20. Kickoff §19: tasks dependency dan fallback skill aktual. Anatomi §6: design struktur visual. Token proposal §5: design token existing, tidak memperkenalkan tema baru.

## Butir sumber

| Sumber | Requirement | Butir asli | Disposisi |
|---|---|---|---|
| L26 (§2) | REQ-016 | 1. Kepadatan dan penempatan komponen tidak seragam antarhalaman. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L27 (§2) | REQ-016 | 2. Heading, filter, tab, CTA dan informasi data bersaing secara visual. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L28 (§2) | REQ-016 | 3. Tabel data besar sulit dipindai, kolom numeric/tanggal/status belum konsisten; mobile rentan melebar. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L29 (§2) | REQ-016 | 4. Banner warning/informasi terlalu dominan atau berulang, sehingga pesan kritis kehilangan prioritas. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L30 (§2) | REQ-016 | 5. Export/import tampak ambigu; action yang belum tersedia tidak boleh tampak aktif. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L31 (§2) | REQ-016 | 6. Read-only/official balance unavailable/review-only/synthetic tidak dikomunikasikan secara konsisten. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L32 (§2) | REQ-016 | 7. State empty/loading/error/permission denied sering terasa seperti layout mentah. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L33 (§2) | REQ-016 | 8. Status finansial, data anomaly, exact decimal dan sumber data kurang jelas secara visual. | Hipotesis; status aktual di issue inventory (bukan otomatis defect) |
| L40 (§3) | REQ-021 | - Menyediakan gaya UI enterprise-finance yang bersih, modern, konsisten dan mudah digunakan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L41 (§3) | REQ-021 | - Menyatukan pola Page Header, Toolbar, Filter Panel, Data Table, Status, Notice, Detail Section dan Empty State. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L42 (§3) | REQ-021 | - Memastikan setiap halaman memiliki satu primary action yang benar-benar tersedia, atau tidak memiliki CTA bila read-only. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L43 (§3) | REQ-021 | - Meningkatkan keterbacaan nominal rupiah, waktu, status dan data anomaly tanpa kehilangan presisi. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L44 (§3) | REQ-021 | - Menyederhanakan task utama Anggota → Simpanan/Pinjaman/Payroll → Laporan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L45 (§3) | REQ-021 | - Menyediakan responsive desktop/tablet/mobile dan keyboard accessibility. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L46 (§3) | REQ-021 | - Memastikan export dibedakan dari import serta dari permission view. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L47 (§3) | REQ-021 | - Memperkuat kejelasan *recorded*, *derived*, *review-only*, *unavailable*, dan *synthetic*. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L50 (§3) | REQ-021 | - Tidak menambah workflow posting simpanan, pencairan pinjaman, payroll approval, SHU, ataupun Warehouse. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L51 (§3) | REQ-021 | - Tidak mengubah rumus keuangan, query, view/procedure, database, account links, RBAC, atau data ownership. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L52 (§3) | REQ-021 | - Tidak mengubah skema autentikasi, role granting, export allow-list, connection pool. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L53 (§3) | REQ-021 | - Tidak membangun import pipeline baru hanya karena tombol import diinginkan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L54 (§3) | REQ-021 | - Tidak merombak TOKO POS, shared Console shell global, atau member PWA. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L55 (§3) | REQ-021 | - Tidak mengklaim production/staging acceptance dari synthetic data. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L70 (§5) | REQ-001, REQ-004, REQ-008 | - **Quiet enterprise finance:** whitespace terstruktur, permukaan terang, aksen biru KKISI yang konsisten dengan Console; jangan membuat desain penuh warna/kartu dekoratif. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L71 (§5) | REQ-001, REQ-004, REQ-008 | - **Hierarchy before decoration:** judul → konteks → status data → filter → hasil → detail. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L72 (§5) | REQ-001, REQ-004, REQ-008 | - **Data-first:** tabel dan angka menjadi fokus; bukan ilustrasi atau kartu KPI tanpa arti. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L73 (§5) | REQ-001, REQ-004, REQ-008 | - **One obvious action:** hanya tampilkan CTA nyata sesuai izin; pilihan sekunder sebagai outline/menu overflow. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L74 (§5) | REQ-001, REQ-004, REQ-008 | - **Honest status:** nilai *unavailable* bukan nol; hasil *review-only* bukan discrepancy final. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L75 (§5) | REQ-001, REQ-004, REQ-008 | - **Accessible by default:** fokus terlihat, semantik elemen benar, label yang dapat dibaca screen reader. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L76 (§5) | REQ-001, REQ-004, REQ-008 | - **Reusable without overgeneralizing:** gunakan existing token/components, hindari membangun design system kedua khusus KOSIPA. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L102 (§7) | REQ-001 | - Heading H1 tunggal dan deskripsi ringkas yang menginformasikan pekerjaan pengguna. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L103 (§7) | REQ-001 | - Breadcrumb clickable sesuai permission; detail page punya link kembali yang mempertahankan konteks filter jika aman. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L104 (§7) | REQ-001 | - Primary CTA hanya jika workflow benar-benar tersedia dan terotorisasi. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L105 (§7) | REQ-001 | - Pada data read-only gunakan label Mode baca saja secara proporsional, bukan tombol nonfungsional. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L108 (§7) | REQ-002 | - Column definitions reusable: title, key, type, align, min width, formatter, optional tooltip, visibility priority. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L109 (§7) | REQ-002 | - Sticky table header jika kontainer tinggi; horizontal scroll hanya di area tabel pada mobile; jangan menyebabkan global horizontal scroll. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L110 (§7) | REQ-002 | - Numeric right-aligned, tabular figures; nama/doc no left-aligned; tanggal dan status konsisten. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L111 (§7) | REQ-002 | - Search/filter server-side atau existing verified mechanism; debounced pencarian bila request mahal, pagination tetap authoritative. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L112 (§7) | REQ-002 | - Page-size options hanya jika API mendukung, total records tampil bila diketahui; jangan mengarang total count. | Conditional; dukungan API tidak ada, kontrol tidak ditampilkan |
| L113 (§7) | REQ-002 | - Row hover/focus, keyboard-operable link, distinct clickable affordance (bukan seluruh row clickable tanpa semantik). | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L114 (§7) | REQ-002 | - Empty result vs no data vs error vs timeout vs restricted scan harus berbeda. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L115 (§7) | REQ-002 | - Sorting hanya pada kolom yang didukung API; jika tidak didukung jangan tampilkan chevron palsu. | Conditional; dukungan API tidak ada, kontrol tidak ditampilkan |
| L116 (§7) | REQ-002 | - Detail via link/drawer hanya bila akses sah; financial data jangan prefetch tanpa audit contract. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L117 (§7) | REQ-002 | - Saved view preference lokal non-sensitif opsional, tidak membocorkan filter data anggota. | Opsional; saved views tidak dibangun, tidak menyimpan filter sensitif |
| L118 (§7) | REQ-002 | - No generic auto-export of complete financial tables. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L121 (§7) | REQ-003 | - Satu baris pencarian/period/status (desktop), stacked/accordion (mobile). | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L122 (§7) | REQ-003 | - Terapkan / Reset bila query tidak auto-apply; satu pola konsisten per jenis halaman. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L123 (§7) | REQ-003 | - Filter chips untuk state aktif, tampilan hasil Menampilkan X–Y jika server menyediakan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L124 (§7) | REQ-003 | - URL query parameters boleh mempertahankan filter non-sensitif; jangan menaruh NIK, data finansial atau secrets di URL. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L125 (§7) | REQ-003 | - Validasi tanggal/periode, search minimal/max length, empty selection dan invalid status; error dekat field. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L128 (§7) | REQ-004 | - **Info**: penjelasan biasa, misalnya Saldo resmi belum tersedia dengan tautan Mengapa?. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L129 (§7) | REQ-004 | - **Warning**: perlu perhatian/review, misalnya mapping cabang belum disahkan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L130 (§7) | REQ-004 | - **Error**: permintaan gagal/audit gagal/query unavailable dengan retry hanya bila aman. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L131 (§7) | REQ-004 | - **Success**: tindakan non-finansial yang benar-benar selesai (mis. export generated), bukan data financial "valid" tanpa parity. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L132 (§7) | REQ-004 | - Warning tidak memakai warna merah kecuali memang kritis; hindari beberapa banner full-width sekaligus. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L133 (§7) | REQ-004 | - Gunakan inline message dekat nilai terdampak; consolidated disclosure untuk batasan yang sama di banyak baris. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L134 (§7) | REQ-004 | - Pesan status singkat dengan Apa artinya/Lihat batasan data saat perlu; tidak memasukkan detail keamanan exploitable. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L137 (§7) | REQ-005 | - Button hierarchy: primary filled, secondary outline, tertiary text/icon + label aksesibel; ukuran konsisten dan responsivitas. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L138 (§7) | REQ-005 | - Export CSV hanya muncul jika feature flag, KOSIPA link, report view grant, dan separate export grant terpenuhi. Disabled vs hidden mengikuti security/UX conventions; backend tetap enforce. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L139 (§7) | REQ-005 | - Export berdasarkan current validated filters; sebelum file besar tampilkan batas ukuran jika berguna; loading, success, 403, 413, rate-limit, audit failure harus jelas. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L140 (§7) | REQ-005 | - Import **tidak tersedia** pada scope sekarang: **jangan tampilkan tombol aktif, dummy upload, atau fake import modal**. Jika product owner memerlukan import, buat discovery PRD terpisah termasuk preview, validation, duplicate handling, maker-checker, rollback dan security. | Tidak ada import UI; discovery terpisah jika kelak diminta |
| L141 (§7) | REQ-005 | - Jangan memberi kesan financial posting aktif pada read-only forms. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L142 (§7) | REQ-005 | - Action menu per row hanya untuk tindakan yang benar-benar implemented dan authorized. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L145 (§7) | REQ-006 | - Currency labels Rp dengan pengelompokan id-ID dan angka tabular. Gunakan authoritative decimal string; jangan melalui JS float sehingga sub-sen hilang. Jika komponen UI mengharuskan rounding, ungkapkan presisi yang ditampilkan dan sediakan exact source value pada detail/export (sesuai izin). | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L146 (§7) | REQ-006 | - Missing/zero/placeholder due date ditampilkan Tanggal tidak tersedia atau status data-quality; jangan dikonversi menjadi tanggal kalender yang tampak sah. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L147 (§7) | REQ-006 | - Badge status harus mengikuti enumerasi domain existing, tidak infer dari warna; teks status manusiawi. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L148 (§7) | REQ-006 | - Source indicator: Tercatat, Hasil perhitungan, Untuk tinjauan, Tidak tersedia, Data sintetis; tampilkan di level yang tepat. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L151 (§7) | REQ-007 | - Standard skeleton layout selama loading, bukan jumpy spinner di banyak lokasi. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L152 (§7) | REQ-007 | - Empty state dengan judul, penjelasan ringkas, tombol clear filters jika sesuai. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L153 (§7) | REQ-007 | - Error/timeout dengan request reference aman, try again bila aman; jangan pernah tunjukkan angka 0 untuk scan gagal. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L154 (§7) | REQ-007 | - Permission-denied dan account-not-linked harus berbeda dari data kosong. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L155 (§7) | REQ-007 | - Audit-unavailable KOSIPA tampil fail-closed tanpa fallback data. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L156 (§7) | REQ-007 | - Toast hanya untuk umpan balik aksi terukur; error penting bertahan secara inline. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L159 (§7) | REQ-008 | - Target WCAG 2.2 AA (kontras teks normal >=4.5:1, visible focus, semantik forms, labels, programmatic table headers, errors announced). | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L160 (§7) | REQ-008 | - Interactive target ideal >=44x44 px atau alternatif setara pada layout compact. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L161 (§7) | REQ-008 | - Tab order logis, Escape menutup drawer/dialog, keyboard navigation untuk tabel & menu. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L162 (§7) | REQ-008 | - Test widths 375, 390, 768, 1024, 1440 px; tidak ada global x-overflow. Tabel boleh scroll di containernya dengan petunjuk kolom tambahan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L163 (§7) | REQ-008 | - Animasi singkat, hormati prefers-reduced-motion. Jangan gunakan warna sebagai satu-satunya pembeda. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L168 (§8) | REQ-009 | - Hero non-dekoratif berisi nama modul, tujuan, status akses / mode baca. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L169 (§8) | REQ-009 | - Quick action cards yang mengarah ke Anggota, Simpanan, Pinjaman, Payroll dan Laporan **hanya jika authorized**. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L170 (§8) | REQ-009 | - Tidak menampilkan nominal saldo, outstanding, total kewajiban atau KPI agregat yang belum authoritative. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L171 (§8) | REQ-009 | - Tampilkan satu compact status panel Informasi data (read-only, angka resmi unavailable) dengan link penjelasan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L172 (§8) | REQ-009 | - No giant "Segera Hadir" pada fitur yang telah ada. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L175 (§8) | REQ-010 | - Header + pencarian anggota yang jelas, tanpa membocorkan sensitive identifiers ke URL/logs. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L176 (§8) | REQ-010 | - Result table: identifier masked sesuai kebijakan, nama/label aman, status, tindakan Lihat Profil. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L177 (§8) | REQ-010 | - Detail profile: identitas dan status, metadata terverifikasi, section cards/tab Simpanan, Pinjaman, Payroll, Kredit TOKO jika authorized. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L178 (§8) | REQ-010 | - Masked phone/email/bank tetap; salary/address/KTP tidak boleh ditambahkan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L179 (§8) | REQ-010 | - Profile sections tidak boleh memuat data yang tidak diizinkan saat prefetch/navigation. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L180 (§8) | REQ-010 | - Compact limitation note bila angka official tidak tersedia. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L183 (§8) | REQ-011 | - Gunakan summary Mutasi tercatat bukan Saldo resmi. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L184 (§8) | REQ-011 | - Type filter yang mencerminkan jenis simpanan real; no withdraw/add buttons karena writer belum ada. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L185 (§8) | REQ-011 | - Ledger table: tanggal, jenis, doc reference, masuk/keluar, nominal, status sumber, keterangan terbatas; hanya tampilkan kolom supported. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L186 (§8) | REQ-011 | - Debit/credit dipisahkan format, negative sign konsisten, presisi akurat. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L187 (§8) | REQ-011 | - Empty state membedakan belum ada mutasi vs filter tidak cocok. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L188 (§8) | REQ-011 | - Official balance unavailable tampil sekali pada konteks yang tepat. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L191 (§8) | REQ-012 | - List: nomor dokumen (duplikat tetap ditandai), anggota sesuai izin, principal tercatat, tenor, status, tanggal dokumen yang valid, link detail. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L192 (§8) | REQ-012 | - Filter per periode/status, safe pagination pada borrower dengan histori besar. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L193 (§8) | REQ-012 | - Detail: header pinjaman, schedule, alert bila orphan/invalid date/duplikat; tidak mengklaim Outstanding jika belum ada parity. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L194 (§8) | REQ-012 | - Installment table: nomor angsuran, jatuh tempo, principal/interest sesuai verified fields, status sumber dan link/keterangan jika ada. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L195 (§8) | REQ-012 | - Akses langsung tidak melompati scoped permission. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L198 (§8) | REQ-013 | - List batch berdasarkan periode, status, total tercatat, jumlah baris yang sah; no approval/generate UI. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L199 (§8) | REQ-013 | - Detail table dan breakdown component grouped; preserve recorded vs derived distinction. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L200 (§8) | REQ-013 | - Comparison: tepat bedakan recorded TOKO component dengan derived Kredit netto hanya saat mapping authoritative; jika belum, badge Untuk tinjauan dan explanatory content. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L201 (§8) | REQ-013 | - Informational A−B tidak diberi red error treatment. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L202 (§8) | REQ-013 | - Row anomalies dipresentasikan sebagai review note, bukan disembunyikan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L203 (§8) | REQ-013 | - Semua read diaudit sebelum akses, termasuk list batch. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L206 (§8) | REQ-014 | - Reporting landing/index dengan kategori dan description, bukan dinding button. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L207 (§8) | REQ-014 | - Consolidate shared report filter experience; period, date validation, clear filters, results context. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L208 (§8) | REQ-014 | - Loan report, payroll report, membership summary, savings movement summary, data quality diagnostics — gunakan exact routes found in repo, not imaginary. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L209 (§8) | REQ-014 | - Export CSV prominent namun secondary relative to reading/filter; permission-aware, with no generic Import action. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L210 (§8) | REQ-014 | - Data-quality diagnostic cards: Terdeteksi, Perlu pemeriksaan, Scan tidak tersedia, Presisi wajar, Belum terverifikasi dengan count hanya bila scan sukses. 20-row sample max per existing baseline; show sample, bukan seluruh data. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L211 (§8) | REQ-014 | - Kualitas data tidak menggunakan green 0 masalah saat scan missing/truncated/fail. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L214 (§8) | REQ-015 | - Consistent detail page link-back and breadcrumbs. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L215 (§8) | REQ-015 | - Context-preserving navigation without sensitive URL params. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L216 (§8) | REQ-015 | - Popovers/tooltips untuk definisi finansial dengan konten singkat. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L217 (§8) | REQ-015 | - Unified responsive table and states across all KOSIPA routes. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L244 (§11) | REQ-002, REQ-017, REQ-021 | - Tidak meng-copy table implementations antar-route. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L245 (§11) | REQ-002, REQ-017, REQ-021 | - Gunakan formatter server/client yang tidak merusak decimal source strings. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L246 (§11) | REQ-002, REQ-017, REQ-021 | - Feature flags dan capability existing tetap authoritative. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L247 (§11) | REQ-002, REQ-017, REQ-021 | - Prefetch sensitive KOSIPA tidak boleh memicu read di luar audit contract atau membuka unauthorized data. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L248 (§11) | REQ-002, REQ-017, REQ-021 | - Tidak mengubah endpoint contracts kecuali additive presentation metadata yang benar-benar dibutuhkan dan punya test. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L249 (§11) | REQ-002, REQ-017, REQ-021 | - Tidak memasukkan React state berlebihan untuk data remote; mengikuti pola app existing. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L250 (§11) | REQ-002, REQ-017, REQ-021 | - Hindari dependency UI baru jika komponen desain existing cukup. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L251 (§11) | REQ-002, REQ-017, REQ-021 | - No breaking changes for TOKO or Console Admin. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L256 (§12) | REQ-016 | - **AC-G01**: Semua route KOSIPA existing tersusun dalam route inventory; tidak ada link mati di sidebar, card dan breadcrumb. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L257 (§12) | REQ-005 | - **AC-G02**: Tidak ada CTA aktif untuk financial writers/import yang belum tersedia. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L258 (§12) | REQ-017 | - **AC-G03**: Tidak ada unauthorized navigation/detail/export; backend existing guards tetap dipakai. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L259 (§12) | REQ-001 | - **AC-G04**: Ringkasan, simpanan, loan, payroll dan reports menggunakan konsistensi header/filter/table/states. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L260 (§12) | REQ-008 | - **AC-G05**: Tidak ada global horizontal overflow 375–1440px, tabel dapat discroll secara lokal bila perlu. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L261 (§12) | REQ-008 | - **AC-G06**: Keyboard tab, focus, Escape, labels, heading hierarchy dan WCAG 2.2 AA spot checks lolos. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L262 (§12) | REQ-006 | - **AC-G07**: Nilai monetary exact, sub-sen dan invalid dates dipertahankan / dilabeli dengan benar. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L263 (§12) | REQ-007 | - **AC-G08**: 0, unavailable, unverified, scan failed, no results tidak tercampur. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L264 (§12) | REQ-017 | - **AC-G09**: DEV Local flag states, reader outage, console audit outage dan role variants tetap fail-safe. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L265 (§12) | REQ-018 | - **AC-G10**: Semua perubahan UI diverifikasi dengan screenshot before/after dan browser tests; TOKO regressions hijau. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L268 (§12) | REQ-002 | - **AC-T01**: 100% table yang dicakup memakai alignment numeric yang konsisten dan real header labels. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L269 (§12) | REQ-003 | - **AC-T02**: Search, filter, pagination bekerja dengan existing API (bukan client-side slicing untuk data besar). | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L270 (§12) | REQ-007 | - **AC-T03**: Empty, error, loading, permission dan partial data mempunyai visual/copy berbeda. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L271 (§12) | REQ-002 | - **AC-T04**: Sort hanya tersedia bila backend benar-benar mendukung. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L272 (§12) | REQ-008 | - **AC-T05**: Table numeric/financial readable pada desktop dan aksesibel di mobile. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L275 (§12) | REQ-004 | - **AC-N01**: Tidak ada repeated full-width warning identik pada tiap kartu/baris. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L276 (§12) | REQ-004 | - **AC-N02**: Setiap informational financial label bisa dimengerti pengguna nonteknis. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L277 (§12) | REQ-017 | - **AC-E01**: Export tersedia hanya bagi synthetic export-allowed user dan existing report permission. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L278 (§12) | REQ-005 | - **AC-E02**: 403, 413, throttle dan audit failure punya feedback yang dapat ditindaklanjuti. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L279 (§12) | REQ-005 | - **AC-E03**: Tidak ada active Import button dan tidak ada fake uploader. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L280 (§12) | REQ-017 | - **AC-E04**: Export CSV tetap exact-decimal, sanitized, bounded, audited. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L283 (§12) | REQ-018 | - Automated screenshot diff/regression untuk halaman utama jika sudah ada infra yang sesuai. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L284 (§12) | REQ-018 | - Playwright/browser test user journeys: synth_koperasi, synth_kasir2, synth_admin, synth_kasir1. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L285 (§12) | REQ-018 | - Viewports 375, 390, 768, 1024, 1440. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L286 (§12) | REQ-018 | - pnpm lint, pnpm typecheck, pnpm test, pnpm build, existing UAT suite, KOSIPA nav/browser suites, TOKO regression. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L287 (§12) | REQ-018 | - Synthetic DEV Local UAT hanya engineer-verified; owner sign-off terpisah. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L304 (§14) | REQ-010 | 1. Operator menemukan Anggota 360 dalam maksimal beberapa tindakan navigasi jelas tanpa harus tahu route. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L305 (§14) | REQ-011 | 2. Staff membedakan official balance unavailable dari transaction/movement totals. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L306 (§14) | REQ-013 | 3. Payroll reviewer bisa mengetahui perbedaan recorded vs derived tanpa mengira semua A−B error. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L307 (§14) | REQ-017 | 4. Report viewer tanpa export grant tidak bisa export, baik melalui UI maupun direct API. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L308 (§14) | REQ-005 | 5. Export allowed user berhasil unduh CSV valid yang mengikuti filter; error 413 dan throttle tetap jelas. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L309 (§14) | REQ-014 | 6. Data-quality failed scan tidak dinyatakan 0 issue. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L310 (§14) | REQ-012 | 7. Tabel loan dengan nomor dokumen duplikat dan tanggal invalid tetap bisa dimengerti. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L311 (§14) | REQ-008 | 8. Mobile 390px: halaman tidak melebar; tabel dapat discroll; CTA tidak bertumpuk. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L312 (§14) | REQ-017 | 9. KOSIPA link revoked: protected content hilang / gagal tertutup dengan state jelas. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L313 (§14) | REQ-007 | 10. Admin Console tanpa KOSIPA link: informasi Akun belum ditautkan, bukan Segera hadir. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L314 (§14) | REQ-018 | 11. TOKO cashier menjalankan POS tanpa perubahan; login/landing tetap sesuai flag dan permission. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L315 (§14) | REQ-015 | 12. Browser back/refresh, empty filter, no results dan unavailable source bersikap konsisten. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L319 (§15) | REQ-019 | - 0 dead/unavailable action yang tampak aktif pada semua halaman in-scope. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L320 (§15) | REQ-019 | - 100% in-scope tables menggunakan standard financial number formatting, consistent labels dan defined states. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L321 (§15) | REQ-019 | - 0 critical accessibility violations pada automated checks ditambah keyboard spot-check. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L322 (§15) | REQ-019 | - 0 cross-permission exposure dari perubahan presentation layer. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L323 (§15) | REQ-019 | - 0 TOKO regression dari enhancement. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L324 (§15) | REQ-019 | - Task completion time untuk cari anggota → lihat pinjaman / payroll diukur sebelum dan sesudah, target penurunan >=20% **jika baseline mendukung**; bukan klaim hasil sekarang. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L325 (§15) | REQ-019 | - Owner menerima visual consistency dan clarity melalui manual UAT; tanda tangan/keputusan eksplisit dibutuhkan. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |
| L326 (§15) | REQ-019 | - No significant performance regression versus measured DEV Local baseline; label synthetic measurement appropriately. | Implemented; bukti lokal di implementation-evidence.md; owner UAT terpisah |

Inventory: 169 bullet/numbered item, 15 FR groups, 21 acceptance criteria, 12 owner scenarios, 19 bagian dan 23 KUX task. Ini coverage spesifikasi; feature completion tetap pending.
