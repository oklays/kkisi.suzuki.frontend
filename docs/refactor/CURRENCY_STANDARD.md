# KKISI TB2 — Indonesian Rupiah Presentation Standard

Display and input standard only. It changes no stored amount, calculation, rounding policy, schema, API payload or export contract.

## Contract

| Context | Function | Example (`1250000.5`) |
|---|---|---|
| Standard UI | `formatRupiah` | `Rp1.250.000,50` (whole amounts: `Rp1.250.000`) |
| Dense table, header `Nominal (Rp)` | `formatRupiahNumberOnly` | `1.250.000,50` |
| Formal document (invoice, receipt, statements) | `formatRupiahDocument` | `Rp1.250.000,50` (whole: `Rp1.250.000,00`) |
| Accounting negatives | `formatRupiahAccounting` | `(Rp1.250.000,00)` |
| Dashboard summary only | `formatRupiahCompact` | `Rp1,25 juta` (exact value in tooltip + screen reader text) |
| Input → canonical | `parseRupiahInput` | `1.250.000,75` → `"1250000.75"` |
| Amount in words | `formatRupiahTerbilang` | `Satu juta dua ratus lima puluh ribu rupiah lima puluh sen` |

Rules: `Rp` glued to the number (no space, no dot, no `,-`); `.` thousands, `,` decimal; negatives `-Rp1.000`; a real fraction shows at least two digits (`,50`) and longer exact fractions are kept whole (`,6666`) — nothing is rounded or truncated; null/undefined show `—` (never zero); malformed or unsafe input throws `RangeError` rather than printing a wrong amount. Compact output is rounded for display only and is never used for checkout, payment, ledger, invoice, receipt, audit or export values.

Parser: `.` is only a thousands separator and `,` only the decimal separator, so `1.250` is 1250 while `4000.50`, `1.25`, `1,250,000` and `1,250,000.75` are rejected as ambiguous instead of guessed. Empty is distinct from zero. A leading `Rp` is tolerated on paste.

Terbilang: exact (BigInt), `seribu`/`seratus`/`sebelas`, `sen` for ≤ 2 decimals, `minus` for negatives, up to 999 kuintiliun; beyond that range or precision it throws (or returns the caller's `fallback`).

## Architecture

| Layer | Location |
|---|---|
| Rules (framework-free, exact decimal strings / BigInt) | `packages/domain/src/money/rupiah.ts`, `terbilang.ts` (exports `@koperasi/domain/money/rupiah`, `/terbilang`) |
| Web entry point + unit adapters (`formatSen*` for integer sen, `formatAmount4` for KOSIPA 1/10,000) | `apps/web/src/components/money/format.ts` |
| `CurrencyText` (`variant`: standard, document, accounting, compact, number; `unit`: rupiah, sen, amount4) | `apps/web/src/components/money/CurrencyText.tsx` |
| `CurrencyInput` (separate `Rp` prefix, live grouping, caret-safe, strict paste, `inputMode`, canonical value + hidden field) | `apps/web/src/components/money/CurrencyInput.tsx` |
| Existing helpers kept as thin adapters (no formatting logic of their own) | `pos/preview.ts#formatRupiah`, `kosipa/payroll-format.ts#formatAmount4`, `kosipa/presentation.ts#formatExactRupiah`, `public-savings/client.ts#rupiah`, `sales/SalesChips.tsx#formatSalesMoney` |

## Module coverage

| Module | Surfaces | Change | Verification | Status |
|---|---|---|---|---|
| POS / cashier | catalog price, cart, subtotal, QRIS dialog, change, recap | all through `formatRupiah(sen)` adapter; cash input → `CurrencyInput` (whole rupiah, ≤10 digits; same `paidAmount` digit string sent) | unit tests; component test stubs | Done |
| POS receipt + return note (75 mm) | lines, totals | `formatSenDocument` (`Rp25.000,00`) | static review of 75 mm layout; **not visually verified** (needs DB-backed page) | Done* |
| Sales history / invoice / returns / payments | tables, chips, detail | `formatSalesMoney` → `formatSen`; tables already right-aligned + tabular | `sales-ui` tests | Done |
| Products / inventory pricing | list + detail price, price strip, confirm text; Creator + Editor price/discount inputs | shared formatter; `CurrencyInput` (decimal, ≤10 int digits, 2 decimals; posts canonical `4000.5`-style string as before) | browser-driven input checks; unit tests | Done |
| Inventory (stock opname/warehouse) | quantities only | no monetary values exist; quantities untouched | scan | N/A |
| KOSIPA savings, loans, payroll, reconciliation, data-quality, member page | all `formatAmount4` / `formatExactRupiah` / `formatRupiah` sites (~90) | adapters delegate to the standard; `Rp ` → `Rp` | domain + web tests; browser regexes updated | Done† |
| Console dashboard | KPI cards show counts only (money intentionally withheld until verified); empty-state chart axis | axis labels use `formatRupiahCompact` (`Rp25 juta`) | typecheck, review | Done |
| Public savings (member form + operator + prototype) | amount input, review, summary, operator table | `CurrencyInput` (whole rupiah); shared `rupiah()`; **terbilang on review step** | UI + prototype tests | Done |
| Landing previews | static mock figures | `Rp756.000`, `Rp2.500.000` | scan | Done |
| CSV (KOSIPA) | machine-readable amounts | **unchanged** (`kosipa/csv.ts`, plain numeric text) | existing `kosipa-csv` tests pass | Unchanged by design |
| Excel | — | no Excel export exists in the app | scan | N/A |
| PDF | public-savings submission PDF | **not changed** — see limitations | — | Deferred |

\* \† see limitations.

## Limitations / follow-up

1. **Public-savings submission PDF** (`infrastructure/public-savings/artifacts.ts`) still prints raw amounts (`100000.25`). It is stored legal evidence rendered from a pinned `kkisi-pss-a4/v1` template with a recorded content digest and renderer version; editing v1 would change the bytes of any retried render. Apply `formatRupiahDocument` + `formatRupiahTerbilang` in a new `v2` template selected at envelope creation, as its own reviewed change.
2. **Browser suites that need staging/DB** (`console-*-browser`, `pos-*-browser`, etc.) had their expected strings updated (`Rp 1.200.000` → `Rp1.200.000`) but were **not run** here. 107 DB-backed unit tests also skipped for the same reason.
3. **Receipt print layout** was not visually checked on a real 75 mm print; document precision adds three characters to each amount.
4. **Legacy CI2 app (`tokonew.kkisitb2.id`), prototype mock-ups, and the Member PWA** (only a static landing preview exists in this workspace) are out of scope.
5. **Behaviour change to note:** percent fields (margin, discount %) remain native number inputs; Rupiah fields no longer accept `4000.50` (dot decimal) — they require `4.000,50` and show a refusal message on paste.
6. Pre-existing, untouched: `ProductCreator` margin/discount helpers compute with JS floats (`fixed()`); it is existing business logic, not changed here.
