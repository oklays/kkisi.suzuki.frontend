# Fixtures (synthetic only)

Nothing in this folder was copied from the legacy application or from any database. Headers were typed from the documented contracts in [LEGACY_FEATURE_INVENTORY.md §C](../LEGACY_FEATURE_INVENTORY.md#c-import-templates). Example values are synthetic (NIK 99901 and up, "CONTOH SINTETIS"). The real legacy templates are **not** reproduced, because two of them contain member personal data (IE-ANO-016).

| Path | Content | Use |
|---|---|---|
| `templates/tpl0NN_*.xlsx` | Header row only, one sheet, for KOS-TPL-001…016 | Contract fixtures for the new parser (IE-BL-001) |
| `samples/tpl0NN_*_example.xlsx` | Header plus one synthetic valid row | Happy-path tests |
| `samples/edge_cells.xlsx` | Text date, real date cell, numeric NIK, formatted amount text, formula cell | IE-ANO-011, 008, 028 |
| `samples/edge_three_sheets.xlsx` | 2 data rows on Sheet1 plus two empty sheets | IE-ANO-001 |
| `probes/probe_parsing.php`, `probes/probe_sheets.php` | Read the samples with the legacy Spout library and replay the legacy loop and parse expressions. No DB, no network. | Runtime evidence |
| `probes/*.py` | Read-only static scanners used for the audit (DataTables exports, money formats, upload handlers, loop nesting, UI triggers, form fields, view→controller map) | Evidence reproduction |
| `generate_fixtures.py` | Regenerates `templates/` and `samples/` | `python3 -I generate_fixtures.py` (needs openpyxl) |

Notes:
- `tpl002_limits_as_parsed.xlsx` has the 4 columns the legacy parser **reads**. The legacy template has only 3 (IE-ANO-005).
- `tpl004_withdrawals.xlsx` follows the layout the parser expects. Legacy never serves it (IE-ANO-015).

## Re-running the runtime probes

The legacy source is mounted read-only. The container installs `ext-zip` (the existing harness images lack it), then runs PHP 7.4. Spout 3 needs PHP ≥ 7.2.

```bash
F=docs/audits/kosipa-import-export/fixtures
docker run --rm -v "$PWD/$F/samples:/rt:ro" -v "$PWD/$F/probes:/probes:ro" \
  -v "$PWD/legacy/kosipa/application/third_party:/legacy/third_party:ro" php:7.4-cli-alpine \
  sh -c 'apk add --no-cache libzip-dev >/dev/null && docker-php-ext-install zip >/dev/null && php /probes/probe_parsing.php && php /probes/probe_sheets.php'
```

Expected key lines (8 Nov 2026 run):
- `DateTime could not be converted to string`
- `=> 1970-01-01`
- `simulated INSERTs: 6`
- `limit rule … => true`
- `gaji minus ('1.500.000' > '200000') => false`

Static scanners: `python3 -I probes/<scanner>.py legacy/kosipa/application/modules [args]`. See each file's docstring.
