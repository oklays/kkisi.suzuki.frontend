# 10 — Audit Evidence and Coverage

## 1. Sources

| Source | What was used | Access |
|---|---|---|
| Legacy source | `legacy/kosipa/` (local copy, git-excluded). CodeIgniter 2.1.4 (`system/core/CodeIgniter.php:36`), HMVC, 95 module controllers + 9 root controllers, 3,480 PHP files. Byte-equality with production is **unverified** (G-02). | Read-only |
| Legacy assets | `assets/global/plugins/datatables/datatables.min.js` (bundle header and Buttons code); `cdn/format_excel/` (25 files: header rows and row **counts** only); `cdn/excel/` (file **names and counts** only, contents not opened) | Read-only |
| Menu and grants | `ref_menu` in `kkisi_refresh_20261030` (30 Oct 2026 copy) and `kkisi_staging` (for comparison) | `SET SESSION TRANSACTION READ ONLY` |
| Data footprint | Aggregate counts on the 30 Oct copy (§4.3) | Read-only, count-only |
| New application | `apps/web/src/app/{console,api}/kosipa/**`, `apps/web/src/components/console/kosipa/*`, `apps/web/src/infrastructure/console/{export-config,report-handlers}.ts`, `packages/application/src/kosipa/{report-export,commands/*}.ts`, `packages/domain/src/kosipa/csv.ts` (working tree, HEAD `0b69cfab`) | Read-only |
| Earlier audits | `docs/superpowers/specs/kosipa-full-access/{02,02A,03,04,06}_*.md`, `unified-console-kosipa-warehouse/{decision-register,export-security-assessment}.md` | Read; IDs cross-referenced |

## 2. Discovery method

1. **Keyword sweep** over `application/{modules,controllers,libraries,helpers,core}` for:
   - `PHPExcel`, `PhpSpreadsheet`, `IOFactory`, `Spout`/`ReaderEntityFactory`, `Csvreader`, `fgetcsv`, `fputcsv`;
   - `vnd.ms-excel`, `openxmlformats`, `text/csv`, `Content-Disposition`;
   - `force_download`, `upload_path`, `multipart`.
   
   53 files matched (most are models that only `use` Spout).
2. **Method-name sweep** for `import|export|upload|excel|xls|csv|download|format|template|unduh`.
3. **UI sweep.** `btn_scan.py` lists live, non-commented triggers in every view. `dt_scan.py` lists every DataTable with Excel/CSV buttons, stripping JS comments. `form_fields.py` lists import form fields.
4. **Wiring.** `view_map.py` maps JS view → controller method. `ref_menu` decides reachability.
5. **Handler analysis.** `upload_scan.py` summarises each upload function: transactions, extension, size and row caps, column map, write targets, messages. `nest_scan.py` checks loop nesting. Manual reading of every active handler.
6. **Export analysis.** `fmt_scan.py` gives money format signatures per `ajax_list`. Column indexes and `columnDefs` were read manually for a sample.
7. **New-app mapping** by route listing and grep. There is no file input in `apps/web/src`.

All scanners are in [fixtures/probes/](fixtures/probes/).

## 3. Evidence index

### 3.1 Access control

- `models/user_m.php:379-401` `cekstatushakakses`: a per-controller URL check against `ref_menu`, `ref_menu_akses` and `ref_group_akses`.
- Every import and export controller calls it once in its constructor. Verified for all 36 controllers listed in §3.4.
- `config/config.php:337` `csrf_protection = true`; `:169` `permitted_uri_chars = 'a-z 0-9~%.:_\-='`.

### 3.2 Import handlers

See the inventory, section A1, for file:line of every route, model, view and JS. The line ranges of the model functions come from `upload_scan.py`.

### 3.3 Date-range filter defect (IE-ANO-031)

These 18 models compare year, month and day separately:
- `laporan/models/kas/lap_kas_pinjaman_m.php`, `laporan/models/kas/lap_kas_regular_m.php`, `laporan/models/lap_kas_pinjaman_m.php`, `laporan/models/lap_transaksi_kas_m.php`;
- `mobile/models/pengajuan_mobile_m.php`, `mobile/models/pinjaman_mobile_m.php`;
- `pinjaman/models/{gaji_minus,kasbon,kpr_btn,pelunasan_pinjaman,pembiayaan,pinjaman_bank,pinjaman,pinjaman_reguler}_m.php`;
- `ppob/models/ppob_penjualan_m.php`, `shu/models/shu_m.php`, `simpanan/models/hak_kewajiban_m.php`, `simpanan/models/sim_setor_m.php`.

### 3.4 Controllers deep-read for import/export

- `master/anggota_c`, `anggota/anggota_c`;
- `simpanan/{simpanan,sim_payroll,sim_setor,penarikan_simpanan,hak_kewajiban,master_payroll,simpanan_new,kas_anggota}_c`;
- `pinjaman/{pinjaman,pinjaman_reguler,pinjaman_bank,kasbon,pembiayaan,gaji_minus,kpr_btn,kartu_aktif,pelunasan_pinjaman,over_kredit}_c`;
- `payroll/matrix_c`, `shu/shu_c`;
- `laporan/{lap_bank,lap_kasbon,lap_pembiayaan,lap_reguler,lap_kas_simpanan,lap_kas_pinjaman,lap_transaksi_kas,outstanding_pinjaman,outstanding_simpanan}_c`, `laporan/outstanding/{lap_reguler,lap_bank,lap_kasbon,lap_pembiayaan}_c`, `laporan/kas/kas_pinjaman_reguler_c`;
- `ppob/{tagihan,ppob_penjualan,laporan_penjualan}_c`;
- `anggota/{trans_pinjaman,trans_toko}_c`, `mobile/users_c`, `admin/{adm_log,pengguna_mobile}_c`, `master/barang_c`.

The remaining controllers (masters, auth, dashboard, mobile requests, PPOB product/purchase, settings) matched no import/export pattern beyond the sweep.

## 4. Safe runtime tests

### 4.1 Synthetic parser probes (legacy library, no DB)

| Test | Setup | Result | Supports |
|---|---|---|---|
| Cell types and date parsing | `fixtures/samples/edge_cells.xlsx` read by the legacy Spout (`third_party/spout`, mounted read-only) in `php:7.4-cli-alpine` with `ext-zip` | Text date → 2022-12-05. Date cell → `DateTime` → legacy `strtotime($cell)` throws. Blank → 1970-01-01. Numeric NIK → int 9901. A formula with no cached value → `''`. | IE-ANO-011, 008, 020 |
| PHP expressions copied from handlers | same container | `strtotime('12/05/2022')` → 5 Dec (US). `strtotime('44900')` → false. `cetak` without DB → `O&#039;NEIL &amp; SONS`. `('0' > '0' \|\| '0' != '')` → true. `'1.500.000' > '200000'` → false. | IE-ANO-005, 003, 021 |
| Multi-sheet loop | `edge_three_sheets.xlsx` with the legacy loop shape (counter instead of INSERT) | 2 rows → 6 simulated inserts | IE-ANO-001 |
| Excel cell typing | Node evaluation of the regex copied from the bundled Buttons 1.2.1 | `1.250.000,00` → text; `500.00` → number; `09901` → text; `9901` → number | IE-ANO-028 |

The container fetched only Alpine packages (`libzip-dev`) to build `ext-zip`. The existing harness images (`kkisi-kfa-php56-ci2`, `kkisi-pss-php56/81-characterization`) do not have `ZipArchive`.

### 4.2 What was **not** executed

- No legacy upload handler was executed against any database.
- No legacy page was opened in a browser.
- No production system was contacted.

**Consequences:**
- the DB effects in [05](DATABASE_IMPACT_MATRIX.md) are static traces;
- the export file names and titles, the default page length, and the `ajax_total` vs export totals are UNVERIFIED at runtime.

### 4.3 Read-only data queries (30 Oct 2026 copy, counts only)

| Purpose | Result |
|---|---|
| Menu snapshot | 74 rows, all `status=1`. No dormant controller listed in the inventory has a row. |
| Duplicate `(doc_no, nik_kar)` in `trans_simpanan_dtl` | 198 groups / 419 rows (of 114,916) |
| Member names with HTML entities | 33 |
| Duplicate `(doc_no_dtl, nik_kar)` in `trans_potongan_matrix` | 4 groups / 8 rows |
| Duplicate `(doc_no, nik_kar)` in `trans_shu_dtl` | 1 group / 3 rows |
| Duplicate `(canonical nik, jenis)` in `m_simpanan_aktif` | 1 group / 2 rows (of 5,498) |
| Loans with `doc_no LIKE '%XLS'` by type and status | 9,770, all APPROVED disbursement. Document status: APPROVED, except 43 `POSTING` (2026). |
| Imported loans with an identical (NIK, amount, date, type, term) | 185 groups / 414 rows; multiplicity 2: 152, 3: 25, 4: 6, 5: 1, 6: 1; 94 groups created within 120 s |
| Imported loans with `tgl_pencairan` NULL or before 1990 | 144 |
| `trans_hak_kewajiban` rows with an invalid `tgl_masuk` | 4 of 4 |
| `m_jenis_pinjaman` codes | 31 codes, including a duplicate `PINJAMAN REGULAR`; `KOPERASI` and `DANKOP (SKEMA BANK)` absent |
| Column types of import targets; `@@global.sql_mode` (local) | See [05 §1.1](DATABASE_IMPACT_MATRIX.md#11-keys-and-derived-fields); local `STRICT_TRANS_TABLES` |

No query returned member names, NIKs or amounts per person.

## 5. Roles tested

**None at runtime.** Role behaviour is derived from code: one page grant gives every method. Staging RBAC personas exist for the new console (`staging-rbac-uat-matrix.md`) but were not run. New-app permissions were read from code: `kosipa.report.export` plus the view capability, the env allow-list, and the throttle.

## 6. Templates verified

All 16 served templates and 7 unreferenced files were opened with openpyxl:
- header rows were read;
- data rows were **counted** only;
- legend columns (enumerations) were read.

Two templates and one unreferenced file contain pre-filled rows that look like member records (IE-ANO-016). Their values were neither copied nor printed into these documents. Synthetic equivalents are in [fixtures/](fixtures/README.md).

## 7. Unverified behaviours

| Item | Why unverified | How to close |
|---|---|---|
| Production source equals the local copy | No hash comparison (G-02). 43 `POSTING` imported loans contradict the local code. | Operator: source hash listing (TASK-102) |
| Production PHP version | `.htaccess` selects `lsphp56`, but Spout 3 needs PHP ≥ 7.2 and imports evidently work | Operator: `phpinfo` or cPanel MultiPHP setting |
| Production `sql_mode` | Decides whether bad dates or amounts fail or are coerced | Operator (G-xx in TASK-102) |
| `upload_max_filesize` / `post_max_size` | Host config | Operator |
| `db_debug` behaviour on a DB error mid-import | Config not opened (credential file rule) | Characterisation in the PHP harness |
| DataTables default page length and export file names | Browser runtime | Browser session on legacy staging (read-only page views) |
| Screen totals (`ajax_total`) vs export sums | Needs runtime | Same |
| Resume Simpanan figures | View definitions missing from the dump (B1) | Operator: view DDL |
| PPOB export column formats; Transaksi Toko/Users Mobile columns | Not traced per column | Low priority |
| Whether IMP-019 (store bills) is still used | Operational question | Owner |
| Live web exposure of the upload folder | Not probed (no production testing) | Operator check during IE-BL-007 |

## 8. Coverage

| Area | Coverage |
|---|---|
| Menus and submenus | 74 of 74 `ref_menu` rows inspected; 54 reachable pages and 6 detail pages examined for controls |
| Import routes and handlers | 31 entries found; 21 active handlers fully traced (static); parser behaviour runtime-probed |
| Export routes | 33 active client-side exports traced to their data endpoint and column indexes; money format traced for 24 endpoints; 2 server-side exports and 10 stubs read; 3 dormant groups identified |
| Templates | 16 of 16 served, plus 7 unreferenced |
| New-app mapping | All KOSIPA routes listed; all 5 exports read; import absence confirmed by search |
| Runtime DB effects | 0% executed (static only) |
| Role-based runtime | 0% (code-derived) |

**Claim:** complete for what the local source contains. It is **not** a claim about production, which may differ (see §7).

## 9. Remaining risks

1. **Production drift** could add or change import paths (43 `POSTING` imported loans).
2. Without a run against a characterisation DB, some secondary effects (e.g. `get_no_save()` numbering under concurrency) remain inferred.
3. Exposure items (IE-ANO-016/017/029) stay live in legacy until the owner acts (IE-BL-007).

## 10. Safety compliance

| Rule | Status |
|---|---|
| Production treated as read-only | No production contact at all |
| No imports into production; no record changes; no mutating SQL | Complied. Only `SELECT` under `SET SESSION TRANSACTION READ ONLY` on the local copies. |
| No legacy source changes; no schema changes; no reset or truncate | Complied (legacy mounted read-only in containers) |
| No deploy, commit or push | Complied. New files only under `docs/audits/kosipa-import-export/`, plus one appended section in the gitignored private findings file. |
| No credentials, member personal data or per-person financial records in documents | Complied. Counts only; template contents not reproduced. Credential files not opened. |
| Unknown upload handlers not executed | Complied. Only the parsing library and copied expressions ran, on synthetic files. |
