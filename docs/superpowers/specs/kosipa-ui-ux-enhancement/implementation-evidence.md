# Implementation evidence — KOSIPA UI/UX

20 Oktober 2026. Design A disetujui owner; implementasi lokal untuk seluruh **17 route**, **32 table definitions**. Preview: **http://127.0.0.1:3203/login**. Scope: presentation KOSIPA; bukan PWA, POS rewrite, perubahan database, financial query/calculation, auth grants atau release remote.

- [Paket handover](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/README.md), [galeri before/after](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/gallery.html).
- [Browser 59/59](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/after-release/results.json), [edge/security 5/5](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/edge-release/results.json), [navigasi 13/13](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/nav-release.log), [walkthrough A/C/D 32/32](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/owner-release/results.json).
- [Lint/typecheck/unit](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/check-release.log): **634 PASS, 76 DB opt-in SKIP**, nol failure. Empat warning lint existing di POS/test register tetap dicatat; tidak diubah di luar scope.
- [Build](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/build-final.log): PASS di source snapshot terisolasi; startup instrumentation Edge `process.exit` warning existing tetap tercatat. Source aplikasi dibandingkan byte-per-byte dengan build snapshot sebelum handover.
- [Flag/outage](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/flag-probes.json): empat state / 18 checks. [Benchmark before](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/performance-3200.json) / [after](/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.dev-local-run/kosipa-uiux-20261020/performance-3203.json).

Code commit lokal: `f014caa2` pada `feat/unified-console`; dokumentasi handover dicommit terpisah. Tidak ada push/merge/deploy.

## Hasil perubahan

Header, notices/provenance, filter/reset/chips, financial tables, pagination, status, empty/error/loading dan export memakai komponen KOSIPA reusable. CSS inherit token Console dan scoped ke module. DOM numeric headings dan cells rata kanan, exact source formatting dipertahankan, invalid legacy dates diberi label. Mutasi tidak disebut saldo resmi; A/B/C payroll tetap recorded/derived/review-only; failed/truncated scans tidak menghasilkan nol temuan. Detail/profile dan semua lima reports ikut dimigrasi.

Input q tidak lagi dibentuk menjadi URL oleh UI baru: Server Actions mengirim body privat, reauthorize dan memanggil page/use case existing. Cursor sensitif juga privat; filter non-sensitif dan link balik di-allow-list. Legacy GET page/API contracts dipertahankan untuk kompatibilitas; ini bukan klaim bahwa arbitrary URL yang diketik manual tidak bisa mengandung q. Hasil private hanya di memory dan clear pada error/refresh/navigation, tanpa local/session storage. Tidak ada API/database financial baru.

Ekspor memakai endpoint existing, capability terpisah, validated current filters, feedback pending/success/403/413/429/503/network. Tidak menambahkan auto export/import/upload/writer. Link financial, sidebar dan breadcrumb KOSIPA tidak melakukan prefetch; struktur shell global dan TOKO tidak dirombak.

Satu ResizeObserver pada client workspace mengendalikan hint scroll dari overflow aktual; MutationObserver menangani tabel Server Components yang selesai streaming setelah hydration layout. Table markup tetap server-rendered; tidak menambah client boundary per table. Pencarian, loading/failure, forged private target dan report-year tanpa data dicakup test browser.

## Requirement implementation mapping

| REQ | Implementasi / bukti | Status |
|---|---|---|
| REQ-001 | KosipaPageHeader; Console breadcrumb/back links; satu H1 di 51 page/persona cases | Implemented; engineering verified locally |
| REQ-002 | FinancialTable typed metadata; 32 definisi; numeric cells/header; bounded region dan cursor | Implemented; engineering verified locally |
| REQ-003 | PrivateWorkspace/search-actions; FilterContext/ReportYearFilter; native validation dan existing parsers | Implemented; engineering verified locally |
| REQ-004 | ContextNotice/Provenance; satu label sintetis; info/review/error; disclosure sumber | Implemented; engineering verified locally |
| REQ-005 | ExportControl; existing endpoint/grants; browser 403/413/429/503/success; no import/writer | Implemented; engineering verified locally |
| REQ-006 | formatAmount4 existing; decimal-string formatter, masking, formatLegacyDate; golden/source checks | Implemented; engineering verified locally |
| REQ-007 | KosipaSkeleton/FeedbackState/KosipaNotice/error boundary; pending/no-result/outage fail closed | Implemented; engineering verified locally |
| REQ-008 | 255 screenshots, 5 widths; Axe A/AA subset seluruh 17 route; focus/keyboard/Escape/reduced motion | Implemented; engineering verified locally |
| REQ-009 | Ringkasan authorized shortcuts + Informasi data; tanpa KPI/financial read | Implemented; engineering verified locally |
| REQ-010 | Private directory + masked identifiers; Anggota360 section navigation/contacts masking | Implemented; engineering verified locally |
| REQ-011 | Savings search + actual type toolbar, summary/ledger and official balance notice | Implemented; engineering verified locally |
| REQ-012 | Loan period/status, duplicates page-local, detail integrity, cursor and invalid dates | Implemented; engineering verified locally |
| REQ-013 | Keempat payroll routes; grouped components/A/B/C dan review-only | Implemented; engineering verified locally |
| REQ-014 | Hub + lima reports; source diagnostics/samples/caps/unavailable; scoped export | Implemented; engineering verified locally |
| REQ-015 | Safe back filters dan q/cursor privacy, disclosures, same table/state patterns | Implemented; engineering verified locally |
| REQ-016 | Baseline asli + 51 matching before + 255 after; 17 route/permissions matrix | Implemented; engineering verified locally |
| REQ-017 | Server flags/session/caps existing, forged-action guard, denied API/export, 18 outage checks | Implemented; engineering verified locally |
| REQ-018 | pnpm check/build; 59 UI + 5 edge + 13 nav + 32 readonly walkthrough; DB opt-in tetap SKIP | Implemented; engineering verified locally |
| REQ-019 | Benchmark raw/comparison tersedia; variasi lokal besar dan operator task-time belum diukur | Evidence available; target 20% belum dibuktikan |
| REQ-020 | Galeri, ZIP, component/route/permission mapping, results dan checklist owner | Owner review-ready; acceptance pending |
| REQ-021 | Diff tidak menyentuh packages/domain/application, infrastructure queries, Prisma, flags/grants atau legacy | Verified scope; no push/merge/deploy |

## Kegagalan dan keterbatasan yang tidak disembunyikan

Baseline nav awal 12/13: N7 login navigation timeout; isolated export probe 200/403 dan subsequent original suite 13/13 dicatat, tanpa mengklaim akar timeout historis pasti. Baseline full-unit sempat gagal satu worker timeout 300 ms under concurrent load; focused rerun dan final full-suite PASS, auth code/test budget tidak diubah.

Walkthrough awal terhadap mode dev memiliki stale readiness karena banner sintetis tampil sebelum skeleton selesai; test helper kini menunggu aria-busy selesai. Test C1 kini memverifikasi q tidak masuk URL, sesuai requirement yang disetujui. Error framework dev tidak disaring: repeated dev capture dihentikan setelah error hydration berulang; raw log disertakan. Rujukan [Next.js #99032](https://github.com/vercel/next.js/issues/99032) dan inspeksi installed Flight development bundle mendukung diagnosis gejala; build lokal production-mode dijadikan permukaan UAT stabil.

Parallel run tambahan 53/59 didiagnosis terpisah: suite memakai akun sama secara bersamaan, sementara PrismaSessionStore mempertahankan lima sesi aktif. Metadata bounded user sintetis (tanpa SID/hash/token) menunjukkan superseded; orkestrasi final berurutan menyelesaikan failure tanpa mengubah auth atau mengabaikan assertion. Raw failure dipertahankan.

Review visual terakhir menemukan hint scroll belum aktif saat tabel server selesai streaming setelah effect layout. Uji awal sempat memberi hasil vacuous karena tidak menunggu tabel. Test diperkuat untuk menunggu tabel di tiga route dan lima viewport pada seluruh core screenshot; red gagal timeout (scroll-hint-red.log), kemudian fix observer additions lulus tanpa mengubah ukuran/financial data. Seluruh screenshot final diambil ulang.

Tidak ada klaim full WCAG certification, live production roles/parity, DB integration dari SKIP, task-time manusia, atau production readiness. Owner UAT dan pengukuran operator tetap menunggu owner. Audit append-only outage/revoked link tidak direkayasa dengan mengubah permission/link owner; kontrak fail-closed tetap ditest pada existing fake-port/unit suites dan direct unauthorized browser/API cases.

Skill frontend-engineer tidak tersedia pada repo/katalog lokal yang diperiksa; fallback frontend-design + standar existing sesuai PRD §10 digunakan secara terbuka. Tidak mengklaim skill yang hilang telah dijalankan.

Normal login/audit application writes terjadi selama pengujian. Tidak ada reset/seed/grant/revoke/transaksi financial oleh sesi ini. Proses original :3200/:3201 dipertahankan; hanya instance probe dan preview milik sesi dikelola. User PRD untracked dan .DS_Store unrelated dipertahankan. Status Git/commit akhir dilaporkan terpisah sesudah staging exact paths.
