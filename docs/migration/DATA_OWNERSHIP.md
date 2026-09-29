# Data Ownership — Legacy PHP vs Next.js

> **Purpose:** During migration, both the legacy CodeIgniter app and the new Next.js app may run against the **same MySQL database** for some period. This document defines who is allowed to READ and WRITE each table at each migration stage, to prevent dual-write conflicts, data corruption, and race conditions.
>
> **Golden rule:** A table has exactly **one writer** at any point in time. Multiple readers are fine. Ownership transitions are atomic per-table cutover events, not gradual.

---

## Ownership Model

Three ownership states per table:

| State | Meaning |
|-------|---------|
| 🟦 **Legacy-Owned** | Legacy PHP has exclusive WRITE. Next.js may READ (reporting/migration prep) but must NEVER write. |
| 🟨 **Transitional (Dual-Read, Single-Write)** | Ownership is moving. One system writes (specified), the other reads only, for a bounded cutover window. |
| 🟩 **Next.js-Owned** | Next.js has exclusive WRITE. Legacy is decommissioned for this table (or read-only if still running in parallel). |

**Forbidden state:** 🟥 Dual-Write — both systems writing to the same table simultaneously. This is never allowed under any circumstances, as it causes race conditions (e.g., two systems both incrementing `db_items.stock` independently).

---

## Ownership by Table

### Layer 0 — Foundation

| Table | Current Owner | Target Owner | Notes |
|-------|---------------|---------------|-------|
| `db_company` | 🟦 Legacy | 🟩 Next.js | Low-risk cutover — small, rarely-changing table. Migrate early. |
| `db_users` | 🟦 Legacy | 🟩 Next.js | Requires password hash compatibility (bcrypt is portable — no rehash needed) |
| `db_roles` | 🟦 Legacy | 🟩 Next.js | |
| `db_permissions` | 🟦 Legacy | 🟩 Next.js | |

---

### Layer 1 — Master Data

| Table | Current Owner | Target Owner | Notes |
|-------|---------------|---------------|-------|
| `db_items` | 🟦 Legacy | 🟩 Next.js | **CRITICAL:** `db_items.stock` is a live mutable field touched by POS, Purchase, Returns, Stock Opname. Cutover must happen atomically for this table — see "Stock Field Cutover" below. |
| `db_category`, `db_brands`, `db_units` | 🟦 Legacy | 🟩 Next.js | Low risk |
| `db_customers` | 🟦 Legacy | 🟩 Next.js | |
| `db_suppliers` | 🟦 Legacy | 🟩 Next.js | |
| `m_anggota` | 🟦 Legacy | 🟨 Transitional → 🟩 Next.js | **May be shared with an external mobile app / payroll system** — confirm no other consumer writes to this table before cutover |
| `db_warehouse` | 🟦 Legacy | 🟩 Next.js | |
| `db_tax`, `db_currency`, `db_paymenttypes` | 🟦 Legacy | 🟩 Next.js | |

---

### Layer 2 — Operational Core

| Table | Current Owner | Target Owner | Notes |
|-------|---------------|---------------|-------|
| `db_kasir` | 🟦 Legacy | 🟩 Next.js | Master list of registers — low risk |
| `db_buka_kasir` | 🟦 Legacy | 🟨 Transitional | **HIGH RISK for dual-write** — must not have both systems opening/closing kasir sessions during transition. Recommend: cut over per-branch, not per-table (see "Branch-by-Branch Cutover" below) |
| `db_stockentry` | 🟦 Legacy | 🟩 Next.js | Append-only audit log — safer to migrate, but must follow `db_items.stock` cutover |

---

### Layer 3 — Transactional

| Table | Current Owner | Target Owner | Notes |
|-------|---------------|---------------|-------|
| `db_cart` | 🟦 Legacy | 🟩 Next.js | Ephemeral/session-scoped — safe to cut over per-branch without historical migration concerns |
| `db_hold`, `db_holditems` | 🟦 Legacy | 🟩 Next.js | Ephemeral |
| `db_sales` | 🟦 Legacy | 🟨 Transitional → 🟩 Next.js | **HIGHEST RISK.** Invoice code generation (`MAX+1`) must never run from two systems concurrently against the same company_id/month. Cutover per branch. |
| `db_salesitems` | 🟦 Legacy | 🟨 → 🟩 | Tied 1:1 with `db_sales` cutover |
| `db_salespayments` | 🟦 Legacy | 🟨 → 🟩 | Tied 1:1 with `db_sales` cutover |
| `db_salesreturn`, `db_salesitemsreturn` | 🟦 Legacy | 🟩 Next.js | Cut over together with `db_sales` |
| `db_purchase`, `db_purchaseitems` | 🟦 Legacy | 🟩 Next.js | Similar invoice-counter risk as `db_sales` — cut over per branch |
| `db_purchasepayments` | 🟦 Legacy | 🟩 Next.js | |
| `db_inventory_so`, `db_inventory_so_dtl` | 🟦 Legacy | 🟩 Next.js | Stock Opname directly mutates `db_items.stock` — must cut over together with the Stock Engine |
| `orders` (mobile/PPOB) | 🟦 Legacy | 🟨 Transitional | **Confirm ownership** — this table may be written by an external mobile app independent of the web app. Do not assume web app is the only writer. Requires separate investigation before cutover plan is finalized. |
| `trans_pinjaman`, `trans_pinjaman_dtl` | 🟦 Legacy | 🟨 Transitional → 🟩 Next.js | Loan module — verify no external payroll batch process also writes to these tables |

---

### Layer 4 — Derived / Cached

| Table | Current Owner | Target Owner | Notes |
|-------|---------------|---------------|-------|
| `db_customer_payments` | 🟦 Legacy | 🟩 Next.js (redesigned) | **Recommend NOT porting the delete+reinsert cache pattern.** Replace with a computed view or materialized aggregate in the new system. If kept as a table, it must be rebuilt from `db_sales`/`db_salespayments`, which must already be Next.js-owned. |
| `db_supplier_payments` | 🟦 Legacy | 🟩 Next.js (redesigned) | Same as above, derived from `db_purchase`/`db_purchasepayments` |

---

### Layer 5 — Cross-Cutting / Config

| Table | Current Owner | Target Owner | Notes |
|-------|---------------|---------------|-------|
| `db_sitesettings` | 🟦 Legacy | 🟩 Next.js | Contains SMTP creds, IAK creds, company info — migrate to environment variables / secrets manager instead of DB table in target architecture |
| `db_smstemplates`, `db_smsapi` | 🟦 Legacy | 🟩 Next.js | |
| `db_expense`, `db_expense_category` | 🟦 Legacy | 🟩 Next.js | |

---

## Cutover Strategy

### Principle: Cut Over by Bounded Context, Not by Individual Table

Because many tables are tightly coupled (e.g., `db_sales` + `db_salesitems` + `db_salespayments` + `db_stockentry` + `db_items.stock` all mutate together in a single POS transaction), **table-by-table cutover is unsafe**. Instead, cutover happens per **bounded context**, and within a context, per **branch (company_id)** where feasible.

### Recommended Cutover Sequence

```
Stage 1: Foundation cutover (all branches at once — low risk, low frequency writes)
  db_company, db_users, db_roles, db_permissions
        ↓
Stage 2: Master data cutover (all branches at once)
  db_items (metadata only — NOT stock field yet), db_category, db_brands,
  db_units, db_customers, db_suppliers, db_warehouse, db_tax, m_anggota (metadata)
        ↓
Stage 3: Stock Engine cutover (per branch — HIGH RISK, requires freeze window)
  db_items.stock field + db_stockentry
  — Freeze legacy writes to stock for the branch being cut over
  — Snapshot db_items.stock as of freeze time
  — Enable Next.js writes for that branch only
  — Legacy app for that branch switches to READ-ONLY on stock, or is fully retired
        ↓
Stage 4: Kasir + POS cutover (per branch — HIGHEST RISK, requires freeze window)
  db_buka_kasir, db_cart, db_hold/db_holditems,
  db_sales, db_salesitems, db_salespayments, db_salesreturn
  — Must happen AFTER Stock Engine is already Next.js-owned for that branch
  — Recommend cutover at day boundary (after kasir close, before next open)
        ↓
Stage 5: Purchase cutover (per branch)
  db_purchase, db_purchaseitems, db_purchasepayments,
  db_inventory_so, db_inventory_so_dtl
        ↓
Stage 6: PPOB cutover (per branch, requires IAK API credential migration)
  Requires coordination with IAK — confirm sandbox/production credential handoff
        ↓
Stage 7: Loan / Payroll cutover (organization-wide, not per-branch —
  loans are member-scoped, not branch-scoped)
  trans_pinjaman, trans_pinjaman_dtl
  — Investigate whether an external payroll batch system writes to these tables
    BEFORE finalizing cutover plan
        ↓
Stage 8: Derived data — rebuild, don't migrate
  db_customer_payments, db_supplier_payments
  — Recompute from already-cut-over source tables; do not carry over
    the legacy delete+reinsert cache mechanically
        ↓
Stage 9: Reporting / Dashboard cutover
  Read-only — can be cut over incrementally per report, since no writes involved
        ↓
Stage 10: Decommission legacy app entirely
```

---

## Tables Requiring Special Investigation Before Cutover Plan Is Final

| Table | Concern | Action Required |
|-------|---------|------------------|
| `orders` | May be written by an external mobile app not covered in this reverse-engineering effort | Confirm all writers of this table before including in cutover plan |
| `m_anggota` | May be shared with payroll/HR system outside this codebase | Confirm authoritative source of member master data |
| `trans_pinjaman*` | May have batch payroll integration not visible in web app code | Confirm with finance/payroll team whether a separate system also writes here |
| `db_sitesettings` | Contains live credentials (SMTP, IAK) | Must migrate to secrets manager, not copied as-is into new DB table |

---

## Preventing Dual-Write During Transition

### Mechanism: Feature-flag routing at the load balancer / reverse-proxy level per branch (`company_id`)

```
Branch A (company_id=1): 100% legacy  →  100% Next.js (cutover day)
Branch B (company_id=2): 100% legacy  →  100% Next.js (cutover day + N)
...
```

Each branch is switched **entirely** (all its POS terminals, all its purchase entry, all its inventory) in a single cutover event — never partially, to avoid a branch having some data legacy-owned and some Next.js-owned simultaneously for the same bounded context.

### Database-level Safety Net

During any transitional window, add a **database trigger or check constraint** (temporary, removed after full cutover) that rejects writes to migrated tables from the legacy connection user, once that table/branch is cut over. This provides a hard backstop beyond application-level discipline.

```sql
-- Example: after Stock Engine cutover for company_id=1,
-- revoke UPDATE on db_items from the legacy DB user for that scope
-- (requires row-level security or application-enforced check,
--  since MySQL lacks native RLS — enforce via legacy app also being
--  put into read-only mode for that branch)
```

> **Recommendation:** Since MySQL does not support row-level security natively, the practical enforcement mechanism is: **the legacy application code itself is modified to become read-only for cut-over branches** (a small legacy patch, not a rewrite), rather than relying on DB-level constraints alone.

---

## Summary Ownership Table (Current State — Pre-Migration)

| Domain | Owner Today |
|--------|-------------|
| All tables | 🟦 100% Legacy-Owned |

This is the starting state. No Next.js write access exists until Stage 1 of the cutover sequence begins. Next.js development against a **separate test/staging database** (seeded copy) is expected throughout the Implementation phase (`IMPLEMENTATION_BACKLOG.md`), with production cutover only happening per the staged plan above, after parity tests pass.
