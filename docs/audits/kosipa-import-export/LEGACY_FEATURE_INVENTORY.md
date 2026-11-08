# 02 — Legacy KOSIPA Import/Export Feature Inventory

The IDs in this file are the source of truth. All other audit documents use them.

Source: the local legacy copy `legacy/kosipa/` (CodeIgniter 2.1.4 HMVC). Paths below are relative to `legacy/kosipa/application/modules/` unless they start with `legacy/`. The menu comes from the `ref_menu` table in the 30 Oct 2026 data copy (`kkisi_refresh_20261030`).

## Conventions

- **Access role.** KOSIPA has no per-action permission. A controller's constructor calls `user_m::cekstatushakakses('<module>/<class>', id_user)`, which allows any user whose group has a `ref_menu_akses` row for that controller URL (`models/user_m.php:379-401`). If a user can open the page, every method on the controller is open to them, including import and export (prior finding ANO-K02). In the tables, "Menu grant `<url>`" means exactly this check.
- **Branch scope.** No list, import or export query filters by site, branch or company. `id_ref_site` is stored in the session but never used as a filter in these paths. `lokasi` and `bagian` are member attributes, not access boundaries. Every row below is **Global**.
- **Discovery status.**
  - **Confirmed:** the route, handler, model write path and UI trigger were all read in source.
  - **Partial:** existence and scope are confirmed, but some detail (for example the exact exported header text) was not traced per column.
  - **Unverified:** inferred, or the evidence is missing.
- **Reachability.**
  - **Active:** the controller has a production menu row and a live UI trigger.
  - **Route-only:** the endpoint is reachable but no button is rendered.
  - **Dormant:** no menu row, so the access check always fails, or there is no route at all.
  - **Dead:** a UI trigger exists but its target does not exist.
- **Menu snapshot.** In the 30 Oct copy, all 74 `ref_menu` rows have `status=1`. The local `kkisi_staging` copy has 13 rows switched to `0` by the FA fence work. That is a local change and is ignored here.
- **File format of imports.** Every import uses Box\Spout 3 `createXLSXReader()`. Only `.xlsx` can be parsed, although the CodeIgniter upload config also allows `xls`.

## Menu hierarchy inspected

There are 74 `ref_menu` rows: 11 groups and 63 leaf links. 54 of the leaf links resolve to a controller; 9 have no controller in the source (ANO-K37). Import/export controls appear on the following pages. The bracketed number is the `ref_menu.id`.

| Group | Leaf pages with import/export controls |
|---|---|
| Anggota | Daftar Anggota [134], Transaksi Pinjaman [136], Transaksi Toko [137] |
| Data Mobile | Users Mobile [92] |
| Simpanan | Data Simpanan [28], Payroll & Saldo Awal [123], Setor TF/Tunai [124], Penarikan [41], Hak & Kewajiban [125], Master Potongan Payroll [106] |
| Pinjaman | Pinjaman Reguler [95], Pinjaman Bank [96], Kasbon [97], Pembiayaan [98], Gaji Minus [104], KPR BTN [119], Daftar Pinjaman [31], Pelunasan Pinjaman [29], Roll Over Pinjaman [30], Kartu Aktif [122] |
| (top) | Matrix Potongan [59], SHU [58] |
| Master Data | Anggota [139] |
| Laporan | Resume Simpanan [54]; OutStanding Pinjaman: Reguler [100], Bank [101], Kasbon [102], Pembiayaan [103]; Pencairan Pinjaman: Reguler [113] |
| PPOB | Daftar Penjualan [76], Lap. Penjualan [94], Lap. Tagihan [132] |

Detail pages that carry controls:
- `simpanan_c::detail`
- `sim_payroll_c::detail`
- `penarikan_simpanan_c::detail`
- `matrix_c::detail_form`
- `shu_c::add_shu`
- `tagihan_c::detail_tagihan`

## A. Import features

DB table abbreviations: `ma` = `m_anggota`, `u` = `users` (smartkkisi mobile wallet), `tp` = `trans_pinjaman`, `tpd` = `trans_pinjaman_dtl`, `ts` = `trans_simpanan`, `tsd` = `trans_simpanan_dtl`, `msa` = `m_simpanan_aktif`, `thk` = `trans_hak_kewajiban`, `tpm` = `trans_potongan_matrix`, `tpb` = `trans_potongan_bulanan`, `tshu` = `trans_shu`, `tshud` = `trans_shu_dtl`, `mjp` = `m_jenis_pinjaman`.

### A1. Active imports (21)

| Feature ID | Module | Menu | Submenu | Page | Feature | File format | Legacy route | Controller → model handler | UI location | Access role | Branch | Database tables | Status | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KOS-IMP-001 | Membership | Master Data | Anggota | Data Anggota list | Import members | XLSX (template TPL-001) | `POST /master/anggota_c/ajax_upload_excel` | `master/controllers/anggota_c.php:986` → `master/models/anggota_m.php:212-413` | Toolbar button "Import" → modal `#formimport` | Menu grant `master/anggota_c` | Global | W: ma (INSERT) · R: ma | Confirmed | view `master/views/anggota_v.php:127,785-817`; JS `master/views/js/anggota_js.php:56-79` |
| KOS-IMP-002 | Membership | Anggota | Daftar Anggota | Data Anggota list | Import members (second copy) | XLSX (TPL-001) | `POST /anggota/anggota_c/ajax_upload_excel` | `anggota/controllers/anggota_c.php:1032` → `anggota/models/anggota_m.php:212-382` | Toolbar "Import" → modal; template link points to `master/anggota_c` | Menu grant `anggota/anggota_c` (template needs `master/anggota_c` too) | Global | W: ma (INSERT) · R: ma | Confirmed | `anggota/views/anggota_v.php:127,792-817`; differs from 001 (NIK zero-pad, 5,000-row cap) |
| KOS-IMP-003 | Membership / credit | Master Data | Anggota | Data Anggota list | Import credit limits (`limit_toko`, `gaji_minus`, `limit_ppob`) | XLSX (TPL-002) | `POST /master/anggota_c/ajax_upload_excel_limit` | `master/controllers/anggota_c.php:992` → `master/models/anggota_m.php:414-568` | Toolbar "Import Limit" → modal `#formimport_limit` | Menu grant `master/anggota_c` | Global | W: ma (UPDATE), u (UPDATE wallet) · R: ma, u | Confirmed | `master/views/anggota_v.php:124,857-882`; writes at `:522`, `:538` |
| KOS-IMP-004 | Membership / credit | Anggota | Daftar Anggota | Data Anggota list | Import credit limits (second copy) | XLSX (TPL-002) | `POST /anggota/anggota_c/ajax_upload_excel_limit` | `anggota/controllers/anggota_c.php:1038` → `anggota/models/anggota_m.php:383-537` | Toolbar "Import Limit" | Menu grant `anggota/anggota_c` | Global | W: ma, u · R: ma, u | Confirmed | logic identical to 003 (diff) |
| KOS-IMP-005 | Savings | Simpanan | Data Simpanan | Savings document detail | Import member lines into an open savings document | XLSX (TPL-003) | `POST /simpanan/simpanan_c/ajax_upload_excel_detail` | `simpanan/controllers/simpanan_c.php:1011` → `simpanan/models/simpanan_m.php:538-1425` | Detail toolbar "Import" → modal with hidden `doc_no`, `jenis_simpanan`, `jenis_transaksi` | Menu grant `simpanan/simpanan_c` | Global | W: tsd (INSERT/UPDATE), msa (INSERT/UPDATE, PAYROLL only) · R: ma, ts, tsd, msa | Confirmed | `simpanan/views/simpanan_detail_v.php:257,505-545`; JS `simpanan/views/js/simpanan_detail_js.php:325-390` |
| KOS-IMP-006 | Savings / payroll | Simpanan | Payroll & Saldo Awal | Payroll savings document detail | Import lines (payroll or opening balance) | XLSX (TPL-003) | `POST /simpanan/sim_payroll_c/ajax_upload_excel_detail` | `simpanan/controllers/sim_payroll_c.php:980` → `simpanan/models/sim_payroll_m.php:542-1429` | Same shared detail view and JS as 005 | Menu grant `simpanan/sim_payroll_c` | Global | W: tsd, msa · R: ma, ts, tsd, msa | Confirmed | `view_map`: `simpanan_detail_js` loaded by `sim_payroll_c::detail:193` |
| KOS-IMP-007 | Savings | Simpanan | Setor TF/Tunai | Deposit list | Bulk deposits (one document per row) | XLSX (TPL-003) | `POST /simpanan/sim_setor_c/ajax_upload_excel_detail` | `simpanan/controllers/sim_setor_c.php:364` → `simpanan/models/sim_setor_m.php:460-633` | Toolbar "Import" → modal (type, jenis, date, payment type) | Menu grant `simpanan/sim_setor_c` (template needs `simpanan/simpanan_c`) | Global | W: ts (INSERT, `POSTING`), tsd (INSERT) · R: ma, ts | Confirmed | `simpanan/views/sim_setor_v.php:145,424-445`; JS `sim_setor_js.php:474,649` |
| KOS-IMP-008 | Savings | Simpanan | Penarikan | Withdrawal list and withdrawal detail | Bulk withdrawals (one document per row) | XLSX (expects TPL-004 layout; served TPL-003) | `POST /simpanan/penarikan_simpanan_c/ajax_upload_excel_detail` | `simpanan/controllers/penarikan_simpanan_c.php:676` → `simpanan/models/penarikan_simpanan_m.php:410-578` | List toolbar "Import" and detail toolbar "Import" (both create new documents) | Menu grant `simpanan/penarikan_simpanan_c` (template needs `simpanan/simpanan_c`) | Global | W: ts (INSERT, `POSTING`, DEBIT), tsd (INSERT debit) · R: ma, ts | Confirmed | `penarikan_simpanan_v.php:148,424-445`; `penarikan_simpanan_detail_v.php:211,508-527` |
| KOS-IMP-009 | Member exit | Simpanan | Hak & Kewajiban | Exit settlement list | Bulk exit settlements (typed amounts) | XLSX (TPL-005) | `POST /simpanan/hak_kewajiban_c/ajax_upload_excel_detail` | `simpanan/controllers/hak_kewajiban_c.php:293` → `simpanan/models/hak_kewajiban_m.php:654-854` | Toolbar "Import" → modal | Menu grant `simpanan/hak_kewajiban_c` | Global | W: thk (INSERT `POSTING`) · R: ma, thk | Confirmed | `hak_kewajiban_v.php:134,572-593` |
| KOS-IMP-010 | Payroll deduction master | Simpanan | Master Potongan Payroll | Deduction master list | Import standing payroll deductions per savings type | XLSX (TPL-006) | `POST /simpanan/master_payroll_c/ajax_upload_excel` | `simpanan/controllers/master_payroll_c.php:193` → `simpanan/models/master_payroll_m.php:178-344` | Toolbar "Import" → modal (`jenis_simpanan`) | Menu grant `simpanan/master_payroll_c` | Global | W: msa (INSERT/UPDATE), ma (UPDATE `sim_sukarela`) · R: ma, msa | Confirmed | `master_payroll_v.php:82,346-359` |
| KOS-IMP-011 | Lending | Pinjaman | Daftar Pinjaman | Loan list | Bulk loans, any product (approved on creation) | XLSX (TPL-007) | `POST /pinjaman/pinjaman_c/ajax_upload_excel` | `pinjaman/controllers/pinjaman_c.php:1663` → `pinjaman/models/pinjaman_m.php:576-776` | Toolbar "Import" → modal (`kode_pembiayaan`, unused) | Menu grant `pinjaman/pinjaman_c` | Global | W: tp (INSERT), tpd (DELETE+INSERT schedule) · R: ma, mjp | Confirmed | `pinjaman_v.php:154,263-276` |
| KOS-IMP-012 | Lending | Pinjaman | Pinjaman Reguler | Loan list | Bulk regular loans | XLSX (TPL-008) | `POST /pinjaman/pinjaman_reguler_c/ajax_upload_excel` | `pinjaman/controllers/pinjaman_reguler_c.php:990` → `pinjaman/models/pinjaman_reguler_m.php:624-827` | Toolbar "Import" | Menu grant `pinjaman/pinjaman_reguler_c` | Global | W: tp (INSERT, UPDATE `akhir_pinjaman`), tpd · R: ma, mjp, tpd | Confirmed | `pinjaman_reguler_v.php:183,289-302` |
| KOS-IMP-013 | Lending | Pinjaman | Pinjaman Bank | Loan list | Bulk bank-channel loans | XLSX (TPL-009) | `POST /pinjaman/pinjaman_bank_c/ajax_upload_excel` | `pinjaman/controllers/pinjaman_bank_c.php:901` → `pinjaman/models/pinjaman_bank_m.php:608-815` | Toolbar "Import" | Menu grant `pinjaman/pinjaman_bank_c` | Global | W: tp, tpd · R: ma, mjp, tpd | Confirmed | `pinjaman_bank_v.php:176,281-294` |
| KOS-IMP-014 | Lending | Pinjaman | Kasbon | Loan list | Bulk cash advances | XLSX (TPL-010) | `POST /pinjaman/kasbon_c/ajax_upload_excel` | `pinjaman/controllers/kasbon_c.php:706` → `pinjaman/models/kasbon_m.php:510-722` | Toolbar "Import" | Menu grant `pinjaman/kasbon_c` | Global | W: tp, tpd · R: ma, mjp, tpd | Confirmed | `kasbon_v.php:171,274-287` |
| KOS-IMP-015 | Lending | Pinjaman | Pembiayaan | Loan list | Bulk goods/service financing | XLSX (TPL-011) | `POST /pinjaman/pembiayaan_c/ajax_upload_excel` | `pinjaman/controllers/pembiayaan_c.php:634` → `pinjaman/models/pembiayaan_m.php:512-719` | Toolbar "Import" | Menu grant `pinjaman/pembiayaan_c` | Global | W: tp, tpd · R: ma, mjp, tpd | Confirmed | `pembiayaan_v.php:163,264-277` |
| KOS-IMP-016 | Lending / credit | Pinjaman | Gaji Minus | Loan list | Bulk salary-shortfall loans; resets every member's `gaji_minus` | XLSX (TPL-012) | `POST /pinjaman/gaji_minus_c/ajax_upload_excel` | `pinjaman/controllers/gaji_minus_c.php:647` → `pinjaman/models/gaji_minus_m.php:472-705` | Toolbar "Import" | Menu grant `pinjaman/gaji_minus_c` | Global | W: tp, tpd, ma (UPDATE all rows + per row), u (wallet) · R: ma, mjp, u | Confirmed | global reset `gaji_minus_m.php:557-569` |
| KOS-IMP-017 | Lending | Pinjaman | KPR BTN | Loan list | Bulk housing loans | XLSX (TPL-009) | `POST /pinjaman/kpr_btn_c/ajax_upload_excel` | `pinjaman/controllers/kpr_btn_c.php:888` → `pinjaman/models/kpr_btn_m.php:508-715` | Toolbar "Import" | Menu grant `pinjaman/kpr_btn_c` | Global | W: tp, tpd · R: ma, mjp, tpd | Confirmed | `kpr_btn_v.php:163,262-275` |
| KOS-IMP-018 | Payroll | Matrix Potongan | — | Payroll batch detail | Import full deduction matrix (41 columns) into a batch | XLSX (TPL-013) | `POST /payroll/matrix_c/ajax_upload_excel_matrix/{doc_no}` | `payroll/controllers/matrix_c.php:933` → `payroll/models/matrix_m.php:610-981` | Detail toolbar "Import Matrix" (hidden in UI for APPROVED/REJECTED) | Menu grant `payroll/matrix_c` | Global | W: tpm (INSERT/UPDATE) · R: ma, tpb, tpm | Confirmed | `matrix_detail_v.php:243,978-997`; button state `matrix_detail_js.php:202-236` |
| KOS-IMP-019 | Payroll / store | Matrix Potongan | — | Payroll batch detail | Import store bills into `TOKO_*` columns | XLSX (TPL-014) | `POST /payroll/matrix_c/ajax_upload_excel_toko/{doc_no}` | `payroll/controllers/matrix_c.php:925` → `payroll/models/matrix_m.php:305-609` | **Route-only.** Button commented out (`matrix_detail_v.php:246`); modal and template link still rendered | Menu grant `payroll/matrix_c` | Global | W: tpm · R: ma, tpm | Confirmed (endpoint); use in operations Unverified | `matrix_detail_v.php:904-923` |
| KOS-IMP-020 | SHU | SHU | — | SHU document detail | Import SHU base values per member | XLSX (TPL-015) | `POST /shu/shu_c/ajax_upload_excel_detail` | `shu/controllers/shu_c.php:1053` → `shu/models/shu_m.php:484-741` | Detail toolbar "Import" → modal with header totals | Menu grant `shu/shu_c` | Global | W: tshud (INSERT/UPDATE), ma (UPDATE `bagian`, `lokasi`) · R: ma, tshu, tshud | Confirmed | `add_shu_v.php:242,652-671`; JS `add_shu_js.php:222,286` |
| KOS-IMP-021 | SHU | SHU | — | SHU document detail | Import voluntary-savings interest (`jasa sukarela`) | XLSX (TPL-016) | `POST /shu/shu_c/ajax_upload_excel_detail_sukarela` | `shu/controllers/shu_c.php:1059` → `shu/models/shu_m.php:742-968` | Second modal `#formimport_2` | Menu grant `shu/shu_c` | Global | W: tshud, ma (`bagian`, `lokasi`) · R: ma, tshu, tshud | Confirmed | `add_shu_v.php:734-753`; JS `add_shu_js.php:247,349` |

### A2. Dormant or dead imports (10; listed for traceability, not counted as features)

| Feature ID | Location | Why it is not a working feature | Evidence |
|---|---|---|---|
| KOS-IMP-022 | `simpanan/simpanan_c::ajax_upload_excel` (`:1004`) | Calls `simpanan_m::ajax_upload_excel`, which does not exist (fatal error). No live trigger: the list-page button is commented out. | ANO-K36; `simpanan_v.php:120` |
| KOS-IMP-023 | `simpanan/sim_payroll_c::ajax_upload_excel` (`:973`) | Same missing model method (fatal). No trigger. | ANO-K36 |
| KOS-IMP-024 | `simpanan/simpanan_new_c::ajax_upload_excel`, `::ajax_upload_excel_detail` (`:616`, `:623`) | No menu row, so the access check always fails. `simpanan_new_m` (a `ref_material` and QR importer copied from another product) is never loaded. | `ref_menu`; view_map |
| KOS-IMP-025 | `simpanan/models/kas_anggota_m.php:198-401` | Model method only; `kas_anggota_c` has no upload route. | grep of controller |
| KOS-IMP-026 | `pinjaman/models/pinjaman_m.php:974-1125` (goods kasbon lines) | No controller route. The view `pinjaman_add_barang_v` and its JS are not loaded by any controller. | view_map: NONE |
| KOS-IMP-027 | SHU list "Import" (`shu_v.php:119`) | Posts to `shu_c/ajax_upload_excel`, which does not exist (404). Template link is the loan template. | `shu_js.php:530,547` |
| KOS-IMP-028 | Roll Over "Import" (`over_kredit_v.php:61`) | `import_excel()` is not defined in `over_kredit_js.php`, so the click does nothing. | grep count 0 |
| KOS-IMP-029 | Kartu Aktif and Pelunasan import JS | JS posts to `ajax_upload_excel`, which neither controller defines. No live button on Kartu Aktif; the Pelunasan button is commented out. | `kartu_aktif_js.php:579-604`; `pelunasan_pinjaman_v.php:137` |
| KOS-IMP-030 | `admin/pengguna_mobile_c` upload | Controller not in the menu. The view's `upload()` is undefined. | `pengguna_mobile_v.php:57` |
| KOS-IMP-031 | `master/barang_c` import | Controller not in the menu (leftover from a store product). | `barang_v.php:51` |

## B. Export features

Two mechanisms exist:

- **Client-side.** DataTables 1.10.12 with Buttons 1.2.1, JSZip 2.5.0 and the HTML5 export plug-in (`assets/global/plugins/datatables/datatables.min.js`). `extend: 'excel'` produces a real `.xlsx`; `extend: 'csv'` produces a `.csv`. Both export only the rows currently loaded in the browser.
- **Server-side.** PhpSpreadsheet `Xlsx` writer.

Copy, PDF and Print buttons are out of scope.

### B1. Active client-side exports (33)

Every row:
- uses server-side DataTables (`serverSide: true`) fed by the page's `ajax_list`;
- needs only the page's menu grant;
- has Global branch scope;
- shows the buttons in the table toolbar (`dom` contains `B`).

"All" means the length menu offers `-1` and the model honours it: every list model inspected has `if ($_POST['length'] != -1) limit(...)`.

| Feature ID | Module | Menu › Submenu | Page | Format | Data endpoint | Exported column indexes | Length menu (All?) | DB source (via model) | Status | Evidence (JS file:line) |
|---|---|---|---|---|---|---|---|---|---|---|
| KOS-EXP-004 | Lending | Pinjaman › Pinjaman Reguler | list | XLSX + CSV | `pinjaman_reguler_c/ajax_list` | xlsx 1–19, csv 1–16 | All | tp, tpd | Confirmed | `pinjaman/views/js/pinjaman_reguler_js.php:288` |
| KOS-EXP-005 | Lending | Pinjaman › Pinjaman Bank | list | XLSX + CSV | `pinjaman_bank_c/ajax_list` | 1–18 | All | tp, tpd | Confirmed | `pinjaman_bank_js.php:309` |
| KOS-EXP-006 | Lending | Pinjaman › Kasbon | list | XLSX + CSV | `kasbon_c/ajax_list` | 1–16 | All | tp, tpd | Confirmed | `kasbon_js.php:389` |
| KOS-EXP-007 | Lending | Pinjaman › Pembiayaan | list | XLSX | `pembiayaan_c/ajax_list` | 1–15 | All | tp, tpd | Confirmed | `pembiayaan_js.php:308` |
| KOS-EXP-008 | Lending | Pinjaman › Gaji Minus | list | XLSX + CSV | `gaji_minus_c/ajax_list` | 1–10 | All | tp, tpd | Confirmed | `gaji_minus_js.php:297` |
| KOS-EXP-009 | Lending | Pinjaman › KPR BTN | list | XLSX + CSV | `kpr_btn_c/ajax_list` | 1–13 | All | tp, tpd | Confirmed | `kpr_btn_js.php:303` |
| KOS-EXP-010 | Lending | Pinjaman › Daftar Pinjaman | list | XLSX | `pinjaman_c/ajax_list` | 1–15 | All | tp | Confirmed | `pinjaman_js.php:472` |
| KOS-EXP-011 | Lending | Pinjaman › Pelunasan Pinjaman | list | XLSX | `pelunasan_pinjaman_c/ajax_list` | 1–13 | All | tp (settlement) | Confirmed | `pelunasan_pinjaman_js.php:421` |
| KOS-EXP-012 | Lending | Pinjaman › Kartu Aktif | list | XLSX + CSV | `kartu_aktif_c/ajax_list` | 0–10 | max 1,000 | tp, tpd | Confirmed | `kartu_aktif_js.php:87` |
| KOS-EXP-013 | Savings | Simpanan › Data Simpanan; Simpanan › Payroll & Saldo Awal | document detail (shared JS) | XLSX | `simpanan_c/ajax_list_detail/{doc}`, `sim_payroll_c/ajax_list_detail/{doc}` | 1–6 | All | tsd | Confirmed | `simpanan/views/js/simpanan_detail_js.php:201` |
| KOS-EXP-014 | Savings | Simpanan › Penarikan | list | XLSX + CSV | `penarikan_simpanan_c/ajax_list` | 1–11 | All | ts | Confirmed | `penarikan_simpanan_js.php:205` |
| KOS-EXP-015 | Savings | Simpanan › Penarikan | document detail | XLSX | `penarikan_simpanan_c/ajax_list_detail/{doc}` | 1–8 | All | tsd | Confirmed | `penarikan_simpanan_detail_js.php:202` |
| KOS-EXP-016 | Savings | Simpanan › Setor TF/Tunai | list | XLSX + CSV | `sim_setor_c/ajax_list` | 1–10 | All | ts, tsd | Confirmed | `sim_setor_js.php:336` |
| KOS-EXP-017 | Member exit | Simpanan › Hak & Kewajiban | list | XLSX + CSV | `hak_kewajiban_c/ajax_list` | 1–10 | All | thk | Confirmed | `hak_kewajiban_js.php:344` |
| KOS-EXP-018 | Payroll master | Simpanan › Master Potongan Payroll | list | XLSX | `master_payroll_c/ajax_list` | 0–7 | All | msa | Confirmed | `master_payroll_js.php:133` |
| KOS-EXP-019 | Payroll | Matrix Potongan | batch detail | XLSX | `matrix_c/ajax_list_detail/{doc}` | 1–50 | All | tpm | Confirmed | `payroll/views/js/matrix_detail_js.php:674` |
| KOS-EXP-020 | SHU | SHU | list | XLSX | `shu_c/ajax_list` | 1–6 | All | tshu | Confirmed | `shu/views/js/shu_js.php:422` |
| KOS-EXP-021 | SHU | SHU | document detail | XLSX | `shu_c/ajax_list_detail/{doc}` | 1–32 | All | tshud | Confirmed | `add_shu_js.php:91` |
| KOS-EXP-022 | Membership | Master Data › Anggota | list | XLSX | `master/anggota_c/ajax_list` | 0–15 (NIK, name, phone, email, credit fields) | All | ma | Confirmed | `master/views/js/anggota_js.php:688`; headers `master/views/anggota_v.php:148-163` |
| KOS-EXP-023 | Membership | Anggota › Daftar Anggota | list | XLSX | `anggota/anggota_c/ajax_list` | 0–19 | All | ma | Confirmed | `anggota/views/js/anggota_js.php:688` |
| KOS-EXP-024 | Membership | Anggota › Transaksi Pinjaman | list | XLSX + CSV | `trans_pinjaman_c/ajax_list` | 0–10 | max 1,000 | tp | Confirmed | `anggota/views/js/trans_pinjaman_js.php:48` |
| KOS-EXP-025 | Membership | Anggota › Transaksi Toko | list | XLSX + CSV | `trans_toko_c/ajax_list` | 0–9 | max 1,000 | store sales (`db_sales`, shared DB) | Partial | `trans_toko_js.php:51` |
| KOS-EXP-026 | Mobile | Data Mobile › Users Mobile | list | XLSX | `mobile/users_c/ajax_list` | 0–11 | All | u | Partial | `mobile/views/js/users_js.php:48` |
| KOS-EXP-027 | Reports | Laporan › OutStanding › Pinjaman Reguler | report | XLSX | `laporan/outstanding/lap_reguler_c/ajax_list` | 0–16 | All | tp + `get_outstanding_pinjaman()` per row | Confirmed | `laporan/views/outstanding/js/lap_reguler_js.php:296` |
| KOS-EXP-028 | Reports | Laporan › OutStanding › Pinjaman Bank | report | XLSX | `laporan/outstanding/lap_bank_c/ajax_list` | 0–15 | All | tp + per-row helper | Confirmed | `outstanding/js/lap_bank_js.php:274` |
| KOS-EXP-029 | Reports | Laporan › OutStanding › Kasbon | report | XLSX | `laporan/outstanding/lap_kasbon_c/ajax_list` | 0–15 | All | tp + per-row helper | Confirmed | `outstanding/js/lap_kasbon_js.php:267` |
| KOS-EXP-030 | Reports | Laporan › OutStanding › Pembiayaan | report | XLSX | `laporan/outstanding/lap_pembiayaan_c/ajax_list` | 0–15 | All | tp + per-row helper | Confirmed | `outstanding/js/lap_pembiayaan_js.php:267` |
| KOS-EXP-031 | Reports | Laporan › Pencairan › Pinjaman Reguler | report | XLSX | `laporan/kas/kas_pinjaman_reguler_c/ajax_list` | 0–20+ | All | tp, tpd | Confirmed | `laporan/views/kas/js/kas_pinjaman_reguler_js.php:261` |
| KOS-EXP-032 | Reports | Laporan › Resume Simpanan | report | XLSX | `laporan/lap_kas_simpanan_c/ajax_list` | 0–20+ | All | savings views (`v_kartu_simpanan`, definition unknown) | Partial | `laporan/views/js/lap_kas_simpanan_js.php:309` |
| KOS-EXP-033 | PPOB | PPOB › Daftar Penjualan | list | XLSX | `ppob_penjualan_c/ajax_list` | 0–15 | All | PPOB sales | Partial | `ppob/views/js/penjualan_js.php:282` |
| KOS-EXP-034 | PPOB | PPOB › Lap. Penjualan | report | XLSX | `laporan_penjualan_c/ajax_list` | 0–3 | All | PPOB sales | Partial | `laporan_penjualan_js.php:258` |
| KOS-EXP-035 | PPOB | PPOB › Lap. Tagihan | list | XLSX | `tagihan_c/ajax_list` | 0–3 | All | PPOB bills | Partial | `ppob/views/js/tagihan_js.php:311` |
| KOS-EXP-036 | PPOB | PPOB › Lap. Tagihan | bill detail | XLSX | `tagihan_c/ajax_list_detail` | 1–6 | All | PPOB bill lines | Partial | `tagihan_dtl_js.php:157` |

### B2. Server-side exports and dormant client-side exports (not counted as working features)

| Feature ID | Location | State | Evidence |
|---|---|---|---|
| KOS-EXP-001 | `laporan/controllers/lap_kas_simpanan_c.php:607` `export($js,$tahu,$bulan)`: PhpSpreadsheet XLSX "DATA SIMPANAN …" | **Dormant / broken.** The button is commented out (`lap_kas_simpanan_v.php:137`). The JS opens a GET, but the method only acts on POST. Only January columns are filled. Variables carry over between members. The `Content-Disposition` quoting is malformed. SQL is built by string interpolation. | `lap_kas_simpanan_js.php:154-188`; controller `:760-830` |
| KOS-EXP-002 | `pinjaman/controllers/kasbon_c.php:1179` `export()`: PhpSpreadsheet XLSX (9 columns) using `kasbon_m::get_all` filters | **Dormant / broken.** The button is commented out (`kasbon_v.php:173`). The JS expects JSON (`dataType:'JSON'`) for a binary body, so it always shows "data tidak ditemukan". Amounts are written as `number_format(..,2)` text. | `kasbon_js.php:943-990`; `kasbon_m.php:724-787` |
| KOS-EXP-003 | 10 empty `export_excel()` stubs: `laporan/lap_bank_c:177`, `lap_kasbon_c:177`, `lap_pembiayaan_c:176`, `lap_reguler_c:178`, `outstanding_pinjaman_c:178`, `outstanding_simpanan_c:182`, `outstanding/lap_bank_c:180`, `outstanding/lap_kasbon_c:177`, `outstanding/lap_pembiayaan_c:176`, `outstanding/lap_reguler_c:218` | **Not a feature.** Empty method bodies; all buttons commented out; the JS `export_excel()` is an empty stub too. | btn_scan |
| KOS-EXP-037 | Client-side Excel on `laporan/lap_bank_c`, `lap_kasbon_c`, `lap_pembiayaan_c`, `lap_reguler_c`, `lap_kas_pinjaman_c`, `lap_transaksi_kas_c`, `outstanding_pinjaman_c`, `outstanding_simpanan_c` | **Dormant.** No menu row, so the access check fails. `lap_reguler_c` also carries per-row values over to the next row when no schedule detail exists (`:104-132`). | `ref_menu` |
| KOS-EXP-038 | `admin/adm_log_c` (access log), Excel + CSV | **Dormant.** No menu row. | `admin/views/js/adm_log_js.php:64` |
| KOS-EXP-039 | `simpanan/views/js/simpanan_new_js.php:157`, `simpanan_detail_new_js.php:197` | **Dormant.** Not loaded by any controller. | view_map: NONE |

## C. Import templates

| Template ID | File (`legacy/kosipa/cdn/format_excel/`) | Served by | Used by | Header (row 1, in reading order) | Issues |
|---|---|---|---|---|---|
| KOS-TPL-001 | `format_anggota.xlsx` | `master/anggota_c::download_format_excel` (`:967`) | IMP-001, 002 | NIK, ID_CARD, NAMA, GENDER, GROUP_ANGGOTA, STATUS, SIM_POKOK, SIM_WAJIB, LIMIT_TOKO. Legend: GROUP = ANGGOTA, NON ANGGOTA, KOPERASI, BMP; STATUS = AKTIVE, RESIGN, PENSIUN | **About 427 pre-filled rows that look like real members** (IE-ANO-016) |
| KOS-TPL-002 | `format_anggota_limit.xlsx` | `master/anggota_c::download_format_limit_excel` (`:976`) | IMP-003, 004 | NIK, LIMIT_TOKO, GAJI_MINUS | The code reads a fourth column, LIMIT_PPOB (IE-ANO-005). Pre-filled NIK rows. |
| KOS-TPL-003 | `format_data_simpanan.xlsx` | `simpanan_c::download_format_excel` (`:992`), `sim_payroll_c` (`:961`), `simpanan_new_c` (`:604`) | IMP-005, 006, 007; also linked from IMP-008 | NIK (nik 5 digit), NOMINAL | — |
| KOS-TPL-004 | `format_data_penarikan_simpanan.xlsx` | **never served.** `penarikan_simpanan_c::download_format_excel` (`:783`) serves TPL-003 under this name | IMP-008 | tgl, NIK, NOMINAL (legend: `=TEXT(A2,"DD-MM-YYYY")`) | IE-ANO-015 |
| KOS-TPL-005 | `format_hak_kewajiban.xlsx` | `hak_kewajiban_c::download_format_excel` (`:182`) | IMP-009 | nik, tgl_masuk, tgl_keluar, sim_pokok, sim_wajib, sim_sukarela, kasbon, jasa_kasbo, pembiayaan, jasa_pembiayaan, reguler, jasa_regular, bank, jasa_bank, toko, ppob, surat_pernyataan (Ya/Tidak) | Dates as `dd-mm-yyyy` text go into `DATE` columns (IE-ANO-011) |
| KOS-TPL-006 | `format_data_potongan_simpanan.xlsx` | direct static link (`master_payroll_js.php:402`) | IMP-010 | NIK, NOMINAL | — |
| KOS-TPL-007 | `format_pinjaman.xlsx` | direct link (`pinjaman_js.php:626`); also wrongly linked from Pelunasan and SHU list | IMP-011 | TGL CAIR, TGL POTONGAN KE-1, NIK, JUMLAH PINJAMAN, JANGKA WAKTU, SUKU BUNGA, BUNGA (%), BIAYA ADMIN (%), BIAYA ASURANSI (%), JENIS PINJAMAN, PEMBIAYA/JENIS | Legend values `KOPERASI`, `DANKOP (SKEMA BANK)` are not `m_jenis_pinjaman` codes, so such rows are silently skipped |
| KOS-TPL-008 | `format_pinjaman_reguler.xlsx` | direct link | IMP-012 | … BIAYA ASURANSI (%), JENIS PINJAMAN (PINJAMAN REGULAR / PINJAMAN REGULAR (ANUITAS)), BLOKIR 1X (YES/NO) | — |
| KOS-TPL-009 | `format_pinjaman_bank.xlsx` | direct link (Pinjaman Bank, KPR BTN, Kartu Aktif) | IMP-013, 017 | … BANK, Executing/Chanelling | The column "Executing/Chanelling" is never read |
| KOS-TPL-010 | `format_kasbon.xlsx` | direct link | IMP-014 | … JENIS KASBON (KASBON 1X POT, KASBON LEBIH DARI 1X POT, KASBON BAYAR CASH, KASBON SEPECIAL & PAT, POTONGAN PINJAMAN) | — |
| KOS-TPL-011 | `format_pembiayaan.xlsx` | direct link (also wrongly from PPOB Lap. Tagihan) | IMP-015 | … JENIS PEMBIAYAAN (ELEKTRONIK, SURAT-SURAT, SERVICE KENDARAAN, SIM, SEPEDA, BARANG KONSINYASI), KETERANGAN | — |
| KOS-TPL-012 | `format_gaji_minus.xlsx` | direct link | IMP-016 | TGL CAIR, TGL POTONGAN KE-1, NIK, JUMLAH PINJAMAN, JANGKA WAKTU, SUKU BUNGA, BUNGA (%) | — |
| KOS-TPL-013 | `format_excel_matrix.xlsx` | `matrix_c::download_format_excel_matrix` (`:916`) | IMP-018 | 41 columns: NIK, KASBON 1X POT … TOKO TB, TOKO MJ, TOKO GIIC, PPOB | Order matches the code |
| KOS-TPL-014 | `format_matrix_toko.xlsx` | `matrix_c::download_format_excel_toko` (`:908`) | IMP-019 | NIK, NAMA TOKO (TOKO_TAMBUN / TOKO_MJ / TOKO_GIIC), TAGIHAN | — |
| KOS-TPL-015 | `format_shu.xlsx` | `shu_c::download_format_excel` (`:1034`) | IMP-020 | NIK, SIMPANAN, TRANSASI USAHA, SUKARELA, BAGIAN, PLANT | — |
| KOS-TPL-016 | `format_shu_sukarela.xlsx` | `shu_c::download_format_excel_sukarela` (`:1043`), downloaded as `format_shu.xlsx` | IMP-021 | NIK, JASA SIM SUKARELA | The code also reads columns E and F (IE-ANO-006) |

Files not referenced by live code:
- `format_data_harga_material.xlsx` and `format_data_material.xlsx` (referenced only in comments);
- `format_data_pinjaman_kasbon.xlsx`;
- `format_data_pinjaman_potongan.xlsx` (contains about 27 pre-filled rows that look like real loans);
- `format_slip.xls`, `format_toko.xls`, `format_tagihan_toko.xls` (BIFF8; no code reads `.xls`).

## D. Server-side PDF document exports (FPDF 1.7)

Legacy KOSIPA includes 17 FPDF view templates (`application/libraries/Pdf.php`, FPDF 1.7) that stream `application/pdf` inline (`$pdf->Output("...", "I")`) via `window.open(...)` GET actions on operational lists and detail screens. In addition, 11 client-side DataTables configurations include `extend: 'pdf'` (`pdfHtml5` via `pdfmake 0.1.18`) alongside Excel/CSV (`KOS-EXP-004, 005, 006, 008, 009, 012, 014, 016, 017, 024, 025`).

| Feature ID | Module | Menu / Page | Document Title | Controller Action(s) | FPDF View Template | DB Tables Read | Status |
|---|---|---|---|---|---|---|---|
| KOS-PDF-001 | Lending | Pinjaman Reguler / Bank / KPR / Daftar | Formulir Permohonan Pinjaman + Jadwal Angsuran | `pinjaman_reguler_c::print_form_pdf`, `pinjaman_bank_c::print_form_pdf`, `kpr_btn_c::print_form_pdf`, `pinjaman_c::print_doc_pdf` | `pinjaman/views/prn_pinjaman_doc.php` | `tp`, `tpd`, `ma`, `mjp` | Active (14 controllers/routes) |
| KOS-PDF-002 | Lending | Pinjaman Reguler / Bank / Kasbon / Pembiayaan / Daftar | Kartu Pinjaman & Jadwal Angsuran | `pinjaman_reguler_c::print_pdf`, `pinjaman_bank_c::print_pdf`, `kasbon_c::print_pdf`, `pembiayaan_c::print_pdf`, `pinjaman_c::print_pdf` | `pinjaman/views/prn_pinjaman.php` | `tp`, `tpd`, `ma` | Active |
| KOS-PDF-003 | Lending | Kasbon / Gaji Minus / Daftar Pinjaman | Formulir Pengajuan Kasbon | `kasbon_c::print_doc_kasbon_pdf`, `gaji_minus_c::print_doc_kasbon_pdf`, `pinjaman_c::print_doc_kasbon_pdf` | `pinjaman/views/prn_pinjaman_kasbon.php` | `tp`, `tpd`, `ma` | Active |
| KOS-PDF-004 | Lending | Pembiayaan | Formulir Permohonan Pembiayaan Barang/Jasa | `pembiayaan_c::print_doc_pembiayaan_pdf` | `pinjaman/views/prn_doc_pembiayaan.php` | `tp`, `tpd`, `ma` | Active |
| KOS-PDF-005 | Lending | Pelunasan Pinjaman | Bukti Pelunasan Pinjaman Dipercepat | `pelunasan_pinjaman_c::print_pdf` | `pinjaman/views/prn_peluasan_pinjaman.php` | `tp`, `ma` | Active |
| KOS-PDF-006 | Lending | Kasbon / Pembiayaan | Kartu Kasbon / Pembiayaan (dormant template) | Unreferenced in controllers | `pinjaman/views/prn_katur_kasbon_pembiayaan.php` | `tp`, `tpd` | Dormant |
| KOS-PDF-007 | Lending | Pinjaman Khusus | Formulir Pinjaman Khusus (dormant template) | Unreferenced in controllers | `pinjaman/views/prn_pinjaman_khusus.php` | `tp` | Dormant |
| KOS-PDF-008 | Lending | Dana Pendidikan | Formulir Dana Pendidikan (dormant template) | Unreferenced in controllers | `pinjaman/views/prn_dana_pendidikan.php` | `tp` | Dormant |
| KOS-PDF-009 | Savings | Data Simpanan / Simpanan Payroll | Formulir Pengajuan Perubahan Simpanan | `simpanan_c::print_pengajuan_pdf`, `sim_payroll_c::print_pengajuan_pdf` | `simpanan/views/print_pengajuan_simpanan_pdf.php` | `ts`, `tsd`, `ma`, `msa` | Active |
| KOS-PDF-010 | Savings | Penarikan Simpanan / Penarikan Mobile | Formulir Pengajuan Penarikan Simpanan | `penarikan_simpanan_c::print_doc`, `penarikan_mobile_c::print_doc` | `simpanan/views/prn_pengajuan_simpanan.php` | `ts`, `tsd`, `ma` | Active |
| KOS-PDF-011 | Savings | Penarikan Simpanan | Bukti Penarikan Simpanan (dormant view) | Unreferenced in controllers (`penarikan_simpanan_c` loads `prn_pengajuan_simpanan`) | `simpanan/views/prn_penarikan_simpanan.php` | `ts`, `tsd` | Dormant |
| KOS-PDF-012 | Savings | Data Simpanan / Simpanan Payroll | Bukti Dokumen Simpanan (Batch Lines) | `simpanan_c::print_doc`, `sim_payroll_c::print_doc` | `simpanan/views/prn_simpanan.php` | `ts`, `tsd`, `ma` | Active |
| KOS-PDF-013 | Savings | Data Simpanan / Simpanan Payroll | Nota Kwitansi Setoran Simpanan | `simpanan_c::print_nota`, `sim_payroll_c::print_nota`, `simpanan_new_c::print_nota` | `simpanan/views/print_nota.php` | `ts`, `tsd`, `ma` | Active |
| KOS-PDF-014 | Savings | Kas Anggota | Kartu Simpanan Anggota (Passbook) | `kas_anggota_c::print_kartu` | `simpanan/views/print_kartu.php` | `ts`, `tsd`, `ma` | Active |
| KOS-PDF-015 | Membership | Anggota | Kartu Simpanan Anggota (duplicate view) | Unreferenced in `anggota_c` | `anggota/views/print_kartu.php` | `ts`, `tsd`, `ma` | Dormant |
| KOS-PDF-016 | Member exit | Hak & Kewajiban | Perhitungan Hak & Kewajiban Anggota Keluar | `hak_kewajiban_c::print_doc` | `simpanan/views/prn_hak_kewajiban.php` | `thk`, `ma` | Active |
| KOS-PDF-017 | Payroll | Matrix Potongan | Slip Rincian Potongan Koperasi (Per Anggota) | `matrix_c::print_slip` | `payroll/views/prnt_slip.php` | `tpm`, `tp`, `ma` | Active |

## Totals (no double counting)

| Category | Count |
|---|---|
| Active import features | 21 (20 with UI, 1 route-only) |
| Dormant or dead import entries | 10 |
| Active export features (client-side Excel/CSV/PDF) | 33 (11 offer CSV and client-side PDF as well as XLSX) |
| Server-side Excel exports | 2, both dormant/broken, plus 10 empty stubs |
| Server-side PDF document templates (FPDF) | 17 (12 active across 24 controller actions, 5 dormant) |
| Dormant client-side export groups | 3 |
| Templates served | 16 (one is never actually served), plus 7 unreferenced files |
