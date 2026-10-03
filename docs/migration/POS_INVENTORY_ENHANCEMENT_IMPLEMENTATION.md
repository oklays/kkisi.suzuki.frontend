# POS behaviour and inventory implementation

Implemented and verified locally on 2026-10-03 from `docs/migration/prompts.md`, using the brownfield specification in `docs/superpowers/specs/pos-inventory-enhancement/`. Branch: `feat/pos-inventory-enhancement`. Worktree: `/private/tmp/kkisi-pos-inventory-enhancement`, based on `dd5a3daa`. The initial implementation handoff had no commit, merge, push or deployment.

### Authorized local Git integration

After that handoff, the user explicitly requested committing the receipt changes on the current branch first, then committing this feature and merging it into `master`. Receipt commit `85bfb6e7` was created on `master-dev`, containing only the five receipt-related files; its five repository tests, package typechecks and scoped lint passed. The feature's full `pnpm check` also passed again before committing. The local integration will carry both the receipt commit and the feature into `master`, followed by checks on the combined result. Push and deployment are outside this follow-up.

## Delivered behaviour

| Request | Result |
| --- | --- |
| Member defaults | Successful NIK, card, member-ID and supported QR lookup selects Kredit Anggota. Cash remains selectable. Failed lookup or releasing a member resets Cash. |
| Larger cart | Barcode success opens the center Keranjang panel. Full names, product discount, quantities, line totals, removal and confirmed clear remain available. The transaction panel retains member selection, totals and payment. |
| Product navigation | Exactly Product and Keranjang tabs replace category chips. The initial tab is Product; reads are capped at 25 and retain product/barcode search. Keyboard tab navigation works. |
| Checkout safety | Pending barcode results cannot repopulate a cleared/paid cart. Consecutive scans remain additive. Uncertain checkout retains its original key across reload, locks cart mutation and retries without duplicate payment. |
| Warehouse | Authorized global administrators can list, create, edit, deactivate and reactivate the organization-wide master. Branch users cannot access its API. |
| Stock Opname | Authorized users can list/read their selected branch's documents, create a draft, search products, save physical counts including zero, approve atomically or cancel. Only the creator can change a managed draft. Legacy documents remain readable and immutable. |
| Recovery | Failed detail reads retry the selected ID. A lost create response retains the visible original fields and request UUID through tab/form remounts. Other creators' drafts show a read-only explanation. |

Approval replaces stock with the saved physical count, appends signed `Penyesuaian` stock entries and releases item locks in one transaction. Repeated approval does not duplicate adjustments. Cancellation releases locks and removes the draft without changing stock. Snapshot drift, competing drafts, revoked permissions, foreign branch IDs and invalid counts fail safely. Money calculations use minor units and reject cent values that the existing DOUBLE storage cannot represent accurately.

## Legacy findings and boundaries

Documentation-first research was followed by targeted PHP inspection and SELECT-only schema verification. `db_warehouse` has no company or address column: it is a global name/mobile/email/status master. SO headers/details are branch-scoped; their actual status and quantity columns are signed INT. The stock ledger contains signed quantities and the `Penyesuaian` note, with no document reference column. All affected tables are InnoDB. No warehouse balance or transfer schema exists.

The new path uses existing tables and a `NXT-SO-<UUID>` document namespace. It requires `inventory_so` for SO and `inventory_view` plus the existing global-admin policy for Warehouse. Page/API guards derive identity and company from the session; POST uses same-origin JSON/CSRF, and transactions recheck the active user and permissions. Domain and application packages remain independent of Prisma and React.

Legacy SO approval and commented product locking differ from the safer new lifecycle. The company mutex coordinates new inventory and existing Next POS transactions; it cannot serialize arbitrary legacy writers. Existing operational ownership remains unchanged. Selected schema parity and synthetic runtime proof do not establish operational ledger reconciliation or concurrent legacy compatibility.

## Verification evidence

| Check | Observed result |
| --- | --- |
| Brownfield coverage validator | All ten REQ identifiers covered by design, tasks and verification. |
| `pnpm lint` | Exit 0; zero errors and two existing internal-navigation warnings in TransactionPanel. |
| `pnpm typecheck` | All three workspace packages passed. |
| `pnpm test` | 173 passed, zero failures, 40 opt-in database tests skipped. Domain 15; application 16; web 142 passed / 40 skipped. |
| `pnpm build` | Production build passed; `/inventory` and all three inventory APIs generated. Anonymous `/inventory` redirected with 307. |
| Inventory MariaDB integration | Nine tests passed, zero skipped/failures on an isolated marked MariaDB 11.4 fixture. |
| POS browser | Cash/change, Kredit, all member lookup modes/Cash override, cart tabs/clear, delayed scan races and lost-response reload/replay passed. Four viewport checks passed without runtime exceptions. |
| Inventory browser | Draft/count/approve/cancel, global warehouse/status changes, failed read recovery, frozen create replay, branch isolation and other-creator read-only presentation passed. Six viewport checks passed without runtime exceptions. |
| Visual inspection | Inspected rendered desktop/mobile POS and inventory screenshots, plus populated center-cart screenshots at 1440, 390 and 320 pixels. No horizontal page overflow. |
| Independent review | POS/backend/spec reviews and final whole-source review completed; no outstanding Critical or Important findings. |

The nine DB scenarios cover UUID replay/conflicts, snapshots/zero/valuation, audit/idempotency, competing documents/foreign IDs/legacy immutability/revoked permissions, stock drift/cancel, global warehouses/duplicate names, 20 concurrent approvals, rollback at every count/approve/cancel write and pre-commit, shared POS mutex, zero-stock/PPOB policy/corrupt duplicates, and extreme DOUBLE precision. The production browser server used separate restricted reader, inventory, POS, register and auth accounts, all against synthetic records.

Logs and review reports are retained under `/private/tmp/kkisi-pos-inventory-work/`: `tests-final.log`, `lint-final.log`, `typecheck-final.log`, `build-final.log`, `inventory-db-final.log`, `pos-browser-final.log`, `inventory-browser-final.log`, `pos-cart-visual.log` and `whole-review-final.md`. Screenshots: `/private/tmp/kkisi-pos-cart-*.png`, `/private/tmp/kkisi-pos-live-*.png` and `/private/tmp/kkisi-inventory-*.png`.

## Local staging activation

Menu/read access is enabled for users with the existing permissions. Mutations remain disabled by default in `.env.example`. A local administrator must provision a separate inventory writer on an approved local schema copy, using the actual schema listed above. Do not reuse the reader, POS, register or root account.

The inventory writer needs SELECT on the staging schema and only these mutation privileges:

| Table | Privileges |
| --- | --- |
| `db_warehouse` | INSERT, UPDATE |
| `db_inventory_so`, `db_inventory_so_dtl` | INSERT, UPDATE, DELETE |
| `db_items` | UPDATE |
| `db_stockentry` | INSERT |

Keep credentials in ignored local configuration. Set `INVENTORY_WRITES_ENABLED=1`, `DATABASE_URL_INVENTORY_WRITE` to that dedicated writer, and `POS_WRITE_DATABASE` to the same named staging database as `DATABASE_URL`. Reader and writer must use matching loopback host, port and database. Restart the app after configuration changes. The writer validator rejects remote targets, root, account reuse, disabled flags and target mismatches. Read-only operation still works when no valid writer exists. No existing environment file or shared staging/operational grant was modified during this implementation.

## Repeating isolated verification

Run normal checks from the feature worktree:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
.agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/pos-inventory-enhancement
```

DB/browser helpers deliberately refuse the existing staging target. They require a disposable instance at **127.0.0.1:3310**, database **kkisi_pos_staging**, with `_pos_test_marker` value **kkisi-pos-disposable-synthetic**. Load `apps/web/tests/fixtures/pos-schema.sql` followed by `inventory-schema.sql`; both contain DDL only. Use a tmpfs-backed container with no shared volume. Provision the auth schema using `apps/web/db/auth/001_auth_schema.sql` and synthetic-only restricted accounts for browser tests. The fixture account may reset only this disposable database. Scripts validate the target and marker before deletions.

From `apps/web`, with `POS_TEST_DATABASE_URL` privately set to the disposable fixture account:

```sh
INVENTORY_DB_TEST=1 node --experimental-strip-types --test tests/inventory-db.test.mjs
node --experimental-strip-types tests/inventory-browser-seed.mjs
```

The browser seed creates `synthetic1`, `synthetic2`, `syntheticadmin`, password `Synthetic-Pos-1`, synthetic member NIK-7/CARD-7/ID 7, registers and 31 branch-one products. These identities must never be loaded into shared or operational databases. Start the built app on loopback **3126**, with `APP_ORIGIN=http://127.0.0.1:3126`, a fresh auth secret and all DSNs pointing to the disposable instance. For encrypted-QR coverage only, use `aes-256-cbc` with synthetic-key/synthetic-iv. Chrome must be available, or set `CHROME_BIN`.

```sh
node tests/pos-checkout-browser.mjs
node --experimental-strip-types tests/inventory-browser-seed.mjs
node tests/inventory-browser.mjs
```

Run these sequentially and reseed between suites. Both browser scripts create and remove their own Chrome profiles. Test ports 9254/9255 and 3126 must be available. The disposable server/container were stopped after verification; the pre-existing `kkisi-staging` instance on port 3307 was retained.

## Rollback and remaining operational gates

Before withdrawing mutation access, approve or cancel known managed drafts through the guarded workflow to release their item locks. Then set `INVENTORY_WRITES_ENABLED=0` and restart. Retain approved documents/audits; correct an approved count with a new SO. Never bulk-unlock legacy items or delete ledger entries to reverse an approval.

Remote deployment and operational cutover are unperformed. They require an approved writer-ownership plan, legacy writer coordination, backup/restore rehearsal, inventory ledger reconciliation and runtime acceptance on the authorized target. This feature does not provide warehouse transfers, per-warehouse balances or expiry batch management.

At the initial handoff, the original checkout remained `master-dev` at `dd5a3daa`; its receipt changes and prompt were preserved. The prompt snapshot was copied into the feature worktree so its specifications refer to the same request. Generated specification copies were removed from the original checkout after byte-for-byte comparison with the worktree copies. The later Git integration is authorized above; the prompt will be retained in the feature commit and the receipt work in its separate commit.
