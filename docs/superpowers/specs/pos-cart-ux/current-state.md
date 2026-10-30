# POS cart UX — current state, 30 October 2026

The attached end-to-end request authorizes implementation, tests, master push,
master → master-dev promotion and the established server deployment, without
routine approval pauses. It overrides the skills' intermediate approval gates.

`PosScreen.tsx` owns cart state, barcode lookups, checkout locks, and optional
localStorage keyed by user/company/register. `CenterCart.tsx` renders stable
product-ID keys. `TransactionPanel.tsx` contains the shared quantity controls,
discounted preview totals, member/credit controls and idempotent checkout.
`ProductCatalog.tsx` owns product search and its explicit Scan/Enter actions.
There is no global scanner shortcut or scanner SDK.

`packages/domain/src/pos/preview.ts` merges by product ID, appends new products,
updates existing projections, refuses excess stock, and removes at minus-one.
Catalog products have no variant/unit-line discriminator; all checkout quantities
are whole integers. `sale.ts:parseCheckout` enforces 1–9999, rejects duplicate IDs,
and sorts checkout items by ID independently of the display. Preserve this.

Existing tests include pos-preview, pos-cart-ui, pos-checkout-state,
pos-checkout-http, pos-enhancement-ui and synthetic/local browser suites.
Domain baseline: 347 passing; focused web baseline: 12 passing.

Deployment documentation: `docs/migration/GENESIS_DEV_DEPLOYMENT.md`.
The more recent ignored `.local/genesis-release/e0581306-20261030-receipt/REPORT.md`
records `/opt/apps/genesis.web/repo`, master-dev, Docker image
`genesis-web:e0581306-20261030-receipt`. Verify these live before deployment.
No new database, worker, API, auth, pricing or inventory architecture is needed.
