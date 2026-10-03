# Verification and traceability

| Requirements | Design / task | Verification |
| --- | --- | --- |
| REQ-001 | Selection event / TASK-001 | Browser successful NIK/card/ID defaults Kredit; Cash click stays selected; lookup failure/removal resets Cash; QR compatibility retained. |
| REQ-002 | Product tab/shared cap / TASK-001 | Application catalog test observes limit=25; rendered tablist has exactly Product/Keranjang; search/barcode paths work. |
| REQ-003 | CenterCart / TASK-001 | Scan opens Keranjang; center contains full names/counts/discount/totals and quantity/remove/clear; transaction aside contains no item list; narrow/desktop screenshots. |
| REQ-004 | Existing lock/persistence / TASK-001 | Uncertain response/reload keeps retry UUID and disables all cart mutations; Cash/Kredit/receipt regression tests remain passing. |
| REQ-005 | Inventory GETs / TASK-002,TASK-003 | Session/RBAC before repository; branch ID injection ignored; list/detail/search/empty/retry checks. |
| REQ-006 | Global Warehouse / TASK-002,TASK-003 | Reject branch users, create/update/deactivate/reactivate global master; duplicate names and invalid email fail. |
| REQ-007 | UUID draft creation / TASK-002,TASK-003 | Valid dates/period; same UUID replay returns one document; modified payload conflict; malformed date rejection. |
| REQ-008 | Count snapshots/locks / TASK-002,TASK-003 | Explicit zero and positive counts, derived adjustment/cost, update original snapshot, another draft rejection, foreign item rejection. |
| REQ-009 | Atomic approval / TASK-002,TASK-003 | Correct stock/one signed audit/unlocks; approval replay no extra audit; empty/drift/invalid branch line fail; injected writes roll back. |
| REQ-010 | Atomic cancellation / TASK-002,TASK-003 | Draft canceled/releases locks with stock unchanged; approved/legacy immutable; retry harmless. |
| BR-001,BR-002,VAL-001 | Pure parsers / TASK-002 | Signed INT boundaries, zero/negative/fractional/NaN/overflow, period/name/email lengths, real dates, item policy and no warehouse balances. |
| SEC-001 | Guard and transaction recheck / TASK-002,TASK-003 | Unauthorized and CSRF calls never reach writer; revoked permission rejected inside transaction; no company/user spoofing. |
| SEC-002 | Writer validator / TASK-002,TASK-003 | Disabled/nonlocal/root/reader/POS/register identity and target mismatches rejected. Existing environments/grants untouched. |
| NFR-001 | Existing layers/bounds/mutex / TASK-002,TASK-004 | lint/typecheck, 25/50/500 limits, concurrent create/add/approve/checkout and transaction rollback tests. |
| OBS-001 | Safe logs and audit / TASK-002,TASK-004 | Safe errors, sanitized logs, persisted creator/audit quantities; response never includes Prisma/SQL/DSN detail. |
| MIG-001 | No operational migration / TASK-002,TASK-004 | Managed prefix enforced; legacy documents read-only; selected synthetic DDL and source-schema evidence reported separately; no operational writes. |

Commands: `.agents/skills/brownfield-spec-engineer/scripts/validate-spec-coverage.sh docs/superpowers/specs/pos-inventory-enhancement`; `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`. Focused and optional DB/browser commands will be recorded with their actual outputs after execution. No deployment smoke test is authorized or required.

## Observed acceptance evidence: 2026-10-03

All four implementation tasks are complete in the isolated feature worktree. Full verification: coverage validator passed; lint exit 0 with two existing warnings; three package typechecks passed; production build passed; unit suites passed 173 with zero failures and 40 opt-in skips. Nine isolated MariaDB integration scenarios passed with no failures/skips, including concurrency and forced rollback at every mutation boundary. POS and inventory browser suites passed against the production build with restricted synthetic accounts. Desktop/mobile screenshots were inspected, including the populated center cart. Final independent source review found no outstanding Critical/Important findings.

Exact commands, tested flows, logs, activation/rollback procedure and external gates are recorded in `docs/migration/POS_INVENTORY_ENHANCEMENT_IMPLEMENTATION.md`. REQ-001..010 and BR/VAL/SEC/NFR/OBS/MIG have local implementation evidence as mapped above. Warehouse/SO write access remains default-off for existing environments; the tested writer was provisioned only in a separate marked disposable fixture.

Schema facts were verified by SELECT-only local inspection; full operational ledger parity, arbitrary legacy-writer concurrency and remote deployment remain unverified. No operational writes, schema migration, existing grant/env change, commit, merge or deployment occurred.
