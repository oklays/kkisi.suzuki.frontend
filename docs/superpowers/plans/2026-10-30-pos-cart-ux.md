# POS cart UX implementation plan

Execute inline using executing-plans under the user's explicit end-to-end
authorization. Scope: `../specs/pos-cart-ux/`. No intermediate approval pauses.

1. Add failing tests in domain pos-preview, web pos-cart-state and pos-cart-ui.
   Verify the failures describe missing setter, ordering and input behavior.
2. Implement `quantityError(product, quantity): 'invalid' | 'stock' | null` and
   `setQuantity(cart, product, quantity)`; delta updates reuse this validation.
   Preserve existing minus removal. Add `lastAdded?: number` to UI lines, helpers
   `addCartProduct(cart, product, order)` and `cartDisplayOrder(cart)`; metadata
   updates use `Math.max(oldOrder, order)`. Sort copies only.
3. Wire a monotonic `useRef` to accepted scans/catalog adds, initialize above saved
   orders, preserve checkout-generation invalidation and functional query clearing.
4. Add an absolute-quantity callback through CenterCart/CartItem; implement a local
   `{value, quantity}` draft. `draft.quantity !== line.quantity` discards obsolete
   edits. Parse digits only, validate before callback, reset and announce invalid
   commits. Enter prevents default, Escape resets; blur commits once. Recognize
   fast scanner bursts longer than four characters and forward via existing scan.
5. Run domain/web tests; add actual React Playwright browser scenarios covering all
   requested ordering, quantity, scanner, restoration, totals and checkout locks.
   Run `pnpm check` and `pnpm build`, review focused diff and secrets exclusion.
6. Commit explicit task paths on master with requested message; `git push origin
   master`; fetch, update master-dev safely, `git merge --ff-only master` if
   ancestry allows, otherwise inspect a regular merge. Recheck and push master-dev.
7. Reverify live target `/opt/apps/genesis.web/repo` and actual deployed branch.
   Check source cleanliness, readiness, disk and rollback image; pull only with
   `--ff-only`; build revision-labeled genesis-web image. Backup compose.env and
   runtime identifiers; preserve environment hash. Change only web image tag and
   `docker compose ... up -d --no-deps web`. Revert the tag if readiness fails.
8. Verify public health/login/anonymous access, deployed source/assets, runtime
   errors and safe cart interactions where an authorized session is available.
   Record exact hashes, skips/blockers and rollback commands in the task report.
