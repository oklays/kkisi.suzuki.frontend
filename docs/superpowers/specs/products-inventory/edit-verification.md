# Native product editor verification — 5 October 2026

Delivered a native editor at `/products`, opened with the pencil button on a row or Edit in its detail dialog. Data produk edits code, actual SKU, name, barcodes, associations, packaging, prices, discount, minimum stock, active status and description. Penyesuaian stok accepts the final physical quantity, previews the signed difference and requires review before saving. Metadata save does not adjust stock.

The local writer is activated on Docker `kkisi-staging`, `127.0.0.1:3307/kkisi_staging`. Existing `db_items` is updated; existing `db_stockentry` receives the signed difference and one supported legacy enum reason in the same transaction. No Prisma schema change, table creation, migration, remote write, commit, push or deployment occurred. The table still shows the catalog code separately from the actual legacy `sku` column.

## Access and configuration

- `items_view` is required for the catalog; `items_edit` is required for the editor snapshot and saves. Existing role grants determine access for cashier, store head and admin; no new grants or blanket role bypass were introduced.
- Origin and CSRF are required for POST. Company and actor come from the validated session. The transaction rechecks active company, user, role, branch access and `items_edit` before locking the item.
- Dedicated `kkisi_product_write` has SELECT on required existing tables, UPDATE on the allowed product columns only and INSERT on the stock ledger. It cannot create items, delete products or change the schema. Reader/auth/POS/register/inventory credentials are separate.
- `.env.local` has `PRODUCTS_WRITES_ENABLED=1` and the dedicated `DATABASE_URL_PRODUCT_WRITE`. It and the local backup are ignored and mode 600. The example configuration defaults to disabled. Validation rejects remote targets, ports/databases other than the existing local replica, and shared writer identities.
- Provisioning command, from repository root: `node --experimental-strip-types apps/web/scripts/setup-product-write.mjs --apply`. It requires existing private `.env.staging` and `.env.local`. Without `--apply` it only validates preparation. This configures the local account and ignored environment; it does not update product rows.
- Product SO locks and stale revisions return 409. Changed codes/SKUs/barcodes cannot introduce duplicates in the branch. Damage, expired and missing reasons only reduce stock. PPOB stock is excluded.

## Verification evidence

| Check | Result |
| --- | --- |
| `pnpm lint` | Exit 0; five existing warnings, no new warnings |
| `pnpm typecheck` | Exit 0 across all packages |
| `pnpm test` | Exit 0; domain 15, application 16, web 157 passing, 41 opt-in DB tests skipped: 188 passes total |
| `pnpm build` | Exit 0; `/products`, `/api/products` and `/api/products/edit` emitted |
| Focused auth/product tests | 17 passes; guards, CSRF, strict fields, validation, company scope, writer restrictions and read semantics |
| Opt-in product database test | One passing real-schema integration scenario, entirely rolled back |
| Native edit browser test | Real local save/readback, concurrency conflict, stock ledger, uncertain response recovery, branch denial, responsive dialogs and focus passed |
| Catalog browser regression | Real catalog filters/search/pagination/CSV/detail/error recovery and six viewport checks passed |
| Final fixture cleanup | 20,498 original catalog rows; zero test items and zero test ledger entries |
| `git diff --check` | Clean |

Database verification used two explicitly marked synthetic products in the existing tables. It saved metadata and verified stock stayed unchanged, adjusted 10 to 7 and verified ledger quantity -3 with reason Rusak, rejected a stale second mutation, confirmed a zero adjustment creates no ledger, rejected invalid associations and foreign items, and forced a failure after the real ledger INSERT to prove the whole transaction rolls back. An injected SO flag within a real transaction verified the server lock branch; an invalid actor was denied. These checks did not modify an arbitrary replicated product.

Browser verification persisted SKU, name, selling price, alert quantity and inactive status and read them back through SQL and a reopened form. A competing valid mutation caused the original form submission to return 409 and require a fresh read. A 7 to 9 stock save was committed, then its response was replaced with 503: submission stayed disabled, the fresh read showed 9, and no duplicate ledger entry was created. Invalid CSRF returned 403 and a foreign-branch snapshot returned 404.

Editor viewports: 1440x900, 1024x768, 390x844 and 320x700; dialogs fit without horizontal overflow, no runtime exceptions, close restored focus. Desktop form, mobile form and mobile stock screenshots were visually inspected. Catalog regression additionally covered 1280x720 and 768x1024. Screenshots are local `/private/tmp/kkisi-product-edit-*.png` and `/private/tmp/kkisi-product-stock-*.png` artifacts.

## Repeat local checks

Use the existing ignored `.e2e-kasirpos.json` login fixture with an account allowed `items_view` and `items_edit`. The fixture tool validates the local Docker target, refuses occupied IDs and clones an existing row into two marked test-owned rows. It creates no tables. Clean up even if a test fails. Run these sequentially from repository root:

```sh
node --experimental-strip-types apps/web/scripts/product-edit-fixture.mjs --seed
PRODUCT_EDIT_DB_TEST=1 node --env-file=apps/web/.env.local --experimental-strip-types --test apps/web/tests/product-edit-db.test.mjs
node --env-file=apps/web/.env.local --experimental-strip-types apps/web/tests/product-edit-browser.mjs
node --experimental-strip-types apps/web/scripts/product-edit-fixture.mjs --cleanup
node apps/web/tests/products-browser.mjs
pnpm check
pnpm build
```

Browser tests require the local app on port 3000 and Chrome. Test credentials/configuration remain private and ignored. The DB scenario expects fresh seeded stock of 10, so run it before the mutating browser scenario. Cleanup verifies exact test row markers before deleting their rows and ledger entries. The read-only catalog browser test can run independently.

## Boundaries

Add product still opens the legacy form. This edit module preserves historical invoice barcodes and mobile `products` records; it does not implement mobile synchronization. Stock adjustment follows the existing Next inventory transaction model and does not recompute legacy stock from all historical purchase/sales tables.

The existing ledger note is an enum and has no actor or free-text reason field. Metadata saves use the existing legacy actor/time columns; stock actions log actor/company/item/delta through the application logger. No durable actor column or idempotency key was invented. Automatic retry is disabled and an uncertain result requires fresh review; this is not a durable exactly-once guarantee across manual retries or legacy external writers. Stok remains a refreshable snapshot.

Evidence is for the actual local replicated schema and this application path. Production cutover, remote forms, other legacy writers and mobile synchronization were not tested. Work remains uncommitted in the active checkout.
