# KOSIPA authoritative-evidence gate report (checkpoint 12)

Status: **TASK-003-dependent work stays BLOCKED.** The local staging copy cannot prove official savings balances, official loan outstanding, payroll-generator parity or full legacy financial parity: its eight legacy report views are stubs and `x_proc_create_matrix` is absent. The validator fails closed and never substitutes a movement sum or an instalment-schedule sum for an official balance.

## 1. Five evidence levels (financial gates G2–G5)

| Level | Name | What proves it | What it unlocks | Can metadata prove it? |
|---|---|---|---|---|
| 1 | OBJECT_EXISTS | the named view/procedure appears in the evidence bundle | nothing | yes |
| 2 | SHAPE_COMPATIBLE | every KOSIPA table the definition references passes the column/type contract (G1) | nothing | yes |
| 3 | DEFINITION_AVAILABLE | a real (non-stub) body exported with SHOW VIEW / SHOW CREATE PROCEDURE, fingerprinted | engineering may **read and analyse** the definition; no figure is shown | yes (maximum) |
| 4 | SEMANTICS_VERIFIED | ≥ 5 reviewed test cases per object, **bound to the current definition fingerprint**, all passed in an isolated sanitized environment | a **candidate** implementation under test, not displayed as official | no: operator evidence |
| 5 | PARITY_ACCEPTED | a parity run on ≥ 30 representative records with **zero unexplained differences**, reviewed and **signed off by the data owner** | official figures and parity claims | no: operator + owner evidence |

Levels are sequential: a parity file without a semantic run does not skip level 4, and evidence produced for another definition (fingerprint mismatch) is `SEMANTIC_STALE` and does not count. The minimums (5 cases, 30 records) are **proposals**; the owner/operator may raise them, and lowering them needs a recorded decision. Code: `packages/domain/src/kosipa/schema-contract.ts` (`financialGate`, `parseSemanticEvidence`); tests in `packages/domain/tests/schema-contract.test.mjs`.

## 2. Current state (local staging copy, 18 Oct 2026, regenerated with this checkpoint's tooling)

| Gate | Level | Status | Exact blocker |
|---|---|---|---|
| G1 reads match schema | n/a | ELIGIBLE | none (double-typed money columns reported as warnings) |
| G2 savings balance | **2** SHAPE_COMPATIBLE | BLOCKED | `v_kartu_simpanan`, `v_saldo_awal` are stubs |
| G3 loan balance/schedule/simulation | **2** | BLOCKED | `v_trans_pinjaman_flat`, `_anuitas`, `_simulasi` are stubs |
| G4 payroll generator | **0** NONE | BLOCKED | `x_proc_create_matrix` absent (matrix columns present) |
| G5 payroll component semantics | **2** | BLOCKED | `v_trans_potongan_bulanan`, `v_matrix_toko`, `v_matrix_toko_dtl` are stubs |
| G6/G7/G8 | n/a | ELIGIBLE | none |

## 3. Task-by-task: what remains blocked and the exact evidence that unlocks it

| Task | Blocked at | Minimum evidence to unlock | Who |
|---|---|---|---|
| Read/analyse savings definitions (prep for TASK-025) | level 3 | production bundle with real bodies of `v_kartu_simpanan`, `v_saldo_awal` (SHOW VIEW privilege) | operator |
| TASK-025 candidate official balance (under test) | level 4 | + semantic file per view: ≥ 5 reviewed cases (e.g. opening balance carried forward, withdrawal reduces balance, cancelled documents ignored, zero/9999 dates, mixed types), run on a sanitized isolated copy, bound to the fingerprint | operator + engineering |
| TASK-025 official balance display / REQ-023 parity, TASK-044 precondition | level 5 | + signed-off parity run, ≥ 30 representative members, zero unexplained differences | operator + **data owner** |
| TASK-026/043 loan outstanding and simulation (candidate → official) | levels 3 → 5 | same chain for the three loan views; D6 (loan calculation rules) also open | operator, owner |
| TASK-027 generator parity, TASK-045 settlement baseline | levels 3 → 5 | body of `x_proc_create_matrix` (SHOW CREATE PROCEDURE), then the same semantic/parity chain | operator, owner |
| D5 company ↔ `TOKO_*` mapping | level 3 + owner | the procedure body lets engineering **read** the mapping; the **decision** stays the owner's (D5) | owner |
| TASK-027 component semantics / TOKO Kredit comparison basis (official) | levels 3 → 5 | the three payroll views, then the chain | operator, owner |

## 4. Secure workflow for restricted definitions and sanitized cases

1. **Export** (operator, production, read-only): run `docs/migration/sql/schema-evidence-bundle-json.sql` with an account that has SHOW VIEW and SHOW CREATE ROUTINE. Save outside the repository (`docs/migration/_baseline/` is gitignored).
2. **Screen** (operator): `validate-schema-evidence.mjs --bundle … --scan`; redact any reported credential, host or e-mail before the bundle leaves the operator's machine.
3. **Report** (operator → ticket): the readiness report (identifiers, levels, fingerprints, referenced tables; **never a body**) is safe to share and to commit.
4. **Restricted review** (named engineer + operator): definition bodies are read only on the operator-controlled machine or a restricted share, **never committed**; the report's fingerprint identifies exactly which definition was reviewed.
5. **Sanitized cases** (operator): restore the definitions into an **isolated** database loaded with sanitized or synthetic rows (no real NIK, names, salaries or accounts), run the agreed cases, and record **only** case ids, purposes, pass/fail counts, reviewer and dates in a semantic evidence file (format below). The validator refuses any file containing long digit runs (NIK/account-like) or e-mail addresses.
6. **Parity** (operator + data owner): compare the candidate implementation with the legacy definition on representative records in the same isolated environment; record sample size, compared count, unexplained differences, reviewer and the owner's sign-off. Row values are not recorded.
7. **Validate**: `validate-schema-evidence.mjs --bundle … --semantic <file> [--semantic <file> …]`. Only the levels the evidence actually proves are unlocked.

Semantic evidence file (one per object, kept outside the repository):

```json
{ "version": 1, "gate": "G2", "object": "v_saldo_awal", "definitionFingerprint": "<14 hex from the report>",
  "cases": [{ "id": "C1", "purpose": "opening balance equals the prior period closing balance" }],
  "run": { "executedAt": "2026-11-01T02:00:00Z", "environment": "isolated-sanitized", "passed": 5, "failed": 0, "reviewedBy": "<role>", "reviewedAt": "2026-11-01" },
  "parity": { "executedAt": "2026-11-02T02:00:00Z", "sampleSize": 30, "compared": 30, "unexplainedDifferences": 0, "reviewedBy": "<role>", "signedOffBy": "<data owner role>", "signedOffAt": "2026-11-02" } }
```

What the tooling does **not** do: it never connects to a database, never executes a view or procedure, never invents a definition, and never turns a recorded sum into an official balance.
