# Financial task-unlocking matrix and Warehouse integration readiness matrix (checkpoint 13)

Legend: **Impl** implemented · **Local** verified locally · **Staging** staging accepted · **Prod** production ready · **Owner** blocked by owner decision · **Operator** blocked by operator evidence. "—" means not applicable. No step below is staging accepted or production ready.

## 1. Financial (KOSIPA): order of unlocking

| # | Step | Prerequisites | Impl | Local | Staging | Prod | Blocked by | Becomes executable when |
|---|---|---|---|---|---|---|---|---|
| 1 | Savings **official balance** interpretation and parity (TASK-025, REQ-023) | G2 level 3 → 4 → 5 | read ledger yes; official balance **no** | ledger yes | no | no | Operator (O1, O5) | O1 report at level 3 (analysis), O5 at level 5 (display) |
| 2 | Loan **outstanding** interpretation and parity (TASK-026/043) | G3 levels 3–5; D6 | recorded schedule yes; outstanding **no** | yes | no | no | Operator (O1, O5), Owner (D6) | same chain + D6 |
| 3 | Payroll component and generator parity (TASK-027/045) | G4 + G5 levels 3–5 | recorded components yes; parity **no** | yes | no | no | Operator (O1 shows `x_proc_create_matrix` absent on the copy) | O1 with the procedure body |
| 4 | Verified TOKO Kredit ↔ payroll mapping | D5 + G4 level 3 | comparison (review-only) yes | yes | no | no | Owner (D5), Operator (O1) | D5 confirmed against the generator body |
| 5 | Read-only reconciliation on approved comparable components | 3 + 4 | review-only reconciliation yes | yes | no | no | as 3–4 | after 3 and 4 |
| 6 | Staging financial **mutation** contracts (loans, savings, payroll settlement) | D1, D2, D4, D3, D6, maker-checker roles, B4 | **no** (disabled by design) | — | no | no | Owner (D1–D4, D6), B4 | only after the policies; writers stay disabled until separately approved |

**Invariants every future financial writer must prove before staging** (not implemented, recorded as acceptance criteria): no overdraft; no payroll settlement outside the approved batch; no self-approval where maker-checker applies; no duplicate loan or savings posting (idempotency key + unique constraint in the same transaction, as proven for stock); no unexplained change to historical balances (append-only movements, corrections as reversals); rounding within the approved tolerance (exact `amount4` arithmetic); no unapproved salary-limit exception (D1); no partial posting without a recovery strategy (outbox + reconciliation pattern).

## 2. Warehouse: readiness matrix

| # | Step (prompt order) | Impl | Local | Staging | Prod | Blocked by | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Validate Gudang schema → domain mapping | validator yes | yes (synthetic layouts) | no | no | Operator (Gudang bundle + mapping) | `gudang-contract.ts`, CLI |
| 2 | Real Gudang read adapter | **no** (deliberately) | — | no | no | Operator (1) | — |
| 3 | Persist confirmed product mappings | rehearsal store yes | yes | no | no | Operator (1), W2 (location), D9 (ratios) | `warehouse-store-db.test.mjs` |
| 4 | Authorised dispatch and receiving | domain + preview yes | yes (synthetic) | no | no | Owner (W1/W5, D8), Operator (1) | warehouse use-case tests, WH-1…5 |
| 5 | Stock posting adapter | **staging implementation, unwired** (`toko-stock-applier.ts`, `LedgerWriter` port with no implementation) | yes on the exact legacy DDL with a test-only ledger | no | no | **Owner (D7 decides the ledger)**, O6 (DDL review), B4, B5/B9 | `toko-writer-contract-db.test.mjs` 5/5, `warehouse-toko-applier-db.test.mjs` 2/2 |
| 6 | Ledger consistency (stock survives the legacy recompute) | yes | yes (cache-only counter-example erased) | no | no | D7 | same |
| 7 | Duplicate posting, partial receipt, concurrent checkout, recovery | yes | yes: duplicates, conflicts, opname lock, POS-statement concurrency, SIGKILL, TCP faults, lost acknowledgement | no | no | as 5 | cross-db harness 11/11 + above |
| 8 | Inventory reconciliation | outbox ↔ posting reconciliation yes | yes | no | no | as 5 | `reconcileOutboxAgainstPostings` |

**Staging implementation prepared (checkpoint 13):** `PrismaTokoStockApplier` covers ledger-based movement via the D7 port, the receiving reference (source/event keys stored on the posting), the stable idempotency key (primary key), the atomic target-side posting record, safe retry and acknowledgement, duplicate-payload rejection, item and company scope including the opname lock, and compatibility with the legacy recompute. It is **not constructed anywhere in the application** (an always-on guard enforces this) and cannot run without a ledger implementation. Activation against production additionally needs B4 (single writer) and B5/B9 (capacity).
