# 04 — Database write mapping, ownership and coexistence

Status: audit evidence + proposals. Nothing here is implemented. Proposals are marked **PROPOSED**.

## 1. Method

1. Static scan of every controller method → direct SQL or model call → model write statement, with file:line ([02A](02A_LEGACY_METHOD_WRITE_INDEX.md)).
2. Manual reading of every financial write path end to end (this document §3), including helpers and the JS caller that triggers it (`modules/*/views/js/*_js.php`).
3. Aggregate read-only queries on the 30 Sep staging copy to check whether code-level defects show up in data (counts only, no rows).

Legacy write path, generic shape (true for all paths below unless stated):
`browser (DataTables/jQuery AJAX, POST) → /<module>/<controller>/<method> → MZ_Controller constructor (session + page gate) → $this->input->post(..., TRUE) (XSS filter only) → string-built SQL or CI Query Builder → auto-commit per statement → echo json_encode({status|success, mess|msg})`.

## 2. Write target inventory

Rows = 30 Sep staging copy (E1-data). "Other writers" = systems other than legacy KOSIPA that write the same table (E1 from earlier audits; smartkkisi E1-inferred). "Proposed owner during migration" applies only after the per-feature cutover in [11](11_CUTOVER_AND_ROLLBACK_PLAN.md).

| Table | Rows | Legacy KOSIPA writers (features) | Ops | Other writers | Proposed owner after cutover |
|---|---|---|---|---|---|
| `m_anggota` | 9,276 | F02, F03, F04, F05, F06, F10, F12/F14 (line add), F16, F18, F19, F22 (salary), F37/F39, F44, F45, F46 | I/U/D | TOKO legacy `Member_model` (I/U/**D**), TOKO `Pos::detailanggota` (U on read, `ANO-T02`), smartkkisi (profile) | KOSIPA Membership context (Next.js) — single owner (UCKW:BR001) |
| `m_simpanan_aktif` (payroll deduction config) | 5,485 | F02, F03, F04, F12, F14, F18, F44, F45 | I/U | none known | KOSIPA Savings-config |
| `users` (smartkkisi accounts, wallet mirror) | 1,168 | F03, F06, F10, F19, F30 | U | smartkkisi (owner) | smartkkisi; Next.js only via a defined status-change contract (FD-08) |
| `oauth_access_tokens` | 149,240 | F03, F10 | D | smartkkisi | smartkkisi; Next.js revokes by `user_id` only |
| `trans_simpanan` / `trans_simpanan_dtl` | 5,787 / 113,267 | F12–F16, F20, F46 | I/U/D | none known | KOSIPA Savings |
| `trans_simpanan_saldo` | 8 | F13/F14 | I | none | KOSIPA Savings |
| `trans_simpanan_penarikan` | 2,935 | F16, F46 | U/D | smartkkisi (creates requests) | request: smartkkisi; status: KOSIPA |
| `trans_simpanan_pengajuan` | 365 | F18, F45 | I/U/D | smartkkisi (creates), **Next.js public savings** (creates OPEN) | request: channel; status: KOSIPA |
| `rek_simpanan` | 4,025 | F20 (dormant) | U | — | retire with F20 |
| `trans_pinjaman` | 32,631 | F22–F34, F37, F41, F47, F49 | I/U/D | smartkkisi PPOB pay-later KASBON (E1-inferred: reject in F49 looks up by order code) | KOSIPA Lending |
| `trans_pinjaman_dtl` | 1,198,697 | F22–F25, F29, F33, F34, F37, F41, F47 | I/U/D | none known | KOSIPA Lending |
| `trans_pinjaman_rollover` | 1,071 | F29 | I/D | — | KOSIPA Lending |
| `trans_pinjaman_pengajuan` | 4,848 | F25, F26, F47 | U/D | smartkkisi (creates) | request: smartkkisi; status: KOSIPA |
| `trans_pinjaman_kasbon_dtl` | 0 | F22 (kasbon variant) | I | — | KOSIPA Lending (unused) |
| `trans_dokumen` | 0 | F28 | I/D | — | KOSIPA Lending |
| `trans_potongan_bulanan` / `trans_potongan_matrix` | 135 / 84,924 | F37–F41; `x_proc_create_matrix` | I/U/D/CALL | procedure | KOSIPA Payroll |
| `trans_hak_kewajiban` | 4 | F19 | I/U/D | — | KOSIPA Membership-exit |
| `trans_shu` / `trans_shu_dtl` | 3 / 3,652 | F44; `x_proc_create_shu` | I/U/D/CALL | procedure | KOSIPA SHU |
| `trans_tagihan`, `_dtl`, `_rincian` | 25 / 7,035 / 27,398 | F43 | I/U/D | — | KOSIPA Payroll (PPOB component) |
| `m_acc_jurnal_umum`, `_dtl` | 0 / 0 | F21 (not wired) | I | — | Decision FD-09 |
| `orders`, `order_details`, `products` | 18,407 / 16,489 / 17,800 | F49 | U | smartkkisi (owner) | smartkkisi (P3/HOLD) |
| `db_notifikasi` | 17,911 | F20, F51 | I/U | smartkkisi (E1-inferred) | shared notification contract (P3) |
| 17 KOSIPA reference masters (`m_jenis_*`, `m_suku_bunga`, `m_jangka_waktu`, `m_rekening`, `m_bagian`, `m_lokasi`, `app_jobsection`, `app_joblevel`, `m_surat`, `db_cabang`, `db_tax`, `db_currency`, `db_expense_category`, `db_paymenttypes`) | 0–172 each | F52 | I/U/D | TOKO legacy writes `db_tax`, `db_currency`, `db_paymenttypes`, `db_expense_category` (TOKO masters with the same names) | KOSIPA-only tables → KOSIPA; shared `db_*` → **TOKO** (KOSIPA menu not migrated, like `ANO-X09`) |
| `db_brands`, `db_category`, `db_units`, `m_barang` | — | F53 (not in menu) | I/U/D | TOKO (owner) | TOKO; KOSIPA path retired |
| `ref_users`, `ref_group`, `ref_group_akses`, `ref_menu`, `ref_menu_akses`, `ref_hist_akses_users`, `ref_site`, `user_data`, `ref_material` | 10 / — / 13 / 74 / 351 / 4,925 / 4 / — / — | F54 | I/U/D | — | legacy KOSIPA IAM until retirement; console IAM lives in the console store. `ref_menu.status` is used as the cutover switch (§5.3) |

Procedures: `x_proc_create_matrix` (payroll generator; body Unknown, B1; owner decision: not modified), `x_proc_create_shu` (SHU base list; body Unknown).

## 3. Write paths

### 3.1 Facts common to every legacy write path (E1)

| Attribute (PRD §4) | Legacy behaviour everywhere unless a path says otherwise |
|---|---|
| Input types | Strings from `$_POST`; amounts parsed with `str_replace(',', '')` or `filter_var(FILTER_SANITIZE_NUMBER_INT)`; dates via `strtotime` |
| Mandatory fields | Enforced only in the browser form; server rarely checks (one exception: F25) |
| Defaults | Literal defaults in the insert arrays (e.g. `total_roll_over=0`, `pengajuan_mobile=0`) |
| Validation | Client-side; server trusts amounts, balances and target status sent by the browser |
| Authorization | Page gate per controller (`ANO-K02`); no per-action check, no maker-checker |
| Insert/update/delete order | Sequential statements in code order |
| Transaction handling | None (auto-commit) except §2 of [02](02_LEGACY_FUNCTION_INVENTORY.md#5-transaction-usage-complete) |
| Generated identifiers | `doc_no` = prefix + year + month + (`MAX(id)` of the month + 1) (`ANO-K06`); AUTO_INCREMENT `id`; detail `doc_no_dtl`/`doc_no_cicilan` concatenations |
| Error handling | Returns `{status:'01'}`/`{success:false}` only for the last statement's result; earlier statements stay committed. `ENVIRONMENT=development` in the local copy (`index.php:21`) → `db_debug` on → a DB error renders an error page mid-path |
| Duplicate submission | No idempotency key, no unique constraint (only `PRIMARY KEY id` on every financial table, E1-data). A double click creates two documents/lines |
| Concurrency | No locks. Two operators can approve, delete or edit the same document at the same time; last write wins |
| Rollback | Not possible after a partial failure; no compensating logic |
| Historical/audit effects | `cd/cd_usr`, `ud/ud_usr` columns only; approvals overwrite `cd_usr` in loans and payroll (`ANO-K27`); no audit table. 23,050 of 32,631 loans have `ud_usr` NULL (E1-data) |
| Financial journal effect | **None in the live flow** (F21 not wired, journals empty) |

### 3.2 Membership

| WP | Path | Statements in order (file:line) | Balance / status effects | Deviations from §3.1 |
|---|---|---|---|---|
| WP-01 Register member (F02) | Form "Tambah Anggota" → `master/anggota_c::ajax_add` | INSERT `m_anggota` (`anggota_m.php:118`); optional QR file; INSERT `m_simpanan_aktif` for POKOK, WAJIB, SUKARELA when > 0 (`anggota_c.php:283, 295, 306`) | Creates payroll deduction configuration that the next `x_proc_create_matrix` run reads (E1-inferred) | No NIK uniqueness check: 3 duplicate canonical NIKs on 30 Sep copy (E1-data) |
| WP-02 Edit member / change status (F03) | Form edit → `ajax_update` | UPDATE `m_anggota` (`anggota_m.php:131`) → if mobile account exists: when status ≠ AKTIVE DELETE `oauth_access_tokens` by `user_id` (517) and UPDATE `users` wallets=0, inactive (526) → then UPDATE `users` wallet = `gaji_minus` or `limit_toko`/`limit_ppob` (538/549) → UPSERT `m_simpanan_aktif` ×3 (559–606) | Credit limits (`limit_toko`, `limit_ppob`, `gaji_minus`) immediately change TOKO Kredit eligibility | Second UPDATE re-sets wallet of a just-deactivated member (`ANO-K32`). The `anggota/anggota_c` copy deletes tokens by token `id` instead of `user_id` (`ANO-K17`) |
| WP-03 Delete member (F04) | Delete button → `ajax_delete/{id}` | SELECT; DELETE `m_anggota` (`anggota_m.php:145`); UPDATE `m_simpanan_aktif` status=0 by NIK (`anggota_c.php:940`) | All savings, loans, payroll lines keep the NIK but lose the master row | Hard delete regardless of history |
| WP-04 Limit import (F06) | Upload Excel → `ajax_upload_excel_limit` | per row: SELECT by `convert(nik_kar, UNSIGNED)`; UPDATE `m_anggota` limits (`anggota_m.php:523`); UPDATE `users` (539) | Store credit limits | Row-by-row, no preview, partial import on error |

### 3.3 Savings

| WP | Path | Statements in order | Balance / status effects | Deviations |
|---|---|---|---|---|
| WP-05 Savings document + lines (F12/F14) | "Data Simpanan" → `ajax_add` (header OPEN) → detail page `ajax_add_detail` per member / `ajax_add_all_detail` / upload | INSERT `trans_simpanan`; per line INSERT `trans_simpanan_dtl` (`kredit` payroll or `kredit_cash`), UPSERT `m_simpanan_aktif` and UPDATE `m_anggota` (02A rows) | Line amounts count toward the savings card only through views keyed on status (definitions Unknown, B1) | Lines can be added/edited/deleted while the header is APPROVED (no status guard) |
| WP-06 Approve / reject savings (F13) | Detail page button → `ajax_proses` (`simpanan_c.php:1038`) | UPDATE `trans_simpanan.doc_status = <request>`; if not PAYROLL UPDATE all lines `doc_status`, `tgl_cair`; if type ∉ {POKOK, WAJIB, SUKARELA} INSERT `trans_simpanan_saldo` (Σ kredit) | Status `<request>` comes from POST, any value accepted | Repeat call inserts another saldo row (`ANO-K43`). PAYROLL lines keep their own status → 38,995 lines POSTING under APPROVED headers, 1,985 REJECTED, 994 OPEN (E1-data, `ANO-K34`) |
| WP-07 Bulk approve deposits (F15) | List checkbox → `sim_setor_c::ajax_approved_all` | per `doc_no`: UPDATE header APPROVED; UPDATE lines APPROVED (`sim_setor_m.php:651`) | — | No `tgl_cair`, no saldo row, no state check (`ANO-K30`) |
| WP-08 Withdrawal line (F16) | Detail page → `penarikan_simpanan_c::ajax_add_detail` (500) | SELECT header, line, member (by `convert`); if `nominal > 0` and `total_saldo − nominal ≥ 0` INSERT `trans_simpanan_dtl` (`debit`) | Reduces savings once approved (view-dependent) | `total_saldo` from POST (`ANO-K04`); two OPEN documents can withdraw the same balance |
| WP-09 Approve withdrawal (F16) | `ajax_proses` (683) / `ajax_approved_all` (733) | UPDATE header and all lines `doc_status`; single path sets `tgl_cair`; if `is_mobile=1` UPDATE `trans_simpanan_penarikan` | Payout (cash/transfer) happens outside the system | Balance not re-checked at approval |
| WP-10 Payroll deduction master (F18) | "Master Potongan Payroll" → `master_payroll_c::*` | INSERT/UPDATE `m_simpanan_aktif`; UPDATE `m_anggota`; `ajax_add`/`ajax_update_all` INSERT `trans_simpanan_pengajuan` | Next payroll run uses new amounts | Upload is the only transactional write (`master_payroll_m.php:146`) |
| WP-11 Exit settlement (F19) | "Hak & Kewajiban" → `ajax_add` (amounts typed or uploaded) → list `ajax_approved_all` | INSERT `trans_hak_kewajiban`; on approve per doc: UPDATE `doc_status=APPROVED`; UPDATE `m_anggota` **WHERE `nik_kat` = …** (`hak_kewajiban_m.php:884`); UPDATE `users` inactive, wallet 0 | Intended: member leaves, limits zeroed, mobile disabled | `m_anggota` has no `nik_kat` column (E1-data) → statement fails after the header is APPROVED; with `db_debug` on the request errors, `users` is not updated (`ANO-K31`). No savings payout document, no loan settlement is produced — settlement is paperwork only |

### 3.4 Loans

| WP | Path | Statements in order | Balance / status effects | Deviations |
|---|---|---|---|---|
| WP-12 Loan application (F22) | `add_pengajuan_pinjaman` form → `ajax_add` (`pinjaman_c.php:415`) | SELECT product (`m_jenis_pinjaman`); UPDATE `m_anggota.gaji` (if > 0); `get_no_save()`; INSERT `trans_pinjaman` (OPEN); non-KASBON: `update_biaya_flat/anuitas` → UPDATE `trans_pinjaman` from view; when already APPROVED+disbursed rebuild schedule | Creates the obligation; for KASBON no schedule | Flat path is overwritten by the annuity view in both branches (`ANO-K07`, now confirmed in source: `pinjaman_c.php:536` `update_biaya_flat` updates from `v_trans_pinjaman_anuitas` at lines 541 and 548) |
| WP-13 Schedule rebuild (F24) | called from WP-12/WP-14 and public URLs `get_bungan_bulanan/{doc}`, `get_bungan_anusitas/{doc}` | DELETE all `trans_pinjaman_dtl` of the loan (`pinjaman_c.php:575`, `654`); INSERT one row per month: due date `Y-m-tgl_tempo`; `status_cicilan = 'Bayar'` if due ≤ today else `'Belum Bayar'` (`pinjaman_c.php:609`, `706`) | **Payment history erased and re-derived from today's date** (`ANO-K22`, `ANO-K23`) | Annuity loop may skip the last instalment (`ANO-K24`); day 29–31 overflow (`ANO-K25`) |
| WP-14 Edit / disburse (F25) | detail form → `ajax_update` (992) | SELECT product; if mobile: UPDATE `trans_pinjaman_pengajuan` status; compute admin %, insurance % in float; `total_potongan = blokir + admin + asuransi + rollover + pinalty`; UPDATE `trans_pinjaman` (all fields incl. `status_pencairan`); rebuild schedule (WP-13); if rollover: per old loan UPDATE LUNAS + `pelunasan=1`, UPDATE **all** old instalments `Bayar` (`pinjaman_c.php:1166`); UPDATE `akhir_pinjaman`; recompute `status_bayar` | Disbursement and netting of old loans in one request without a transaction | Approved loans remain fully editable; rollover amounts are client values from WP-16; 6,696 instalments due after 30 Sep 2026 are already `Bayar` with no payment type (E1-data, consistent with this path, `ANO-K46`) |
| WP-15 Approve / reject (F26) | list/detail → `ajax_posting/{doc}` (1230); bulk `ajax_posting_all` → POSTING; `ajax_publish_all` → `publish=1` | UPDATE `doc_status=<POST>`, `cd_usr=<approver>`; if APPROVED: rollover settlement as WP-14; if mobile: UPDATE request | — | Maker identity overwritten (`ANO-K27`) |
| WP-16 Rollover link (F29) | detail page modal → `add_rollover` / `delete_rollover/{id}` | INSERT batch `trans_pinjaman_rollover` (old doc, `sisa_pinjaman`, `sisa_cicilan` from POST); UPDATE new loan `total_roll_over` = Σ | Amount netted from the new disbursement | Remaining balance computed in the browser |
| WP-17 Delete loan (F27) | delete button → `ajax_delete/{id}`; bulk `ajax_delete_all` | SELECT; DELETE header; DELETE all instalments (`pinjaman_reguler_m.php:387-399`) | Removes approved/disbursed loans and paid history | No status check (`ANO-K28`). 33,136 schedule rows without a header (earlier index audit) are consistent with partial deletes |
| WP-18 Early settlement / over-kredit (F33/F34) | `pengajuan_pelunasan` form → `ajax_update` | UPDATE header with client `pelunasan_*` amounts, `status_bayar` from `pelunasan_status`; if YES: UPDATE instalments `tgl_cicilan ≥ first day of month` → `Bayar`, `type_cicilan = remark` | Loan closed; no receipt, no savings or cash document | Undo (`ajax_delete`) flips the same fields back |
| WP-19 Status refresh on list (F31) | opening the product list (DataTables POST) | per row: SELECT last instalment; UPDATE `status_bayar` | LUNAS iff the **last** instalment is `Bayar` (`ANO-K26`) | A read endpoint writes; 212 approved+disbursed loans are BELUM LUNAS although every instalment is `Bayar` (E1-data) |

### 3.5 Payroll, SHU, mobile, masters, IAM

| WP | Path | Statements in order | Effects | Deviations |
|---|---|---|---|---|
| WP-20 Payroll batch + generation (F37/F38) | `ajax_add` (header OPEN per `kd_group`) → `process_simulasi/{id}` | INSERT `trans_potongan_bulanan`; `CALL x_proc_create_matrix(doc_no, bl, th, periode, kd_group, start(M−1), end(M−1))` | Matrix lines per member (savings, loans, PPOB, `TOKO_*`) | Only path that checks state (`doc_status='OPEN'`); returns (`db_salesreturn`) ignored (`ANO-X01`) |
| WP-21 Payroll adjustments (F39/F40) | line edit, uploads | INSERT/UPDATE/DELETE `trans_potongan_matrix`; UPDATE `m_anggota` | — | Upload transactional; edits not |
| WP-22 Payroll approve (F41) | `ajax_proses` (`matrix_c.php:1029`) | UPDATE header (status from POST, `cd_usr`=approver); if APPROVED: UPDATE **every** `trans_pinjaman_dtl` of the month `Belum Bayar` → `Bayar/PAYROLL` (`matrix_c.php:1057`); per loan whose paid row has `sisa_cicilan=0`: UPDATE LUNAS | Settles instalments of members not in the batch (`ANO-K05`) | Re-approval re-runs; `ANO-K47` |
| WP-23 SHU (F44) | create → `ajax_add_all_detail` (`CALL x_proc_create_shu`) → `ajax_generate_jasa` → `ajax_proses` | INSERT `trans_shu`; procedure fills `trans_shu_dtl`; per line UPDATE jasa (float, `round(x,-3)`) + `pembulatan_sukarela`; UPDATE status | Status only — no payout, savings credit or journal | Divide by zero (`ANO-K09`); `ajax_edit_detail` broken (`ANO-K42`) |
| WP-24 Mobile savings change (F45) | `mobile/pengajuan_mobile_c::ajax_proses` | UPDATE request status; INSERT/UPDATE `m_simpanan_aktif`; UPDATE `m_anggota` | Payroll deduction amount changes | — |
| WP-25 Mobile withdrawal (F46) | `mobile/penarikan_mobile_c::ajax_proses` | INSERT `trans_simpanan` + `trans_simpanan_dtl` (withdrawal); UPDATE `trans_simpanan_penarikan` | Creates F16 document | Balance not checked |
| WP-26 Mobile loan (F47) | `pinjaman_mobile_c::ajax_add` → `update_biaya_*` → `ajax_posting` | INSERT `trans_pinjaman`; UPDATE `m_anggota`; UPDATE request; schedule rebuild (WP-13) | Creates F22 loan | `get_bungan_anusitas` broken (undefined method) |
| WP-27 Masters (F52/F53) | `ajax_add/update/delete` | INSERT/UPDATE/DELETE reference row | Deleting a product type referenced by loans breaks joins | No reference check |
| WP-28 IAM (F54) | `adm_pengguna_c`, `adm_group_c`, `adm_menu_c`, `adm_profile_c`, `reset_c`, `bisnis_c` | INSERT/UPDATE/DELETE `ref_*` | Changes who can open which controller | GET-driven mutations (private register) |
| WP-29 PPOB approve/reject (F49) | `ppob_penjualan_c` | UPDATE `orders`, `order_details`; UPDATE linked KASBON in `trans_pinjaman`; external IAK call | — | `updated_at` format typo `Y-m-d H:i:i` (`ANO-K41`) |
| WP-30 Notifications (F51) | `update_notif` | UPDATE `db_notifikasi` | — | — |

### 3.6 Hidden and indirect writes

| Kind | Where | Status |
|---|---|---|
| Writes from read/list endpoints | Loan `ajax_list` in 4 product controllers (WP-19); `get_bungan_*` public schedule rebuilders | Confirmed E1 |
| Writes from GET requests | `adm_group_c::get_group`, `adm_menu_c::get_menu` (`?insert/?update/?delete`) | Confirmed E1 (details private) |
| Stored procedures | `x_proc_create_matrix`, `x_proc_create_shu` | Bodies Unknown (B1) |
| Triggers | None in the 30 Sep copy | Production Unknown (B3) |
| Scheduled jobs | None in source | E1 (no cron/CLI controllers) |
| Downstream processes | smartkkisi reads `users`, `trans_*_pengajuan`, `trans_simpanan_penarikan`; TOKO reads `m_anggota` limits; payroll generator reads `m_simpanan_aktif`, `trans_pinjaman_dtl`, `db_sales`, `trans_tagihan*` | E1-inferred |
| Other applications writing the same tables | TOKO legacy (`m_anggota`), smartkkisi, Next.js public savings (`trans_simpanan_pengajuan`) | E1 / E1-inferred |

## 4. Write ownership matrix (per feature)

States: **L** = legacy is the only writer · **N** = Next.js is the only writer · **L→N** = transfer in progress (both disabled during the switch window) · **Shared-intake** = request created by a channel, decided by one owner.

| Feature group | Today | Migration target | Can both systems act on the same pending item today? | Conflicting approvals possible? | Switch mechanism (PROPOSED, FD-03) | External dependants |
|---|---|---|---|---|---|---|
| Reference masters (F52) | L | N | yes (no locks) | n/a | `ref_menu.status=0` for each migrated controller URL | loan/savings forms read them |
| Member master + limits + status (F02–F06, F10) | L + TOKO legacy + POS read-write | N (Membership owner) | yes | n/a | `ref_menu.status=0` for `master/anggota_c`, `anggota/anggota_c`, `mobile/users_c`; TOKO legacy `Member` menu disabled by TOKO owner | TOKO Kredit limits, smartkkisi |
| Payroll deduction config (F18, F45) | L (+ public savings intake N) | N | yes | yes (two approvers of one request) | `ref_menu.status=0` for `simpanan/master_payroll_c`, `mobile/pengajuan_mobile_c` | payroll generator |
| Savings documents, deposits, withdrawals (F12–F16, F46) | L | N | yes | yes | `ref_menu.status=0` for `simpanan/simpanan_c`, `sim_payroll_c`, `sim_setor_c`, `penarikan_simpanan_c`, `mobile/penarikan_mobile_c` — together, because one balance | savings card, exit settlement, smartkkisi balance view |
| Loans: origination → disbursement → settlement (F22–F34, F47) | L | N | yes | yes | all 7 product controllers + `pelunasan_pinjaman_c` + `over_kredit_c` + `mobile/pinjaman_mobile_c` together | payroll generator, smartkkisi |
| Payroll batch (F37–F43) | L (+ procedure) | N (native generator replacing the procedure, UCKW:MIG004) | yes | yes | `payroll/matrix_c`, `ppob/tagihan_c` | finance payroll export |
| Exit settlement (F19) | L | N | yes | yes | `simpanan/hak_kewajiban_c` | Membership, smartkkisi |
| SHU (F44) | L | N | yes | yes | `shu/shu_c` | — |
| PPOB (F49) | L + smartkkisi | HOLD | — | — | — | IAK |

Rule (PROPOSED BR-117): a write feature is enabled in Next.js only when its row is **N**; the transfer is all-or-nothing per row, never per user or per branch (KOSIPA has no branches).

## 5. Coexistence analysis (PRD §4.1)

### 5.1 Same database?
Yes. Legacy KOSIPA, TOKO legacy, smartkkisi and Next.js all use `n1608204_smart_kopkar` (E1, earlier audit). Next.js reaches it through per-feature writer accounts (pattern: `prisma-return-write.ts`) inside a 12-connection budget that is already fully allocated (B5/B8).

### 5.2 Questions the PRD requires before enabling any write

| Question | Answer (evidence) | Consequence |
|---|---|---|
| Does the old application still write the same records? | Yes for every KOSIPA table (§2) | Writer can be enabled only after legacy is switched off for that feature (§4) |
| Which system is authoritative? | Today legacy; after cutover Next.js per feature | Ownership table in [11](11_CUTOVER_AND_ROLLBACK_PLAN.md) is the source of truth; recorded in `console_feature_ownership` (PROPOSED, FD-01) or in deployment config if no DDL is approved |
| Can both systems act on the same pending transaction? | Yes — no locks, status from client | Never run both; Next.js additionally locks the row (`SELECT … FOR UPDATE`) and checks the state server-side |
| Are conflicting approvals possible? | Yes (two staff in legacy; legacy + Next.js) | Prevented by single-writer switch + state machine |
| How are duplicate submissions prevented? | Not at all in legacy | Next.js: idempotency key per command (FD-01) + natural-key duplicate check under lock |
| How do rollback and cutover work? | — | [11](11_CUTOVER_AND_ROLLBACK_PLAN.md): flip `ref_menu.status` back to 1 and disable the Next.js flag; data written by Next.js is legacy-compatible by construction (same tables/columns/codes) |
| Do external systems depend on legacy writes? | Yes: payroll generator, smartkkisi, TOKO Kredit | Next.js must write the exact columns/values those consumers read (compatibility contracts in [07 §6](07_TARGET_ARCHITECTURE.md#6-legacy-compatibility-contracts)) |

### 5.3 Why `ref_menu.status` is the proposed legacy switch
`user_m::cekstatushakakses` (`models/user_m.php:379-390`) grants a controller only when a `ref_menu` row with that URL has `status=1`. Setting `status=0` on one row denies that controller (all methods) to every user, hides it from the sidebar, and is undone by setting it back to 1. It is a **data** change, not a code change (owner decision of 16 Oct 2026: legacy code is not modified). Limits: it does not stop ungated root print controllers (read-only), smartkkisi, TOKO legacy, or direct SQL; the stored procedures are called only from `matrix_c`/`shu_c`, so they stop with them. Production `ref_menu` must be verified first (B10), and the change runs only as reviewed SQL by the operator ([production DB changes are manual-only](../../../migration/sql/)).

## 6. Gaps in write-path evidence

| Gap | Why it matters | How to close |
|---|---|---|
| G-01 Local legacy copy = production source? | All file:line evidence is from the local copy | Operator lists SHA-256 of `application/modules/**/*.php` on production; compare (script in TASK-104) |
| G-03 Bodies of `x_proc_create_matrix`, `x_proc_create_shu` and 45 views (B1) | Payroll lines, loan amounts (`v_trans_pinjaman_flat/anuitas`), savings balances (`v_kartu_simpanan`) | `docs/migration/operator-handoff-schema-evidence.md` §3 (existing) |
| G-04 Production triggers, indexes, `sql_mode`, `ENVIRONMENT` (B3) | Hidden writes; whether `nik_kat` failure surfaces as error page or silent false | handoff script B + one config read by operator |
| G-05 smartkkisi writes to `trans_pinjaman` (PPOB KASBON) and `db_notifikasi` | Ownership of those rows | smartkkisi source grep by operator (Laravel) |
| G-06 Writes built from multi-line dynamic SQL | Scanner may miss them | Manual review of models with `$sql .=` patterns during TASK-104 characterization |
