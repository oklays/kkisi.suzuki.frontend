# POS / Kasir migration — target design

The presentation foundation is implemented as an explicitly labeled fixture preview.
Operational domain, service, authentication and persistence design below remains
unimplemented. See `ui-foundation.md` for the actual component mapping and evidence.

## Legacy flow observations
| Step | Code path / operation | Risk / verification |
|---|---|---|
| Login / gate | `Login::verify`; `MY_Controller::load_global`, `permission_check('sales_add')`; `Pos::index` | Verify actual redirect/session on staging. |
| Register | `Pos::pilih_kasir`, `buka_toko`, `new_invoice`, `tutup_kasir`; inserts `db_buka_kasir`, Quotation `db_sales`; close sums Final Cash/Kredit and deletes pending quotation/cart | Company ID supplied in request to buka_toko; verify scope and same-day behavior. |
| Search / member | `Pos::search_item`, `getnik`, `getnik_qr`, `getidcard`, `detailanggota`; `Pos_model` matching methods; reads `db_items`, `m_anggota`, `db_sales` | Trace view JS and exact search predicates/responses before new API contract. |
| Add / quantity | `Pos::add_to_cart_new`, `update_qty_pos_new`, `removerow_new` use `db_cart`; older `add_to_cart` writes `db_salesitems` directly | Determine which flow view actually invokes; verify stock guard. |
| Discounts / totals | cart stores `price_per_unit`, `discount_amt`, `tax_amt`; `Pos_model::pos_save` accepts posted `subtotal`, `grand_total`, `bayar`, `kembalian`, `diskon_all` | Client values are trusted by legacy; server-authoritative recalculation is necessary, may differ from current edge cases. |
| Checkout | `Pos::pos_save` → `Pos_model::pos_save`: copies cart into salesitems, updates quotation → Final, deletes cart, recomputes stock per item, calculates HPP, replaces salespayments | `trans_begin()` commented out; partial-write risk. No claim of atomic legacy behavior. |
| Inventory | `Pos_model::update_items_quantity`: sums stockentry and dated purchase/return/sale, sets `db_items.stock`, updates `products.current_stock` | Existing docs incorrectly describe simple decrement + new stockentry; reconcile staging data before port. |
| Receipt | `Pos::print_invoice_pos` and `Print_pos` | Check template and print payload. |
| Reporting | `db_sales`, `db_salesitems` `Final` + `subtotal_hpp`, payments feed reports and kasir close | Verify report filters and accounting with sampled sales. |

## Target boundaries
Next.js scaffold is located in `kkisi.web/`. Follow existing `docs/migration/module-boundaries.md` when implementing POS: thin `app/pos` and API handlers; feature UI components; server application use cases; pure pricing and credit domain rules; repository ports with MySQL adapters; external SMS port. No direct database access from browser. Reuse legacy DB tables; staging clone first.

## Safety design
- Cut over POS, stock, purchase, return, opname **together per company**, or retain PHP as sole transaction writer via a secured compatibility gateway until all stock writers can transfer. A Next.js-only POS writer alongside PHP purchase/returns cannot guarantee ownership from `DATA_OWNERSHIP.md`.
- Server-issued checkout key persisted with unique enforcement (schema decision pending), or safely reuse an existing unique quotation/sales identifier with a transactional locking protocol. Never rely on button disable only.
- Acquire ordered row locks on register, quotation/cart and item stock within DB transaction; verify active session and current price; compute authoritative totals; write all sale rows/payment/stock mirror/audit effects in the same transaction; on error rollback and keep cart. Exact stock formula/mirror policy must be decided from characterization.
- For the approved UI: sidebar + center product explorer + right 440px transaction panel; cash and legacy Kredit only until other methods verified. Leave mockup-only promotion and payment buttons visibly unavailable, not operational.
- No schema migration proposed yet. Any new key/index needs PHP compatibility analysis, reversible SQL and a tested rollback plan.

## Required evidence before each checkpoint
Save staging fixtures and actual request/response/DB before/after snapshots. Run unit/integration tests, lint, type checks and build when project exists; log failures, do not hide them.
