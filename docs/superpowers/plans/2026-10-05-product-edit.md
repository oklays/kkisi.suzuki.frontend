# Native Product Edit Implementation Plan

Goal: authorized native edit and stock adjustment on existing local replicated tables.
Architecture: UI -> guarded GET/POST edit API -> domain parsers/application ports -> read repository + restricted writer transaction.
Constraints: local kkisi-staging only; no new tables; preserve existing products/read work, old invoice/mobile records and other modules. Design: ../specs/products-inventory/edit-design.md.

- [x] Tests first for edit and adjustment validation, input allowlist, server permission/CSRF/company scoping and local writer restrictions.
- [x] Implement snapshot/read options and conflict-checked transactional update/ledger port, safe handler and API route.
- [x] Add grouped native editor with stock delta confirmation, loading/errors, conflict reload and uncertain-outcome review. Replace legacy Edit link; retain legacy Add.
- [x] Activate dedicated restricted local product writer; inspect grants/schema without migrations.
- [x] Run rollback-only real DB checks, synthetic-row browser save/read/ledger checks, responsive screenshots, lint/typecheck/tests/build. Record limitations. No commit/push/deploy.

Evidence and repeat commands: [edit-verification.md](../specs/products-inventory/edit-verification.md).
