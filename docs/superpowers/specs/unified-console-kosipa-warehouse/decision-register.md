# Decision & Blocker Register — `unified-console-kosipa-warehouse`

Maintained by engineering; updated at each checkpoint. A release blocker stays visible until the owner/operator closes it. Nothing here is a default: unresolved decisions are implemented as interfaces/pure rules with the unsafe action disabled.

## A. Owner decisions

| # | Decision | Owner input needed | Current handling | Affects |
|---|---|---|---|---|
| D1 | Salary 70% rule | hard limit or controlled override | pure `evaluateDeductionRatio` returns `needs-override`; no override rule invented; no writer | TASK-043 |
| D2 | Savings withdrawals | allowed savings types, minimum balance | policy object required by `assertWithdrawal`; no default; writer disabled | TASK-044 |
| D3 | Expired membership | employment-status source, deactivation rule | eligibility shown (read-only); no status mutation | TASK-021, TASK-043 |
| D4 | Short payroll deduction | allocation across several loans | settlement reports an exception; allocation not implemented | TASK-045 |
| D5 | TOKO branch ↔ payroll column | confirm company 1/2/3 → TOKO_TAMBUN/MJ/GIIC | empirical map, reconciliation review-only; `KOSIPA_STORE_COLUMN_MAP` is the only way to confirm | TASK-027, TASK-045 |
| D6 | Loan calculation | interest, due-date, rounding rules | Flat/Anuitas pure functions exist; reads show recorded values only; imported schedules differ by < Rp 1 (recorded) | TASK-026/043 |
| D7 | Warehouse accounting | internal transfer vs commercial sale/purchase | `UNSPECIFIED` is refused by any writer | TASK-062/063 |
| D8 | Receiving policy | who defines per-shipment policy | flag modelled, no default | TASK-063 |
| D9 | Unit conversion | approved ratios + evidence | only equal units (1:1) accepted | TASK-062 |
| D10 | Fractional quantities | need and precision | whole units only | TASK-062 |

## B. Evidence / operator blockers

| # | Blocker | Evidence needed | Safe next action | Responsible |
|---|---|---|---|---|
| B1 | TASK-003 view/procedure definitions (balances, simulation, payroll) | operator runs `docs/migration/sql/legacy-schema-objects-readonly.sql` after authorisation | until then: no official balance anywhere | operator |
| B2 | Gudang schema export (`smart_kopkar_gudang`) | read-only export | no Gudang reader/writer | operator |
| B3 | Production state of indexes / table sizes | pre-check SQL in `kosipa-read-indexes-proposed.sql` | reads are capped at 5 s and degrade to explicit "unavailable" | operator |
| B4 | Single-writer enforcement per bounded context | technical mechanism (not staff instruction) | no financial or stock writer is enabled | owner + operator |
| B5 | Connection budget is 12/12 | capacity decision before any new pool (warehouse writer, TOKO receiving writer) | none added | owner |
| B6 | Console store not provisioned in production | reviewed `console-store-production.sql` run by operator | flags remain off | operator |

## C. Data-quality observations (30 Sep copy; production unverified)

Payroll: 35 rows total ≠ component sum; 5 headers total ≠ row sum; 3 empty headers; 4 duplicate (batch, NIK) pairs; 14% sub-sen totals; header `kd_group` unreliable. Loans: 7 duplicated `doc_no`; contradictory status combinations (e.g. REJECTED + LUNAS); `actual_*` unused; `tgl_bayar` never filled; zero and `9999-12-10` due dates widespread; installment rows with no loan parent. Returns: `db_salesreturn` empty on the staging copy (return-adjusted derivation proven on synthetic data only).
