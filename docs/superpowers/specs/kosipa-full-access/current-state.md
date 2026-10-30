# Current state — `kosipa-full-access`

Audit 30 Oct 2026 (Asia/Jakarta). Sources: local legacy copy `kosipa/` (read-only, gitignored), Next.js source at HEAD `0af0dd77`, local `kkisi_staging` (30 Sep 2026 copy, read-only account, aggregate queries only), earlier spec [`unified-console-kosipa-warehouse`](../unified-console-kosipa-warehouse/README.md) (UCKW) whose findings were re-verified where this audit touched them.

**Implementation update, 30 Oct 2026:** FA-01/01.5/02 and [FA-03A](fa-03a/CHECKPOINT_REPORT.md) now provide synthetic-only native CRUD for five reference masters, two-administrator grants, a separate atomic command-ledger database, real legacy-PHP compatibility tests and reusable numbering. The writer guard permits only the isolated synthetic target. No native member mutation or financial posting is activated. Metrics below remain the original read-only audit measurements; production capacity and activation gates are in [PRODUCTION_READINESS_GATES](fa-03a/PRODUCTION_READINESS_GATES.md).

## 1. Systems and databases

| System | Stack | Role for KOSIPA data | Writes KOSIPA tables? |
|---|---|---|---|
| Legacy KOSIPA (`kosipa.kkisitb2.id`) | CodeIgniter 2.1.4 + HMVC, PHP 5.6 | System of record for members, savings, loans, payroll, SHU | yes — all of them ([04 §2](04_DATABASE_WRITE_MAPPING.md#2-write-target-inventory)) |
| Next.js unified console (`apps/web`) | Next.js 16, TypeScript, Prisma 6 raw SQL, MariaDB | KOSIPA read views, identity links, public-link savings requests; synthetic-only native masters | console store; `trans_simpanan_pengajuan` (OPEN intake) + `pss_*`; isolated five-master commands + separate command ledger/number registry |
| TOKO legacy | CodeIgniter 3.1.11 | Reads `m_anggota` limits for Kredit | yes — `m_anggota` (`ANO-T02`, `ANO-T03`) |
| smartkkisi | Laravel 8 | Member mobile app; request intake; wallet | yes — requests, `users`, `orders` |
| Database | MariaDB `n1608204_smart_kopkar` shared by all four; Next.js also `kkisi_auth`, console store | — | — |

Connection budget: 12 of the hosting's 20 connections allocated to Next.js, all in use by existing pools (B5/B8 open).

## 2. Business flows (as implemented in legacy)

1. **Membership:** staff register/edit members in `master/anggota_c`; the edit form also sets credit limits, savings deductions and status; a non-AKTIVE status revokes mobile tokens and touches smartkkisi wallets ([04 WP-01…WP-04](04_DATABASE_WRITE_MAPPING.md#32-membership)).
2. **Savings:** payroll, cash/transfer and opening-balance documents (header + member lines) → approve/reject; withdrawals checked against a balance sent by the browser; payouts happen outside the system; no GL posting.
3. **Loans:** 7 product controllers create OPEN loans → approve (`ajax_posting`) → disburse (`ajax_update` with `status_pencairan`) which nets rollover loans and (re)builds the schedule; early settlement/over-kredit close loans with client amounts.
4. **Payroll:** monthly batch per member group → stored procedure `x_proc_create_matrix` fills the deduction matrix (TOKO window M−1) → manual adjustments/uploads → approve, which marks instalments paid (for **all** members of the month, `ANO-K05`) and loans LUNAS.
5. **Exit:** hak & kewajiban document; approval should deactivate the member but fails on a wrong column (`ANO-K31`).
6. **SHU:** base list via `x_proc_create_shu`, proportional allocation rounded to thousands, status-only "process".
7. **Mobile requests:** savings deduction changes, withdrawals and loans created by smartkkisi are processed by staff in `mobile/*`.

## 3. User roles
Legacy: KOSIPA staff accounts (`ref_users`, 10 rows on the copy) in groups (`ref_group_akses`, 13) granted per controller via `ref_menu_akses` (351 rows) — one grant opens every method of a controller (`ANO-K02`). No branch scope. Next.js: console users (`db_users`) linked to KOSIPA users; KOSIPA view capabilities derived from the linked user's active legacy groups/menus; export via operator allow-list. The implemented write vocabulary is gated: only `kosipa.master.manage` is grantable, through a two-administrator workflow and fresh view-permission checks; writes remain synthetic-only.

## 4. Database entities (counts on the 30 Sep copy)
Members `m_anggota` 9,276 · deduction config `m_simpanan_aktif` 5,485 · savings `trans_simpanan`/`_dtl` 5,787/113,267 · loans `trans_pinjaman`/`_dtl` 32,631/1,198,697 · rollover links 1,071 · loan requests 4,848 · withdrawal requests 2,935 · savings requests 365 · payroll `trans_potongan_bulanan`/`_matrix` 135/84,924 · exit `trans_hak_kewajiban` 4 · SHU 3/3,652 · PPOB bills 25/7,035/27,398 · journals 0. Keys: only `PRIMARY(id)` on every financial table; no unique document numbers; 45 views are stubs and no procedures/triggers exist on the local copy (production definitions needed, B1).

## 5. Queues, workers, jobs
None in legacy (all synchronous; procedures run on button click). Next.js has one outbox/worker pattern, for public-savings PDFs/notifications (`pss_outbox`), reusable for post-commit side effects.

## 6. Technical debt (summary; details in [06](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md))
No transactions on approval paths; client-trusted balances/status/payoffs; schedule rebuild erases payment history and auto-marks past instalments paid; hard deletes of loans/members; list views writing loan status; approver overwriting maker; float money; duplicate controllers and dormant code; GET-driven IAM mutations (private); 7 endpoints calling missing methods; full scans on a 1.2 M-row table without indexes; ≈1,400 corrupted member rows; header/line status divergence in savings.

## 7. Existing assets in Next.js that the write work builds on
Pure domain rules (state machine with maker-checker, exact schedules, batch-scoped payroll settlement, SHU largest remainder, store obligations net of returns, savings position/withdrawal check, balanced-journal check), writer-account pattern with deployment guard and connection budget, lock-wait cap, console audit store (append-only), identity links, Origin/CSRF checks, money input/display components, keyset-paginated bounded read repositories, test suites (domain/application/DB/HTTP/browser/persona matrix).
