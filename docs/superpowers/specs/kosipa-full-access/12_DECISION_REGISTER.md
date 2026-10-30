# 12 — Decision register: facts, approved rules, recommendations, assumptions, open decisions

Earlier registers stay authoritative for their items: [UCKW decision register](../unified-console-kosipa-warehouse/decision-register.md) (D1–D10, B1–B10, E1–E3, W1–W5, R1, S1). This register adds the full-access items. **Nothing below marked "proposed" or "recommended" is approved.**

## 1. Verified facts (E1 / E1-data)

| ID | Fact | Evidence |
|---|---|---|
| VF-01 | Legacy KOSIPA has 94 controllers, 776 non-constructor functions, 285 write methods, 60 written tables + 2 procedures | [02A](02A_LEGACY_METHOD_WRITE_INDEX.md), [02](02_LEGACY_FUNCTION_INVENTORY.md) |
| VF-02 | No legacy approval, disbursement, settlement or payroll path uses a DB transaction or lock | [02 §5](02_LEGACY_FUNCTION_INVENTORY.md#5-transaction-usage-complete) |
| VF-03 | The legacy gate needs `ref_menu.status=1` for the controller URL | `models/user_m.php:379-390` |
| VF-04 | Staging copy: 9,276 members, 32,631 loans, 1,198,697 instalments, 5,787 savings docs, 113,267 savings lines, 135 payroll batches, 84,924 matrix lines | aggregate queries 30 Oct 2026 |
| VF-05 | Financial tables have only `PRIMARY KEY(id)`; no unique `doc_no`; 7 duplicate loan doc no groups | `information_schema` |
| VF-06 | No GL journal rows; journal code not wired | `ANO-K33` |
| VF-07 | Audit-time baseline was read-only except identity links and public-savings intake. FA-01…FA-03A add synthetic-only native master writes and reusable numbering; no native member mutation or financial posting is activated | `capabilities.ts`, `public-savings/service.ts:189` |
| VF-08 | Next.js already has pure domain functions for state machine, schedules, settlement, SHU, store credit, savings position, journal balance | `packages/domain/src/kosipa/*` |
| VF-09 | Local legacy `ENVIRONMENT = 'development'` → `db_debug` on | `kosipa/index.php:21`, `config/database.php` |
| VF-10 | All loans use due day 10; annuity rate values 1.60/0.92/1.33 | aggregates |

## 2. Approved rules carried in (not re-opened)
OD-1 … OD-6 and UCKW:BR001–BR013 — see [05 §1](05_BUSINESS_RULES_AND_FINANCIAL_LOGIC.md#1-decision-baseline-already-approved--not-re-opened). Memory-recorded decisions: sales-return Kredit handling; production DB changes manual-only.

## 3. Open decisions (new)

| ID | Decision | Options | Recommendation | Blocks | Owner |
|---|---|---|---|---|---|
| FD-01 | Where idempotency + financial audit live | (a) additive table `kosipa_command_ledger` in the business DB (atomic with writes) · (b) console store only (non-atomic) + reconciliation | (a); DDL reviewed SQL, rollback = `DROP TABLE` (no legacy reader) | every write (P0) | Owner + operator |
| FD-02 | Indexes and uniqueness | (a) Tier-1 indexes on `trans_pinjaman_dtl` + unique `doc_no` per header table after de-duplicating 7 groups · (b) indexes only · (c) none | (b) first (performance, no data change), (a) unique after finance decides the 7 duplicates | P-01 targets; doc no hard guarantee | Owner + operator |
| FD-03 | Legacy single-writer switch | (a) `ref_menu.status=0` per controller URL (reversible data change) · (b) revoke `ref_menu_akses` per group · (c) staff instruction only (not acceptable, UCKW B4) · (d) DB triggers (prohibited now) | (a) | every cutover | Owner + operator |
| FD-04 | Due day > days in month | (a) clamp to month end · (b) roll to next month (legacy accident) · (c) forbid tempo > 28 | (a) | loan disbursement | Owner/finance |
| FD-05 | When is a loan LUNAS | (a) all instalments paid · (b) last instalment paid (legacy) | (a) | loan read model, payroll | Finance |
| FD-06 | Instalments due before disbursement date / back-dated loans | (a) never auto-paid; checker enters opening paid count, type `MANUAL` · (b) legacy auto-`Bayar` | (a) | disbursement | Finance |
| FD-07 | Member removal | (a) deactivate only; hard delete only with zero history by admin · (b) legacy hard delete | (a) | member commands | Owner |
| FD-08 | smartkkisi `users` wallet mirror and token revocation on status change | (a) Next.js writes the same mirror fields once and deletes tokens by `user_id` · (b) smartkkisi handles it via its own job | (a) until smartkkisi exposes a contract | member status, exit | Owner + smartkkisi maintainer |
| FD-09 | General ledger | (a) none (as today) · (b) build balanced journals from `acc_mapping_akun` (empty today) | (a) for parity; (b) is a new feature with its own spec | savings/loan approval scope | Finance |
| FD-10 | What SHU "process" does | (a) status only (legacy) · (b) credit SHU to SUKARELA savings · (c) cash payout document | finance decides; until then (a) | SHU P2 | Board/finance |
| FD-11 | Early settlement / rollover remaining amount | (a) Σ unpaid principal from cut-off month · (b) + interest of cut-off month · (c) + admin/penalty per product % | finance states formula per product | settlement, rollover | Finance |
| FD-12 | Authoritative status for savings lines with divergent header (`ANO-K34`) | (a) header status · (b) line status · (c) line status if not NULL else header | decided after B1 view definitions show what balances use | savings read + reversal | Finance |
| FD-13 | Exit settlement netting | (a) automatic net (savings pay loans/store debt) · (b) separate documents, manual | (a) with statement for member signature | exit | Board/finance |
| FD-14 | Cancel/void representation, back-dating limit, reversal window | (a) `REJECTED` + ledger reason for cancel (legacy-safe) · (b) new value `CANCELLED` if characterization proves tolerance; back-date ≤ current open payroll period; reversal not allowed for periods with approved payroll unless a compensating document is used | (a) + limits as stated | lifecycle | Finance |
| FD-15 | Period closing / site scope | (a) none (legacy) · (b) monthly close | (a) now | — | Board |
| FD-16 | Where write grants live and who sets them | (a) legacy menus (rejected) · (b) console-store grant table + UI, 2-person rule · (c) env allow-list interim | (b), (c) interim only off-production | every write | Owner |
| FD-17 | Strength of control | (a) maker ≠ checker for approve/disburse/reverse · (b) + disburser ≠ approver (3 eyes) above an amount · (c) legacy-created documents may be approved in Next.js by a Supervisor | (a) + (c); (b) if finance sets a threshold | approvals | Finance |
| FD-18 | Audit retention period and reviewer | statutory period; named reviewer | owner states | OBS | Owner |
| FD-19 | First implementation checkpoint scope | see [01 §8](01_EXECUTIVE_AUDIT_SUMMARY.md#8-recommended-first-implementation-checkpoint) | CP-1 Foundation | implementation start | Owner |
| FD-20 | Payroll generator replacement timing | (a) keep legacy procedure until native generator proves parity (UCKW:MIG004) · (b) switch at once | (a) | payroll cutover | Owner |
| FD-21 | Excel templates | (a) keep legacy templates (operator familiarity) · (b) new CSV templates | (a) read compatibility + new validated CSV | imports | Operators |

### 3.0 FA-03A proposed decisions (not approved)

| ID | Decision | Current boundary | Blocks | Owner |
|---|---|---|---|---|
| FD-22 | Business-table ownership triggers vs verified exclusion of every competing writer | SQL generator and synthetic prototype only; five masters plus five member-profile UPDATE columns. Requires explicit exception to the business-trigger prohibition. Current member prototype does not cover INSERT/DELETE/status/bank fields. See [ownership](fa-03a/SHARED_WRITE_OWNERSHIP.md) | native member activation | Owner + operator + application maintainers |
| FD-23 | Approve numbering family scope and legacy-format deviations | Local implementation uses REG/DBT period sequence, PIN/KAS/POT row ID; PIN first-of-month and REG/DBT ≥1000 padding differences are documented, not approved. Registry uniqueness protects native claims; FD-02 and exclusion of legacy concurrent writers still apply | first document/member registration command | Owner + finance + operator |
| FD-24 | Member-profile synchronization with smartkkisi `users` | (a) update `m_anggota` only, preserving legacy behavior; (b) mirror an explicitly approved overlapping field set. No native member profile command exists | membership profile contract | Owner + smartkkisi maintainer |
| FD-25 | Reactivation transition and limit restoration | Decide whether non-AKTIVE → AKTIVE is allowed and define checks; no automatic restoration policy approved | member status command | Owner + finance |

FD-01c remains **open**, separate from implemented FD-01b. The hash-chain/off-host-anchor outline in [production gates](fa-03a/PRODUCTION_READINESS_GATES.md#5-fd-01c--owner-bypass-and-the-pending-tamper-evidence-decision) is a candidate, not an approved architecture or completed control. FD-07, FD-08 and FD-17 recommendations above remain open; the FA-03B plan does not silently adopt them.

### 3.1 FA-01 implementation baseline (30 Oct 2026)
The owner's FA-01 instruction set FD-01, FD-03 and FD-16 as the **implementation baseline for local development only**. Nothing below enables anything in production.

| ID | Applied in FA-01 | Still needs a decision before production |
|---|---|---|
| FD-01 | Option (a). `kosipa_command_ledger` is written in the business transaction ([report](fa-01/CHECKPOINT_REPORT.md#c-database-changes)). | **FD-01b, resolved in FA-01.5 as option (b):** the ledger is in its own database on the same server. Database-level `SELECT, INSERT` (cPanel-expressible) makes it append-only for the application, and one transaction still spans both databases. No trigger is needed ([evidence](fa-01.5/FD-01b-ledger-isolation.md)). Open: the operator steps, and **FD-01c** (tamper evidence against the cPanel owner: hash chain or off-host copy). |
| FD-03 | The fence is verified per controller ([FD-03 verification](fa-01/FD-03-legacy-fence-verification.md)). The SQL generator was rehearsed on the synthetic stack. A separate native ownership flag was added. **FA-01.5:** native commands now fail closed (`LEGACY_ACTIVE`) whenever a fenced row is enabled again, with share locks against a racing `adm_menu_c`. | The operator fences per feature and drains in-flight legacy requests first. Confirm the smartkkisi admin panel never writes the five masters ([shared writers](fa-01.5/SHARED_WRITER_OWNERSHIP.md)). |
| FD-16 | Option (b). A `console_kosipa_grant` table, a grants API and the `/console/settings/akses-kosipa` page. Grant administrators = `iam.link.manage` plus the allow-list `KOSIPA_GRANT_ADMIN_USER_IDS`. Only capabilities with existing commands are grantable (`kosipa.master.manage`). **FA-01.5:** two-administrator confirmation (request, then approval by another administrator within 24 h), enforced by the application and the console store. | Production console store (B6) and the real administrator list. |

Inherited and still open: D1 (ratio), D2 (withdrawal policy), D3 (expiry), D4 (short payroll), D6 (loan rule authority), B1 (views/procedures), B3 (indexes/triggers/sql_mode), B4 (single-writer mechanism → FD-03 proposes it), B5/B8 (connections), B6 (console store production), B10 (real roles/menu).

## 4. Recommended changes (pending approval)
All "Proposed" behaviour in [05](05_BUSINESS_RULES_AND_FINANCIAL_LOGIC.md) (R-01…R-23), [06](06_LEGACY_ANOMALIES_AND_PERFORMANCE.md) fixes, [07](07_TARGET_ARCHITECTURE.md), [08](08_AUTHORIZATION_AND_AUDIT_DESIGN.md), [11](11_CUTOVER_AND_ROLLBACK_PLAN.md).

## 5. Assumptions (to be confirmed)

| ID | Assumption | Confirmed by |
|---|---|---|
| A-01 | Local legacy copy = production source | G-01 |
| A-02 | KOSIPA remains cooperative-wide (no branch) | owner (FD-15) |
| A-03 | smartkkisi keeps owning `users`, `orders`, request intake | owner |
| A-04 | Legacy reports read only the columns Next.js writes in the documented vocabulary | characterization (TASK-104) |
| A-05 | `doc_no` consumers rely on prefix + period only | G-10 |
| A-06 | Business date is Asia/Jakarta (UTC+7) | existing code |

## 6. Evidence gaps

| ID | Gap | Action | Who |
|---|---|---|---|
| G-01 | Production source hashes vs local copy | operator: `find application -name '*.php' -exec sha256sum` (read-only) | Operator |
| G-02 | 9 menu entries without source (`accounting/coa_c`, etc.) | production listing of those paths | Operator |
| G-03 | View/procedure definitions (B1) | existing handoff §3 | Operator |
| G-04 | Production triggers, indexes, `sql_mode`, `ENVIRONMENT` (B3) | handoff script B + one config line | Operator |
| G-05 | smartkkisi writes to `trans_pinjaman` / `db_notifikasi` | read-only grep of smartkkisi source | Operator |
| G-06 | Writes inside multi-line dynamic SQL not seen by the scanner | manual review during TASK-104 | Engineering |
| G-07 | Production `ref_menu` / `ref_menu_akses` (B10) | role/menu export (existing script) | Operator |
| G-08 | Cause of 328 duplicate-month instalments and 6,696 future-dated paid instalments | characterization on staging (TASK-104) | Engineering |
| G-09 | Production row counts | bounded `COUNT(*)` by operator | Operator |
| G-10 | Which consumers parse `doc_no` | grep TOKO/smartkkisi/legacy reports | Engineering |
