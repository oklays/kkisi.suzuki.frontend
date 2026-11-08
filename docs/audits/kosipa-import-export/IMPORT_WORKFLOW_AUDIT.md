# 03 — Import Workflow Audit

This document covers the 21 active import features, KOS-IMP-001 to 021 ([inventory](LEGACY_FEATURE_INVENTORY.md#a1-active-imports-21)). Anomaly IDs refer to the [register](LEGACY_ANOMALY_REGISTER.md).

## 1. The common legacy pipeline (all 21)

Every handler is a copy of the same skeleton. Only the column mapping and the write block differ.

```text
Browser                             Controller (*_c.php)              Model (*_m.php ajax_upload_excel*)
───────                             ────────────────────              ─────────────────────────────────
Click "Import" → Bootstrap modal
choose .xlsx (+ hidden context)
submit → $.ajax FormData POST ────► if POST: echo models->…() ─────►  1. ext = last part of the file name
 button "Sedang Proses…" disabled                                     2. if ext == ''  → error "File tidak boleh kosong!"
                                                                      3. if ext != 'xlsx' → status 'success' (!), text error   [IE-ANO-019]
                                                                      4. if size < 9,000,000 B: CodeIgniter upload to cdn/excel/
                                                                         (allowed xls|xlsx, original file name kept)           [IE-ANO-017]
                                                                         upload error → exit() (empty response)               [IE-ANO-019]
                                                                      5. Spout XLSX reader; for EACH sheet:
                                                                           numRow = 2; skip row 1 (header, not checked)       [IE-ANO-020]
                                                                           $arr[] = positional cells                           (never reset)
                                                                           row cap check (varies) on numRow
                                                                           foreach $arr → lookups + writes (autocommit)       [IE-ANO-001/002]
                                                                      6. reader close; unlink file (success path only)
◄──── JSON {status, mess} ◄──────────────────────────────────────────  7. "Total Data N berhasil di upload .!"                [IE-ANO-018]
success → toast + reload table; error → toast. No preview, no row report, no retry helper.
```

Observed facts that apply to every import:

- **Supported format.** Only `.xlsx`; the check compares the file name extension, case-sensitive. An `.xls` file passes the upload-library filter but fails in the XLSX reader (uncaught), so the uploaded file is left behind.
- **Sheets.** All sheets are read, and rows are processed again for each sheet (IE-ANO-001, runtime-reproduced).
- **Header.** Row 1 is skipped without checking its names. The matrix import (`numRow = 0`, condition `> 0`) also skips row 1 only.
- **Blank rows.** Spout 3 skips empty rows by default (library default, not runtime-tested here). A row with blank required cells is processed and then either skipped silently or written with blank values, depending on the handler (see §3).
- **Cell types.** Spout returns:
  - text cells as strings;
  - numeric cells as int or float (a leading zero is lost: `09901` typed as a number becomes 9901);
  - date-formatted cells as `DateTime`, which makes every date-parsing handler throw (IE-ANO-011);
  - formulas as their cached value.
- **Money.** Cells are stored as given. There is no parsing of `1.500.000` or `Rp`. In the payroll and savings handlers, `cetak()` (`helpers/view_helper.php:156`) adds `htmlentities` and escaping. A formatted string such as `1.500.000` reaches a `DECIMAL` column: under STRICT mode the INSERT fails; otherwise it is stored as `1.5`. The production `sql_mode` is unverified; the local copy runs STRICT_TRANS_TABLES.
- **Size and row limits.** The size check is `$_FILES[..]['size'] < 9,000,000` bytes (message says 2 MB). CodeIgniter `max_size = 9,000,000` (KB). The PHP `upload_max_filesize` on the host is unknown. Row caps (on `numRow`, header included): 1,000 for most; 1,001 for the matrix; 1,500 for the store import; 5,000 for the `anggota/` member import; **none** for the limit, savings-line, payroll-master and SHU imports.
- **Encoding and delimiter.** Not applicable: XLSX only. No CSV import exists anywhere in KOSIPA.
- **Authorisation.** The page grant only (ANO-K02). CSRF token present (`csrf_protection = true`). No branch scope.
- **SQL construction.** Lookups are string-built `query("…'$x'…")`. Most cell values pass through `cetak()` (escaped), but four handlers interpolate raw cell text (IE-ANO-035).
- **Audit trail.** None. Some rows get `cd`/`cd_usr` (creator name) or `ud`/`usr_ud`. No batch record, no file hash, and no link from the imported rows back to the upload.
- **Retry.** Re-uploading the same file is the only retry. It is safe only for the true upsert handlers (see §2). For insert-only handlers it duplicates rows.

## 2. Operation type per import

| Feature | Operation | Key used | Exact condition |
|---|---|---|---|
| IMP-001, 002 Members | INSERT only (UPDATE branch commented out) | `CONVERT(nik_kar, UNSIGNED)` | Insert when no member has the same numeric NIK; otherwise skip silently |
| IMP-003, 004 Limits | UPDATE only | `CONVERT(nik_kar, UNSIGNED)` | Update the first matching `m_anggota` row; update `users` (wallet) if a mobile user matches |
| IMP-005, 006 Savings lines | UPSERT | `(doc_no, nik_kar as typed)` | INSERT when `COUNT(*)=0`; else UPDATE that `(doc_no, nik_kar)`; `PAYROLL`: also UPSERT `m_simpanan_aktif (nik, jenis)` |
| IMP-007 Deposits | INSERT (new document per row) | none | Always: header `POSTING` + one line per matching member |
| IMP-008 Withdrawals | INSERT (new document per row) | none | Always: header `POSTING`; line per matching member (none if not found) |
| IMP-009 Exit settlement | INSERT (conditional) | `CONVERT(nik_kar, UNSIGNED)` in `trans_hak_kewajiban` | Insert only if the member has **no** H&K row in any status; else skip |
| IMP-010 Deduction master | UPSERT | `(CONVERT(nik), jenis_simpanan)` | INSERT `m_simpanan_aktif` or UPDATE `potongan_payroll`; `SIMPANAN SUKARELA` also updates `m_anggota.sim_sukarela` |
| IMP-011…015, 017 Loans | INSERT + schedule DELETE/INSERT + UPDATE | none | Always a new loan per valid row (member and product found); schedule regenerated; `akhir_pinjaman` updated |
| IMP-016 Gaji Minus | Global UPDATE, then INSERT and conditional UPDATEs | none / NIK | Reset all members, then per valid row: new loan; if amount > `'200000'` set member and wallet values |
| IMP-018 Matrix | UPSERT | `(periode = batch doc_no, CONVERT(nik))` | INSERT or UPDATE all 40 component columns |
| IMP-019 Store bills | UPSERT (one column) | `(periode, CONVERT(nik))`, store column ≠ 0 | INSERT row with one `TOKO_*` column, or UPDATE that column |
| IMP-020, 021 SHU | UPSERT + member UPDATE | `(doc_no, CONVERT(nik))` | INSERT or UPDATE line; always UPDATE `m_anggota.bagian/lokasi` |

No import uses DELETE (except the schedule rebuild), TRUNCATE or REPLACE. IMP-016's unscoped `UPDATE m_anggota SET gaji_minus = 0` is a reset applied to the whole table.

## 3. Validation matrix

Legend: ✔ checked server-side · ✖ not checked · ~ partially or implicitly · n/a not applicable.

| # | Check | 001/002 Member | 003/004 Limit | 005/006 Sav. lines | 007 Deposit | 008 Withdrawal | 009 H&K | 010 Ded. master | 011–017 Loans | 016 Gaji Minus | 018 Matrix | 019 Store | 020/021 SHU |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Required fields | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ~ member and product must exist | ~ | ✖ | ✖ | ✖ |
| 2 | Data types | ✖ | ✖ | ✖ (STRICT may reject) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| 3 | Invalid date | n/a | n/a | n/a | ✖ (form date) | ✖ → 1970 / throw | ✖ → STRICT error / zero-date | n/a | ✖ → 1970 / throw | ✖ | n/a | n/a | n/a |
| 4 | Invalid money | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ (string compare) | ✖ | ✖ | ✖ |
| 5 | Duplicates within file | ~ skip by NIK | last wins | last wins (if key matches) | ✖ duplicates | ✖ duplicates | ~ first wins | last wins | ✖ duplicates | ✖ | last wins | last wins | last wins |
| 6 | Duplicates in DB | ✔ by numeric NIK | n/a | ~ raw-NIK key (IE-ANO-008) | ✖ | ✖ | ✔ any H&K row | ✔ | ✖ | ✖ | ✔ | ✔ | ✔ |
| 7 | Invalid member id | skip (insert new) | skip | ✖ inserts NULL member | ~ header without line | ~ header without line | ✔ skip | ✖ inserts NULL name | ✔ skip | ✔ skip | ✔ skip | ✔ skip | ✖ inserts NULL member |
| 8 | Foreign key / reference | ✖ group/status free text | n/a | ~ document must exist (else nulls) | ✖ | ✖ | ✖ | ✖ | ✔ product code in `m_jenis_pinjaman` | ✔ product `GAJI MINUS` | ~ batch row read, not required | ✖ | ~ document read, not required |
| 9 | Branch ownership | n/a (single cooperative) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| 10 | Cross-branch | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| 11 | Unauthorised attempt | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only | page grant only |
| 12 | Existing-record update | skip (no update) | overwrite | overwrite | n/a | n/a | skip | overwrite | n/a | overwrite (reset) | overwrite | overwrite | overwrite |
| 13 | Missing master data | ✖ | n/a | n/a | n/a | n/a | n/a | n/a | skip silently | skip silently | n/a | ✖ (falls to GIIC) | n/a |
| 14 | Empty file | ~ ext check only | ~ | ~ | ~ | ~ | ~ | ~ | ~ | ✖ global reset still runs | ~ | ~ | ~ |
| 15 | Invalid header | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| 16 | Corrupted file | uncaught exception (file left) | same | same | same | same | same | same | same | same | same | same | same |
| 17 | Unsupported format | ✔ by name (status 'success') | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ~ only `''` checked; `.xls` passes upload, then throws | same | ✔ | ✔ | ✔ |
| 18 | Partial failure | rows before the failure committed; no report | same | same | same | same | same | same | same | same | same | same | same |
| — | Document status (server) | n/a | n/a | ✖ (UI only) | n/a | n/a | n/a | n/a | n/a | n/a | ✖ (UI only) | ✖ (UI only) | ✖ |
| — | Balance or limit check | n/a | n/a | ✖ | n/a | ✖ overdraw | ✖ | n/a | ✖ (no credit check) | ✖ | ✖ | ✖ | n/a |

## 4. Template contracts

The authoritative header lists are in [inventory §C](LEGACY_FEATURE_INVENTORY.md#c-import-templates). Contract notes by feature:

- **Members (TPL-001 → IMP-001/002).** Columns A–I: `NIK, ID_CARD, NAMA, GENDER, GROUP_ANGGOTA, STATUS, SIM_POKOK, SIM_WAJIB, LIMIT_TOKO`.
  - Legend values: GROUP ∈ {ANGGOTA, NON ANGGOTA, KOPERASI, BMP}; STATUS ∈ {AKTIVE, RESIGN, PENSIUN}. Neither list is validated.
  - `status_pot_pokok` / `status_pot_wajib` = 1 when the amount ≠ `'0'`.
  - The template has pre-filled personal data (IE-ANO-016).
- **Limits (TPL-002 → IMP-003/004).** The template has A–C. The code reads A–D: `NIK, LIMIT_TOKO, GAJI_MINUS, LIMIT_PPOB` (IE-ANO-005).
- **Savings lines (TPL-003 → IMP-005/006).** `NIK (5 digits), NOMINAL`. Context comes from hidden form fields:
  - `jenis_transaksi = CASH/TRANSFER` → amount to `kredit_cash`;
  - any other value → `kredit`;
  - `PAYROLL` with `SIMPANAN WAJIB` or `SIMPANAN POKOK` → standing deduction update.
- **Deposits (TPL-003 → IMP-007).** `NIK, NOMINAL` (code names the column `debit` but stores it as `kredit_cash`). `doc_type`, `jenis_transaksi`, `jenis_simpanan` and `doc_date` come from the modal.
- **Withdrawals (expects TPL-004 → IMP-008).** `tgl (dd-mm-yyyy text), NIK, NOMINAL`. The template served is TPL-003 (IE-ANO-015).
- **Exit settlement (TPL-005 → IMP-009).** 17 columns, A–Q. Dates are `dd-mm-yyyy` text.
  - `total_hak = pokok + wajib + sukarela`;
  - `total_kewajiban` = the sum of the 10 obligation columns;
  - `sisa_hak = hak − kewajiban`;
  - `surat_pernyataan = 'Ya'` → 1.
- **Deduction master (TPL-006 → IMP-010).** `NIK, NOMINAL`. `jenis_simpanan` comes from the modal. Period: `periode_start` = first day of the current month, `periode_end` = 31 Dec of the current year.
- **Loans (TPL-007…012 → IMP-011…017).**
  - Shared columns A–I: `TGL CAIR, TGL POTONGAN KE-1, NIK, JUMLAH PINJAMAN, JANGKA WAKTU, SUKU BUNGA (Flat | other = annuity), BUNGA (%), BIAYA ADMIN (%), BIAYA ASURANSI (%)`.
  - Column J is product-specific. Daftar Pinjaman: J = JENIS PINJAMAN, K = PEMBIAYA/JENIS. Reguler: J = JENIS PINJAMAN, K = BLOKIR 1X. Bank/KPR: J = BANK. Kasbon: J = JENIS KASBON (`KASBON LEBIH DARI 1X POT` is mapped to `KASBON >1X POT`). Pembiayaan: J = JENIS PEMBIAYAAN, K = KETERANGAN.
  - Gaji Minus uses A–G only. Its constants: `pembiayaan_code = KOPERASI`, `jenis = bank = GAJI MINUS`, `tgl_tempo = 10`, admin = insurance = 0.
  - Constants for all loan imports: `tgl_tempo = '10'`, `type_pencairan = TRANSFER`, `doc_type = KREDIT`, `plan_angsuran = 0` (recomputed by the schedule), `status_bayar = BELUM LUNAS`, `status_roll_over = NO`.
  - Fees in rupiah = amount × % / 100.
  - The product's ledger accounts (`akun_*`) are copied from `m_jenis_pinjaman`.
- **Matrix (TPL-013 → IMP-018).** 41 columns, A–AO, mapped one-to-one onto `trans_potongan_matrix` (all target columns verified to exist).
- **Store bills (TPL-014 → IMP-019).** `NIK, NAMA TOKO, TAGIHAN`.
- **SHU (TPL-015 → IMP-020).** `NIK, SIMPANAN, TRANSAKSI USAHA, SUKARELA, BAGIAN, PLANT`. Sukarela interest is rounded to thousands: `round(x, -3)`.
- **SHU sukarela (TPL-016 → IMP-021).** `NIK, JASA SIM SUKARELA`. The code also reads E–F (IE-ANO-006).

A "valid example record" exists only as a synthetic fixture: see [fixtures/](fixtures/README.md). No legacy example rows are reproduced.

## 5. Per-feature notes

Only the behaviour beyond §1–4 is listed.

| Feature | Workflow specifics | Business rules found in code | Anomalies |
|---|---|---|---|
| IMP-001/002 | Two pages, two handlers; template link on both goes to `master/anggota_c` | New member gets `status_pot_sukarela = 0`; `cd_usr` = full name | 016, 020, 021, 022 |
| IMP-003/004 | Separate modal "Import Limit" | Wallet = GAJI_MINUS if it is "not empty", else LIMIT_TOKO; PPOB wallet = LIMIT_PPOB | 005 |
| IMP-005/006 | Detail page of an open document; table reloads after the call | `start_date` from the header; `finish_date` = end of the header month; for PAYROLL: deduction period from the header month to 31 Dec | 008, 012 |
| IMP-007 | Modal asks doc type, jenis transaksi, jenis simpanan, date, payment type | Header `POSTING`, period from the modal date | 001, 010 |
| IMP-008 | Import from the list or from a detail page; both create new documents | Header `POSTING`, `doc_type = DEBIT`; bank account copied from the member | 001, 009, 011, 015 |
| IMP-009 | — | Totals computed from the typed columns only | 011, 024 |
| IMP-010 | Modal asks `jenis_simpanan` | Deduction active (`status = 1`) on insert and on update | 014 |
| IMP-011…017 | Success toast; list reload | See §4 constants; `akhir_pinjaman` = last schedule date; schedule all `Belum Bayar` | 001, 004, 011, 023, 034 |
| IMP-016 | — | Global reset; threshold `'200000'`; constants 500000 / 0 | 003 |
| IMP-018 | Detail page of a batch; button hidden unless OPEN or POSTING (UI only) | Row key `periode` = batch `doc_no` | 012 |
| IMP-019 | No button; modal remains in the page | Store column chosen by name; anything else → GIIC | 012, 013 |
| IMP-020/021 | Two modals on the SHU detail page; modal posts header totals as hidden fields (unused by the server except `doc_no` and `periode_th`) | Sukarela rounding to thousands | 006, 007, 012 |

## 6. Transaction and data-integrity summary

| Question | Answer (all 21) |
|---|---|
| Runs inside a DB transaction | **No** (IE-ANO-002) |
| Whole file committed atomically | No |
| Stops at the first error | A PHP error (e.g. a date cell) stops processing; rows already written stay. A DB error under STRICT mode stops the statement; CodeIgniter's `db_debug` setting decides whether the script halts (not checked) |
| Successful rows saved despite later failures | Yes |
| Rollback | None |
| Duplicate uploads create duplicate transactions | **Yes** for IMP-007, 008, 011–017 (and per extra sheet for all, IE-ANO-001) |
| Idempotent | Only the upsert handlers, and only when the NIK format matches |
| Audit log | None (no batch, file hash or actor record beyond `cd_usr`) |
| Safe to retry after failure | Only IMP-003/004, 010, 018, 019, 020 (and 005/006 with matching NIK format); **not** the loan, deposit or withdrawal imports |

## 7. Database impact

See [DATABASE_IMPACT_MATRIX.md](DATABASE_IMPACT_MATRIX.md). The financially material effects:

- loans with schedules created as approved (IMP-011…017);
- savings lines that change balances (IMP-005/006);
- POSTING savings documents waiting for approval (IMP-007/008);
- payroll deduction rows that feed the payroll settlement (IMP-018/019);
- member credit limits and mobile wallet balances (IMP-003/004/016);
- SHU allocation inputs (IMP-020/021);
- exit-settlement amounts (IMP-009).
