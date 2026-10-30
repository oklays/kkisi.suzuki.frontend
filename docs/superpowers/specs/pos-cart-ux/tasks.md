# POS cart UX tasks

- TASK-001 (REQ-001, REQ-002): add failing cart-order tests; implement metadata
  helpers in `apps/web/src/features/pos/cart-state.ts`, typed metadata in
  `types.ts`, and wire `PosScreen.tsx`/`CenterCart.tsx`. Verify arbitrary response
  order, restoration, repeated IDs and stable canonical checkout sequence.
- TASK-002 (REQ-003, REQ-004): add failing quantity tests; implement shared domain
  validation/setter in `packages/domain/src/pos/preview.ts`, editable control in
  `TransactionPanel.tsx` and compact styles in `pos.css`. Verify input, buttons,
  locking, scan forwarding and draft races in a browser.
- TASK-003 (REQ-005): run pnpm check/build, focused browser checks, inspect exact
  staged diff, commit/push master, fetch/update master-dev, merge master into it,
  rerun relevant gates and push. Verify remote equality and clean local tree.
- TASK-004 (REQ-005): verify SSH/live checkout/config/disk/rollback, fast-forward
  deployed branch, build and recreate only web. Verify readiness/image/assets/
  browser runtime and read-only POS behavior. Report any unverified live gate.
