# Migration Matrix — KKISI → Next.js

> **Legend:**
> - ✅ Complete  ·  🔄 In Progress  ·  ⬜ Not Started  ·  ❌ Blocked  ·  N/A Not Applicable
>
> **Columns:**
> - **Legacy Behavior Documented** — reverse-engineering docs exist in `kkisi.web/`
> - **Behavior Verified** — manually confirmed against live legacy (`validation-checklist.md`)
> - **Char. Tests** — characterization test scenarios written (`characterization-tests.md`)
> - **Target Architecture** — Next.js module boundaries designed (`module-boundaries.md`)
> - **Implementation** — Next.js code written
> - **Parity Test** — characterization tests pass against new implementation
> - **UAT** — user acceptance testing passed with stakeholders
> - **Production** — live in production, legacy decommissioned

---

## Core Infrastructure

| Module | Legacy Documented | Behavior Verified | Char. Tests | Target Architecture | Implementation | Parity Test | UAT | Production |
|--------|:-----------------:|:-----------------:|:-----------:|:-------------------:|:--------------:|:-----------:|:---:|:----------:|
| Database schema | ✅ | ⬜ | N/A | ⬜ | ⬜ | N/A | N/A | ⬜ |
| Auth / Session | ✅ | ⬜ | ✅ CT-AUTH-001–003 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| RBAC / Permissions | ✅ | ⬜ | ✅ CT-RBAC-001–002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Multi-company isolation | ✅ | ⬜ | ✅ CT-RBAC-001–002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Domain Modules

| Module | Legacy Documented | Behavior Verified | Char. Tests | Target Architecture | Implementation | Parity Test | UAT | Production |
|--------|:-----------------:|:-----------------:|:-----------:|:-------------------:|:--------------:|:-----------:|:---:|:----------:|
| **Kasir Session** | ✅ | ⬜ | ✅ CT-KSR-001–002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **POS Sales** | ✅ | ⬜ | ✅ CT-POS-001–004 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **POS Cart** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Member (Anggota)** | ✅ | ⬜ | ✅ CT-MBR-001–002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Credit Limit** | ✅ | ⬜ | ✅ CT-MBR-001–002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Items / Products** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Stock Management** | ✅ | ⬜ | ✅ CT-INV-001–003 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Stock Opname** | ✅ | ⬜ | ✅ CT-INV-002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Purchase** | ✅ | ⬜ | ✅ CT-INV-001 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Purchase Return** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Konsinyasi** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Sales (non-POS)** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Sales Return** | ✅ | ⬜ | ✅ CT-INV-003 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Mobile Orders** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **PPOB** | ✅ | ⬜ | ✅ CT-PPOB-001–002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Loan / Koperasi** | ✅ | ⬜ | ✅ CT-LOAN-001–003 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Payroll Deduction** | ✅ | ⬜ | ✅ CT-LOAN-002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Customers** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Suppliers** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| **Expense** | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Reporting

| Module | Legacy Documented | Behavior Verified | Char. Tests | Target Architecture | Implementation | Parity Test | UAT | Production |
|--------|:-----------------:|:-----------------:|:-----------:|:-------------------:|:--------------:|:-----------:|:---:|:----------:|
| Dashboard KPIs | ✅ | ⬜ | ✅ CT-RPT-002 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Sales Report | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Purchase Report | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Laporan Toko (P&L) | ✅ | ⬜ | ✅ CT-RPT-001 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Profit by Item | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Stock Report | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Expense Report | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Excel Exports | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Kasir Report | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Integrations

| Module | Legacy Documented | Behavior Verified | Char. Tests | Target Architecture | Implementation | Parity Test | UAT | Production |
|--------|:-----------------:|:-----------------:|:-----------:|:-------------------:|:--------------:|:-----------:|:---:|:----------:|
| IAK API (PPOB) | ✅ | ⬜ | ✅ CT-PPOB-001 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| PHPMailer / SMTP | ✅ | ⬜ | ✅ CT-AUTH-003 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| SMS Gateway | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Excel Export | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Barcode Generation | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Administration

| Module | Legacy Documented | Behavior Verified | Char. Tests | Target Architecture | Implementation | Parity Test | UAT | Production |
|--------|:-----------------:|:-----------------:|:-----------:|:-------------------:|:--------------:|:-----------:|:---:|:----------:|
| User Management | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Roles & Permissions | ✅ | ⬜ | ✅ CT-RBAC | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Site Settings | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Company / Branch | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Master Data (all) | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| DB Backup | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| CSV Import | ✅ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

---

## Security Remediation (Not Carry Forward)

| Issue | Documented | Fixed in Next.js | Verified |
|-------|:----------:|:----------------:|:--------:|
| SQL injection — Login | ✅ | ⬜ | ⬜ |
| SQL injection — PPOB | ✅ | ⬜ | ⬜ |
| SQL injection — helpers | ✅ | ⬜ | ⬜ |
| `encrypt_url()` always false | ✅ | ⬜ | ⬜ |
| Unauthenticated `Api_c` | ✅ | ⬜ | ⬜ |
| SMTP debug in production | ✅ | ⬜ | ⬜ |
| AES keys in webroot | ✅ | ⬜ | ⬜ |
| `Access-Control-Allow-Origin: *` | ✅ | ⬜ | ⬜ |

---

## Progress Summary

| Phase | Total Items | Complete | In Progress | Not Started |
|-------|-------------|----------|-------------|-------------|
| Legacy Documented | 44 | 44 | 0 | 0 |
| Behavior Verified | 44 | 0 | 0 | 44 |
| Char. Tests Written | 44 | 22 | 0 | 22 |
| Target Architecture | 44 | 0 | 0 | 44 |
| Implementation | 44 | 0 | 0 | 44 |
| Parity Tests | 44 | 0 | 0 | 44 |
| UAT | 44 | 0 | 0 | 44 |
| Production | 44 | 0 | 0 | 44 |

> Last updated: Migration baseline creation (pre-implementation)
