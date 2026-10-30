# POS cart UX — 30 October 2026

Source: the attached POS/Kasir end-to-end request. The user authorizes master
push, master → master-dev promotion and deployment; no routine approval pause.
Specification: [pos-cart-ux](../superpowers/specs/pos-cart-ux/requirements.md).

## Implementation

- `apps/web/src/features/pos/cart-state.ts`: successful adds stamp an action order
  allocated before lookup. Late responses retain the maximum order and aggregate
  quantity. Display sorting copies the array, preserving canonical checkout order.
- `apps/web/src/features/pos/types.ts`: optional persisted `lastAdded` metadata.
- `apps/web/src/components/pos/PosScreen.tsx`: monotonic add/scan IDs, restoration
  above saved order, guarded absolute quantity commits, preservation of newer
  search text, and stock checks against current cart state instead of stale scans.
- `apps/web/src/components/pos/CenterCart.tsx`: sorted display and stable product-ID
  keys, forwarding quantity and scanner actions.
- `packages/domain/src/pos/preview.ts` and the web `preview.ts` re-export: shared
  absolute/delta validation of safe integer quantities 1–9999 and stock. Invalid
  absolute input never removes or clamps a line. Existing minus-at-one removal,
  price/discount projections, totals and checkout server ordering are preserved.
- `apps/web/src/components/pos/TransactionPanel.tsx`: editable local draft, Enter/
  blur commit, Escape cancellation, concise visible/accessibly described errors,
  external scan invalidation and no per-keystroke requests.
- `apps/web/src/components/pos/pos.css`: compact centered quantity field, matching
  button height, focus and error states; checked down to 320 px at the POS scale.

Keyboard scanner identification uses cadence for Enter-terminated bursts of at
least five characters (longer than any valid quantity). Keyboard events do not
identify hardware; short numeric codes remain ambiguous with manual typing and
must use the existing barcode field. No scanner prefix/configuration is changed.

No dependencies, application database schemas, migrations, pricing, settlement,
inventory deductions, checkout endpoints, RBAC or production flags are changed.

## Automated verification

| Gate | Result |
|---|---|
| `pnpm check` | PASS: lint 0 errors / 6 existing warnings; strict typecheck; 1,005 tests pass, 146 opt-in skips |
| `pnpm build` | PASS, exit 0; existing instrumentation `process.exit`/Edge Runtime warning remains |
| `pos-cart-ux-browser.mjs` | PASS: actual React with synthetic HTTP; ordering, reverse responses, repeat merge, stable DOM/focus, manual input, validation, stock/max, totals, draft/scan races, restore, payment locks and Cash/QRIS/Kredit |
| `pos-checkout-db.test.mjs` | PASS: 12 suites, including real synthetic transaction persistence, rollback, idempotency, stock and concurrent shared credit limits |
| `inventory-db.test.mjs` | PASS: 9 suites; stock-opname/checkout guards, persistence and isolation |
| `pos-checkout-browser.mjs` | PASS: authenticated built app on loopback 3126; real synthetic DB, Cash/Kredit, member ID/card/QR, stale scans, reload/retry and responsive layout |
| Built-app cart smoke | PASS: actual catalog/barcode reads, manual Enter/blur, discounted totals, stock refusal, newest/repeat order, focused scanner, +/- and restoration; no checkout in this smoke |
| Spec coverage / `git diff --check` | PASS |

Changed versioned tests: domain `pos-preview.test.mjs`; web
`pos-cart-state.test.mjs`, `pos-cart-ui.test.mjs`, `pos-cart-ux-browser.mjs`,
`pos-checkout-browser.mjs` (input values replace the old text-span assertions),
and `pos-enhancement-ui.test.mjs` (updated module boundary stub).

The new state/input assertions were observed failing before implementation. A
further browser regression reproduced a delayed scan using stale stock quantity;
the current-state validation fixes it. Screenshots were visually inspected.

Database checks used only task-owned `kkisi-pos-cart-ux-test`, MariaDB 10.11.19,
loopback 3310, tmpfs, synthetic rows and the existing disposable marker. The old
POS fixture lacks the current returns-reader table: its existing structure only
was loaded from the local staging dump, with no source rows. The fixture's shared
reader/writer pool initially exhausted available slots during the 20-transaction
credit case; a disposable-only 40-slot pool passed all cases. The authenticated
app used distinct restricted reader/POS-writer/auth accounts and 4-slot pools.
These are LOCAL_SYNTHETIC checks, not production acceptance.

## Git and deployment evidence

Baseline local master/master-dev and fetched origin refs agree at `e0581306`.
Exact resulting commits, remote equality, server-access attempts and final status
are recorded in the execution report at `.local/pos-cart-ux/REPORT.md`.

Documented target: `root@117.54.42.178`, `/opt/apps/genesis.web/repo`, last local
release record says master-dev and image `genesis-web:e0581306-20261030-receipt`.
Repeated SSH connections and a TCP-22 probe timed out; public HTTPS `/health`
returns 200 from the same IP. The current deployed branch/revision/rollback image
cannot be verified through that blocked connection. No live source, environment,
container, tunnel or database has been modified by this task.

After server SSH access is restored, verify actual clean checkout/branch, current
revision, readiness, disk space and retained rollback image before pulling the
verified branch with `--ff-only`. Follow the established Docker procedure, retain
the previous image/compose.env, preserve environment bytes and recreate only
`web` with `up -d --no-deps web`. Verify readiness, source/image/assets and safe
authenticated cart interactions. Do not reuse the previous release's flag-changing
activation script for this UI-only task. No production sale is required.
