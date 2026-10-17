# Operator Handoff — Schema Evidence (TASK-003 and Warehouse)

**Audience:** the authorised database operator. **Purpose:** obtain the schema objects the engineering team cannot read, so that blocked milestones can resume on real evidence.
**Nothing in this handoff is executed by the application or by the engineering agent.** All scripts are read-only metadata queries (no table data is read). This document does not authorise any production change.

## 1. Why this is needed (what stays blocked without it)

| Missing evidence | What it blocks | Current safe behaviour in the console |
|---|---|---|
| View definitions `v_kartu_simpanan`, `v_saldo_awal` (savings) | Official savings balance, opening-balance semantics, savings parity (REQ-023), any withdrawal balance check (TASK-044) | Only recorded movement sums; "Saldo resmi belum tersedia" |
| View definitions `v_trans_pinjaman_flat`, `_anuitas`, `_simulasi` | Official loan outstanding, simulation parity, loan calculation decisions (D6) | Recorded schedule sums; "Saldo/outstanding resmi belum tersedia" |
| Procedure `x_proc_create_matrix` (and `proc_hari_simpanan`) | Payroll generation parity (REQ-034 write side), TOKO column ↔ branch map confirmation (D5) | Payroll shown as recorded; reconciliation labelled "hanya untuk ditinjau" |
| Views `v_trans_potongan_bulanan`, `v_matrix_toko`, `v_matrix_toko_dtl` | Which store component legacy reports use | Not used |
| Production indexes, row estimates, triggers, `sql_mode` | Index proposal validation, performance claims, date behaviour | Reads capped at 5 s and degrade to "unavailable" |
| Gudang tables, keys, units, stock model | Warehouse reader/writer, item identifiers, unit conversions, stock semantics | No Gudang connectivity at all |

## 2. Preconditions

1. Use an **operator-owned** account with `SELECT` on `information_schema`, `SHOW VIEW`, and (for routines) `SHOW_ROUTINE`/`EXECUTE`-free metadata access. **Do not use the application accounts** (`kkisi_read`, `*_write`, auth, console).
2. Run from a workstation or the cPanel terminal, not from the application server's web process. No tunnel to the app is required.
3. Read-only by construction: every statement below starts with `SELECT`, `SHOW CREATE` or `SET @var`. If your client is configured to autocommit DDL, nothing here issues DDL.

## 3. KOSIPA (TASK-003) — what to run

| Step | Script | Notes |
|---|---|---|
| A | `docs/migration/sql/legacy-schema-objects-readonly.sql` | Inventory, **view definitions**, **procedure definitions**, key indexes. If `SHOW CREATE VIEW` returns a stub (`NULL AS ...`) the account lacks `SHOW VIEW`: stop and report |
| B | `docs/migration/sql/kosipa-schema-evidence-columns-readonly.sql` | Columns with exact types/precision, keys/indexes, FKs, row estimates, triggers, `sql_mode` |
| C (alternative to A+B, schema only) | `mysqldump --single-transaction --no-data --routines --events --triggers <schema>` | `--no-data` exports DDL only; verify that views are real definitions, not stubs |

Save the raw output to `docs/migration/_baseline/` (**gitignored**); do not paste it into chat or tickets before §5.

### Dependencies for official financial balances (what engineering will read first)

1. `v_kartu_simpanan` and `v_saldo_awal`: how opening balance, movements, status (`APPROVED/OPEN/POSTING`), interest (`jasa_kredit`) and cash credit (`kredit_cash`) combine; whether `SALDO AWAL` documents are inside or outside the opening balance; which `doc_status` values count.
2. `v_trans_pinjaman_flat|anuitas|simulasi`: the exact interest formula, rounding, due-date rule, how `status_cicilan`/`pelunasan_*` affect outstanding.
3. `x_proc_create_matrix`: which sources feed each `TOKO_*` and loan column, which company ids map to which store column, whether returns are deducted, which window (previous month) and whether it ignores `doc_status` of installments.
4. Column-level facts from script B: the tolerance between `total_potongan` and the 59 components, `double` vs `decimal` header totals.

## 4. Warehouse (Gudang) — what to run and what to answer

Run `docs/migration/sql/gudang-schema-evidence-readonly.sql` against the Gudang database (`n1608204_smart_kopkar_gudang`, to be confirmed). The table names in it are **discovery hints, not facts**: Gudang is an older fork of the TOKO template and must not be assumed identical.

**Minimum structure the integration needs** (the operator confirms each exists, or reports the real equivalent):

| Need | Why | Evidence to return |
|---|---|---|
| Item master: id, code, barcode(s), name, unit(s), active flag | Explicit item mapping (no name-only matching; ids are never assumed equal across databases) | Column list + keys (G2, G3) |
| Stock model: where quantity lives (e.g. global item + per-company stock) | Quantity semantics, branch scoping, duplicate-posting rules | Tables, keys, triggers (G2–G4) |
| Dispatch/sales document header + lines: a **stable unique document identifier** and line identifier | `sourceRef` must be unique and stable for idempotent receiving | Unique keys on document number / line id (G3) |
| Unit of measure per item and any pack/conversion fields (`unit_perpack` or similar) | Unit conversion needs approved ratios; none are invented | Columns holding unit and pack size |
| How a store appears in Gudang (customer / company / warehouse record) | Map a dispatch to the destination store | **Answer in prose**: which table/column identifies the destination store (do not export the rows) |
| Whether Gudang decrements stock on dispatch, on invoice, or on approval | Source-side quantity timing | Triggers/routines/views (G4, G5) + one sentence from the process owner |
| Existing writers and schedules (cron, events) | Single-writer enforcement (decision B4) | Events (G4) |

## 5. Sensitive-content review (before anything is committed)

Check the saved output and remove or redact before sharing:

- **DEFINER** accounts and host names inside view/routine definitions (they reveal account names): replace with `<definer>`.
- Hard-coded **passwords, tokens, API keys, IP addresses, e-mail addresses** inside routines, triggers or comments.
- Any **data row** that slipped in (column comments with personal names, sample values). The scripts request metadata only; if a row appears, delete it.
- Internal host names or file paths in routine bodies.

Then a second person reviews the redacted file. Only the redacted file may be added to `docs/migration/_baseline/` **or** attached to the repository, and only after the owner approves. The unredacted original is deleted after the review.

## 6. Read-only validation of the result

1. The file contains real `CREATE VIEW ... AS select ...` bodies (not `NULL AS` stubs) for every view listed in §3.
2. `x_proc_create_matrix` appears with a body.
3. Script B returns the columns of all 15 listed tables; `COLUMN_TYPE` shows `decimal(18,2)`/`decimal(18,4)`/`double(18,4)` as expected.
4. For Gudang: G1 lists the real table names; the document header, line and item tables are identified (record the names in the handoff reply).
5. Record `sql_mode` (zero-date behaviour) and `max_user_connections` (budget input, decision B5).

## 7. Reply to engineering

Return: the redacted outputs (or their location), the answers to the prose questions in §4, and a note of any statement that failed (missing privilege or table). Engineering then (a) reads the definitions, (b) updates `decision-register.md` and the loan/savings/payroll specs, (c) resumes the blocked tasks (see the register, section B). No production credentials are shared, and no production change is requested by this handoff.
