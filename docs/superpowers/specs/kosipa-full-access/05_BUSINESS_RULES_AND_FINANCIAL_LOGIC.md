# 05 — Business rules and financial logic

Each rule is compared four ways (PRD §5): **Legacy** (what the code does, with source), **Documented** (existing approved rules/decisions), **Reconstructed** (the domain rule we believe the business intends), **Proposed** (Next.js behaviour). Category per PRD §2.3: **A** keep equivalent · **B** implementation deficiency, fix without a business decision · **C** ambiguous/defective, needs an explicit decision (ID in [12](12_DECISION_REGISTER.md)).

No rule in this document introduces a new financial policy. Where the business has not decided, the proposal is the **safest blocking behaviour** (refuse/flag) until the decision exists.

## 1. Decision baseline (already approved — not re-opened)

| Ref | Decision | Source |
|---|---|---|
| OD-1 | Legacy PHP code is not modified; fixes are delivered as Next.js behaviour (16 Oct 2026) | [UCKW README](../unified-console-kosipa-warehouse/README.md) |
| OD-2 | `x_proc_create_matrix` is not modified; a Next.js replacement generator must net Kredit returns (UCKW:MIG004) | UCKW requirements |
| OD-3 | Kredit returns are recorded only in `db_salesreturn`; payroll deduction for month M uses TOKO Kredit of month M−1 net of returns of those sales; finalised deductions never change | memory `sales-return-design`, domain `store-credit.ts` |
| OD-4 | Production DB users/grants/schema change only through reviewed SQL run by the operator; one least-privilege writer account per feature | memory `production-db-changes-manual-only` |
| OD-5 | KOSIPA export grant = operator allow-list (E1 decision, checkpoint 12) | UCKW decision register |
| OD-6 | Money in Next.js is exact (integer sen / decimal strings / BigInt); display per `docs/refactor/CURRENCY_STANDARD.md`; KOSIPA payroll amounts keep 1/10,000 precision (amount4) | currency standard |
| UCKW:BR001–BR013 | Single writer per context; KOSIPA cooperative-wide; integer money; Σ principal = principal; deduction ratio configurable (D1); payroll window M−1; withdrawal availability (D2); maker-checker; immutability after approval; canonical NIK; returns net; contract expiry (D3); Gudang receipts | [UCKW requirements](../unified-console-kosipa-warehouse/requirements.md) |

Open owner decisions inherited: D1 (deduction ratio), D2 (withdrawable types/minimum), D3 (expiry source), D4 (short payroll allocation), D6 (loan rule authority), B1 (view/procedure bodies).

## 2. Rule catalogue

### R-01 Money representation and rounding — Category B
- **Legacy:** amounts parsed by stripping commas; float arithmetic in PHP (`($plan_pinjaman*$biaya_admin_persen)/100`, `pinjaman_c.php:1052-1060`), float schedule maths (`get_bungan_*`), SHU `round(x, -3)`. Columns: `decimal(18,2)` (loans, savings), `decimal(18,4)` (payroll matrix), **`double(18,2)`** (`m_simpanan_aktif.potongan_payroll`, `trans_shu_dtl.jasa_simpanan`) (E1-data). 1,102,908 of 1,198,697 instalment rows hold a non-integer rupiah principal (E1-data).
- **Documented:** UCKW:BR003 integer rupiah/Decimal, no float; OD-6.
- **Reconstructed:** amounts are rupiah with at most the column's scale; rounding happens only at defined points.
- **Proposed:** domain works in integer sen (`decimal(18,2)` columns) or amount4 (`decimal(18,4)`); writes quantise to the column scale with **half-up** at exactly the points named in each rule; a `double` column is written from an exact decimal string and read back for verification (VAL-110). Totals are always computed from the stored line values (Σ lines = header), never re-derived separately.

### R-02 Document numbers — Category B
- **Legacy:** `PIN` + `YYYY` + `MM` + `str_pad(MAX(id of rows created this month)+1, 5)` (`pinjaman_m.php:551-573`); same pattern for savings/journals (`max(id)+1`). The sequence is the global AUTO_INCREMENT, so numbers jump; the six most common `doc_no` lengths are 14–21 characters (E1-data), i.e. formats from several eras coexist; 7 duplicate `doc_no` groups (15 loans) exist (E1-data).
- **Documented:** UCKW:REQ035 numbering under lock.
- **Reconstructed:** human-readable, unique per document type, prefix+period identifies the month.
- **Proposed:** keep the visible format `PREFIX + YYYY + MM + n` (consumers parse only prefix/period — to be confirmed by characterization, TASK-104) with `n` = next number for prefix×period, allocated inside the write transaction under a named lock and verified unique before insert (BR-116). Unique index on `doc_no` is a separate DDL decision (FD-02); until then uniqueness is enforced by the lock + check.

### R-03 Flat loan schedule — Category C (D6)
- **Legacy:** header amounts come from view `v_trans_pinjaman_flat` (definition Unknown, B1), then overwritten by `v_trans_pinjaman_anuitas` (`ANO-K07`). Schedule rows: `pokok = plan_pinjaman / plan_jangka_waktu` (float), each row stores the view's `angsuran`, `angsuran_plus_jasa`, `biaya_suku_bunga`, `jasa_pinjaman` (`pinjaman_c.php:573-620`).
- **Example (reproducible):** principal Rp10,000,000, 3 months → legacy per-row principal `3333333.3333…` stored as `3,333,333.33` ×3 = **Rp9,999,999.99** (Σ ≠ principal by Rp0.01). The 30 Sep copy shows Σ principal within Rp1 for 31,077 of 31,081 disbursed loans (E1-data), i.e. the view-driven amounts mostly hide the split error, but not always (4 loans differ ≥ Rp1).
- **Reconstructed:** flat interest per month = principal × monthly rate; principal split evenly; last instalment absorbs rounding.
- **Proposed:** `loanSchedule({method:'Flat'})` (existing domain) — same example with unit Rp1: `3,333,333 / 3,333,333 / 3,333,334`, interest `100,000` each at 1%, Σ principal **exactly Rp10,000,000**. Enabled for writes only after parity with the production view definitions (D6, B1).

### R-04 Annuity loan schedule — Category B (formula) + C (D6 authority)
- **Legacy:** monthly rate `r = biaya_suku_bunga/100`; `A = P·r / (1 − (1+r)^−n)`; interest = remaining × r; principal = A − interest; rows inserted only while remaining > 0 (`pinjaman_c.php:653-720`). Float throughout; values stored to 2 decimals by the column.
- **Example (reproducible, PHP double semantics re-run in Python):** P = Rp12,000,000, n = 12, r = 1%: A = 1,066,185.46414…; row 1 interest 120,000.00, principal 946,185.46; row 12 principal 1,055,629.17. Remaining after row 12 = +1.49e-8 → row kept.
  Counter-example: P = Rp10,000,000, n = 24, r = 1.5% → remaining after row 24 is a tiny **negative** float → **row 24 is not inserted**; schedule has 23 rows and Σ principal Rp9,508,136.93 (`ANO-K24`). Over a grid of 5,346 parameter sets (P Rp1–50 M step 0.5 M, n ∈ {3..60}, r ∈ {0.5..2%}) the last row is dropped in **2,673** cases.
  Data check: all 638 annuity loans on the 30 Sep copy have complete schedules with Σ principal = principal (E1-data) → the stored schedules were not produced by this loop with dropping parameters (they may come from the view path or another tool). Defect is **confirmed in code, not observed in data**.
- **Documented:** UCKW:BR004 PMT with interest on remaining principal; Σ principal = principal.
- **Proposed:** `loanSchedule({method:'Anuitas'})` with exact BigInt maths, half-up to Rp1, last row absorbs: same P/n/r gives payment Rp1,066,185, row 1 = 946,185 principal + 120,000 interest, row 12 = 1,055,635 + 10,556, total interest Rp794,226, Σ principal exactly Rp12,000,000; the 24-month case yields all 24 rows (last principal Rp491,862).

### R-05 Instalment due dates — Category C (FD-04)
- **Legacy:** first due month = `awal_pinjaman` month; date string `YYYY-M-tgl_tempo`; flat uses `strtotime` (Feb 31 → Mar 3), annuity uses `date("Y-m-".$t_tempo, …)` (Feb 31 → "2026-03-31"). Either way a tempo day 29–31 yields two instalments in one month and none in another (`ANO-K25`).
- **Data:** `tgl_tempo = 10` for all 32,631 loans (E1-data) → defect latent today. 328 loan-months nevertheless contain two instalment rows (cause not attributed; checked in TASK-104).
- **Proposed:** due day d → `min(d, last day of month)`; one instalment per calendar month; validation rejects tempo outside 1–31 (FD-04 confirms the clamp rule).

### R-06 Instalment status at schedule creation — Category C (FD-06)
- **Legacy:** every instalment with due date ≤ today is written `Bayar` (paid) at generation (`pinjaman_c.php:609`, `706`); regeneration happens on every loan edit, so payment state is recomputed from the calendar, and real payroll/settlement marks are erased (`ANO-K22`, `ANO-K23`).
- **Data:** 24,027 instalments are `Bayar` with no payment type; 6,696 of them are due after the snapshot date (E1-data).
- **Reconstructed:** an instalment is paid only when a payment event (payroll deduction, settlement, cash) covers it.
- **Proposed:** schedules are generated **once** at disbursement with every row `Belum Bayar`; status changes only through settlement commands that record the type (`PAYROLL`, `LUNAS DIPERCEPAT`, `LUNAS RESIGN`, `LUNAS PENSIUN`, `ROLLOVER`, plus `MANUAL` if FD-06 approves back-dated loans). Back-dated disbursement with past instalments requires an explicit "opening paid count" entered by the checker (FD-06).

### R-07 Loan fully paid (LUNAS) — Category C (FD-05)
- **Legacy:** LUNAS iff the **last** instalment row (max id) is `Bayar` (list refresh, `gaji_minus_c.php:166-175`); payroll approval uses "paid row with `sisa_cicilan = 0`"; settlement sets LUNAS from client flag. Status is written lazily when someone opens a list (`ANO-K26`).
- **Data:** 212 approved+disbursed loans are `BELUM LUNAS` though every instalment is `Bayar` (E1-data).
- **Proposed:** LUNAS iff every instalment is paid (domain `loansFullyPaid`); computed in the read model at query time and **persisted only by the command that pays the last instalment** (same transaction). The column is kept in sync for legacy consumers.

### R-08 Disbursement amounts — Category A (formula) + B (arithmetic)
- **Legacy:** `biaya_admin = plan × admin% / 100`; `biaya_asuransi = plan × asuransi% / 100`; `total_potongan = blokir_1angsuran + admin + asuransi + total_roll_over + total_pinalty + biaya_pinalty` (`pinjaman_c.php:1065-1076`); `total_diterima` from `v_trans_pinjaman_anuitas` (Unknown).
- **Example:** plan Rp10,000,000, admin 1%, insurance 0.5%, first-instalment block Rp950,000, rollover Rp2,000,000, no penalty → `total_potongan` = 950,000 + 100,000 + 50,000 + 2,000,000 = **Rp3,100,000**; reconstructed net received = plan − total_potongan = **Rp6,900,000** (E1-inferred, to be proven against the view, B1).
- **Proposed:** same formula, exact decimal, half-up to Rp1 per fee component; `total_diterima` computed by the same domain function and checked against the view in parity mode.

### R-09 Deduction-to-salary ratio — Category C (D1, existing)
- **Legacy:** 70% of `gaji` displayed only (`ANO-K11`).
- **Proposed:** `evaluateDeductionRatio` (existing): e.g. salary Rp5,000,000, existing deductions Rp2,000,000, new instalment Rp1,800,000, ratio 70% → limit Rp3,500,000, projected Rp3,800,000 → `needs-override`. Blocking vs override per D1; never silent auto-approve.

### R-10 Rollover (new loan settles old loans) — Category B + C (FD-11)
- **Legacy:** operator picks old loans; browser sends `sisa_pinjaman`/`sisa_cicilan`; on disbursement/approval old loans → LUNAS and **all** their instalments `Bayar` without type (`ANO-K46`).
- **Proposed:** remaining amount computed server-side from unpaid instalments at the disbursement date (principal only, or principal + current interest per FD-11); old loans settled in the same transaction as the new disbursement, instalments marked `ROLLOVER` with the settling document reference; netting amount shown to the checker.

### R-11 Early settlement (pelunasan) and over-kredit — Category C (FD-11)
- **Legacy:** payoff principal/admin/penalty/total typed or computed in the browser; no approval; instalments from the first day of the chosen month → `Bayar`, type = remark (`LUNAS DIPERCEPAT`, `LUNAS RESIGN`, `LUNAS PENSIUN`; 10,531 such rows E1-data); over-kredit is a copy setting `rool_over=1`.
- **Proposed:** settlement document (OPEN → APPROVED by checker) with server-computed payoff = Σ unpaid principal from the cut-off month + admin + penalty per product configuration (FD-11 fixes the formula); settles instalments atomically; undo = reversal document (R-17), not a field flip.

### R-12 Payroll TOKO window and returns — Category A (OD-2, OD-3)
- **Legacy:** `process_simulasi` passes month M−1 (`matrix_c.php:876-905`); procedure ignores returns.
- **Proposed:** `payrollStoreWindow(2026, 1)` → `2025-12-01 … 2026-01-01` (existing); obligations via `storeObligations` net of returns of those sales only.

### R-13 Payroll settlement scope — Category B + C (D4)
- **Legacy:** approving one `kd_group` batch marks every unpaid instalment of the month for all members (`ANO-K05`).
- **Proposed:** `planPayrollSettlement` (existing): only members in this batch whose deduction covers what is due; shortfalls and deductions without dues become exceptions for review (D4 decides allocation; until then nothing is allocated).

### R-14 Savings balance — Category C (B1, D2)
- **Legacy:** balances come from views `v_kartu_simpanan`, `v_saldo_awal`, `v_trans_simpanan_*` (Unknown); lines carry `kredit` (payroll), `kredit_cash` (cash/transfer), `debit` (withdrawal), `jasa`; `trans_simpanan_saldo` rows for non-core types.
- **Reconstructed (E1-inferred from columns):** balance per member×type = Σ(`kredit` + `kredit_cash`) − Σ `debit` of APPROVED lines (+ opening "SALDO AWAL" documents). Header/line status divergence (`ANO-K34`) means "APPROVED" must be defined (FD-12).
- **Proposed:** `savingsPosition` (existing): posted = approved credits − approved debits; available = posted − pending debits. Official numbers only after view parity (B1).

### R-15 Withdrawal — Category B + C (D2)
- **Legacy:** checks a client-sent balance at line entry only (`ANO-K04`).
- **Proposed:** `assertWithdrawal` with server balance, re-checked at approval under a row lock on the member's savings position; policy per type from D2; until D2 nothing is withdrawable.

### R-16 Exit settlement (Hak & Kewajiban) — Category B + C (FD-13)
- **Legacy:** hak = savings (pokok/wajib/sukarela), kewajiban = loans + store Kredit (`SUM(db_sales.grand_total)`, no returns, `ANO-X01`) + PPOB wallet orders — amounts entered/uploaded; approval should deactivate the member and zero limits but fails on `nik_kat` (`ANO-K31`); no payout or loan settlement documents.
- **Proposed:** server computes hak and kewajiban (R-14, R-07, R-12) at a cut-off date; approval atomically (1) settles loans (type `LUNAS RESIGN`/`LUNAS PENSIUN`), (2) creates the withdrawal of the net savings, (3) deactivates the member, zeroes limits, revokes mobile tokens (BR-110). Whether the cooperative nets kewajiban against hak automatically is FD-13.

### R-17 Corrections — Category C (FD-09, FD-14)
- **Legacy:** none; delete or edit after approval.
- **Proposed:** approved documents are immutable (UCKW:BR009); a reversal document references the original, carries a reason, needs a checker, and writes compensating lines (negative effect) in the same tables so legacy reports stay consistent; original rows are never deleted.

### R-18 SHU allocation — Category B + C (FD-10)
- **Legacy:** `jasa_simpanan = simpanan_i / total_simpanan × pool_simpanan`, same for usaha; `total_shu_pembulatan = round(total, −3)`; `pendapatan_shu = rounded + pembulatan_sukarela` (`shu_c.php:720-760`). No zero guard; Σ ≠ pool.
- **Example:** pool Rp1,000,000, three equal members → legacy 333,333.33 each → rounded **333,000 ×3 = Rp999,000** (Rp1,000 unallocated). Proposed `allocateShu(unit Rp1,000)` → **334,000 / 333,000 / 333,000 = Rp1,000,000**, remainder 0.
- **Open:** what "process" means financially (credit to savings? cash payout?) — FD-10. Legacy only flips status.

### R-19 Member status and eligibility — Category A
- Status values `AKTIVE`, `LUAR BIASA`, `KONTRAK`, `RESIGN`, `PENSIUN`; groups `ANGGOTA`, `NON ANGGOTA`, `BMP`, `KOPERASI` (E1-data). ≈1,400 rows hold amounts in `status_anggota`/`kd_group` (`ANO-K38`). Eligibility = `evaluateMemberEligibility` (existing). Contract expiry handling = D3.

### R-20 Credit limits — Category A + B (FD-08)
- `limit_toko`, `limit_ppob`, `gaji_minus` on `m_anggota` drive TOKO Kredit; legacy mirrors them into smartkkisi `users.wallet_balance`/`wallet_balance_ppob`. On non-AKTIVE status legacy zeroes then re-sets wallets (`ANO-K32`).
- **Proposed:** limits changed only by the limit command (single or validated batch with preview); deactivation zeroes limits and wallet mirror once; the wallet mirror write is a defined contract with smartkkisi (FD-08).

### R-21 Dates and time zone — Category A
- Business date = Asia/Jakarta (UTC+7; TOKO code uses Asia/Bangkok, same offset). `doc_date` is user-chosen (back-dating allowed in legacy without limit); `tgl_cair` = payout date; `periode_bl/th` = payroll period.
- **Proposed:** `doc_date` may not be in the future; back-dating limit per document type (FD-14); approval timestamp recorded separately.

### R-22 Period closing — Category C (FD-15)
- **Legacy:** none. **Proposed:** none introduced silently. Payroll batches already act as a soft period lock once APPROVED (documents of that period that would change approved deductions are refused). A general closing feature is out of scope until FD-15.

### R-23 Interest rate semantics — Category C (D6)
- `biaya_suku_bunga` is `varchar(50)`; annuity loans use 1.60 (635), 0.92 (2), 1.33 (1) (E1-data). Annuity code treats it as monthly %. Flat semantics depend on the view (Unknown). Proposed: store as given, parse as exact decimal monthly % (VAL-104); reject non-numeric.

## 3. Defects found, mapped to the PRD §5 checklist

| PRD item | Finding | Ref |
|---|---|---|
| Off-by-one calculations | Annuity last instalment dropped; day-overflow month duplication | `ANO-K24`, `ANO-K25` |
| Floating-point errors | All schedule/fee/SHU maths in float; 1.1 M fractional rows | R-01 |
| Inconsistent rounding | 2-dp column rounding vs `round(-3)` SHU vs none | R-01, R-18 |
| Missing validation | Client balances, client status, client payoff | `ANO-K03`, `ANO-K04`, `ANO-K29` |
| Duplicated calculations | PHP simulation vs SQL views (two sources) | `ANO-K08` |
| Non-atomic balance updates | No transactions in any approval | 02 §5 |
| Incorrect transaction ordering | Header APPROVED before dependent updates (exit settlement fails after) | `ANO-K31` |
| Unexpected negative balances | Parallel withdrawals possible | `ANO-K04` |
| Duplicate instalment postings | Rebuild + auto-Bayar; payroll approval re-run | `ANO-K22`, `ANO-K23`, `ANO-K47` |
| Incorrect status transitions | Any status from client; LUNAS from last row | `ANO-K03`, `ANO-K26` |
| Orphaned financial records | 33,136 schedule rows without header; member hard delete | `ANO-K28` |
| Missing reversal relationships | No reversal concept | R-17 |

## 4. Delete semantics (PRD §5.1)

| Legacy delete | Real meaning | Proposed operation | Allowed when | Permission | Confirmation |
|---|---|---|---|---|---|
| Delete savings/withdrawal/deposit line or document (F12–F16) | OPEN: discard draft · APPROVED: void a posted movement | OPEN → `cancel` (row kept, status CANCELLED) or hard delete of a DRAFT never submitted · APPROVED → `reverse` document | cancel: maker or checker while OPEN · reverse: checker, reason | `kosipa.savings.cancel` / `kosipa.savings.reverse` | dialog with document summary; reverse requires typed reason |
| Delete loan / bulk delete (F27) | OPEN: withdraw application · APPROVED not disbursed: void approval · disbursed: reverse disbursement | `cancel` / `void` / `reverse` (instalment rows kept, marked via reversal) | void before disbursement; reverse only same period and no payroll settled (FD-14) | `kosipa.loan.cancel` / `.reverse` | as above |
| Delete loan document attachment (F28) | remove supporting file | soft delete (flag) while loan OPEN | loan OPEN | `kosipa.loan.update` | simple confirm |
| Delete rollover link (F29) | edit draft netting | allowed only while new loan OPEN | OPEN | `kosipa.loan.update` | simple |
| Undo early settlement (F33 `ajax_delete`) | reverse a posted settlement | reversal document | checker, reason | `kosipa.loan.reverse` | typed reason |
| Delete payroll batch / lines (F37/F39) | discard a draft batch | allowed while OPEN; APPROVED batch immutable | OPEN | `kosipa.payroll.update` | confirm with line count |
| Delete exit settlement (F19) | discard draft | OPEN only | OPEN | `kosipa.exit.update` | simple |
| Delete SHU / lines (F44) | discard draft distribution | OPEN only | OPEN | `kosipa.shu.update` | confirm |
| Delete member (F04) | remove a person | **deactivate** (status + limits + tokens); hard delete only for a member with no history at all, by an administrator (FD-07) | no rows in any `trans_*`/`db_sales` | `kosipa.member.deactivate` | typed NIK |
| Delete master record (F52) | remove configuration | deactivate (`status=0`); hard delete only if unreferenced | unreferenced | `kosipa.master.manage` | shows reference count |
| Delete mobile request (F45–F47) | reject/cancel request | `reject` with reason (request row kept) | OPEN | `kosipa.mobile.decide` | reason |

## 5. Financial invariants (enforced in domain + verified in tests)

| ID | Invariant |
|---|---|
| INV-01 | Σ schedule principal = loan principal; Σ schedule totals = Σ principal + Σ interest |
| INV-02 | Exactly one instalment per calendar month per loan |
| INV-03 | An instalment is paid at most once and only by a recorded settlement event |
| INV-04 | Loan LUNAS ⇔ all instalments paid |
| INV-05 | Savings available balance never below the type minimum after any approved withdrawal |
| INV-06 | Header total = Σ line amounts for every document written by Next.js |
| INV-07 | Payroll approval settles only instalments of members present in that batch |
| INV-08 | Approved/disbursed/posted documents are never updated except by state transitions recorded in the audit; never deleted |
| INV-09 | Every reversal references exactly one original and nets it to zero |
| INV-10 | SHU Σ allocations = pool − reported remainder; remainder < allocation unit |
| INV-11 | Store obligation for period M = Kredit sales of M−1 − returns of those sales ≥ 0 |
| INV-12 | Document numbers unique per type (verified by query before commit) |
