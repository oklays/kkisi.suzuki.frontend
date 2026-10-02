# KKISI Toko Web — Reverse-Engineering Documentation

> **Target:** `tokonew.kkisitb2.id` (PHP/CodeIgniter 3 POS & Cooperative Management System)  
> **App Version:** 2.0.1  
> **Framework:** CodeIgniter 3.1.11  
> **Generated:** 2025

---

## Document Index

| # | File | Contents |
|---|------|----------|
| 01 | [01-discovery.md](01-discovery.md) | Tech stack, framework, dependencies, project structure |
| 02 | [02-modules.md](02-modules.md) | All controllers, models, and module purposes |
| 03 | [03-routes.md](03-routes.md) | Full URL route inventory |
| 04 | [04-database.md](04-database.md) | All database tables, columns, and relationships |
| 05 | [05-data-flow.md](05-data-flow.md) | SQL patterns, data flow diagrams, key queries |
| 06 | [06-business-rules.md](06-business-rules.md) | Business logic, validations, financial rules |
| 07 | [07-integrations.md](07-integrations.md) | External APIs, third-party libraries |
| 08 | [08-background-jobs.md](08-background-jobs.md) | Background tasks, scheduled operations |
| 09 | [09-security.md](09-security.md) | Auth, RBAC, vulnerabilities, encryption |
| 10 | [10-diagrams.md](10-diagrams.md) | System architecture, ERD, request flow |

---

## Quick Summary

This is a **multi-tenant cooperative POS & inventory management system** built on CodeIgniter 3, deployed for **KKISI** (Koperasi Karyawan Industri Suzuki Indonesia). Key capabilities:

- **POS (Point of Sale):** Cashier-session-gated sales for toko (store) items
- **PPOB (Payment Point Online Bank):** IAK API integration for pulsa/PLN/data top-ups
- **Member Management:** Cooperative employee members with credit limits & loan tracking
- **Purchase Management:** Supplier purchasing with cash, credit, konsinyasi (consignment)
- **Inventory:** Stock opname (physical count), stock entry, multi-warehouse
- **Sales Mobile:** Mobile order management with order lifecycle statuses
- **Reports:** Sales, purchase, expense, profit/loss, stock reports + Excel export
- **Loan Module:** `trans_pinjaman` — installment loans with payroll deduction logic
- **RBAC:** Role-based permissions stored in `db_permissions`
