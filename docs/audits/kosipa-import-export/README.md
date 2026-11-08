# KOSIPA Legacy Import/Export Audit

**Date:** 8 November 2026 · **Type:** audit and documentation only. No code, data, schema or deployment changes.

**Subject:** every Excel/CSV import and export in legacy KOSIPA (CodeIgniter 2.1.4 HMVC, local copy `legacy/kosipa/`), compared with KOSIPA New (`apps/web` + `packages/*`).

**Purpose:** a parity baseline for implementing import and export in KOSIPA New. It keeps valid legacy business behaviour and lists the legacy defects that must **not** be copied.

## Findings in brief

1. **Legacy has 21 working import features and 33 working export features.** There are also 10 dead or dormant import entries and 6 dormant export entries (2 broken server-side exports, 10 empty stub methods counted as one group, 3 dormant client-side groups).
2. **Imports are a core operational channel, not a convenience.**
   - 9,770 loans in the 30 Oct data copy carry the import suffix `XLS`.
   - Imports also feed payroll matrices, savings documents, credit limits, SHU and member records.
3. **Legacy imports are unsafe as written.**
   - None runs in a transaction. The earlier audit's claim of two transactional uploads is corrected here.
   - Every import processes the rows again for each sheet in the workbook. A workbook with empty extra sheets creates duplicate loans and savings documents (reproduced with synthetic data).
   - Loans are created already approved.
   - The Gaji Minus import clears every member's flag and overwrites mobile wallet balances.
   - Dates, money and NIK formats are parsed loosely.
   - Two templates contain real member records.
   - Four handlers build SQL from raw cell text.
   - **35 anomalies:** 4 critical, 14 high, 11 medium, 6 low.
4. **Legacy exports are browser-side only.** They contain only the rows currently loaded on screen, write money as text, inherit a broken date-range filter, and have no export permission, audit or cap.
5. **KOSIPA New has no import feature.** Its exports are five aggregate CSV reports with strong controls. Per-member exports are blocked by decision E3. **Parity: 0 of 21 imports and 0 of 33 exports at full or partial parity.**
6. **The evidence is enough to start the shared import foundation now.** Product imports depend on native command families (loans, payroll, savings documents) that do not exist yet, and on owner decisions (Gaji Minus rule, import approval state, E3, official balance definitions).

## Documents

| # | Document | Contents |
|---|---|---|
| 01 | README.md (this file) | Overview, method, summary, index |
| 02 | [LEGACY_FEATURE_INVENTORY.md](LEGACY_FEATURE_INVENTORY.md) | Every import, export and template with IDs, routes, handlers, UI, access, tables, evidence |
| 03 | [IMPORT_WORKFLOW_AUDIT.md](IMPORT_WORKFLOW_AUDIT.md) | Common pipeline, operation types, validation matrix, template contracts, integrity |
| 04 | [EXPORT_WORKFLOW_AUDIT.md](EXPORT_WORKFLOW_AUDIT.md) | Mechanism, scope, file structure, money formats, query rules, security, new exports |
| 05 | [DATABASE_IMPACT_MATRIX.md](DATABASE_IMPACT_MATRIX.md) | Tables written and read, keys, derived fields, financial effects |
| 06 | [LEGACY_VS_NEW_PARITY_MATRIX.md](LEGACY_VS_NEW_PARITY_MATRIX.md) | Feature-by-feature parity with KOSIPA New |
| 07 | [LEGACY_ANOMALY_REGISTER.md](LEGACY_ANOMALY_REGISTER.md) | IE-ANO-001…035 with severity, class, evidence, fix |
| 08 | [RECOMMENDED_IMPLEMENTATION_BACKLOG.md](RECOMMENDED_IMPLEMENTATION_BACKLOG.md) | IE-BL-001…019, P0–P3, dependencies, acceptance criteria, sequence |
| 09 | [IMPORT_EXPORT_UI_UX_SPEC.md](IMPORT_EXPORT_UI_UX_SPEC.md) | Import wizard, export control, errors, responsive and accessibility rules |
| 10 | [AUDIT_EVIDENCE_AND_COVERAGE.md](AUDIT_EVIDENCE_AND_COVERAGE.md) | Sources, method, runtime tests, data queries, coverage, unverified items, safety |
| — | [fixtures/](fixtures/README.md) | Synthetic templates and edge cases, runtime probes, static scanners |

Security-sensitive details (paths, patterns, lines enabling exploitation) are only in the gitignored `docs/superpowers/specs/kosipa-full-access/private-legacy-security-findings.md`, section "Import/Export audit, 8 Nov 2026".

## ID schemes

| Prefix | Meaning | Defined in |
|---|---|---|
| `KOS-IMP-NNN` | Legacy import feature or entry | 02 §A |
| `KOS-EXP-NNN` | Legacy export feature or entry | 02 §B |
| `KOS-TPL-NNN` | Legacy import template | 02 §C |
| `KOS-PDF-NNN` | Legacy server-side FPDF document template | 02 §D |
| `IE-ANO-NNN` | Import/export/PDF anomaly | 07 |
| `IE-BL-NNN` | Backlog item for KOSIPA New | 08 |

Earlier IDs (ANO-K…, F…, WP…, E1–E3, FD-…, R-…, VAL-…) are cross-referenced, not renumbered.

## Method

1. **Discovery from source, not from the visible menu.**
   - Keyword and method-name sweeps across all 95 module controllers, models, helpers and libraries.
   - A scan of every view for live (non-commented) import/export triggers and DataTables export buttons.
   - Mapping of each JS view to its controller.
   - Reachability decided by the production-snapshot `ref_menu` (74 rows).
2. **Handler tracing.** Every active upload function was read. Scripted summaries cover transactions, limits, column maps, write targets, loop nesting and messages. Export endpoints were traced for scope, column indexes and money formats.
3. **Safe runtime checks.** The legacy XLSX library was run on synthetic workbooks in a network-isolated container (no database). The bundled DataTables cell-typing rule was evaluated in Node.
4. **Data footprint.** Count-only, read-only queries on the 30 Oct 2026 local data copy.
5. **New-app mapping.** All KOSIPA routes, the five exports and the write-command catalogue were read.

## Scope limits

- Runtime DB effects of legacy imports were **not** executed. They are static traces.
- No browser session on legacy.
- No production contact.
- Production may differ from the local source: 43 imported loans are in a status the local code never writes.

See [10 §7](AUDIT_EVIDENCE_AND_COVERAGE.md#7-unverified-behaviours).

## What changed in the repository

- New: `docs/audits/kosipa-import-export/**`. These are markdown files plus synthetic fixtures and read-only scripts.
- Appended: one section in the gitignored private findings file.
- Nothing else was modified, committed or deployed.
