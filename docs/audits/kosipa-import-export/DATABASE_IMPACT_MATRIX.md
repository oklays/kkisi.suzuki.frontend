# 05 — Database Impact Matrix

All tables are in the shared database `smart_kopkar`. KOSIPA, TOKO and the smartkkisi backend (`users`) all use it. Column types come from the 30 Oct 2026 copy (read-only `information_schema`). None of these financial tables has a foreign key; most have only a primary key (prior finding P-01). Stored procedures are not called by any import or export.

## 1. Imports: write impact

Legend: **I** insert, **U** update, **D** delete, **R** read for lookups.

| Feature | m_anggota | users (wallet) | m_simpanan_aktif | trans_simpanan | trans_simpanan_dtl | trans_hak_kewajiban | trans_pinjaman | trans_pinjaman_dtl | trans_potongan_matrix | trans_potongan_bulanan | trans_shu / _dtl | m_jenis_pinjaman |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| IMP-001/002 Members | I, R | | | | | | | | | | | |
| IMP-003/004 Limits | U (`limit_toko`, `gaji_minus`, `limit_ppob`), R | U (`wallet_balance`, `wallet_balance_ppob`), R | | | | | | | | | | |
| IMP-005/006 Savings lines | R | | I/U (`potongan_payroll`, `status`, period), only for PAYROLL | R (header) | I/U (`kredit` or `kredit_cash`, member, period) | | | | | | | |
| IMP-007 Deposits | R | | | I (`POSTING`) | I (`kredit_cash`) | | | | | | | |
| IMP-008 Withdrawals | R | | | I (`POSTING`, DEBIT) | I (`debit`, bank account) | | | | | | | |
| IMP-009 Exit settlement | R | | | | | I (`POSTING`, all hak/kewajiban columns), R | | | | | | |
| IMP-010 Deduction master | U (`sim_sukarela`; `sim_wajib` never, IE-ANO-014), R | | I/U | | | | | | | | | |
| IMP-011…015, 017 Loans | R | | | | | | I (APPROVED), U (`akhir_pinjaman`) | D + I (schedule) | | | | R |
| IMP-016 Gaji Minus | **U all rows** (`gaji_minus=0`), U per row (`gaji_minus`, `limit_ppob`), R | U (all previous gaji-minus members + per row) | | | | | I, U | D + I | | | | R |
| IMP-018 Matrix | R | | | | | | | | I/U (40 component columns) | R | | |
| IMP-019 Store bills | R | | | | | | | | I/U (`TOKO_TAMBUN` / `TOKO_MJ` / `TOKO_GIIC`) | | | |
| IMP-020 SHU | U (`bagian`, `lokasi`), R | | | | | | | | | | R / I, U | |
| IMP-021 SHU sukarela | U (`bagian`, `lokasi` → blank, IE-ANO-006), R | | | | | | | | | | R / I, U | |

### 1.1 Keys and derived fields

| Table | Primary key | Business key used by the import | Derived fields set by the import |
|---|---|---|---|
| `m_anggota` | `id` | `CONVERT(nik_kar, UNSIGNED)` (`nik_kar varchar(50)`, not unique; 3 canonical duplicates, ANO-K39) | `status_pot_pokok`, `status_pot_wajib` (amount ≠ 0), `status_pot_sukarela = 0` |
| `users` | `id` | `CONVERT(nik, UNSIGNED)` | `wallet_balance`, `wallet_balance_ppob` (`double(18,2)`) |
| `m_simpanan_aktif` | `id` | `(nik_kar, jenis_simpanan)`; NIK padded to 4 digits by IMP-010 | `periode_start`, `periode_end`, `status = 1` |
| `trans_simpanan` | `id` | `doc_no` from `get_no_trans_tarik()` (counter style; not traced) | `periode_bl/th` from the date |
| `trans_simpanan_dtl` | `id` | `(doc_no, nik_kar)` (`nik_kar varchar(10)`) | `start_date`, `finish_date` (end of the header month), `doc_no_dtl = doc_no + nik` |
| `trans_hak_kewajiban` | `id` | NIK (any existing row blocks the insert) | `total_hak`, `total_kewajiban`, `sisa_hak` |
| `trans_pinjaman` | `id` (`doc_no` not unique; 7 duplicate groups in the data copy) | none (new `doc_no` = `MAX`-based + `XLS`) | `biaya_admin`, `biaya_asuransi` (rupiah from %), `akhir_pinjaman`, ledger account codes copied from the product |
| `trans_pinjaman_dtl` | `id` | `doc_no` (DELETE all, INSERT schedule) | every instalment: `angsuran`, `pokok`, `bunga`, `jasa`, `sisa`, `status_cicilan = 'Belum Bayar'` |
| `trans_potongan_matrix` | `id` | `(periode = batch doc_no, nik_kar)`; `periode varchar(50)` | `doc_no_dtl = 'POT' + yyyymm + nik` (store import) |
| `trans_shu_dtl` | `id` | `(doc_no, CONVERT(nik_kar))` | `pembulatan_sukarela = round(x, -3)`, `pendapatan_shu`, and on update the header-copied totals (IE-ANO-007) |

Money columns are mixed types:
- `decimal(18,2)`: `trans_simpanan_dtl`, `trans_pinjaman.plan_pinjaman`;
- `decimal(18,4)`: matrix;
- `double(18,2)` and `double(18,0)`: `m_anggota`, `users`, `trans_shu_dtl`, `trans_hak_kewajiban`.

Imports write whatever text the cell held (IE-ANO-028 and the `sql_mode` note).

### 1.2 Financial, reporting and audit implications

| Feature | Balance / financial effect | Reports affected | Audit trail |
|---|---|---|---|
| IMP-005/006 | Credits a member's savings once the document is approved; PAYROLL changes next month's standing deduction | Savings movements, Resume Simpanan, member 360, H&K hak | `cd/ud` only on `m_simpanan_aktif`; lines have no creator |
| IMP-007/008 | Creates deposits and withdrawals that move balances when approved (bulk approval skips checks, ANO-K30) | same | `cd_usr` on the header |
| IMP-009 | Fixes the payout and offset amounts for exiting members (approval should deactivate the member: ANO-K31) | Exit reports, loans closed by offset | `cd_usr` |
| IMP-010 | Sets the deduction the payroll generator (`x_proc_create_matrix`) takes for each member | Payroll matrix, savings growth | `usr_cd`/`usr_ud` |
| IMP-011…017 | Creates receivables (principal and interest schedule), approved and disbursed; fees in rupiah; ledger account codes stored, but no journal is posted (ANO-K33) | Outstanding, Pencairan, Kartu Aktif, payroll deductions, H&K kewajiban, SHU jasa | `cd` only (no user on most loan imports) |
| IMP-016 | As loans, plus credit-limit and wallet resets for every member | Toko/PPOB spending capacity | none for the reset |
| IMP-003/004 | Store and PPOB spending capacity; resets wallet balances | Store sales on credit (TOKO) | none |
| IMP-018/019 | Payroll deduction amounts per member per component; approval settles loans and savings (ANO-K05, K47) | Payroll report, store reconciliation, loan repayment status | none on rows |
| IMP-020/021 | SHU allocation inputs and payout | SHU distribution | `cd_usr`/`ud_usr` |

## 2. Exports: data sources

| Export(s) | Base tables / views | Helper per row | Notes |
|---|---|---|---|
| EXP-004…010 loan lists | `trans_pinjaman` (+ `trans_pinjaman_dtl` for status, `m_anggota`) | some lists recompute and **write** `status_bayar` (ANO-K26/K50) | Product filter by `jenis_pinjaman` / `bank_pembiaya` |
| EXP-011 Pelunasan | `trans_pinjaman` settlement fields | — | |
| EXP-012 Kartu Aktif | `trans_pinjaman`, `trans_pinjaman_dtl` | — | |
| EXP-013, 015 Savings document lines | `trans_simpanan_dtl` | — | |
| EXP-014, 016 Withdrawal / deposit lists | `trans_simpanan` (+ sums of lines) | — | |
| EXP-017 H&K | `trans_hak_kewajiban` | — | |
| EXP-018 Deduction master | `m_simpanan_aktif` | — | |
| EXP-019 Matrix | `trans_potongan_matrix` | — | |
| EXP-020/021 SHU | `trans_shu`, `trans_shu_dtl` | — | |
| EXP-022/023 Members | `m_anggota` (+ bills) | — | Personal data |
| EXP-024 Member loans | `trans_pinjaman` | — | |
| EXP-025 Member store transactions | `db_sales` (TOKO tables, shared DB) | — | Store credit purchases; returns ignored elsewhere (ANO-X01) |
| EXP-026 Users Mobile | `users` | — | Mobile account data |
| EXP-027…030 Outstanding | `trans_pinjaman` | `get_outstanding_pinjaman()` reads `trans_pinjaman_dtl` once per loan | Not an official balance |
| EXP-031 Pencairan Reguler | `trans_pinjaman`, `trans_pinjaman_dtl` | — | |
| EXP-032 Resume Simpanan | `v_kartu_simpanan`, `trans_simpanan`, `trans_simpanan_dtl`, `m_simpanan_aktif`, `m_jenis_simpanan` | — | View definitions unknown (B1) |
| EXP-033…036 PPOB | PPOB sale, purchase and bill tables | — | Not traced per column (Partial) |

Reads do not change balances, except the loan-list status writes noted above.
