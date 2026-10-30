# Thermal receipt typography implementation plan

**Goal:** Improve the existing KKISI TB2 receipts with readable black monospace text and clear totals, preserving transaction behavior.

**Architecture:** Keep repository → readReceipt → server-rendered receipt → shared receipt.css → ReceiptPrintButton/window.print. Apply presentation-only uppercase with explicit identifier exceptions. Keep the fixed 75 mm measured page and shared money formatter.

**Scope:** Checkout Cash/Kredit/QRIS, sales reprints, and cash/credit return notes. No schema, calculations, permissions, APIs, device commands, dependencies, push, or deployment changes. Work directly in the requested checkout. The supplied implementation request authorizes the design and inline execution.

## Discovery and design

The current stylesheet uses Arial 13 px, a 17 px header, 15 px total, #111 text and #333 separators. Metadata reserves 105 px plus a gap; long values wrap in the remainder. The shared print button measures full-width content after fonts load and before printing. Checkout embeds the receipt in a 75 mm frame. Only 75 mm is configured now; historical 80 mm documentation does not establish a second selectable width. No 58 mm option, ESC/POS, image printing, or driver controls exist in this path.

Chosen approach: CSS monospace typography with 10 pt body/details, 13 pt header, 12 pt grand total; black text and rules; stronger 600/700 weights; flexible label/value wrapping; amount tokens stay intact and move to a right-aligned second row if necessary. Uppercase is inherited only by receipt content. Identifier cells opt out since case semantics are unknown. Preserve all fields and the Rp document format with sen precision. Keep footer content and 3 mm tear allowance.

Alternatives considered: retaining Arial with bold fixes hierarchy but misses the requested monospace legibility; adding native ESC/POS or new paper settings expands unverified hardware scope. The CSS approach reuses all current variants without changing the print mechanism.

## Task 1: Regression and before evidence

Files: apps/web/tests/receipt-layout-browser.mjs; apps/web/tests/pos-enhancement-browser.mjs.

- [x] Render the unmodified six fixture receipts and save before screenshots.
- [x] Extend the existing real-page browser harness with checkout/reprint Cash, Kredit, QRIS, member limits, returns, returned-sale notice, long identifiers/names, maximum amounts, and narrow previews.
- [x] Check computed monospace/black/uppercase hierarchy, unchanged raw values, identifier exceptions, bounds and collisions; run and observe failure on the original styles.

Run: `RECEIPT_SHOTS=/private/tmp/kkisi-receipt-typography/after pnpm --filter @koperasi/web exec node tests/receipt-layout-browser.mjs`.

## Task 2: Shared presentation

Files: apps/web/src/app/pos/receipt/[id]/receipt.css; apps/web/src/app/pos/receipt/[id]/page.tsx; apps/web/src/app/pos/return-receipt/[id]/page.tsx.

- [x] Apply the selected type tokens and CSS uppercase; mark identifier dd elements with receipt-identifier so raw and displayed case remain intact.
- [x] Keep money intact and right-aligned, including discount/tax notes; preserve labels, conditional fields, footers and precision.
- [x] Run the layout harness; review before/after screenshots, including worst-case width and return notes.
- [x] Update the existing print integration expectations for the new computed size and uppercase PDF extraction; verify manual, automatic and browser-menu preparation and 1/40/80-item one-page PDFs.

## Task 3: Verification and handover

- [x] Run `pnpm check`, `pnpm build`, both browser harnesses and `git diff --check`. Report skips or failures explicitly.
- [x] Save a focused report at docs/migration/RECEIPT_TYPOGRAPHY_2026_10_30.md with changed files, evidence, compatibility and hardware procedure.
- [x] Keep generated synthetic preview artifacts under docs/migration/receipt-typography-2026-10-30/ for review.

Physical acceptance requires a real printer: self-test versus receipt, correct paper/orientation, manufacturer-approved head cleaning, supported driver density/speed, then reprint Cash/Kredit/QRIS/return at 100% with headers/footers disabled and verify totals, feed and cut. No hardware is available in this task; do not claim physical darkness or cutting verified.
