# Staging acceptance matrix (checkpoint 13)

**No scenario is staging accepted.** "Local evidence" is synthetic or the 30 Sep copy on the local container. A scenario can be accepted only by authorised users on staging with the listed data and policy.

| Area | Scenario | Local evidence | Missing for acceptance | Blocked by |
|---|---|---|---|---|
| **KOSIPA** | Identity mapping | identity links + audit; persona matrix; UAT-1/2 | staging accounts chosen from the real role export | Operator (O3) |
| | Anggota 360 | UAT-3…7 | anonymised member data on staging | Operator |
| | Savings balance parity | recorded ledger only; official balance absent by design | G2 level 5 | Operator (O1, O5) |
| | Loan balance parity | recorded schedule only | G3 level 5; D6 | Operator, Owner |
| | Payroll component parity | recorded components; comparison review-only | G4/G5 level 5; D5 | Operator, Owner |
| | Approval and posting | none (no writer) | D1–D4, D6, maker-checker roles | Owner |
| | Business permission isolation | persona matrix (8 personas), audit-before-read incl. payroll list (A4) | real roles (O3) | Operator |
| **TOKO** | POS checkout | `pos-browser`, `e2e-local` (UAT phases 1 and 4, flags on/off) | owner smoke on staging | — (ready for staging) |
| | Cash / Kredit / QRIS | existing POS suites | owner smoke on staging | — |
| | Returns | sales-return suites | owner smoke; payroll gate per design | — |
| | Register | register suites | owner smoke | — |
| | Product and inventory behaviour | product/inventory suites (the synthetic schema lacks `db_brands`, so the products API runs only on the copy) | staging data | — |
| | Stock recomputation | legacy formula modelled; the posting survives it, cache-only is erased | staging run with the real legacy PHP active | Owner (B4 timing) |
| | Existing performance | 32-worker local load: 0 errors, p95 184 ms with production pool sizes | staging latency through the tunnel | Operator (O4) |
| **WAREHOUSE** | Item mapping | synthetic preview + rehearsal store | Gudang schema + mapping | Operator (Gudang) |
| | Dispatch / receiving / partial receipt | domain + synthetic preview | W1/W5 roles, D8, Gudang | Owner, Operator |
| | Inventory posting | unwired staging applier, contract on exact legacy DDL | D7 ledger, O6 DDL review | Owner, Operator |
| | Idempotency / cross-database recovery | harness 11/11, applier 5/5 + 2/2 (lost ack, redelivery) | authorised staging copy with the reviewed DDL | Operator (O6), Owner (D7) |
| | Reconciliation | outbox ↔ posting reconciliation | as above | as above |
| **SHARED** | Authentication | auth suites; credential-exposure closeout LS-1…8 | **release of the fix**; operator exposure check | Owner (release), Operator |
| | Post-login routing | R1 policy (mapping on/unset/malformed) | R1 approval + role ids (O3) | Owner, Operator |
| | Role-based authorisation / company-branch scope | persona matrix, branch-switch tests, TOKO branch suites | real roles (O3) | Operator |
| | Audit | audit-before-read on every KOSIPA read incl. payroll list; fail closed | staging console store with triggers (B6) | Operator (O7) |
| | Report export | E1 allow-list, injection/decimals/caps, single-instance limiter | allow-listed staging user | Owner (who) |
| | Connection capacity | measured one-pool-per-process; plan in `cutover-plan.md` | O4 | Operator |
| | Feature flags | flags on/off phases | — | — |
| | Failure isolation | reader outage, console store down (UAT 2–3) | staging outage drill | — |
| | Rollback | flag-off phases | staging rollback rehearsal per step | Owner (window) |
