# 06 — Legacy anomalies and database performance

Continues the anomaly register of the earlier audit (`ANO-K01`–`ANO-K21`, `ANO-X01`–`X09`, `ANO-T01`–`T03`, `ANO-G01`–`G06`). That register is **private** (gitignored) because it describes exploitable weaknesses in a running system. This document keeps the same rule: security-sensitive findings are listed by ID and severity only, with details in `private-legacy-security-findings.md` (gitignored, created with this spec).

Status values: **Confirmed** (code read, and data agrees or data is not needed) · **Confirmed-code** (code read; data on the 30 Sep copy does not show the effect or cannot) · **Observed-data** (data shows it; cause not attributed) · **Suspected**.

## 1. Earlier anomalies re-verified against the local legacy copy

| ID | Earlier status | Now | Evidence |
|---|---|---|---|
| ANO-K03 client-chosen status | Confirmed | Confirmed | `pinjaman_c.php:1230` (`doc_status` from POST), `simpanan_c.php:1038`, `penarikan_simpanan_c.php:683`, `matrix_c.php:1029` |
| ANO-K04 client-sent balance | Confirmed | Confirmed | `penarikan_simpanan_c.php:500-520` |
| ANO-K05 payroll settles all members | Confirmed | Confirmed | `matrix_c.php:1057` |
| ANO-K06 `MAX(id)+1` numbering | Confirmed | Confirmed + data: 7 duplicate loan `doc_no` groups (15 rows) | `pinjaman_m.php:551-573`; E1-data |
| ANO-K07 flat overwritten by annuity view | **Suspected** | **Confirmed-code** | `pinjaman_c.php:541`, `548` |
| ANO-K12 loan form changes salary | Confirmed | Confirmed | `pinjaman_c.php:450`, `927` |
| ANO-K17 token revoke by wrong column | Confirmed | Confirmed (only `anggota/anggota_c`; `master/anggota_c:517` uses `user_id`) | 02A |
| ANO-X01 store obligation ignores returns | Confirmed/Suspected | unchanged (procedure body B1) | `hak_kewajiban_m` |

## 2. New anomalies (`ANO-K22` onward)

| ID | Sev. | Status | Location | Finding | Impact | Proposed Next.js behaviour | Req |
|---|---|---|---|---|---|---|---|
| ANO-K22 | Critical | Confirmed-code | `pinjaman_c.php:573-575`, `653-654` (`get_bungan_*`), called from `update_biaya_*` on every add/edit and from `pinjaman_mobile_c` | Every edit of a loan deletes its whole schedule and rebuilds it | Payroll/settlement payment marks of an approved loan are lost and replaced by calendar guesses (K23) | Schedule created once at disbursement; never rebuilt; changes after disbursement only via settlement/reversal documents | REQ-120, REQ-121 |
| ANO-K23 | Critical | Confirmed-code; Observed-data (24,027 `Bayar` rows without payment type, 6,696 due after the snapshot) | `pinjaman_c.php:609`, `706` | Rebuild marks every instalment due ≤ today as paid | Loans look paid without payment; payroll later skips them (they are no longer `Belum Bayar`) | Paid only by settlement events (R-06, BR-103) | REQ-121 |
| ANO-K24 | High | Confirmed-code (simulation: 2,673/5,346 parameter sets), not observed in 30 Sep data (638/638 annuity schedules complete) | `pinjaman_c.php:653-720` | Annuity loop drops the last instalment when the float remainder ≤ 0 | Member under-scheduled by one instalment; loan LUNAS one month early | Exact BigInt annuity, last row absorbs (R-04) | REQ-118 |
| ANO-K25 | Medium | Confirmed-code (latent: all loans use day 10); Observed-data 328 loan-months with 2 instalments (cause open) | `pinjaman_c.php` due-date construction | Tempo day 29–31 overflows into the next month | Two deductions in one month, none in another | Clamp to month end (R-05, FD-04) | REQ-118 |
| ANO-K26 | High | Confirmed + data (212 loans) | `gaji_minus_c.php:166-175` and same block in `kpr_btn_c`, `pembiayaan_c`, `pinjaman_bank_c`; `pinjaman_c::update_all_pinjaman` | `status_bayar` is written by list views; LUNAS judged from the last instalment only | Status depends on who viewed which list; reports disagree | Status computed from all instalments; persisted only by the paying command (R-07) | REQ-134 |
| ANO-K27 | High | Confirmed | loan `ajax_posting` (`cd_usr` = approver), `matrix_c.php:1043` | Approval overwrites the creator column | Maker-checker cannot be proven for history; audit lost | Separate maker/checker identities in the command ledger; legacy `cd_usr` left as written by the maker | SEC-104, OBS-101 |
| ANO-K28 | Critical | Confirmed; data consistent (33,136 schedule rows without header) | `pinjaman_reguler_m.php:387-399`, `delete_by_all`; `anggota_c::ajax_delete` | Hard delete of loans in any status and of members with history | Financial history destroyed, orphans | Cancel/void/reverse/deactivate (05 §4) | REQ-111, REQ-123 |
| ANO-K29 | High | Confirmed | `pelunasan_pinjaman_c.php:306-383`, `over_kredit_c.php:172-245` | Early settlement amounts and status from the browser; no approval; `pelunasan_total` not comma-stripped in one copy | Wrong payoff, unreviewed closure; under STRICT mode a comma amount fails | Server-computed payoff + approval (R-11) | REQ-122 |
| ANO-K30 | High | Confirmed | `sim_setor_m.php:651`, `penarikan_simpanan_m.php:596`, `hak_kewajiban_m.php:871` | Bulk approve skips what single approve does (payout date, saldo row, validations) | Same document type ends in different states depending on the button | Bulk = N single commands, per-item result (BR-118) | REQ-114, REQ-115 |
| ANO-K31 | High | Confirmed (`nik_kat` absent in 30 Sep schema) | `hak_kewajiban_m.php:884` | Exit approval updates `m_anggota` by a non-existent column after the header is already APPROVED | Member stays active with limits; mobile account stays active; header says approved | Single atomic exit command (R-16) | REQ-117 |
| ANO-K32 | High | Confirmed-code | `master/anggota_c.php:513-550` | Status change to non-AKTIVE zeroes wallets, then the next block re-sets wallet from limits | Resigned/retired member keeps a spendable wallet in smartkkisi | Deactivation zeroes once; no later overwrite (R-20) | REQ-110 |
| ANO-K33 | Medium | Confirmed + data (0 journal rows; `acc_mapping_akun` empty) | `simpanan_c.php:308, 432` (calls commented), no UI caller | No general-ledger posting in the live system | Accounting happens outside KOSIPA; earlier UCKW:REQ036 assumed a journal exists | No GL until FD-09 decides; domain `assertBalancedJournal` stays ready | REQ-141 |
| ANO-K34 | Medium | Observed-data | `trans_simpanan` vs `trans_simpanan_dtl` | Line status diverges from header (38,995 POSTING / 1,985 REJECTED / 994 OPEN lines under APPROVED headers; 2,143 NULL-status lines under OPEN headers) | Balance depends on which status a view trusts | Next.js writes header and lines atomically with one status; reads follow FD-12 | REQ-114 |
| ANO-K35 | Medium | Confirmed + data | schedule maths, `double` columns | Fractional rupiah stored in 1,102,908 instalment rows; `double` money columns | Rounding drift in totals and payroll | Exact decimal writes (R-01) | BR-101 |
| ANO-K36 | Medium | Confirmed | [02A §3](02A_LEGACY_METHOD_WRITE_INDEX.md#3-controller-calls-to-model-methods-that-do-not-exist) | 7 endpoints call model methods that do not exist (`ajax_upload_excel` ×3, `shu_c::ajax_edit_detail` ×2, `pelunasan_pinjaman_c::print_pdf`, `pinjaman_mobile_c::get_bungan_anusitas`) | Features that look present are broken (savings Excel import, SHU line edit, mobile annuity schedule) | Not reproduced; built correctly where in scope | REQ-101 |
| ANO-K37 | Low | Confirmed (30 Sep menu) | `ref_menu` vs source | 9 menu links without controller; 25 gated controllers unreachable | Inventory noise; possible source drift (G-02) | Dormant features marked, not migrated by default | REQ-101 |
| ANO-K38 | Medium | Observed-data | `m_anggota` | ≈1,400 rows have amounts in `status_anggota`/`kd_group` (e.g. `0,00`, `150.000,00`) — column-shifted import | Eligibility/report misclassification | Data-quality report lists them (existing report); writes validate enums (VAL-102) | REQ-112 |
| ANO-K39 | Medium | Observed-data | `m_anggota` | 3 duplicate canonical NIKs | Ambiguous member resolution | Create/import rejects canonical duplicates (VAL-101) | REQ-108 |
| ANO-K40 | High | Confirmed | admin IAM controllers | Security detail in the private file | — | Console IAM only | SEC-101 |
| ANO-K48 | High | Confirmed | loan schedule endpoints | Security detail in the private file (related to ANO-K22) | — | Schedule generation internal only | SEC-101 |
| ANO-K49 | Medium | Confirmed-code | legacy access check | Security detail in the private file | — | Console grants only | SEC-102 |
| ANO-K50 | Medium | Confirmed | loan list endpoints | Security detail in the private file (related to ANO-K26) | — | Read models never write | SEC-101 |
| ANO-K41 | Low | Confirmed | `ppob_penjualan_c.php` | `updated_at` formatted `Y-m-d H:i:i` (minutes twice) | Wrong timestamps | n/a (P3) | REQ-137 |
| ANO-K42 | Medium | Confirmed | `shu_c.php:741-748`, `918-1028` | SHU line update keyed by NIK+doc (duplicates share values); `pendapatan_shu` adds unrounded sukarela rounding; line edit broken | SHU per member may be wrong for duplicate NIKs | Allocation keyed by line id; rounding defined (R-18) | REQ-127 |
| ANO-K43 | Medium | Confirmed-code | `simpanan_c.php:1038-1075` | Each approval call inserts a `trans_simpanan_saldo` row | Duplicate balance rows on retry/double click | Idempotent approval; insert only on first transition | REQ-114 |
| ANO-K44 | Medium | Confirmed | loan `ajax_update` (`pinjaman_c.php:992-1228`) | Approved/disbursed loans remain fully editable (principal, rate, term) | History rewritten silently | Immutable after approval (BR-106) | REQ-121 |
| ANO-K45 | Medium | Confirmed | `matrix_c.php:803-870` | Payroll header edit with `doc_status=APPROVED` rewrites `akhir_pinjaman`/`status_bayar` of each member's latest unpaid loan | Unrelated loan fields change on header edit | Header edit never touches loans | REQ-125 |
| ANO-K46 | High | Confirmed-code; data consistent (6,696 future-dated `Bayar` rows without type) | `pinjaman_c.php:1166`, `ajax_posting` rollover block | Rollover settlement marks **all** old instalments paid without type or reference | Cannot tell rollover-settled from paid; future instalments marked paid | `ROLLOVER` type + settling document reference (R-10) | REQ-120 |
| ANO-K47 | High | Confirmed | `matrix_c.php:1029-1080` | Payroll approval has no current-state check; re-approval re-runs settlement and LUNAS updates | Repeated settlement | State machine + idempotent approval | REQ-125 |

## 3. Performance findings

Measurement environment: local Docker MariaDB 11.4 (`kkisi-staging`, 30 Sep copy), no concurrent load, read-only account, `max_statement_time` 120 s. Production is MariaDB on shared hosting with 20 connections shared with PHP (B5/B8); production plans and timings are not measured (no load tests allowed).

| ID | Query / trace (original) | Why it is inefficient | Evidence | Proposed query / strategy | Index requirement | Business compatibility | Verification / benchmark |
|---|---|---|---|---|---|---|---|
| P-01 | Every schedule lookup: `SELECT … FROM trans_pinjaman_dtl WHERE doc_no = ?` (legacy everywhere; Next.js loan detail) and `WHERE nik_kar = ?` | Table has only `PRIMARY(id)`; 1,198,697 rows, 196 MB → full scan each time | `information_schema.STATISTICS` (E1-data); earlier measurement 190–360 ms per scan; two audit aggregates joining on `doc_no` exceeded 120 s | Keep Next.js `LIMIT` + keyset; add indexes | Tier 1 (already proposed, not executed): `(doc_no, ke_cicilan)`, `(nik_kar, tgl_cicilan)` — [index-proposal](../unified-console-kosipa-warehouse/index-proposal.md); DDL is an owner/operator decision (FD-02) | None (index only) | `EXPLAIN` shows `ref` on new index; loan detail p95 ≤ 300 ms on staging copy |
| P-02 | `WHERE convert(nik_kar, UNSIGNED INTEGER) = '$nik'` (most models) | Function on column → no index use; full scan of `m_anggota`/`trans_*`; also matches every non-numeric NIK as 0 | `ANO-K19`; grep | Application computes canonical keys (`nikLookupKeys`) and queries `nik_kar IN (?, ?)` | `m_anggota(nik_kar)` exists on staging copy; production Unknown (B3) | Equal results for numeric NIKs; non-numeric NIKs no longer collide (correction) | Characterization test for `'00123'`/`'123'` equivalence |
| P-03 | Loan list `ajax_list`: per row `SELECT … ORDER BY id DESC LIMIT 1` + `UPDATE trans_pinjaman` | N+1 with a write per row on every page view; each sub-query scans `trans_pinjaman_dtl` (P-01) | `gaji_minus_c.php:134-175` | Read model computes status set-based (one grouped query on the page's loans) and never writes | P-01 index | Status semantics corrected (R-07) | List page ≤ 3 queries; 0 writes (test asserts no UPDATE in read path) |
| P-04 | DataTables server side: `get_datatables()` + `count_filtered()` (re-runs the full query and loads all rows to count, `$query->num_rows()`) + `count_all()`; `LIKE '%term%'` across many columns; `LIMIT start, length` | 3 executions per page; filtered count transfers the whole result set to PHP; leading-wildcard LIKE; OFFSET grows with page | `master/models/bagian_m.php:52-80` (template shared by all models) | Keyset pagination (`id < ?` + `LIMIT n+1` for "has more"); count only on demand with a capped `COUNT(*)` (existing Next.js pattern) | none beyond PK | Exact total counts replaced by "≥ N" for large lists (UI decision in REQ-133) | Query count per list page ≤ 2 |
| P-05 | `SELECT *` on wide tables (`m_anggota`, `trans_pinjaman`) | Transfers unused columns (incl. PII) | grep | Explicit column lists (existing Next.js repositories do this) | — | none | Code review rule |
| P-06 | Payroll approval: `UPDATE trans_pinjaman_dtl … WHERE YEAR(tgl_cicilan)=… AND MONTH(tgl_cicilan)=… AND status_cicilan='Belum Bayar'` then a join query and per-loan UPDATE | Non-sargable date functions; full scan of 1.2 M rows under REPEATABLE READ → next-key locks on scanned range for the whole statement; long auto-commit write | `matrix_c.php:1057-1075` | Batch-scoped settlement: resolve instalment ids for the batch's members by `nik_kar IN (…) AND tgl_cicilan >= ? AND tgl_cicilan < ?`, then `UPDATE … WHERE id IN (…)` in chunks of ≤ 500 inside one transaction | `(nik_kar, tgl_cicilan)` | Scope correction (R-13) | Approval of a 1,400-member batch < 5 s on staging; lock wait none for unrelated loans |
| P-07 | Payroll header edit (APPROVED branch): per matrix line `SELECT … FROM trans_pinjaman_dtl a LEFT JOIN trans_pinjaman b … WHERE a.nik_kar=… ORDER BY a.id DESC LIMIT 1` + 2 UPDATE + 1 SELECT | Query-in-loop over ~1,400 lines, each a full scan (P-01) | `matrix_c.php:836-865` | Removed (K45) | — | Behaviour removed | — |
| P-08 | Bulk approve/delete loops (`foreach doc → UPDATE`) without transaction | Many round trips; partial completion | `sim_setor_m.php:651`, `posting_by_all` | One transaction per item (independent results) or per bounded chunk; idempotent | — | Per-item result instead of all-or-nothing message | Partial-failure test |
| P-09 | Excel imports: per row `SELECT … convert(nik_kar…)` + INSERT/UPDATE | Row-by-row full scans | `hak_kewajiban_m.php:778-790`, other `ajax_upload_*` | Two-phase import: parse + validate in memory with one set-based lookup (`nik_kar IN (…)` chunks), preview, then apply in one transaction | `m_anggota(nik_kar)` | Same rows written; adds preview | 5,000-row import < 30 s on staging |
| P-10 | Schedule rebuild: DELETE all rows of a loan + INSERT per month (string SQL per row) | Write amplification on every edit; `DELETE … WHERE doc_no` scans 1.2 M rows (P-01) | `pinjaman_c.php:575, 654` | Generate once; multi-row INSERT in the disbursement transaction | P-01 | Rebuild semantics removed (K22) | Disbursement ≤ 2 s |
| P-11 | Menu render: query per menu node | N+1 per request | `ANO-K20` | Not migrated (typed registry exists) | — | — | — |
| P-12 | Reports via views (`v_trans_*`), definitions Unknown | Cannot assess; earlier audit saw 5 s caps hit for some aggregates | B1 | Pre-aggregated, period-bounded queries; date range ≤ 366 days (UCKW:VAL005); export streamed | per report after B1 | Report definitions must match views (parity) | Report p95 ≤ 2 s for one period |
| P-13 | Next.js reads (current) | Already: `SET STATEMENT max_statement_time=5`, explicit columns, `LIMIT`, keyset (`id < ?`), parameterised, single pool | `apps/web/src/infrastructure/repositories/kosipa-*.ts` | Keep; schedule views flagged `INDEX_REQUIRED` until P-01 | — | — | Regression suite (existing) |
| P-14 | Long write transactions / lock contention risk for new writers | New writers will lock `trans_pinjaman`, `trans_simpanan`, member savings rows | design | Lock order: member → document header → lines; `innodb_lock_wait_timeout` capped per statement (existing `capLockWait`); transactions ≤ 15 s; no network/IO inside | — | — | Deadlock test with two concurrent approvals (TASK-136) |

### 3.1 Performance targets (PROPOSED — baselines first, PRD §6.1)

Baselines are measured on the staging copy before any claim (TASK-139); production numbers are never inferred from local ones.

| Operation | p50 | p95 | DB queries per request | Rows examined (max) | Error rate |
|---|---|---|---|---|---|
| Member list/search (first page) | ≤ 200 ms | ≤ 800 ms (UCKW:NFR003) | ≤ 3 | ≤ 10,000 | < 0.5% |
| Member detail (360) | ≤ 300 ms | ≤ 1 s | ≤ 8 | bounded by LIMIT | < 0.5% |
| Loan list | ≤ 250 ms | ≤ 800 ms | ≤ 3 | ≤ 35,000 header rows | < 0.5% |
| Loan detail incl. schedule | ≤ 150 ms (with P-01 index) | ≤ 500 ms | ≤ 4 | ≤ 400 schedule rows | < 0.5% |
| Dashboard summary | ≤ 500 ms | ≤ 1.5 s | ≤ 6 aggregates | capped | < 1% (degrade to "unavailable") |
| Search/filter | ≤ 300 ms | ≤ 1 s | ≤ 2 | — | < 0.5% |
| Create/update command | ≤ 300 ms | ≤ 1 s | ≤ 12 incl. locks/audit | single document | < 0.1% (excluding validation refusals) |
| Approval command | ≤ 500 ms | ≤ 2 s | ≤ 15 | one document (+ its lines) | < 0.1% |
| Payroll approval (batch) | ≤ 3 s | ≤ 10 s | chunked | batch members' instalments of one month | < 0.1% |
| Financial report (one period) | ≤ 800 ms | ≤ 2 s | ≤ 4 | period-bounded | < 1% |
| CSV export (≤ 50,000 rows) | stream starts ≤ 1 s | completes ≤ 30 s | streamed chunks | bounded | < 1% |

Correctness, transactional integrity and authorization take precedence over every target (PRD §6.1).
