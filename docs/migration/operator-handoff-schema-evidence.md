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

## 8. Coverage check (checkpoint 10) — does the handoff identify everything the blocked work needs?

| Required by | Needed evidence | Where it is requested | Covered |
|---|---|---|---|
| Official savings balance (B1) | `v_kartu_simpanan`, `v_saldo_awal` definitions; opening-balance rule; `SALDO AWAL` handling | script A §2, §3 dependency 1 | yes |
| Official loan outstanding, simulation parity (B1, D6) | `v_trans_pinjaman_flat/anuitas/simulasi` definitions; interest, rounding, due date | script A §2, §3 dependency 2 | yes |
| Payroll generator parity, branch map (B1, D5) | `x_proc_create_matrix` body, `proc_hari_simpanan`, matrix views | script A §2–§3, §3 dependency 3 | yes |
| Exact monetary types / tolerance | column types incl. `decimal` vs `double`, defaults | script B1 | yes |
| Index validation, performance claims (B3) | keys/indexes, row estimates, `AUTO_INCREMENT` vs rows | script A §5, script B2, B4 | yes |
| Values changed behind the application's back | triggers on financial tables | script B5 | yes |
| Zero-date behaviour | `sql_mode` | script B6, §6 step 5 | yes |
| Connection capacity (B5) | `max_user_connections` | script B6, §6 step 5 | yes |
| Gudang reader (B2) | tables, columns, keys, FKs, triggers, routines, events, views | Gudang script G1–G5 | yes |
| Gudang identifiers for reliable TOKO integration | unique document id and line id; item identifiers; unit and pack fields; how a store is represented | §4 table + G2/G3 + prose answers | yes (prose answers needed from the operator) |
| Stock semantics (when Gudang decrements) | triggers/routines/views, one sentence from the process owner | §4, G4/G5 | yes (needs the process owner's sentence) |
| **Not requested on purpose** | table DATA, credentials, member data | §2, §5 | by design |

**If the owner prohibits production reads entirely:** the blockers stay open. Engineering continues on the sanitised 30 Sep snapshot **without claiming current-production parity**: official balances remain unavailable, reconciliation stays review-only, the Warehouse stays synthetic, and every report states its source and that production is unverified. The snapshot cannot supply view/procedure definitions (they are stubs), the Gudang schema, production indexes or production `sql_mode`; those need an authorised operator regardless.

## 9. Automated validation (checkpoint 11) — from reviewed metadata to eligible tasks

The manual review in §6 is now backed by tooling. It is **offline** (file in, report out): no connection, no credentials, no procedure is executed.

| Step | Who | What |
|---|---|---|
| 1 | Operator | Runs `docs/migration/sql/schema-evidence-bundle-json.sql` (information_schema only; one JSON document) with `mysql --batch --raw --skip-column-names`, saved under `docs/migration/_baseline/` (gitignored). Replace the schema name at the top. |
| 2 | Operator | `node --experimental-strip-types apps/web/scripts/validate-schema-evidence.mjs --bundle <bundle.json> --scan`. `--scan` prints **counts** of objects whose bodies contain password-like text, IPs, e-mail addresses or `DEFINER=`; redact the bundle before it leaves the operator's machine if any are reported. |
| 3 | Operator or engineering | Attach the **report** (identifiers, statuses, fingerprints, referenced table names; never a view or procedure body) to the ticket. The report is safe to commit. |
| 4 | Engineering | Reads "Tasks that become eligible" / "Still blocked" and opens only the unlocked tasks. Gates never flip on assumption: a view whose definition is empty, a stub (`SELECT NULL AS …`) or missing keeps its gate BLOCKED. |

Gate to task mapping: G2 official savings balance (TASK-025 parity, TASK-044), G3 official loan balance/schedule/simulation (TASK-026 parity, TASK-043), G4 payroll generator (TASK-027 parity, D5 evidence, TASK-045), G5 payroll component semantics, G1/G6/G7/G8 housekeeping. Exit code 0 = all ELIGIBLE, 2 = at least one gate not eligible (the honest state, not a failure), 1 = unusable input.

**Gudang:** the same SQL against the Gudang schema produces its bundle; `docs/migration/gudang-mapping.template.json` is filled from that bundle by a person who knows the process (a role is left out, never guessed), then
`validate-schema-evidence.mjs --gudang-bundle <g.json> --gudang-mapping <m.json>` names the adapters (item catalog, stock reader, dispatch reader) that become eligible. Without a mapping every adapter is blocked.

**Run against the local staging copy (30 Sep snapshot, 17 Oct 2026):** G1 ELIGIBLE (nine contract tables compatible; double-typed money columns reported as warnings), G6/G7/G8 ELIGIBLE, **G2/G3/G5 BLOCKED** (all eight legacy report views are stubs in the copy), **G4 PARTIAL** (`x_proc_create_matrix` absent; matrix columns present). Official balances and payroll generator parity therefore remain blocked until an operator provides real definitions from production.
