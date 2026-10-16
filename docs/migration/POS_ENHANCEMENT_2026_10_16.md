# POS checkout and 75 mm receipt enhancements

Source: `docs/prompts/enhancement_pos.md`. Implemented locally on 2026-10-16. Local integration into `master`, followed by `master` → `master-dev`, was authorized after implementation. No database/schema changes, new dependencies, remote push, or server deployment.

| Source requirement | Implementation | Evidence |
| --- | --- | --- |
| 1. Enlarge member remaining/total limit text and make it blue | `pos.css`: 10 → 13 px, semibold, #123b88; explicit “Total limit” label | Actual React browser rendering checked at 1440, 390 and 320 px without horizontal overflow |
| 2. Clear remaining barcode and employee NIK after successful payment | `PosScreen.tsx` clears its product query on confirmed checkout; `TransactionPanel.tsx` resets member search, selected member, tender and payment method | Event regression tests and actual browser checkout confirm both fields empty; rejected/uncertain payments retain member/search generation and retry safety |
| 3a. Larger receipt font, narrower padding, 75 mm paper | `receipt.css`: body 11 → 13 px, title 15 → 17 px, total 13 → 15 px; footer inherits body text size and black color; horizontal padding 5 → 1.5 mm | Browser computed styles and exported PDF width; saved receipt and return receipt share these styles |
| 3b. Stop printing beyond receipt end | `ReceiptPrintButton.tsx` calculates explicit `@page` width/height at full 75 mm paper width, after fonts load and before printing; print CSS removes viewport minimum height and hides non-receipt content | 1-, 40- and 80-line receipts each produce exactly one PDF page with all items and complete footer; narrow checkout iframe and full preview calculate identical page dimensions; automatic print invoked once |

## Root causes and boundaries

The barcode query lived in `PosScreen` and was not reset by its checkout callback. Member query text lived privately inside `MemberSearch`, so clearing the selected member did not clear the input. Only confirmed checkout resets the member search; its unmount cleanup invalidates outstanding lookup responses so an earlier lookup cannot populate the next transaction. A reset also returns the identifier mode to its default NIK selection.

The receipt already had 75 mm content width, but 5 mm padding on each side and an 11 px base font. `@page size:auto` left the job size to the printer/driver default: the synthetic browser reproduced a short receipt on a full 612 × 792 pt Letter sheet. The new explicit page height includes the full receipt padding plus less than 2 mm rounding allowance. It recalculates for automatic printing, the print button, and browser-menu printing. Component cleanup removes the dynamic page rule when leaving the receipt.

This fixes excessive printable page length in the browser. The reported continuous dots on the physical printer were not directly reproduced because that printer is not connected to this workspace. Browser/PDF success does not prove device stopping, cutting, driver support for custom roll length, or spooler behavior.

## Verification

- `pnpm check`: lint and TypeScript passed; 278 tests passed (28 domain, 22 application, 228 web), 42 opt-in tests skipped; no failures.
- `pnpm build`: production build passed. The existing Google Font download required network access outside the restricted sandbox.
- `pnpm --filter @koperasi/web exec node tests/pos-enhancement-browser.mjs`: passed using only synthetic data and a loopback HTTP server; no application database or real printer access.
- Browser checks include actual POS/receipt React components, desktop/mobile layout, automatic print count, iframe sizing, receipt PDF text completeness and page count, and no runtime exceptions.
- `git diff --check`: passed. The source prompt is included in the change. The development-generated `apps/web/next-env.d.ts` was backed up before the final production build regenerated its standard type references.

Browser verification requires installed Chrome and Poppler (`pdfinfo`, `pdftotext`). Default evidence directory: `/private/tmp/pos-enhancement-verification/`, including screenshots and `receipt-1.pdf`, `receipt-40.pdf`, `receipt-80.pdf`, plus `receipt-auto-page-baseline.pdf` for comparison. This path is temporary and machine-local.

## Physical printer acceptance

Use the configured receipt printer with 75 mm paper width, 100% print scale, no browser headers/footers, and a driver setting that honors the supplied roll/page length. Print a short Cash receipt, a member Kredit receipt and a longer receipt. Confirm larger readable text, complete totals/footer, one job, and paper feed/cut ending after the footer. Repeat with “Cetak Ulang Struk”. Confirm barcode and NIK are blank for the next transaction; cancelling print must not undo or repeat the confirmed payment.

If dots/feed continue despite the PDF ending correctly, inspect the printer model, selected driver/paper length, and queued job before claiming physical acceptance. Those device-specific facts are not available in this workspace.
