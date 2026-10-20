# Verification dan acceptance

Status terbaru: implementasi dan bukti after tersedia; lihat implementation-evidence.md untuk hasil final dan keterbatasan. Baseline di bawah dipertahankan sebagai riwayat. Coverage validator hanya memeriksa dokumen, bukan bukti feature selesai.

## Requirement traceability

| Requirement | Design | Task | Check |
|---|---|---|---|
| REQ-001 (FR-UI-001) | D1 | KUX-010 | periksa satu H1, breadcrumb, izin link dan aksi |
| REQ-002 (FR-UI-002) | D2 | KUX-011 | uji seluruh tabel, scroll dengan keyboard, cursor paging dan tidak ada fake sort |
| REQ-003 (FR-UI-003) | D3 | KUX-012 | uji submit, reset, validasi, request dan URL, refresh/back serta cursor |
| REQ-004 (FR-UI-004) | D4 | KUX-013 | periksa duplikasi notice, label sumber, error persisten dan A−B nonmerah |
| REQ-005 (FR-UI-005) | D5 | KUX-030 | uji ekspor positif/negatif dan feedback dengan response terkontrol |
| REQ-006 (FR-UI-006) | D6 | KUX-014 | uji decimal string, safe fixed units, sub-sen, negatif, nol, missing dan tanggal legacy |
| REQ-007 (FR-UI-007) | D7 | KUX-014 | uji loading, no-result, audit/source outage, revoked link dan retry aman |
| REQ-008 (FR-UI-008) | D8 | KUX-031, KUX-032 | uji 375/390/768/1024/1440, keyboard, screen-reader semantics dan audit aksesibilitas |
| REQ-009 (FR-PAGE-01) | D9 | KUX-020 | screenshot tiga persona dan seluruh shortcut |
| REQ-010 (FR-PAGE-02) | D10 | KUX-021 | uji hasil, profil, masking, section terbatas dan tiada prefetch sensitif |
| REQ-011 (FR-PAGE-03) | D11 | KUX-022 | uji jenis aktual, reset, cursor, presisi dan missing source |
| REQ-012 (FR-PAGE-04) | D12 | KUX-023 | uji PINSYN9005 duplikat, PINSYN9003 cursor dan data tanggal invalid |
| REQ-013 (FR-PAGE-05) | D13 | KUX-024 | uji semua empat route payroll, pemisahan A/B/C, sub-sen, audit dan izin |
| REQ-014 (FR-PAGE-06) | D14 | KUX-025 | uji lima laporan dan missing/truncated scan tidak hijau nol |
| REQ-015 (FR-PAGE-07) | D15 | KUX-040 | uji back/refresh/deep link dan tiada parameter identitas/secrets |
| REQ-016 (PRD §2, §10, phase 0) | D16 | KUX-001, KUX-002, KUX-003 | cocokkan 17 pola route, manifest, screenshot dan gap |
| REQ-017 (AC-G03/G09, AC-E01/E04) | D17 | KUX-030, KUX-032 | uji API/page negatif, revoke, outage dan CSV exact/sanitized/bounded/audited |
| REQ-018 (AC-G10, PRD §12/§14) | D18 | KUX-041 | rekam seluruh hasil dan pisahkan skipped/blocked dari PASS |
| REQ-019 (PRD §15) | D19 | KUX-042 | ukur median/p95 navigasi warmed dan task time operator, catat kondisi dan keterbatasan |
| REQ-020 (PRD §18, phase 5) | D20 | KUX-050, KUX-051, KUX-052 | audit artefak, keputusan tertulis dan defect closeout |
| REQ-021 (PRD §3/§16/§17/§19) | D21 | KUX-001, KUX-052 | review diff layer/file, tidak ada DDL atau konfigurasi grant dan catat Git state |

BR-001..004, VAL-001/002, SEC-001..003, NFR-001/002, OBS-001/002 dan MIG-001 mengikuti mapping per task pada tasks.md; test juga harus memeriksa kontrak tetap, bukan hanya class CSS.

## Baseline evidence saat review

- 69 halaman/state sintetis dibuka, 138 screenshot 1440/390; semua berhasil, nol global overflow pada dua lebar tersebut.
- 17 pola route source terwakili; supplemental mencakup payroll member/rekonsiliasi, query results dan duplikat/jadwal besar.
- Koperasi dapat membuka seluruh domain; kasir2 ditolak payroll; admin belum ditautkan pada semua route KOSIPA. Bukti ini tidak membuktikan revoked link/outage/seluruh API negative matrix.
- UI code belum dimodifikasi. Suite existing `console-kosipa-nav-browser.mjs` pada :3201 menghasilkan **12/13 PASS**, satu FAIL N7 karena login `page.waitForURL` timeout 20 detik. Suite belum hijau; tidak mengubah test/aplikasi atau menganggapnya fixed.
- Probe terpisah N7 kemudian berhasil: synth_koperasi login 200, satu link CSV dan API 200 text/csv; synth_kasir2 login 200, tanpa link CSV dan API 403. Ini bukti isolated recheck, bukan pengganti PASS full suite. Akar timeout intermittent belum diketahui. Hasil: [export-probe.json](/private/tmp/kkisi-kosipa-uiux-20261020/export-probe.json); [suite result](/private/tmp/kkisi-kosipa-nav/results.json).

## Perintah dan pemilihan lingkungan

```sh
bash .agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/kosipa-ui-ux-enhancement
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` dilakukan setelah implementation dan tidak bersamaan mengganti output `.next` milik server DEV LOCAL yang dipakai owner; gunakan isolated build/output atau workspace yang terverifikasi bila perlu. Jangan reset/seed/restart DEV LOCAL demi menjalankan suite.

Suite browser existing dibaca sebelum dijalankan:
- `apps/web/tests/console-kosipa-nav-browser.mjs`: baseline aman terhadap data finansial, menggunakan session/audit/export normal dan SELF_LINK negatif yang harus ditolak. Set DEV_LOCAL_URL=:3201 dan PLAYWRIGHT_MODULE ke instalasi existing.
- `apps/web/tests/console-kosipa-browser.mjs`: **mutates links/grants/fixtures** pada schema e2e. Jalankan hanya isolated e2e sesuai guard, bukan owner DEV LOCAL.
- `apps/web/tests/owner-uat-walkthrough-browser.mjs`: sebagian skenario menulis transaksi; pilih subset read-only atau lingkungan isolated. Jangan menjalankan all terhadap owner data.
- `apps/web/scripts/uat-run.sh`: dapat mencabut shared identity links dan reset fixtures; hanya pada lingkungan e2e terisolasi yang sudah diperiksa. Tidak perlu dijalankan untuk dokumen desain.
- `apps/web/tests/kosipa-*-db.test.mjs`: DB opt-in dengan guard masing-masing, hasil skip tidak dianggap PASS integrasi.
- TOKO/POS suite existing: mutation checks pada fixture terpisah; smoke login/landing/catalog nonmutating pada data owner bila aman.

Meaningful UI checks yang harus ditambahkan saat implementasi: exact money fixture dengan sub-sen/negative/null, legacy date labels, real numeric column semantics, URL/body privacy, restricted section absent/no-prefetch, duplicate doc preservation, real cursor paging, export error mapping dan unavailable scan count. Screenshot regression existing adalah capture/assertions; pixel-diff engine belum dibuktikan tersedia. Gunakan before/after visual review tanpa menambah dependency hanya untuk checkbox.

## Matrix state dan viewport yang harus dipenuhi

Semua 17 route: widths 375/390/768/1024/1440, satu H1, no global scroll, local table scroll via keyboard, header numeric kanan, focus dan label. Akun koperasi, kasir2, admin serta kasir1 TOKO. State: initial/no-search, no record, no-match filter, loading, invalid input, source timeout/unavailable, partial/truncated scan, audit unavailable, permission denied, not-linked, revoked link, disabled flags. Pertahankan error yang penting inline; no cached fallback pada access failure.

Export: success dengan validated current year, 403 UI/API, 413, 429 Retry-After, audit 503, network error, no duplicate requests, sanitized CSV + exact decimals dan existing cap. Gunakan response interception untuk UI failure agar tidak mematikan DB atau menghabiskan throttle owner. Live positive download dibatasi dan dicatat; tidak mengklaim actual file saved dari event blob saja.

## Owner manual UAT (hasil owner tetap kosong)

| # PRD §14 | Skenario | Bukti engineering yang perlu dilampirkan | Hasil owner |
|---|---|---|---|
| 1 | Cari anggota lewat navigasi | Klik sidebar→directory→profil, waktu dan jumlah aksi | Belum diuji owner |
| 2 | Bedakan mutasi dan saldo resmi unavailable | Screenshot savings dan penjelasan singkat | Belum diuji owner |
| 3 | Bedakan payroll recorded/derived/A−B | Screenshot comparison review-only | Belum diuji owner |
| 4 | Viewer tanpa export grant | UI tidak ada kontrol + direct API denied | Belum diuji owner |
| 5 | Export authorized/413/throttle | CSV exact dan feedback actionable | Belum diuji owner |
| 6 | Scan gagal bukan nol | Screenshot response terkontrol dan no fake count | Belum diuji owner |
| 7 | Duplikat loan/tanggal invalid | PINSYN9005 dan invalid date/schedule | Belum diuji owner |
| 8 | Mobile 390 | Screenshot/table scroll dan CTA tersusun | Belum diuji owner |
| 9 | Link dicabut | Isolated fixture revoked, clear/fail closed | Belum diuji owner |
| 10 | Admin tanpa link | State akun belum ditautkan, data tidak bocor | Belum diuji owner |
| 11 | TOKO POS/login/landing tetap | Read-only smoke dan isolated transaction regression | Belum diuji owner |
| 12 | Back/refresh/filter/no-result/outage | Journey test plus private-query refresh guidance | Belum diuji owner |

## Performance dan handover

Sebelum kode berubah: ukur cold/warm navigation 5 kali per halaman representatif, laporkan median/p95 dengan compiler/runtime mode dan network/viewport sama; jangan campur next dev cold compile dengan production warm. Task T1→loan/payroll diukur dengan operator dan langkah yang setara; target >=20% hanya jika baseline mendukung. Task-time operator belum diukur. Tabel berikut mempertahankan baseline historis. Benchmark before/after final dengan production-mode lokal dan keterbatasannya tersedia di implementation-evidence.md dan paket handover.

Handover wajib berisi perubahan code, before/after seluruh route, mapping komponen/permission/menu, hasil seluruh command dan browser/a11y/performance, daftar defect/risiko dan owner form. Jika ada gate gagal atau belum diuji, laporkan spesifik. Tidak menyimpulkan production/staging acceptance. Production O3, official balance O1/O5, D5 mapping dan writer decisions tetap terpisah.

## Hasil performance baseline aktual

Profil: existing Next dev :3201, Chromium headless 1440×960, data sintetis, satu warm-up lalu n=5 navigasi penuh per route. Timer mencakup goto dan main H1 terlihat. p95 nearest rank pada n kecil sama dengan maksimum; ini bukan benchmark produksi atau task-time manusia. Raw: [performance-before.json](/private/tmp/kkisi-kosipa-uiux-20261020/performance-before.json).

| Route | Median ms | p95 ms |
|---|---|---|
| `/console/kosipa` | 451 | 524 |
| `/console/kosipa/pinjaman` | 457 | 506 |
| `/console/kosipa/payroll` | 480 | 592 |
| `/console/kosipa/laporan/payroll` | 452 | 602 |
| `/console/kosipa/laporan/kualitas-data` | 480 | 708 |

Regresi performa belum dapat dinilai sebelum after tersedia pada kondisi setara. KUX-042 baseline navigation tersedia; baseline task-time dan perbandingan after masih pending.

## Explicit secondary traceability

| ID | Design | Task | Check |
|---|---|---|---|
| BR-001 | D5/D21 | KUX-030/KUX-052 | tidak ada import/writer aktif |
| BR-002 | D4/D6/D13 | KUX-013/KUX-024 | unavailable/recorded/derived/review berbeda |
| BR-003 | D2/D6/D12 | KUX-014/KUX-023 | unit/status/cursor source tetap |
| BR-004 | D20 | KUX-051 | owner sign-off tertulis |
| VAL-001 | D3 | KUX-012 | search/status/period/cursor parser existing |
| VAL-002 | D3/D14 | KUX-012/KUX-025 | tahun di luar 2000–2100 ditolak |
| SEC-001 | D17 | KUX-012/KUX-032 | reauthorize session/flag/link/view di server |
| SEC-002 | D5/D17 | KUX-030/KUX-032 | export grant separate dan server scope |
| SEC-003 | D3/D15/D17 | KUX-012/KUX-040 | no sensitive query/storage/log/prefetch |
| NFR-001 | D8 | KUX-031/KUX-032 | viewport dan keyboard/AA |
| NFR-002 | D19/D21 | KUX-042 | request/pool/dependency dan measured performance |
| OBS-001 | D7/D17 | KUX-014/KUX-032 | audit tetap/ref aman/no secret logging |
| OBS-002 | D16/D20 | KUX-050 | before/after/results/performance/defect evidence |
| MIG-001 | D21 | KUX-052 | no schema/data migration; revert kode saja |
