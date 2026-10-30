# POS thermal receipt typography — 30 October 2026

Implemented locally in the existing checkout. No push, deployment, transaction write, migration, dependency, or printer setting change.

## Findings and existing flow

`PrismaReceiptRepository.find` projects stored sale data → `readReceipt` → `/pos/receipt/[id]` server component → shared `receipt.css` → `ReceiptPrintButton` → `window.print()`. Checkout embeds that page in a 75 mm frame. Reprints use the same page with mode and permission guards. `/pos/return-receipt/[id]` uses the same stylesheet/button with its existing return reader. No changes were made to those readers, guards or print-button implementation.

Application-side readability issues: Arial proportional text; mixed-case labels/names; #111 body and #333 rules; 13 px body / 12 px notes / 15 px total with limited hierarchy. Long values had a fixed 105 px label column plus gap. A later `margin:0` rule overrode totals' auto left margin, so amounts that wrapped to their own flex line lost right alignment. The new browser regression reproduced this on the transaction discount; the fix preserves right alignment on both single- and second-line amounts.

The supplied text mentions a faded physical receipt, but no photograph or thermal device was available for inspection. Application text cannot establish whether fading originates in the printhead, paper, heat/density, speed, or driver. This flow exposes no device darkness/speed/native-font controls, sends no ESC/POS commands, and uses vector/browser text rather than a low-resolution raster receipt. No device commands or arbitrary heat settings were added.

## Typography and layout

| Area | Before | After |
| --- | --- | --- |
| Typeface and contrast | Arial, #111 | Local Courier New → Liberation Mono → monospace; black text and rules |
| Body and metadata | 13 px regular | 10 pt (3.53 mm em at 100%), weight 600; tabular numbers |
| Product details / notes | 12 px notes | 10 pt regular notes, bold product names |
| Store and grand total | 17 px / 15 px | 13 pt / 12 pt bold; total bounded by solid black rules |
| Case | Mixed | CSS uppercase only within receipt; exact-case identifier exceptions |
| Metadata | Fixed pixel label width | Character-based label column, aligned colon, wrapping value column |
| Financial rows | Wrapped amounts could align left | Intact amount tokens, right aligned on either row, no precision reduction |
| Footer and print | Existing text / measured 75 mm page | Existing messages, compact spacing, 3 mm bottom padding, print section break avoidance |

Uppercase includes store/address/telephone, labels, dates, cashier/member names, method, products, money prefix and footer. `salesCode`, return code, originating sale code and member NIK retain their exact case because their case sensitivity is not established. Raw records, DOM text values, API data and money formatter remain unchanged. Document Rupiah formatting retains the shared `Rp25.000,00` convention and sen precision; CSS displays `RP25.000,00`. No new spaces, rounding or calculations were introduced.

All existing conditional information is preserved: checkout member limits, Cash tender/change, product discounts, recorded reprint taxes/discounts, returned-sale notice, return reason/refund method, and receipt/return footer messages. Sale dates remain date-only because the existing reader supplies no sale time; no time was invented. Reprints continue to exclude current member credit aggregates.

## Changed files

| File | Purpose |
| --- | --- |
| `apps/web/src/app/pos/receipt/[id]/receipt.css` | Shared typography, black contrast, hierarchy, wrapping, alignment, print rules |
| `apps/web/src/app/pos/receipt/[id]/page.tsx` | Exact-case identifier classes; nonbreaking discount/tax amount spans |
| `apps/web/src/app/pos/return-receipt/[id]/page.tsx` | Exact-case return/sale/member identifier classes |
| `apps/web/tests/receipt-layout-browser.mjs` | Expanded actual-template layout checks and synthetic scenarios |
| `apps/web/tests/pos-enhancement-browser.mjs` | New physical font-size and uppercase PDF text expectations |
| `docs/superpowers/plans/2026-10-30-receipt-typography.md` | Focused discovery, design and execution checklist |
| This report and `receipt-typography-2026-10-30/` | Before/after evidence and printer validation handover |

## Before / after previews

Open [the comparison](receipt-typography-2026-10-30/before-after.html) for paired real-template browser screenshots: Cash reprint, Kredit reprint and credit return with a wide amount, plus the updated member checkout receipt. All fixtures are synthetic; large-value fixtures are layout stress cases, not committed transactions. The screenshots now capture only `.receipt-paper`, excluding the surrounding browser viewport. The preview labels the 75 mm paper width. The exported PDF separately verifies the actual content-sized page.

- Cash: [before](receipt-typography-2026-10-30/sale-typical-cash-before.png) / [after](receipt-typography-2026-10-30/sale-typical-cash-after.png).
- Kredit: [before](receipt-typography-2026-10-30/sale-kredit-member-before.png) / [after](receipt-typography-2026-10-30/sale-kredit-member-after.png).
- Credit return: [before](receipt-typography-2026-10-30/return-long-values-before.png) / [after](receipt-typography-2026-10-30/return-long-values-after.png).
- [Member checkout after](receipt-typography-2026-10-30/checkout-kredit-after.png) and [one-item print PDF](receipt-typography-2026-10-30/receipt-1.pdf).

## Verification and compatibility

- `pnpm check`: lint + all workspace TypeScript checks passed. Domain 347 passed; application 177 passed; web 477 passed, 146 opt-in tests skipped. Total 1,001 passed, zero failed. Skipped DB/provider suites do not constitute live acceptance.
- `pnpm build`: Next.js production build passed.
- `pnpm --filter @koperasi/web exec node tests/receipt-layout-browser.mjs`: 13 scenarios passed using the real server templates and global/receipt CSS, with auth/data readers stubbed. Covers checkout and reprint Cash/Kredit/QRIS, checkout member limits, original/reprint tax and discount fields, returned-sale notice, cash and credit returns, long names and case-sensitive identifiers, wide amounts, and 320 px screen previews. Checks 75 mm print bounds, collisions, amount integrity/right alignment, computed type hierarchy/contrast/case and unchanged input data. The typography assertion failed against original Arial; the right-alignment assertion failed before the margin correction.
- `pnpm --filter @koperasi/web exec node tests/pos-enhancement-browser.mjs`: real React checkout and receipt components with synthetic loopback APIs; manual/automatic print integration, single automatic job, narrow iframe/full-preview geometry equality, no runtime exceptions, POS at 1440/390/320 px. PDFs for 1/40/80 items each contain one complete 75 mm page, all items and footer; `size:auto` baseline still reproduces Letter output. Existing unit tests cover browser-menu `beforeprint` preparation.
- `git diff --check`: passed.

| Configuration | Status |
| --- | --- |
| Current fixed 75 mm page | Chromium screen/print/PDF verified with synthetic data |
| Historical 80 mm printer workflow | Current code still requests 75 mm; physical 80 mm driver/media fit requires validation at 100% without automatic scaling |
| 58 mm | No existing project configuration; unsupported, not claimed verified |
| Local monospace fonts | No font download/dependency; tested with the locally resolved Chromium stack; other OS fallback metrics need device checks |
| Physical thermal darkness, feed and cut | Not verified |

`lpstat -p -d` listed only EPSON_L5290_Series and its fax queue; no thermal receipt queue. No job was sent. Browser/PDF evidence proves presentation and page geometry, not physical darkness, mechanical cutting, driver acceptance or actual printed type size.

## Physical printer validation procedure

1. Record the thermal printer model, driver, roll width and manufacturer-supported printable width. Print its built-in self-test according to its manual; compare text darkness with the application receipt. If self-test is also faint, suspect hardware, paper or device settings first.
2. Confirm compatible thermal paper, coated-side orientation and paper condition. Inspect and clean the thermal printhead only by the manufacturer's instructions, then repeat the self-test.
3. In the supported driver utility, record current darkness/density and speed. If the manufacturer permits adjustment, change one supported setting at a time and compare; do not send undocumented ESC/POS commands or exceed supported settings.
4. Print the existing 75 mm job at 100% / actual size, zero browser margins and browser headers/footers disabled. Verify the driver's custom roll/page-length support and printable area; avoid fit-to-page shrinking. When using an 80 mm roll, verify physical placement and that no edge is clipped.
5. Reprint a short Cash receipt, member Kredit receipt, QRIS receipt, long product/name/identifier case, large total, and both return methods. Confirm clear digits, no overlap/clipping, correct right alignment, complete tax/discount/limit information and footer, one job, and sufficient tear/cut allowance. Measure actual type size on paper rather than inferring it from screen pixels.
6. Compare self-test and application output again. Record model/settings, paper, result and a dated physical sample before marking physical quality accepted. If self-test is dark but application output is faint, inspect driver scaling and text rendering; if both are faint, investigate paper/head/power/device configuration.

## Remaining limits and rollback

No real thermal printer or printed sample was tested. 58 mm support and a selectable 80 mm profile were not added because they do not exist in the current print flow. Thermal heads and drivers may ignore or scale browser page dimensions; real-device acceptance remains open. Very long values intentionally wrap and may increase receipt length rather than truncate. Local monospace weights are font/driver-dependent; CSS bold does not guarantee increased thermal density.

Rollback consists only of reverting the five changed application/test files; documentation and synthetic evidence may be retained. No database or device rollback is required. This report records local implementation and verification; production activation is a separate operation.

## 75 mm width recheck

On user review, the original 400 px screenshot included a 283.453125 px receipt and 116.546875 px of empty viewport on the right. That empty area was outside the paper. Chromium measured paper width 74.997 mm (75 mm with CSS pixel rounding), left/right padding 1.5 mm each, and content width 71.997 mm. The saved PDF MediaBox width is 212.88 pt, approximately 75.10 mm after PDF page quantization.

Changed the screenshot harness to capture the receipt element alone, regenerated the original and updated previews, removed the comparison figure's white surround, and added assertions that the image width matches the receipt width and both horizontal paddings are 1.5 mm. The screenshot-width assertion failed with the former 400 px capture and passed after the correction. All 13 updated layout cases and the six original-style baseline cases passed; changed-file lint and diff checks passed. Production receipt CSS and print geometry were unchanged during this recheck. Physical paper measurement still requires a thermal printer.
