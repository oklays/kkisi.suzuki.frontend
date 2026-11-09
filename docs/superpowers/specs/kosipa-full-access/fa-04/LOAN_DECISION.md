# FA-04 — Loan decision (Posting / Setujui / Tolak)

Date: 9 November 2026. Scope: REQ-119 and the decision part of WI-14 (TASK-123). Legacy function F26 (`ajax_posting/{doc_no}` in seven loan product controllers). Disbursement (WI-15), cancel/void (REQ-123) and bulk "Approve All" are **not** part of this slice.

## 1. Flow

| Step | Who (capability) | From → to | What is written |
|---|---|---|---|
| Posting | staff (`kosipa.loan.prepare`) | `OPEN` → `POSTING` | `doc_status`, `posting_doc`, `posting_doc_usr`, `ud`, `ud_usr` |
| Setujui | another officer (`kosipa.loan.approve`) | `OPEN` / `POSTING` → `APPROVED` | `doc_status`, `approved_doc`, `approved_doc_usr`, `ud`, `ud_usr` |
| Tolak | another officer (`kosipa.loan.approve`) | `OPEN` / `POSTING` → `REJECTED` | as above with `rejected_doc(_usr)` + `keterangan_riject` (reason 5–200 characters) |

- A mobile loan (stored `trans_pinjaman.pengajuan_mobile = 1`) also updates its ONE `trans_pinjaman_pengajuan` row: `doc_status` (+ `keterangan_riject` on reject), so the member sees the decision.
- `APPROVED` and `REJECTED` are final. Disbursement stays a separate step (still legacy, see §6).
- Every command runs in one transaction with a command-ledger row holding the maker (native poster) and the checker; the console audit records `kosipa.loan.post|approve|reject`.
- Screens: the decision panel on `/console/kosipa/pinjaman/[docNo]`, and the list filter **Menunggu keputusan** (`?status=MENUNGGU_KEPUTUSAN` = OPEN + POSTING) on `/console/kosipa/pinjaman/daftar`.
- API: `GET /api/kosipa/loans/[docNo]/decision` (state, version, allowed actions + blockers), `POST /api/kosipa/loans/[docNo]/decision/post|approve|reject` (`{ idempotencyKey, expectedVersion, reason? }`, CSRF).

## 2. Legacy defects corrected

| # | Legacy behaviour | Effect on data | Native rule |
|---|---|---|---|
| 1 | Server accepted any `doc_status` from the request (ANO-K03), from any state | Re-approval, approve after reject, statuses outside the vocabulary | Server-side transitions only; decided documents immutable |
| 2 | Approver overwrote `cd_usr` (ANO-K27) | The print labels `cd_usr` **"Dibuat"**: the approver appeared as the maker; maker/checker unprovable | `cd_usr` never touched (not even granted); decision in the unused stamp columns + ledger |
| 3 | `kasbon_c` reject never sent `ket_rejected` | Rejected kasbon without a reason, also on the member's mobile request | Reason mandatory (5–200), stored on loan and request |
| 4 | Approval settled every roll-over old loan (`LUNAS`, all instalments `Bayar`) | Old loans closed for a new loan that may never be disbursed (or is rejected later); disbursement settles them again anyway | Approval never touches roll-over links, old loans or instalments (REQ-120 places this at disbursement) |
| 5 | `UPDATE ... WHERE doc_no` | 7 doc numbers carry two headers: both changed | `LOAN_DUPLICATE_HEADER`: refused until cleaned |
| 6 | Mobile sync driven by a hidden form field | A forged/missing flag skipped or forced the request update | Driven by the stored flag; more than one request → `LOAN_MOBILE_REQUEST_CONFLICT` |
| 7 | PPOB pay-later kasbon decided like any loan | `orders` / IAK state out of sync with the loan | `LOAN_PPOB_ORDER`: decide in the PPOB module |
| 8 | No state checks | Approving a loan already recorded as disbursed or LUNAS | `LOAN_STATE_INCONSISTENT` |
| 9 | No member/amount checks | Approval for a RESIGN/PENSIUN member, unknown or duplicate NIK, zero principal | Approve refused (`LOAN_MEMBER_INACTIVE` / `_NOT_FOUND` / `_AMBIGUOUS`, `LOAN_AMOUNT_INVALID`); reject stays possible |
| 10 | `pembiayaan_c` approval also wrote disbursement fields from the request | Disbursement without its own control | A decision never writes disbursement columns |
| 11 | No concurrency control, no transaction | Two officers could decide one loan; partial writes | Row locks + optimistic version (`STALE`), guarded UPDATE, one transaction incl. the mobile request |

Also found and handled while building: legacy can reuse a deleted loan's number (`get_no_save`), so the native poster is matched on number **and** row id.

## 3. Database

- Writer `kosipa_loan_w` (`apps/web/db/kosipa/008_loan_writer_grants.sql.tpl`; production review-only: `docs/migration/sql/kosipa-loan-writer-production.sql`). Column-level UPDATE only on the columns above; no INSERT/DELETE; no access to `trans_pinjaman_dtl` / `trans_pinjaman_rollover`.
- No DDL. `trans_pinjaman` and `trans_pinjaman_pengajuan` have no `doc_no` index: ids are found with a consistent read, then only those rows are locked by primary key.

## 4. Configuration

`DATABASE_URL_KOSIPA_LOAN_WRITE` (pool ≤ 2, own account), `KOSIPA_LOAN_WRITES_ENABLED=true`, `KOSIPA_WRITE_OWNERSHIP += loan.decision`, grants `kosipa.loan.prepare` / `kosipa.loan.approve` via Pengaturan → Akses KOSIPA (two administrators). The shared writer guard still refuses production.

## 5. Verification (synthetic stack)

- `packages/domain/tests/kosipa-loan-decision.test.mjs` (9), `packages/application/tests/kosipa-loan-decision-command.test.mjs` (4).
- `apps/web/tests/kosipa-loan-decision-db.test.mjs` (11, real MariaDB + least-privilege account): post/approve/reject, maker≠checker, replay, stale, mobile sync, roll-over untouched, every fail-closed case, fence, injected-failure rollback, concurrent approve vs reject, privilege denials, reused number. `KOSIPA_FA01=1 node --experimental-strip-types --test --test-concurrency=1 tests/kosipa-loan-decision-db.test.mjs`.
- `apps/web/tests/kosipa-loan-decision-browser.mjs` (L1–L7 on :3230, 375/768/1440 without overflow).

## 6. Fence scope — owner decision (9 Nov 2026): coexistence during UAT

The KOSIPA console is still in UAT and not used by the board, so the owner chose to run the native decision **alongside** the legacy loan screens: legacy keeps application, editing, mobile conversion and disbursement.

- `KOSIPA_LOAN_DECISION_LEGACY_SHARED=true` (only exactly "true") skips the `ref_menu` fence for `loan.decision`: the command no longer requires the eight controllers to be off, the panel shows a "Mode bersama (UAT)" warning, and `apps/web/scripts/setup-kosipa-staging-write.mjs` does not fence them (default; `--loan-fence` = strict). The synthetic stack and every other environment stay strict unless the flag is set.
- What still protects native decisions: row locks, the optimistic version (a legacy change after the page was read → `STALE`), the guarded status UPDATE and one transaction.
- Accepted UAT risk: legacy writes blindly, so a legacy page opened BEFORE a native decision can still overwrite it (e.g. reject an approved loan; legacy re-approval also re-runs its early roll-over settlement). Decide each document in one application only and reload legacy pages.
- Before production cutover: unset the flag (strict fence) or record a new owner decision.

## 7. Related fix — Master Pinjaman Mobile fenced the wrong screen

`master.pinjaman_mobile` (commit 75efd4dd) named `mobile/pinjaman_mobile_c` as its legacy controller. No legacy KOSIPA screen writes `m_pinjaman_mobile`; that controller only READS it for a dropdown and is the screen that turns mobile requests into loans. Fencing it would have closed legacy mobile-loan processing without protecting anything. The definition now carries `legacyWriter: false`: nothing is fenced for it (feature `legacyControllers: []`, the fence generator prints "nothing to fence"), and the master command runs without the fence check.

The synthetic stack also lacked `m_pinjaman_mobile` and `trans_pinjaman_pengajuan`, so the master writer grants from 75efd4dd could not be applied there; that was the cause of the `kosipa-product-masters-db` failure ("legacy root 2 (bank)", a raw P2010). Both tables are now fixtures and `setup` re-applies the master writer grants: the suite passes.
