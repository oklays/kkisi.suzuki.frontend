# Implementation Backlog — KKISI → Next.js

> **⚠️ This backlog defines WHAT to build and in what order.** The status notes below track preparatory UI and Checkpoint 2A work separately from operational acceptance.
> Each item must satisfy its "Dependency" and have a passing characterization test before implementation begins, per `MIGRATION_DEPENDENCY_GRAPH.md`'s readiness gate.
>
> **Complexity scale:** S = 1-2 days · M = 3-5 days · L = 1-2 weeks · XL = 2+ weeks

---

## Backlog Table

| ID | Module | Description | Dependency | Risk | Acceptance Criteria | Characterization Test | Complexity |
|----|--------|-------------|-------------|------|---------------------|------------------------|------------|
| **IMP-001** | Foundation | Set up Next.js project skeleton (App Router, TypeScript, Prisma, layered folder structure per `module-boundaries.md`) | None | Low | Project builds, lints, Prisma connects to staging DB copy | N/A | M |
| **IMP-002** | Foundation | Define Prisma schema mirroring `kkisi.web/04-database.md` for Layer 0–1 tables only | IMP-001 | Low | Schema matches legacy column types/nullability exactly | N/A | M |
| **IMP-003** | Auth | Implement `LoginUseCase` (bcrypt verify, session creation) | IMP-002 | Medium | Passes CT-AUTH-001, CT-AUTH-002 | CT-AUTH-001, CT-AUTH-002 | M |
| **IMP-004** | Auth | Implement RBAC middleware (permission slug check per route) | IMP-003 | Medium | Passes CT-AUTH-002, CT-RBAC-001, CT-RBAC-002 | CT-AUTH-002, CT-RBAC-001/002 | M |
| **IMP-005** | Auth | Implement OTP password reset flow (email-based) | IMP-003, integration: SMTP client | Medium | Passes CT-AUTH-003 | CT-AUTH-003 | M |
| **IMP-006** | Company | Company/Branch CRUD (domain entity + repository + admin UI) | IMP-002 | Low | Create/edit/list companies; role 1-2 sees all, role >2 scoped | N/A (add new CT) | S |
| **IMP-007** | Master Data | Items CRUD (metadata only — no stock field logic yet) | IMP-006 | Low | Create/edit/list items with category, brand, unit, tax | N/A | M |
| **IMP-008** | Master Data | Customers, Suppliers CRUD | IMP-006 | Low | Standard CRUD, company-scoped | N/A | S |
| **IMP-009** | Master Data | Member (Anggota) CRUD — data fields only, no credit logic | IMP-006 | Low | Create/edit/list members; NIK unique constraint enforced | N/A | M |
| **IMP-010** | Master Data | Warehouse, Tax, Currency, Payment Types CRUD | IMP-006 | Low | Standard CRUD | N/A | S |
| **IMP-011** | Stock Engine | Domain: `Item` entity, `StockEntry` entity, `stock-mutation.service.ts` | IMP-007 | High | Pure unit tests for stock increment/decrement logic, negative-stock guard | New unit tests | M |
| **IMP-012** | Stock Engine | Application: read-only stock queries (current stock, stock history) | IMP-011 | Medium | Matches legacy stock values exactly for sampled items | Manual comparison | M |
| **IMP-013** | Stock Engine | Application: manual stock adjustment use case | IMP-011 | High | Passes adjustment scenario; writes `StockEntry` audit row | New CT (adjustment) | M |
| **IMP-014** | Credit Limit | Domain: `credit-limit-calculator.service.ts` (`gaji_minus` override rule) | IMP-009 | High | Passes CT-MBR-001 (unit test, no DB) | CT-MBR-001 | S |
| **IMP-015** | Credit Limit | Application: `GetCreditLimitUseCase` (queries monthly Kredit+Final usage) | IMP-014, IMP-009 | High | Passes CT-MBR-001, CT-MBR-002 | CT-MBR-001, CT-MBR-002 | M |
| **IMP-016** | Kasir | Domain: `KasirSession` entity; Application: Open/Close kasir use cases | IMP-006 | Medium | Passes CT-KSR-001, CT-KSR-002 | CT-KSR-001, CT-KSR-002 | M |
| **IMP-017** | POS | Domain: `invoice-code-generator.service.ts` (month/company counter) | IMP-006 | High | Passes CT-POS-003 (unit test with mocked counter) | CT-POS-003 | S |
| **IMP-018** | POS | Domain: `tax-calculator.service.ts` (inclusive/exclusive formulas) | IMP-007 | High | Unit tests for both tax types match `06-business-rules.md §6.6` exactly | New unit tests | S |
| **IMP-019** | POS | Application: `AddToCartUseCase`, cart repository | IMP-016 | Medium | Item added/incremented correctly in cart | New CT | M |
| **IMP-020** | POS | Application: `SaveSaleUseCase` — Cash payment path | IMP-016, IMP-017, IMP-018, IMP-019, IMP-011 | **Critical** | Passes CT-POS-001 exactly (all DB mutations match) | CT-POS-001 | L |
| **IMP-021** | POS | Application: `SaveSaleUseCase` — Kredit payment path (member credit check) | IMP-020, IMP-015 | **Critical** | Passes CT-POS-002 exactly, including block-on-insufficient-credit | CT-POS-002 | L |
| **IMP-022** | POS | Application: `HoldInvoiceUseCase`, `RetrieveHoldUseCase` | IMP-020 | Medium | Passes CT-POS-004 | CT-POS-004 | M |
| **IMP-023** | POS | Presentation: POS screen (cart UI, payment dialog, member lookup) | IMP-020, IMP-021, IMP-022 | Medium | Manual UAT walkthrough matches legacy screen flow | Manual UAT | L |
| **IMP-024** | POS | Presentation: Invoice print view | IMP-020 | Low | Printed layout matches legacy fields | Manual comparison | S |
| **IMP-025** | Sales Return | Application: `CreateSalesReturnUseCase` (stock restoration) | IMP-020, IMP-011 | High | Passes CT-INV-003 | CT-INV-003 | M |
| **IMP-026** | Purchase | Application: `CreatePurchaseUseCase` (stock increment, payment record) | IMP-008, IMP-011 | High | Passes CT-INV-001 | CT-INV-001 | L |
| **IMP-027** | Purchase | Application: `RecordPurchasePaymentUseCase` | IMP-026 | Medium | Payment recorded, due balance recalculated | New CT | M |
| **IMP-028** | Purchase | Purchase Return use case (regular + konsinyasi) | IMP-026 | Medium | Stock decremented correctly, both purchase types handled | New CT | M |
| **IMP-029** | Stock Opname | Application: Create SO → Enter Count → Approve SO (3-step flow) | IMP-011 | High | Passes CT-INV-002 (all 3 steps) | CT-INV-002 | L |
| **IMP-030** | PPOB | Infrastructure: `IakClient` wrapper (checkBalance, checkOperator, inquiryPLN, topUp) | Integration setup | Medium | Contract tests against IAK sandbox pass | New contract tests | M |
| **IMP-031** | PPOB | Application: `CheckOperatorUseCase`, `InquiryPlnUseCase` | IMP-030 | Medium | Correct routing based on `rc`/`status` codes | New CT | M |
| **IMP-032** | PPOB | Application: `ExecuteTopupUseCase` (credit limit check + IAK call + DB record) | IMP-030, IMP-015 | **Critical** | Passes CT-PPOB-001, CT-PPOB-002 | CT-PPOB-001, CT-PPOB-002 | L |
| **IMP-033** | Loan | Domain: `flat-rate-calculator.service.ts`, `installment-schedule.service.ts` (with explicit month-rollover guard) | None (pure domain) | High | Passes CT-LOAN-003 (month rollover) as unit test | CT-LOAN-003 | M |
| **IMP-034** | Loan | Application: `GenerateInstallmentScheduleUseCase` | IMP-033, IMP-009 | **Critical** | Passes CT-LOAN-001 | CT-LOAN-001 | L |
| **IMP-035** | Loan | Application: `ApplyPayrollDeductionUseCase` (auto-mark past installments) | IMP-034 | **Critical** | Passes CT-LOAN-002 | CT-LOAN-002 | M |
| **IMP-036** | Loan | Loan integration with Credit Limit (`gaji_minus` override from active loan) | IMP-035, IMP-014 | High | Member with active gaji_minus loan shows correct effective limit in POS | New CT (integration) | M |
| **IMP-037** | Reports | Application: `GenerateBranchPlUseCase` (Laporan Toko P&L) | IMP-020, IMP-026, all transactional modules stable | High | Passes CT-RPT-001 | CT-RPT-001 | L |
| **IMP-038** | Reports | Application: `GetDashboardKpisUseCase` | IMP-020, IMP-026 | Medium | Passes CT-RPT-002 (branch scoping) | CT-RPT-002 | M |
| **IMP-039** | Reports | Sales report, Purchase report, Stock report, Expense report | IMP-020, IMP-026 | Medium | Figures match legacy for sampled date ranges | New CTs per report | L |
| **IMP-040** | Reports | Excel export for reports | IMP-037, IMP-038, IMP-039 | Low | Downloaded file matches legacy column structure | Manual comparison | M |
| **IMP-041** | Derived Data | Redesign customer/supplier payment aggregation (replace delete+reinsert cache with computed query or materialized view) | IMP-020, IMP-026 | Medium | Aggregate values match legacy cache table values | New CT | M |
| **IMP-042** | Mobile Orders | `orders` table integration investigation + use case (pending ownership confirmation) | Investigation task (see `DATA_OWNERSHIP.md`) | High | Ownership confirmed before implementation starts | N/A (investigation first) | M |
| **IMP-043** | Security | Fix SQL injection vectors (parameterize all queries) — apply to legacy as interim patch OR ensure Next.js repositories are 100% parameterized from day 1 | None | **Critical** | No string-concatenated SQL anywhere in new codebase (lint rule + code review gate) | N/A (regression prevention) | M |
| **IMP-044** | Security | Secrets management: move SMTP/IAK credentials from `db_sitesettings` to environment variables/secrets manager | IMP-030 | Medium | No credentials in DB or source control | N/A | S |
| **IMP-045** | Admin | User Management, Roles & Permissions admin UI | IMP-004 | Low | CRUD + permission assignment matches legacy capability | New CT | M |
| **IMP-046** | Admin | Site Settings admin UI (non-credential settings only) | IMP-006 | Low | Standard CRUD | N/A | S |
| **IMP-047** | Cutover | Stage 1 cutover: Foundation tables (per `DATA_OWNERSHIP.md`) | IMP-003 through IMP-010 all in Production status | **Critical** | Zero data loss, rollback plan tested | N/A | M |
| **IMP-048** | Cutover | Stage 3–4 cutover: Stock Engine + POS, per branch | IMP-011–IMP-024 in Production, freeze-window rehearsed in staging | **Critical** | Parity verified for first cutover branch for 1 full business day before proceeding to next branch | N/A | XL |

---

## Recommended First Milestone

### **Milestone 1: "Walking Skeleton" — Foundation + Read-Only Parity**

**Goal:** Prove the layered architecture, auth, and RBAC work end-to-end against real data, without touching any write-heavy financial logic yet.

**Scope (IMP-001 → IMP-010):**
1. Next.js project skeleton with full layered folder structure
2. Prisma schema for Layer 0–1 tables (Foundation + Master Data)
3. Login + session + RBAC middleware
4. OTP password reset
5. Company, Items, Customers, Suppliers, Member, Warehouse, Tax — CRUD only (no business logic)

**Why this first:**
- Validates the architecture (`module-boundaries.md`) against real code before high-risk financial modules are attempted
- Delivers immediately useful admin screens with near-zero business logic risk
- Establishes CI pipeline, characterization test runner, and staging DB conventions that every subsequent module reuses
- No production cutover risk yet — can run entirely against a staging DB copy

**Exit criteria for Milestone 1:**
- [ ] All IMP-001 through IMP-010 marked Complete in this backlog
- [ ] CT-AUTH-001, CT-AUTH-002, CT-AUTH-003, CT-RBAC-001, CT-RBAC-002 passing
- [ ] `MIGRATION_MATRIX.md` updated: Foundation + Master Data rows show Implementation ✅
- [ ] Staging deployment reviewed by stakeholders (UAT walkthrough of admin CRUD screens)

---

### **Milestone 2 (Next, not started): Stock Engine + Kasir Session**

Only begins after Milestone 1 exit criteria are met. Covers IMP-011 through IMP-016 — the shared kernels that POS, Purchase, and Stock Opname all depend on. This is deliberately isolated from POS itself so the stock mutation logic can be parity-tested in isolation before the highest-risk module (POS Sales) is attempted.

---

### **Milestone 3 (Future): POS Sales — Critical Path**

IMP-017 through IMP-024. The highest-risk, highest-value module. Not started until Milestone 2's Stock Engine has passing parity tests in a staging environment with production-like data volume.

---

## Explicit Non-Goals for This Backlog Document

- ❌ Producing this document did not itself implement business modules
- ❌ No production database has been modified
- ❌ No legacy code has been modified
- This document is a **plan artifact only** — implementation work begins in a separate, subsequent engineering effort following this backlog in order

---

## Backlog Status Summary (2026-09-30)

| Status | Count | Evidence / remaining gate |
|--------|-------|---------------------------|
| In Progress | 2 | **IMP-001:** Next.js scaffold, layers and Prisma setup exist; the read path connects to an isolated synthetic staging DB, but not a verified source-schema copy. **IMP-002:** only a read subset of `db_items` and `db_category` is mapped; exact legacy nullability/precision and full Layer 0–1 scope remain open. |
| Preparatory UI only | 1 | **IMP-023:** `/pos` fixture presentation exists (`kkisi.web/src/components/pos/`, `src/app/pos/page.tsx`), but upstream sale/cart use cases and operational UAT are absent. It is not acceptance-complete. |
| Not Started | 45 | All other backlog items. |
| Complete | 0 | No item has satisfied all original acceptance criteria. |

Checkpoint 2A read proof: `kkisi.web/prisma/schema.prisma` → `src/infrastructure/repositories/prisma-item.repository.ts` → `src/application/inventory/use-cases/read-products.usecase.ts` → `scripts/read-products.ts`. A local `kkisi_staging` MariaDB with synthetic Product/Category rows now verifies an actual Prisma SQL read and company filter using a SELECT-only account. `kkisi.web/scripts/setup-staging.sh` and `staging/product-smoke.sql` reproduce it. The legacy PHP config points to a local MySQL server unavailable in this workspace, so **source DDL/data parity remains unverified**. No operational database writes, API route, or POS fixture replacement have been made, and `MIGRATION_MATRIX.md` implementation boxes remain unchecked.

The 48-item baseline and its dependency order remain the planning reference. Preparatory UI ahead of transactional dependencies does not waive the readiness gate in `MIGRATION_DEPENDENCY_GRAPH.md`.
