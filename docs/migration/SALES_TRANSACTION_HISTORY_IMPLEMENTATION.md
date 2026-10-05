# Sales Transaction History — Implementation Handover

Date: 5 October 2026

Status: implemented and polished in the local checkout; local browser UI audit passed. Representative staging acceptance and activation are pending.

## Delivered locally

- Added `/sales`, `/sales/invoice/{id}`, and read-only list/detail/payment GET APIs over the existing `db_sales`, `db_salesitems`, `db_salespayments`, company, item, and register tables.
- Added Jakarta-time date defaults, bounded filters and pagination, exact stored-money projections, scoped metadata, and fail-closed print eligibility.
- Reused the existing receipt page for explicit 80 mm reprint preview. Server permission checks enforce `sales_view` for history, `sales_payment_view` for payment rows, and `sales_add OR sales_view` for receipt access. A viewer cannot select checkout mode to read current member credit aggregates.
- Kept checkout/register writes on existing paths. No schema, database, table, index, seed, grant, or migration changes were made.

## Local verification

Run from the repository root:

```sh
pnpm check
pnpm build
git diff --check
```

Final local results: domain 22 passed, application 20 passed, web 184 passed / 0 failed / 42 existing opt-in skips; `pnpm build` and `git diff --check` passed. Four existing lint warnings remain in transaction panel and register test code. Focused behavior tests cover date/query validation, read use cases, SQL scoping and mapping, permission gates, receipt checkout/reprint behavior, and rendered list/detail states. Local fake-Prisma tests do not establish compatibility with representative live staging data. The existing local test account/data also passed the authenticated browser suite across 375/390/768/1280/1440 px. Slow/error/payment pagination scenarios use synthetic request interception; no transaction rows were created. Print verification uses a window.print spy, not a physical printer.

## Remaining gates before activation

1. On an approved existing staging environment, confirm reader-only privileges and the required legacy columns/indexes with SELECT-only inspection. Do not create or migrate schema.
2. Complete the live role/branch matrix, representative long invoices/payment histories, physical print/PDF acceptance, and checkout/register regression on approved staging. The local filter/navigation/responsive/payment-retry/reprint browser scenarios already passed. Use synthetic identities/data; do not run checkout seeders or write tests against operational data.
3. Verify representative legacy rows for nulls, returns, payment statuses, session references, tax/charges/round-off, and foreign/missing children. Compare stored values without exporting customer PII.
4. Measure the planned 30-request warm benchmark and query plans against that same approved staging environment. Existing indexes must meet the target without schema changes; otherwise keep activation gated and plan a separate change.
5. Review the final diff and record staging evidence in `docs/superpowers/specs/sales-transaction-history/verification.md`.

## Rollback

Rollback is code-only: revert the Sales routes/components and receipt reprint-mode changes to the previous application build. No database rollback is required or permitted. Before activation, verify the previous build still serves existing checkout receipt behavior and the current code does not alter rows, stock, payment, credit limit, or register balances.

No commit, push, deployment, production inspection, schema operation, or business-data mutation is part of this handover. Browser login uses existing local session housekeeping.

## UI and behavior audit

See [Sales UI audit](SALES_TRANSACTION_HISTORY_UI_AUDIT.md) for every observed root cause and fix. Highlights: optional-register filter validation; persistent sidebar capabilities/loading/error shell; separate content scroll; payment/status chips; query reset/back/pagination; cancellable payment reads and failed-page retry; scoped detail counts; exact legacy totals/reprint parity; restoration of original checkout Final predicates.
