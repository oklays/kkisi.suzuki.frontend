# Task breakdown

Rancangan A dan baseline disetujui owner pada 20 Oktober 2026. Owner meminta langsung implementasi menyeluruh berdasarkan task ini, tanpa dokumen planning tambahan; native checkout sudah pada branch target `feat/unified-console`, perubahan unrelated dipertahankan. Small local commits hanya mencakup path terkait; jangan memasukkan PRD/user file atau .DS_Store tanpa sengaja.

| Task | Phase | Tujuan | Requirements | File/surface | Dependency | Verification | Status |
|---|---|---|---|---|---|---|---|
| KUX-001 | 0 | Baca PRD/instruksi/skill, scope baseline dan catat missing frontend-engineer | REQ-016, REQ-021 | PRD; README; current-state | — | Cocokkan 19 bagian PRD dan batas diff | Baseline reviewed; audit selesai |
| KUX-002 | 0 | Inventory 17 route/component/permission dan screenshot tiga persona 1440/390 | REQ-016, REQ-017 | current-state; manifests lokal | KUX-001 | 17 pola source terwakili dan 138 screenshot baseline tersedia | Baseline reviewed; audit selesai |
| KUX-003 | 0 | Triase issue aktual, coverage PRD dan design review | REQ-016, REQ-019 | impact-analysis; design; prd-coverage | KUX-002 | Coverage validator dan review owner | Approved A oleh owner |
| KUX-010 | 1 | Header, status mode, section dan breadcrumb aman | REQ-001, REQ-004 | components/console/kosipa; semua page | approval desain | Render semantics + screenshot header | Implemented; locally verified (implementation-evidence.md) |
| KUX-011 | 1 | Typed financial table wrapper, columns, alignment, local scroll dan totals | REQ-002, REQ-008 | components/console/kosipa; kosipa.css usulan | KUX-010 | Table rendering check, keyboard scrolling dan viewports | Implemented; locally verified (implementation-evidence.md) |
| KUX-012 | 1 | Filter/reset/chips/field validation; private server presentation search actions | REQ-003, REQ-015, REQ-017 | components/console/kosipa; app/console/kosipa actions usulan | KUX-010 | Auth recheck, query/body privacy, native validation dan cursor | Implemented; locally verified (implementation-evidence.md) |
| KUX-013 | 1 | Notice/disclosure/provenance dan label sintetis satu kali | REQ-004, REQ-009 | components/console/kosipa; layout KOSIPA usulan | KUX-010 | Severity/duplicate banner/env marker checks | Implemented; locally verified (implementation-evidence.md) |
| KUX-014 | 1 | Formatters source-exact, status/tanggal dan loading/empty/error | REQ-006, REQ-007 | payroll-format.ts; components/console/kosipa; loading/error usulan | KUX-011 | Meaningful money/date/scan state tests | Implemented; locally verified (implementation-evidence.md) |
| KUX-020 | 2 | Migrasi Ringkasan | REQ-009, REQ-001 | app/console/kosipa/page.tsx | KUX-010..014 | Tiga persona; authorized links; tanpa KPI | Implemented; locally verified (implementation-evidence.md) |
| KUX-021 | 2 | Migrasi directory dan Anggota360 | REQ-010, REQ-003 | app/console/kosipa/anggota/** | KUX-010..014 | Private search, masking, restricted sections | Implemented; locally verified (implementation-evidence.md) |
| KUX-022 | 2 | Migrasi savings search dan ledger | REQ-011, REQ-002 | app/console/kosipa/simpanan/** | KUX-010..014 | Jenis/filter/reset/cursor/unavailable | Implemented; locally verified (implementation-evidence.md) |
| KUX-023 | 2 | Migrasi loans list/detail | REQ-012, REQ-006 | app/console/kosipa/pinjaman/** | KUX-010..014 | Duplicate/invalid date/large schedule cases | Implemented; locally verified (implementation-evidence.md) |
| KUX-024 | 2 | Migrasi empat payroll routes | REQ-013, REQ-007 | app/console/kosipa/payroll/** | KUX-010..014 | A/B/C, review-only, audit dan section grant | Implemented; locally verified (implementation-evidence.md) |
| KUX-025 | 2 | Migrasi report hub dan lima report | REQ-014, REQ-004 | app/console/kosipa/laporan/** | KUX-010..014 | Semua report/scan categories/cap20 | Implemented; locally verified (implementation-evidence.md) |
| KUX-030 | 3 | Secure export UX dan direct API gates | REQ-005, REQ-017 | ExportControl usulan; laporan pages; browser tests | KUX-025 | 403/413/429/audit outage + exact CSV | Implemented; locally verified (implementation-evidence.md) |
| KUX-031 | 3 | Responsive seluruh route | REQ-002, REQ-008 | kosipa.css; table wrapper; pages | KUX-020..025 | 375/390/768/1024/1440 screenshot+overflow | Implemented; locally verified (implementation-evidence.md) |
| KUX-032 | 3 | Keyboard/a11y/revoke/flag/outage security regression | REQ-008, REQ-017 | UI components + tests | KUX-030, KUX-031 | AA automated jika infra tersedia + manual, denied tidak expose data | Implemented; locally verified (implementation-evidence.md) |
| KUX-040 | 4 | Cross-page context, copy dan disclosure polish | REQ-015, REQ-004 | 17 pages dan nav adapters lokal | KUX-020..025 | Back/refresh/deep links, sensitive URL assertions | Implemented; locally verified (implementation-evidence.md) |
| KUX-041 | 4 | Functional/browser/screenshot/TOKO regression | REQ-018, REQ-016 | tests; results; screenshots after | KUX-030..040 | pnpm lint/typecheck/test/build; browser/nav/UAT/TOKO | Implemented; locally verified (implementation-evidence.md) |
| KUX-042 | 4 | Measure performance/task time before/after | REQ-019 | performance evidence lokal dan verification | Baseline/after navigation tersedia | Raw median/p95 tersedia; human task-time belum diukur | Engineering benchmark recorded; owner measurement pending |
| KUX-050 | 5 | DEV Local walkthrough dan paket owner review | REQ-020 | handover; screenshot mapping; route matrix | KUX-041, KUX-042 | Semua artefak tersedia dan gaps eksplisit | Implemented; locally verified (implementation-evidence.md) |
| KUX-051 | 5 | Owner UAT intake tanpa auto acceptance | REQ-020 | verification 12 skenario; owner results | KUX-050 | Owner mengisi PASS/FAIL/BLOCKED sendiri | Ready for owner intake; manual result pending |
| KUX-052 | 5 | Defect closeout dan handover/Git boundary | REQ-020, REQ-021 | defect register; final diff/status | KUX-051 | Repro/fix/retest defect; status lokal; no push/merge/deploy | Engineering closeout; owner defects/dev framework follow-up retained |

## Nonfunctional coverage per task

- KUX-010/011/013: BR-002, NFR-001 dan source labels.
- KUX-012: VAL-001/002, SEC-001/003; reauthorize tiap entry point. Tidak ada default baru untuk D1–D10/R1.
- KUX-014/023/024/025: BR-002/003, OBS-001; exact units, unknown status/date dan scans.
- KUX-030/032: BR-001, SEC-001/002/003; audit-before-read dan output sanitization tetap.
- KUX-041/042: NFR-001/002, OBS-002; suite mutating jangan dijalankan terhadap owner DEV LOCAL.
- KUX-050/051/052: BR-004, OBS-002, MIG-001; owner acceptance terpisah dan rollback kode saja.

Tidak ada fase database/core/worker baru karena bertentangan scope. File usulan harus dicek terhadap installed Next.js guide sebelum implementasi sesuai apps/web/AGENTS.md. Optional saved views tidak dibangun; page size/sort unsupported tidak ditambahkan.
