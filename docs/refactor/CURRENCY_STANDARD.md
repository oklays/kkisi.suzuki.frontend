# KKISI TB2 — Indonesian Rupiah Presentation Standard

Display and input standard only. It changes no stored amount, calculation, rounding policy, schema, API payload or export contract.
Branch `feat/currency-rupiah-standard` (6 commits on top of `master` 7a1f1a0d; not pushed, not merged).

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

Rules: `Rp` glued to the number (no space, no dot, no `,-`); `.` thousands, `,` decimal; negatives `-Rp1.000`; a real fraction shows at least two digits (`,50`) and a longer exact fraction is kept whole (`,6666`) — nothing is rounded or truncated **unless a workflow opts in** (below); null/undefined show `—` (never zero); malformed or unsafe input throws `RangeError` rather than printing a wrong amount. Compact output is rounded for display only and is never used for checkout, payment, ledger, invoice, receipt, audit or export values.

Parser: `.` is only a thousands separator and `,` only the decimal separator, so `1.250` is 1250 while `4000.50`, `1.25`, `1,250,000` and `1,250,000.75` are rejected as ambiguous instead of guessed. Empty is distinct from zero. A leading `Rp` is tolerated on paste.

Terbilang: exact (BigInt), `seribu`/`seratus`/`sebelas`, `sen` for ≤ 2 decimals, `minus` for negatives, up to 999 kuintiliun; beyond that range or precision it throws (or returns the caller's `fallback`).

### Opt-in display policy: payroll shows at most 2 decimals

`formatRupiah(value, { maxFractionDigits: 2, overflow: 'truncate' })`. Used by every KOSIPA payroll screen (`payroll-format.ts` → `formatAmount4`, `formatPayrollDecimal`): `Rp2.581.645.259,9063` is displayed as `Rp2.581.645.259,90`.
- The cut is **toward zero, not rounding** (owner's example: `,9063` → `,90`; rounding would give `,91`).
- A non-zero amount is never shown as zero: `0,0063` stays `Rp0,0063` (so a sub-sen reconciliation difference never reads `Rp0`).
- Display only. The recorded amount4 keeps its full 1/10,000 precision in the database, the reconciliation maths and the CSV export.
- Default behaviour stays strict (`throw`); only workflows that opt in truncate.

## Architecture

| Layer | Location |
|---|---|
| Rules (framework-free, exact decimal strings / BigInt) | `packages/domain/src/money/rupiah.ts`, `terbilang.ts` (exports `@koperasi/domain/money/rupiah`, `/terbilang`) |
| Web entry point + unit adapters (`formatSen*` for integer sen, `formatAmount4` for KOSIPA 1/10,000) | `apps/web/src/components/money/format.ts` |
| `CurrencyText` (`variant`: standard, document, accounting, compact, number; `unit`: rupiah, sen, amount4) | `apps/web/src/components/money/CurrencyText.tsx` |
| `CurrencyInput` (separate `Rp` prefix, live grouping, caret-safe, strict paste, explains refused separators / dropped digits, `inputMode`, canonical value + hidden field, `data-field` test hook) | `apps/web/src/components/money/CurrencyInput.tsx` |
| Existing helpers kept as thin adapters | `pos/preview.ts#formatRupiah`, `kosipa/payroll-format.ts` (payroll policy), `kosipa/presentation.ts#formatExactRupiah` (exact), `public-savings/client.ts#rupiah`, `sales/SalesChips.tsx#formatSalesMoney` |

## Public Savings PDF templates (versioned)

`apps/web/src/infrastructure/public-savings/pdf-templates.ts` is the registry.

| Version | Renderer | Amounts | Status |
|---|---|---|---|
| `kkisi-pss-a4/v1` | `pdf-lib-1.17.1/kkisi-pss-v1` | raw stored decimals (`100000.25`) | Frozen. Historical submissions stay bound to it. |
| `kkisi-pss-a4/v2` | `pdf-lib-1.17.1/kkisi-pss-v2` | `formatRupiahDocument` + `Terbilang:` line for the requested amount | Pinned into the evidence envelope of every **new** submission. |

How binding works (no schema change — the persisted envelope already recorded both values): `appendSubmission` writes `templateVersion`/`rendererVersion` once; every `RENDER_PDF` job and retry renders with the **persisted** values and denies on a renderer mismatch; a missing version means v1; an unknown version fails closed (`PDF_TEMPLATE_UNSUPPORTED`).
Evidence: `tests/public-savings-pdf-versions.test.mjs` renders v1 with the live code and with a frozen copy of the pre-v2 renderer (`tests/fixtures/pss-artifacts-v1.frozen.ts`) and requires identical digests and decrypted bytes; v2 determinism, content and failure paths; and a guard that the service never hard-codes a version. `public-savings-integration` (44/44, real DB + outbox) asserts a new submission's PDF is v2.
**Rollback caution:** once v2 submissions exist, deploying code older than this change would refuse to render them (`PDF_TEMPLATE_UNSUPPORTED`); roll forward, or keep v2-aware code on every worker.

## 75 mm receipts

`tests/receipt-layout-browser.mjs` renders the real receipt and return-note pages with the real CSS in Chromium (75 mm print emulation) for typical, long-value, worst-case (Rp989.999.999.999,01) and Kredit/return scenarios: paper is 75 mm, no horizontal overflow, no amount broken across lines. A CSS fix keeps each amount unbreakable and drops it to its own right-aligned line when a row is too wide (no precision is ever reduced). **Physical thermal printing is still pending** (no printer was available).

## Module coverage and evidence

| Module | Surfaces | Change | Verification | Status |
|---|---|---|---|---|
| POS / cashier | catalog, cart, summary, QRIS dialog, change, recap; cash input | `formatRupiah(sen)` adapter; `CurrencyInput` (whole rupiah, ≤10 digits, same digit-string `paidAmount`) | unit tests; `pos-cash-input-browser` (real browser: grouping, change from canonical value, refusal message, nothing sent); `pos-checkout-db` 11/12 | Done |
| POS receipt + return note | lines, totals | `formatSenDocument` (`Rp25.000,00`) + unbreakable amounts | `receipt-layout-browser` 6/6 scenarios | Done (hardware pending) |
| Sales | history, invoice, returns, payments | `formatSalesMoney` → `formatSen` | `sales-ui` tests; `sales-history-browser` pass | Done |
| Products / inventory pricing | list, detail, price strip, creator + editor inputs | shared formatter; `CurrencyInput` posting canonical strings | `products-browser` pass; `product-add-browser` pass (DB asserts sales_price 3996, discount 199.8); `product-edit-browser` pass (types `4.500,25`, DB asserts 4500.25); `product-add-db`/`product-edit-db` pass | Done |
| KOSIPA payroll | list, batch, member, reconciliation, payroll report, data-quality totals | payroll display policy (≤ 2 decimals) | `payroll-screens-render` (real pages + real application read path, `Rp2.581.645.259,90`; sub-sen guard; bypass guard); `kosipa-payroll-db` pass | Done |
| KOSIPA savings, loans, member page, reports | all amount4 sites | `formatAmount4` (same policy; those values are 2-decimal data) | domain + web tests; `kosipa-*-db` 6/6 pass | Done |
| Console dashboard | KPI (counts only), empty-state axis | axis via `formatRupiahCompact` | typecheck, review | Done |
| Public savings (form, operator, prototype) | amount input, review, summary | `CurrencyInput` (whole rupiah); shared `rupiah()`; terbilang on review | `public-savings-browser` pass (real OTP/signature/submit/PDF); integration 44/44; UI + prototype tests | Done |
| Public savings PDF | submission evidence | template v2 (see above) | v1/v2 tests; visual review of both PDFs | Done |
| Landing previews | static mock figures | `Rp756.000`, `Rp2.500.000` | scan | Done |
| CSV (KOSIPA) | machine-readable amounts | **unchanged** (`csv.ts` identical to `master`) | `kosipa-csv` tests | Unchanged by design |
| Excel | — | no Excel export exists | scan | N/A |

Source scan (`tests/currency-standard.test.mjs`): flags Intl currency style, `Rp ` with a space, `Rp.`, and `IDR` used as a display prefix. A valid `currency: 'IDR'` code in a machine-readable contract is deliberately allowed.

## Financial integrity evidence

- `git diff master..HEAD` shows **no change** in `apps/web/src/app/api`, repositories, `packages/application`, Prisma, `packages/domain/src/{pos,sales,inventory}`, `kosipa/csv.ts` or `money/money.ts`. The only infrastructure files touched are the PDF registry, the renderer and the one-line version pin in the Public Savings service.
- Round-trip tests: integer sen → decimal string → display → parse → the same sen (including 999,999,999,999 sen); formatting never mutates its input; canonical values submitted by `CurrencyInput` are the original dot-decimal strings.
- Real-DB suites (local staging copy / disposable containers only; no production data) executed unmodified against the new code: see results in the release report.

## Follow-ups and risks

1. **Float helpers in `ProductCreator`** (margin → selling price, discount % → discount): client-side prefill only; the user sees and can edit the result and the server recomputes margin/discount % from exact cents (`purchasePriceFor`, `productPricing`). Measured over 400,000 random cases, ~0.04% of suggestions differ by exactly Rp0,01 from exact half-up arithmetic. Not changed here; replace with the exact domain helper in a separate change.
2. **`pos-checkout-db` fixture drift (pre-existing):** `tests/fixtures/pos-schema.sql` lacks `db_salesreturn`, which the credit lookup now reads. With that table added to a disposable DB, 11/12 pass; the remaining test (20 concurrent Kredit checkouts) fails with a lock-wait timeout (the app deliberately caps lock waits at 8 s) on Docker/tmpfs. No code in this branch touches that path; investigate separately.
3. **Browser suites that need the shared console-store account** (`console-payroll`, `console-kosipa`, `console-savings`, `console-loans`, `console-uat`, …) could not run: the `kkisi_console` account is capped at 2 connections and a developer's running server holds one. Payroll is covered by `payroll-screens-render` instead. Run them when that server is stopped.
4. **Not executed (51 of the original 107 skips)** — need dedicated disposable DBs/accounts unrelated to currency: auth-store (11), console-store (3), cross-db-outbox (11), e2e-isolation (1), inventory-db (9), pos-privileges (1), toko-writer-contract (5), warehouse-store (6), warehouse-toko-applier (2), PSS actual-schema (1; container sentinel refused), PSS recovery (1).
5. `pos-register-recap-staging` fails at its own precondition (stale `.e2e-pos-recap.json`: the recorded cashier session is no longer open).
6. Product browser CDP scripts are intermittently flaky right after login (also on `master`); they pass on repeat.
7. Pre-existing build warning: `src/instrumentation.ts` uses `process.exit` (Edge-runtime notice). Unrelated.
8. Physical 75 mm thermal print not verified (no printer).
9. Legacy CI2 app, prototype mock-ups and the Member PWA (only a static landing preview exists here) are out of scope.
