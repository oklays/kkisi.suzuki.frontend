# POS and inventory enhancement implementation plan

> For agentic workers: use subagent-driven-development with task review, and test-driven-development for behavior changes. User authorized immediate implementation; use the isolated feature worktree and preserve the original checkout.

**Goal:** implement every request in the current migration prompt with verifiable POS and inventory workflows.

**Architecture:** retain pure domain policies, application repository ports/use cases and app-owned Prisma adapters. POS keeps its current cart/checkout state; inventory reuses actual legacy tables through a separate staging-only writer.

**Tech stack:** pnpm 10, installed Next 16/React 19/Prisma 6.12, TypeScript, Node built-in tests, headless Chrome.

**Subsequent user authorization:** after the verified implementation handoff, commit the receipt work on the current branch first, then commit this feature and merge into local `master`. This overrides the initial no-commit constraint below for this Git integration. Receipt commit: `85bfb6e7` on `master-dev`. Keep push/deployment outside this follow-up and verify the combined result after merging.

## Global constraints

- Work in `/private/tmp/kkisi-pos-inventory-enhancement`, branch `feat/pos-inventory-enhancement`; do not commit/push/deploy or modify original receipt work.
- User request snapshot: `/private/tmp/kkisi-pos-inventory-work/request.md`; authoritative specification: `docs/superpowers/specs/pos-inventory-enhancement/`.
- Catalog page cap 25; visible POS tabs exactly `Product` and `Keranjang`; preserve .8 shell scale and checkout retry locks.
- No operational writes, migrations, reset, shared database grants, private environment edits, new dependencies or invented warehouse branch ownership.
- Inventory writes require dedicated distinct staging-only account and explicit enablement; all APIs/pages enforce session permissions, writes enforce CSRF and transaction authorization.
- Warehouse global administration requires inventory_view and role <=2; SO requires inventory_so and session branch scope. New managed document numbers use `NXT-SO-<UUID>`.

## Task 1: POS behavior and center cart

Requirements REQ-001..004. Files and implementation directions: task brief `/private/tmp/kkisi-pos-inventory-work/task-1-brief.md`.

- [x] Write failing member-default/cap/cart-layout regressions using current test patterns; run package-local Node tests and capture expected failure.
- [x] Change successful selection to Kredit, clearing to Cash; leave explicit Cash override enabled.
- [x] Change shared page cap to 25; replace category buttons with accessible tabs; scan opens center cart; keep all cart operations/clear confirmation and checkout locks.
- [x] Remove duplicate transaction item list; keep member/totals/payment and checkout state mounted; preserve responsive CSS and shell scale.
- [x] Run focused tests/lint/typecheck and write test results to task report. No commits.

## Task 2: Inventory backend

Requirements REQ-005..010, BR/VAL/SEC/NFR/OBS/MIG from spec. Files and exact contracts: task brief `/private/tmp/kkisi-pos-inventory-work/task-2-brief.md`.

- [x] Add failing domain validation, use case/global authorization, HTTP session/CSRF and writer config tests; verify red before implementation.
- [x] Implement domain parsers/types and application InventoryManagement/repository ports; export through existing inventory subpath.
- [x] Implement dedicated local-staging writer, parameterized repository with company/global mutex, permission recheck, managed draft/count/approve/cancel lifecycle, immutable snapshots and safe audits.
- [x] Add thin guarded routes for stock-opnames/items/warehouses; return agreed response shapes and code-only errors.
- [x] Run backend-focused tests/lint/typecheck and report. Root integrates UI/proxy/config and synthetic DB tests. No commits.

## Task 3: Inventory UI and verification integration

Requirements REQ-005..010, SEC/OBS/MIG. Files: `apps/web/src/app/inventory/page.tsx`, `components/inventory/InventoryScreen.tsx`, `inventory.css`, `components/pos/PosShell.tsx`, `features/pos/types.ts`, `app/pos/page.tsx`, `src/proxy.ts`, `.env.example`, `tests/inventory-*.mjs`, fixture SQL and implementation report.

- [x] Add failing guards/navigation/transaction fixture checks; verify failure.
- [x] Page capabilities come from auth permission checks; pass boolean stockOpname/warehouse/write availability and session CSRF token. Guard before queries.
- [x] Render live list/detail and explicit forms for draft, count, approval/cancel; global Warehouse name/mobile/email/status forms; show precise safe error text and retry. Disable controls during requests; confirm approval/cancel/deactivate.
- [x] Extend navigation and proxy coverage. Add placeholder configuration and provisioning/rollback instructions only.
- [x] Provision a disposable marked synthetic fixture (no shared volumes), run lifecycle/rollback/concurrency and browser desktop/mobile checks. Clean up its server/container only.
- [x] Run spec coverage, pnpm lint/typecheck/test/build; review diffs and update task/verification evidence. No commit/push/deploy.
