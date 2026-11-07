# FA-03C T07 — voluntary-savings deposits (Setor Simpanan), first native financial command

Date: 2026-11-07. Branch `feat/kosipa-remaining-masters`. **Synthetic stack only**; not merged to master, not enabled on the local production copy, nothing on production. Scope: REQ-114 (first slice), F15, WP-07; decisions FD-35, FD-36, FD-37 (owner, 7 Nov 2026) and the FD-12 evidence recorded in the decision register.

## Legacy contract reproduced (simpanan/sim_setor_c, sim_setor_m)

- One document per member: header `trans_simpanan` with `doc_type = KREDIT`, `jenis_transaksi = CASH/TRANSFER`, `jenis_simpanan = SIMPANAN SUKARELA` (the legacy form offers only this product), `payment_type` CASH/TRANSFER, `doc_status = POSTING`, `periode_bl/th` and `start/finish_date` from the document date; one line `trans_simpanan_dtl` with `kredit_cash = amount`, member NIK/name/group, sender bank fields for transfers, `doc_no_dtl = doc_no + NIK`.
- Number: legacy `TFCSH` + YYYYMM + RIGHT(last CASH/TRANSFER id, 5) + 1. Native: `TFCSH` + Jakarta YYYYMM + the new header id, claimed in the append-only registry (scheme `savings-cash-transfer`, row-id; FD-23 pending like KAS/PIN).
- Approval: header and lines `APPROVED`. Every captured production balance view (`v_kartu_simpanan`, `v_trans_simpanan_total`, `…_outstanding`, `…_kas_new`, `v_mobile_simpanan_sukarela`) counts header `APPROVED` and sums `kredit + kredit_cash − debit`; proven by replaying the production SELECT of `v_kartu_simpanan` / `v_trans_simpanan_total` against native rows.

## Integrity corrections (not new policy)

Explicit values for the NOT NULL columns legacy filled only under non-strict SQL mode (`is_mobile`, `saldo_awal_penarikan`, line `saldo` = 0); header and line in the SAME status from creation (REQ-114); line `tgl_cair` = approval date (REQ-114; legacy bulk approval left it empty, ANO-K30); one transaction for header, number, line and ledger; amount exact (VAL-103), never coerced; member identity and amount come only from the server-side lookup and validated input (SEC-109); optimistic version over every header and line column (a legacy edit makes a held decision STALE); no delete (FD-37).

## Owner decisions applied

- **FD-35** maker ≠ checker: `kosipa.savings.prepare` creates, a DIFFERENT person with `kosipa.savings.approve` approves; the maker is the actor of the `savings.deposit.create` ledger row. Legacy-created documents (no native maker) may be approved (FD-17 c).
- **FD-36** document date within the current Jakarta month and not after today.
- **FD-37** a pending deposit is cancelled by rejection with a mandatory reason; rows stay as `REJECTED`, never counted.

## Implementer decisions (owner review requested)

1. A member who has left (`RESIGN` / `PENSIUN`) cannot receive a deposit (exit settlement owns their savings). Legacy did not check.
2. A NIK longer than the line's VARCHAR(10) is refused, never truncated; an ambiguous NIK alias (two members) is not resolved by the form.
3. `no_anggota` is not written on the line (legacy parity; the member number can exceed its VARCHAR(10)).
4. Rejection is available to any holder of `kosipa.savings.approve`, including the maker (a maker cannot approve, but may cancel a typo by rejecting with a reason). Creating needs `prepare`; the screen shows the maker's own pending rows as "Menunggu petugas lain".
5. Own writer account `kosipa_savings_w`, flag `KOSIPA_SAVINGS_WRITES_ENABLED`, feature `savings.deposit` fenced against `simpanan/sim_setor_c` only. **Competing writer:** legacy `simpanan/simpanan_c` (Data Simpanan) can still change any `trans_simpanan` row; it must be fenced at the savings cutover (all savings controllers), not by this slice.

## Delivered

Domain `savings-deposit.ts` (+ `TFCSH` scheme), application `commands/savings-deposit.ts` (create / approve / reject / list / member lookup), repository `kosipa-savings-deposit.repository.ts`, writer config `prisma-kosipa-savings-write.ts`, grants `db/kosipa/007_savings_writer_grants.sql.tpl` + review-only `docs/migration/sql/kosipa-savings-writer-production.sql`, HTTP `/api/kosipa/savings/deposits[/member|/:id/approve|reject]`, console page `/console/kosipa/simpanan/setoran` (navigation "Setoran simpanan"; mform form with server member lookup and CurrencyInput; FinancialTable list with status/month filter; approve with explicit confirmation, reject with reason), `prepare` / `approve` made grantable, staging script extended (`kosipa_savings_w`, 007, flags; `--seed-grants` adds prepare/approve).

## Evidence (7 Nov 2026, synthetic stack)

Domain 5 (RED 0/5 first) + application 3; DB 4/4 (legacy-shaped rows, registry claim, maker in the ledger, FD-35 refusal, approval visible in the production `v_kartu_simpanan` definition, replay, immutability, rejection kept and not counted, STALE after a legacy edit, FD-36 dates, unknown member, cash with bank details refused, rollback, LEGACY_ACTIVE, no DELETE/amount/date UPDATE privilege, production guard); browser D1–D5 (navigation, read-only viewer, two-administrator grants, maker lookup error, pending deposit not approvable by its maker, checker approval with confirmation, rejection with reason, status filter, legacy re-enabled notice, 375/768/1440). Regression: product P1–P8, member E1–E8, master E1–E9 browser suites; DB/HTTP/console 196 pass, 0 fail, 3 skipped; unit 592 pass, 4 todo; typecheck clean; lint 0 errors.

## Not in this slice

Payroll savings documents, opening balances ("SALDO AWAL"), other savings products, `trans_simpanan_saldo` rows (legacy writes them only on the simpanan_c path for non-core products), withdrawals (**D2 open**), reversals (FD-12/FD-14), the mobile channel, printing a receipt. Production activation and owner UAT.
