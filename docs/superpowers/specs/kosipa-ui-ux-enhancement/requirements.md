# Requirements — KOSIPA UI/UX

Sumber: PRD v1 lengkap, 19 bagian; intent adalah quiet enterprise finance yang mempercepat T1–T7 melalui presentasi konsisten, bukan migrasi business rules. Persona: operator KOSIPA, staf read-only, reviewer berizin dan admin console tanpa link. Requirement ditulis sebagai target; belum ditandai implemented.

## Functional requirements (EARS)

### REQ-001 — Header dan breadcrumb

WHEN halaman dibuka, THE SYSTEM SHALL menampilkan satu H1, tujuan ringkas, label Mode baca saja, breadcrumb sesuai izin dan aksi nyata saja.

Sumber: FR-UI-001. Desain: D1. Task: KUX-010. Verifikasi: periksa satu H1, breadcrumb, izin link dan aksi.

### REQ-002 — Tabel finansial

WHEN data tabel tersedia, THE SYSTEM SHALL memakai definisi kolom reusable, alignment angka kanan termasuk header, tabular numerals, hover/focus, tautan semantik, sticky header dan scroll lokal; tidak menawarkan sort, page size atau total tanpa dukungan sumber.

Sumber: FR-UI-002. Desain: D2. Task: KUX-011. Verifikasi: uji seluruh tabel, scroll dengan keyboard, cursor paging dan tidak ada fake sort.

### REQ-003 — Filter dan pencarian

WHEN pengguna mencari atau menerapkan filter, THE SYSTEM SHALL memvalidasi di dekat field, menyediakan Terapkan filter dan Reset filter, chip filter non-sensitif, query server yang bounded serta URL tanpa input sensitif.

Sumber: FR-UI-003. Desain: D3. Task: KUX-012. Verifikasi: uji submit, reset, validasi, request dan URL, refresh/back serta cursor.

### REQ-004 — Notice dan kepercayaan data

WHEN nilai memiliki batasan atau sumber belum terverifikasi, THE SYSTEM SHALL memberi label sumber yang tepat, satu notice dominan dan disclosure singkat; informasi biru/netral, review amber, error merah hanya kegagalan; tidak mengartikan unavailable sebagai nol.

Sumber: FR-UI-004. Desain: D4. Task: KUX-013. Verifikasi: periksa duplikasi notice, label sumber, error persisten dan A−B nonmerah.

### REQ-005 — Aksi dan ekspor

WHEN pengguna berizin meminta ekspor, THE SYSTEM SHALL menampilkan kontrol sekunder Unduh CSV yang mengikuti filter tervalidasi, pending/success dan pesan 403/413/429/503; tidak menampilkan import atau financial writer.

Sumber: FR-UI-005. Desain: D5. Task: KUX-030. Verifikasi: uji ekspor positif/negatif dan feedback dengan response terkontrol.

### REQ-006 — Nominal, tanggal dan status

WHEN nilai tercatat ditampilkan, THE SYSTEM SHALL mempertahankan presisi sumber, format Rp id-ID, tanda negatif, tanggal invalid berlabel dan enumerasi domain; angka sen/amount4 existing tetap memakai formatter unit yang benar.

Sumber: FR-UI-006. Desain: D6. Task: KUX-014. Verifikasi: uji decimal string, safe fixed units, sub-sen, negatif, nol, missing dan tanggal legacy.

### REQ-007 — State dan feedback

WHEN request menunggu, kosong, gagal atau akses ditolak, THE SYSTEM SHALL menampilkan skeleton stabil, no-search/no-record/no-match berbeda, error/timeout persisten, account-not-linked dan denied berbeda serta fail-closed tanpa cached financial fallback.

Sumber: FR-UI-007. Desain: D7. Task: KUX-014. Verifikasi: uji loading, no-result, audit/source outage, revoked link dan retry aman.

### REQ-008 — Aksesibilitas dan responsive

WHEN halaman digunakan dengan keyboard atau lebar 375 sampai 1440, THE SYSTEM SHALL menjaga kontras AA, label dan header semantik, fokus terlihat, target 44px atau alternatif setara, Escape dan reduced motion serta tidak ada global x-overflow.

Sumber: FR-UI-008. Desain: D8. Task: KUX-031, KUX-032. Verifikasi: uji 375/390/768/1024/1440, keyboard, screen-reader semantics dan audit aksesibilitas.

### REQ-009 — Ringkasan

WHEN ringkasan KOSIPA dibuka, THE SYSTEM SHALL menampilkan akses domain yang authorized, tujuan dan Informasi data ringkas tanpa KPI saldo/outstanding spekulatif atau Segera hadir untuk fitur existing.

Sumber: FR-PAGE-01. Desain: D9. Task: KUX-020. Verifikasi: screenshot tiga persona dan seluruh shortcut.

### REQ-010 — Anggota 360

WHEN anggota dicari dan profil dibuka, THE SYSTEM SHALL menampilkan hasil dengan aksi Lihat profil, identitas tersamar sesuai kebijakan presentasi, profil terstruktur dan hanya section yang authorized; kontak/rekening tetap masked tanpa gaji/alamat/KTP.

Sumber: FR-PAGE-02. Desain: D10. Task: KUX-021. Verifikasi: uji hasil, profil, masking, section terbatas dan tiada prefetch sensitif.

### REQ-011 — Simpanan

WHEN buku simpanan dibuka, THE SYSTEM SHALL menampilkan Mutasi tercatat, filter jenis aktual, kredit/debit/jasa terpisah, status sumber, cursor dan empty state tepat serta satu penjelasan saldo resmi unavailable.

Sumber: FR-PAGE-03. Desain: D11. Task: KUX-022. Verifikasi: uji jenis aktual, reset, cursor, presisi dan missing source.

### REQ-012 — Pinjaman

WHEN daftar/detail pinjaman dibuka, THE SYSTEM SHALL menampilkan dokumen/status/periode, pokok tercatat, tenor, tanggal sah dan jadwal; mempertahankan duplikat/orphan/invalid date sebagai review note dan tidak mengklaim outstanding resmi.

Sumber: FR-PAGE-04. Desain: D12. Task: KUX-023. Verifikasi: uji PINSYN9005 duplikat, PINSYN9003 cursor dan data tanggal invalid.

### REQ-013 — Payroll

WHEN batch/anggota/rekonsiliasi payroll dibuka, THE SYSTEM SHALL mengelompokkan komponen tercatat, membedakan A/B/C dan Untuk tinjauan bila mapping belum authoritative, menjaga anomaly dan audit-before-read termasuk daftar tanpa approval/generate UI.

Sumber: FR-PAGE-05. Desain: D13. Task: KUX-024. Verifikasi: uji semua empat route payroll, pemisahan A/B/C, sub-sen, audit dan izin.

### REQ-014 — Laporan dan kualitas data

WHEN landing atau salah satu dari lima laporan dibuka, THE SYSTEM SHALL memakai kategori/deskripsi, filter report konsisten dan export berizin; diagnosis membedakan Terdeteksi/Perlu pemeriksaan/Scan tidak tersedia/Presisi wajar/Belum terverifikasi, sample maksimal 20 dan count hanya pada scan berhasil.

Sumber: FR-PAGE-06. Desain: D14. Task: KUX-025. Verifikasi: uji lima laporan dan missing/truncated scan tidak hijau nol.

### REQ-015 — Konteks antarrute

WHEN pengguna beralih daftar dan detail, THE SYSTEM SHALL mempertahankan filter non-sensitif yang allow-listed, link balik aman, breadcrumb dan definisi keuangan singkat dengan pola tabel/state konsisten.

Sumber: FR-PAGE-07. Desain: D15. Task: KUX-040. Verifikasi: uji back/refresh/deep link dan tiada parameter identitas/secrets.

### REQ-016 — Baseline aktual

WHEN desain diusulkan, THE SYSTEM SHALL mencatat seluruh route existing dan screenshot 1440/390 untuk synth_koperasi/synth_kasir2/synth_admin, inventory masalah berprioritas dan status skill aktual tanpa menganggap hipotesis sebagai fakta.

Sumber: PRD §2, §10, phase 0. Desain: D16. Task: KUX-001, KUX-002, KUX-003. Verifikasi: cocokkan 17 pola route, manifest, screenshot dan gap.

### REQ-017 — Keamanan dan kontrak

WHEN konten atau CSV diakses, THE SYSTEM SHALL mempertahankan feature flag, account link, view/export grant terpisah, audit-before-read, filter validation, limit/sanitization dan scoped authorization existing termasuk URL langsung.

Sumber: AC-G03/G09, AC-E01/E04. Desain: D17. Task: KUX-030, KUX-032. Verifikasi: uji API/page negatif, revoke, outage dan CSV exact/sanitized/bounded/audited.

### REQ-018 — Regresi dan kompatibilitas

WHEN kode presentasi diubah, THE SYSTEM SHALL menjalankan lint/typecheck/test/build, KOSIPA browser/nav dan UAT serta regresi TOKO pada lingkungan yang aman tanpa mereset data owner atau menghentikan proses unrelated.

Sumber: AC-G10, PRD §12/§14. Desain: D18. Task: KUX-041. Verifikasi: rekam seluruh hasil dan pisahkan skipped/blocked dari PASS.

### REQ-019 — Pengukuran

WHEN hasil enhancement dinilai, THE SYSTEM SHALL membandingkan baseline dan hasil lokal sintetis untuk navigasi/render dan task T1→pinjaman/payroll; target 20 persen hanya klaim setelah pengukuran setara mendukung.

Sumber: PRD §15. Desain: D19. Task: KUX-042. Verifikasi: ukur median/p95 navigasi warmed dan task time operator, catat kondisi dan keterbatasan.

### REQ-020 — Handover dan owner UAT

WHEN pekerjaan diserahkan, THE SYSTEM SHALL menyertakan before/after semua halaman, mapping komponen/rute/izin, hasil uji responsive/a11y/security/performance, defect terbuka dan 12 skenario owner yang tidak otomatis ditandai accepted.

Sumber: PRD §18, phase 5. Desain: D20. Task: KUX-050, KUX-051, KUX-052. Verifikasi: audit artefak, keputusan tertulis dan defect closeout.

### REQ-021 — Batas scope dan release

WHEN implementasi berjalan, THE SYSTEM SHALL membatasi perubahan ke presentasi KOSIPA dengan token existing; tidak mengubah formula/query/schema/pool/RBAC/auth/allow-list, tidak membuat writer/import, serta tidak push/merge/deploy.

Sumber: PRD §3/§16/§17/§19. Desain: D21. Task: KUX-001, KUX-052. Verifikasi: review diff layer/file, tidak ada DDL atau konfigurasi grant dan catat Git state.

## Business rules

- BR-001: UI tidak menghasilkan financial writer/import workflow; read-only tetap dibaca saja (REQ-005, REQ-021).
- BR-002: unavailable tidak bernilai nol; recorded/derived/review-only dibedakan; mapping belum sah bukan final discrepancy (REQ-004, REQ-006, REQ-013).
- BR-003: enumerasi/status/precision/bounds/cursor legacy authoritative dan tidak dihitung ulang di UI (REQ-002, REQ-006, REQ-012).
- BR-004: hanya owner dapat menerima hasil UAT secara tertulis; synthetic engineering PASS tidak sama dengan staging/production readiness (REQ-020).

## Validation, security, nonfunctional, observability, migration

- VAL-001: directory 2–50 karakter; loan search/status/periode, payroll status/grup/period dan cursor memakai parser use case existing; form errors dekat field (REQ-003).
- VAL-002: tahun laporan 2000–2100; tanggal/periode invalid ditolak tanpa membaca sumber (REQ-003, REQ-014).
- SEC-001: session + flags + identity link + view capability harus dicek server per entry point (REQ-017).
- SEC-002: export grant terpisah dari view, allow-list tetap server-owned, scope existing tidak diperluas (REQ-005, REQ-017).
- SEC-003: tidak ada prefetch financial tanpa audit; request sensitif tidak di URL/log/state persistence; output error aman (REQ-003, REQ-015, REQ-017).
- NFR-001: lebar 375/390/768/1024/1440, AA checks, focus, motion dan scrolling sesuai REQ-008.
- NFR-002: tidak menambah request background/pool/dependency atau mengklaim percepatan tanpa measured baseline; target 20 persen bersyarat (REQ-019, REQ-021).
- OBS-001: mempertahankan jejak audit existing dan menggunakan request reference hanya bila verified/tersedia; tidak log identifier/nominal/secrets (REQ-007, REQ-017).
- OBS-002: simpan before/after, route matrix, results/defects/performance terpisah dari data sensitif (REQ-016, REQ-020).
- MIG-001: tidak ada schema/data migration, seed/reset atau DB write baru; rollback kode saja (REQ-021).

Coverage butir asli, acceptance criteria dan UAT berada di [prd-coverage.md](prd-coverage.md); pengecualian optional tercatat eksplisit, tidak dihapus dari inventory.
