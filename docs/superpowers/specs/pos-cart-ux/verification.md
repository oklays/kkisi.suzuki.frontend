# POS cart UX verification

| Requirement | Design / task | Evidence |
|---|---|---|
| REQ-001 | recent-add metadata / TASK-001 | first/second/multiple/repeated add; no manual reorder; remove; stable ID and checkout order |
| REQ-002 | monotonic order + generation / TASK-001 | reverse response completion; restoration/rerender; late clear/checkout and newer query regression |
| REQ-003 | domain setter + draft / TASK-002 | 1→10→100→1; Enter/blur/empty/zero/negative/fraction/exponent/text/stock/max; +/-; line/total discounts |
| REQ-004 | draft baseline + scanner burst / TASK-002 | scan while draft/blur; scanner focus forwarding; repeated buttons; accessible lock; desktop/mobile screenshots |
| REQ-005 | release gates / TASK-003, TASK-004 | pnpm check/build; browser; Git graph/push; server/image/health evidence and rollback |

Additional invariants: BR-001 existing HTTP/domain checkout/payment/credit tests;
VAL-001 domain/UI rejection tests; SEC-001 current RBAC/storage scope regressions;
NFR-001 request count and stable DOM identity; OBS-001 visible localized feedback;
MIG-001 exact Git diff and runtime/container/environment identity checks.

Commands: `pnpm check`, `pnpm build`,
`pnpm --filter @koperasi/web exec node tests/pos-cart-ux-browser.mjs`.
Database integration tests remain opt-in and require disposable/local synthetic
targets. No real sale is authorized. Report skips and distinguish synthetic UI,
deployed assets/health and authenticated live acceptance.
