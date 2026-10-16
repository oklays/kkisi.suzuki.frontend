# POS member, checkout reset, and 75 mm receipt fixes

Source: `docs/prompts/enhancement_pos.md`. Execute in the requested checkout; preserve the source prompt and user-authored changes. Local commit to `master` followed by `master` → `master-dev` integration was subsequently authorized. No database/schema change, remote push, or deployment. Generated `next-env.d.ts` follows the final production build output; its prior development form is backed up.

Design: retain the existing POS components and checkout confirmation boundary. Increase the member limit summary from 10 px to 13 px in brand blue. On confirmed checkout clear the product query and remount only member search to clear its query and invalidate outstanding lookups. Retain inputs and retry keys on errors or uncertain outcomes.

Receipt: retain 75 mm width, increase body text from 11 px to 13 px, title 15 to 17 px and total 13 to 15 px; reduce horizontal padding from 5 mm to 1.5 mm. Compute explicit page height at the full 75 mm paper width before printing, including vertical padding and a small rounding allowance. Share this preparation between automatic, button, and browser-menu printing; remove viewport minimum heights and exclude everything except the receipt in print. Avoid automatic repeated jobs. Browser completion does not prove that a physical printer printed or cut successfully.

- [x] Reproduce missing barcode/member reset with runnable component event checks, including failed and uncertain checkout preservation.
- [x] Fix confirmed-checkout reset in `PosScreen.tsx` and `TransactionPanel.tsx`; enlarge member summary in `pos.css`.
- [x] Add failing receipt preparation checks; implement content-sized print in `ReceiptPrintButton.tsx` and `receipt.css`. Check short, long, and narrow-frame layouts.
- [x] Verify rendered desktop/mobile styles, single print invocation and bounded page geometry with synthetic fixtures; run focused tests, lint/typecheck, build and diff checks.
- [x] Record coverage of every source bullet, verification evidence and physical-printer limitation in the implementation report.
