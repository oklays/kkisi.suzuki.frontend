# KKISI Web — Next.js application

This directory contains the **new** Next.js application alongside the original reverse-engineering documentation in `docs/` (`00-index.md`–`10-diagrams.md`). The legacy PHP source remains in `../tokonew.kkisitb2.id/`.

## Getting started

Requires Node.js 20.9+ (Node 22 recommended).

```sh
cd kkisi.web
npm ci
npm run dev
```

Visit http://localhost:3000/pos. `/pos` is a **POS UI preview with isolated example data**. Search by name/code/barcode, filter categories, add/change/remove items within example stock bounds, look up example member identifiers, and preview Cash/Kredit selection. Cart state resets on refresh. Checkout, promotions and unsupported payment modes are disabled. Tax and credit limits are not calculated.

No DB connection, operational authorization or payment processing exists yet. Never point this preview at production credentials. Real POS must enforce server-side session, `sales_add`, company scope, and an open register before serving operational data.

## Quality checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

Optional browser checks require an installed Playwright package and Chromium. Start the production build on port 3100, then run:

```sh
npm run start -- --hostname 127.0.0.1 --port 3100
# In another terminal; omit PLAYWRIGHT_MODULE if playwright is installed locally.
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:browser
```

`POS_URL` overrides the preview URL; `POS_SCREENSHOTS` overrides the screenshot directory (default `/private/tmp/ksm-pos-verification`). Browser checks cover search, barcode Enter, category filters, cart limits, member identifiers, disabled payment/checkout, clear confirmation, refresh and horizontal overflow at five widths.

## UI structure

`src/app/pos/page.tsx` supplies isolated `src/components/pos/fixtures.ts` to `PosScreen`. Reusable presentation components live in `src/components/pos/`; read projection types live in `src/application/pos/contracts.ts`. `preview.ts` contains in-memory preview helpers, not production business calculations. Future server use cases supply verified projections; do not turn the fixtures into a service or persistence layer.

Illustration filenames preserve the supplied five category families with six variants each. Selection hashes the product ID; real images take precedence, with a fallback on image-load error. The supplied SVGs contain empty raster wrappers, so the app uses replacement native vectors; originals remain in the mockup directory. All UI icons use Lucide React.

## Next steps

Follow `../.kiro/specs/pos-kasir-revamp/{requirements,design,tasks,ui-foundation}.md`. Next checkpoint: authenticated read-only Product & Inventory integration, with bounded queries and verified company/category/stock/image mappings. Operational characterization remains required before pricing, member credit or checkout integration. Do not enable production transaction writes before the single-writer cutover and parity checks in `../docs/migration/DATA_OWNERSHIP.md`.
