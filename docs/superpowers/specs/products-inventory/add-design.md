# Native product add — 2026-10-05

"Tambah produk" on `/products` now opens a native dialog instead of the legacy `items/add` form. Writes go only to the local Docker `kkisi-staging` replica (`127.0.0.1:3307/kkisi_staging`) through the existing dedicated product writer. No table, column, migration or Prisma schema change.

## Legacy reference

`Items::newitems` → `Items_model::verify_and_save` and the `items.php` form/JS:

| Legacy behaviour | Native implementation |
| --- | --- |
| Required barcode, name, category, unit, price, sales price | Same; validated in domain parser and form |
| Duplicate check `upper(custom_barcode)` per branch | Unit and pack barcode checked against both barcode columns, plus SKU and manual item code, per branch, under the branch row lock |
| `item_code = item_init + pad(max(id in branch)+1, 4)` | Same formula when code is left blank; steps past codes already taken by hand-edited items |
| `purchase_price` = price (Inclusive) or price + tax% (Exclusive); margin ↔ sales price; discount % ↔ Rp | Same two-way form helpers; server recomputes purchase price, `profit_margin` and `discount_persen` exactly from saved values |
| Opening stock → `db_stockentry` row, then `update_items_quantity` | One `Stok Awal` ledger row and `db_items.stock` = opening stock in the same transaction (equal to the legacy recompute for a new item) |
| Type Produk Jadi / PPOB, konsinyasi, status Aktif/Draf, expiry date, alert qty, unit per pack, description | Same fields. PPOB cannot have opening stock (consistent with the editor) and `SALDOPPOB` is reserved |

## Deliberate differences

- `tax_id` stores the selected tax. Legacy add hardcodes `1` even though it computes the price with the selected tax; legacy update stores the selection.
- Not implemented: image upload (legacy writes to the legacy server's `uploads/items/`), status SO on creation (new items start unlocked), quick-add category/brand/unit/tax modals, and the `ALTER TABLE db_items AUTO_INCREMENT=1` the legacy add runs on every save (DDL).
- Not written: the mobile/marketplace `products` table. Legacy inserts there for Produk Jadi, but only 219 of the latest 789 replicated items have a matching row, and the editor already leaves mobile sync out of scope.

## Access and safety

- `GET/POST /api/products/add` require `items_add`; POST also requires Origin, CSRF and JSON. Branch and actor come from the session only. The transaction locks the branch row and rechecks the user, role, branch and `items_add` before inserting.
- Writer grants added by `apps/web/scripts/setup-product-write.mjs --apply`: column-level `INSERT` on `db_items` and `SELECT` on `db_tax`. The writer still cannot delete or change schema.
- No automatic retry. On an unconfirmed result the form locks and offers a barcode lookup; a manual retry with the same barcode is rejected as a duplicate.

## Verification

From the repository root, with the app on port 3000:

```sh
PRODUCT_ADD_DB_TEST=1 node --env-file=apps/web/.env.local --experimental-strip-types --test apps/web/tests/product-add-db.test.mjs
node --env-file=apps/web/.env.local --experimental-strip-types apps/web/tests/product-add-browser.mjs
pnpm check && pnpm build
```

The DB test runs inside a rolled-back transaction against the real schema. The browser test saves marked draft products (`NXTADDUI…`, `NXT PRODUCT ADD UI TEST`), checks prices, the ledger, lost-response recovery, scanner Enter, four viewports and focus return, then deletes exactly those rows.
