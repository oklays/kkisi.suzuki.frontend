# KKISI System Map

> Canonical reference for the migration from CodeIgniter 3 PHP to Next.js.  
> Source of truth: `kkisi.web/` reverse-engineering docs.  
> Do not modify source files in `tokonew.kkisitb2.id/`.

---

## System Identity

| Property | Value |
|----------|-------|
| **Name** | KKISI Toko — Cooperative POS & Inventory |
| **Organization** | KKISI (Koperasi Karyawan Industri Suzuki Indonesia) |
| **Domain** | `tokonew.kkisitb2.id` |
| **Framework** | CodeIgniter 3.1.11 (PHP) |
| **App Version** | 2.0.1 |
| **Database** | MySQL (single DB, prefixes: `db_`, `m_`, `trans_`) |
| **Timezone** | Asia/Bangkok (UTC+7) |

---

## Module Map

| Domain | Legacy Controllers | Core Tables | Priority |
|--------|--------------------|-------------|----------|
| **Auth** | `Login`, `Logout`, `Csrfdata` | `db_users`, `db_roles`, `db_permissions` | P0 |
| **POS / Kasir** | `Pos`, `Print_pos`, `Kasir` | `db_sales`, `db_salesitems`, `db_cart`, `db_buka_kasir`, `db_kasir`, `db_salespayments` | P0 |
| **Members (Anggota)** | `Member` | `m_anggota` | P0 |
| **Inventory / Items** | `Items`, `Inventory`, `Barcode`, `Import` | `db_items`, `db_items_stock`, `db_stockentry`, `db_inventory_so`, `db_inventory_so_dtl` | P1 |
| **Purchase** | `Purchase`, `Purchase_return`, `Suppliers` | `db_purchase`, `db_purchaseitems`, `db_purchasepayments`, `db_suppliers` | P1 |
| **Sales (non-POS)** | `Sales`, `Sales_return`, `Sales_mobile` | `db_sales`, `db_salesreturn`, `db_salesitems` | P1 |
| **PPOB** | `ppob/Pos_ppob` | `db_items (ppob=1)`, `orders` | P1 |
| **Loans (Koperasi)** | (helper functions) | `trans_pinjaman`, `trans_pinjaman_dtl`, `v_trans_pinjaman_flat` | P2 |
| **Reports / Dashboard** | `Reports`, `Dashboard` | (multi-table read) | P2 |
| **Expense** | `Expense` | `db_expense`, `db_expense_category` | P2 |
| **Customers** | `Customers` | `db_customers`, `db_customer_payments` | P2 |
| **Admin / Config** | `Users`, `Roles`, `Site`, `Company`, `Menu`, `Warehouse` | `db_sitesettings`, `db_company` | P3 |
| **Master Data** | `Brands`, `Category`, `Units`, `Tax`, `Currency`, `Payment_types`, `Country`, `State` | `db_brands`, `db_category`, `db_units`, `db_tax`, `db_currency`, `db_paymenttypes` | P3 |
| **Integrations** | `Sms`, `Templates` | `db_smsapi`, `db_smstemplates` | P3 |

---

## Critical Business Rules Index

| Rule | Location | Doc Reference |
|------|----------|---------------|
| Member credit limit = `gaji_minus ?: limit_toko` | `custom_helper.tagihan_anggota` | `06-business-rules.md §6.2` |
| Kasir session required before POS | `cek_buka_kasir()` | `06-business-rules.md §6.3` |
| Stock mutated synchronously, `db_stockentry` always written | `Pos_model`, `Purchase_model` | `06-business-rules.md §6.8` |
| Invoice code: `{PREFIX}{ymd}{5d}` counter per month/company | `Pos::pos_save` | `06-business-rules.md §6.5` |
| PPOB top-up via IAK API, credit deducted from `limit_ppob` | `Pos_ppob::pos_save` | `07-integrations.md §7.1` |
| Loan installments auto-marked PAYROLL for past months | `get_update_cicilan()` | `06-business-rules.md §6.9` |
| Payroll deduction loan overrides store credit | `cek_gaji_minus()` | `06-business-rules.md §6.2` |
| All data scoped to `company_id`; role ≤2 = all-company | `MY_Controller.load_global` | `06-business-rules.md §6.1` |
| Laporan Toko P&L: Penjualan − HPP − Biaya Operasional | `Reports_model` | `06-business-rules.md §6.12` |
| Tax inclusive: `amt / ((rate/100)+1) / 10` | `calculate_inclusive()` | `06-business-rules.md §6.6` |

---

## Known Critical Bugs in Legacy (Must Not Carry Forward)

| # | Bug | Location | Impact |
|---|-----|----------|--------|
| 1 | `encrypt_url()` always returns `false` | `mysecurity_helper.php` | URL param encryption broken |
| 2 | SQL injection in login | `Login_model.php` | Auth bypass possible |
| 3 | SQL injection in PPOB queries | `Pos_ppob.php` | Data exposure |
| 4 | `SMTP::DEBUG_SERVER` in production | `sms_template_helper.php` | Debug leak |
| 5 | `Api_c` has no authentication | `Api_c.php` | Stock data exposed |
| 6 | `security.ini` in webroot | `application/helpers/` | Key exposure risk |

---

## Migration Documentation Index

| File | Phase | Contents |
|------|-------|----------|
| `docs/migration/validation-checklist.md` | P1 | Manual verification against live legacy |
| `docs/migration/characterization-tests.md` | P2 | Test scenario catalog |
| `MIGRATION_MATRIX.md` | P3 | Module-by-module migration status |
| `MIGRATION_DEPENDENCY_GRAPH.md` | P4 | Module dependency order |
| `docs/migration/module-boundaries.md` | P5 | Next.js architecture layer design |
| `DATA_OWNERSHIP.md` | P6 | DB read/write ownership per phase |
| `IMPLEMENTATION_BACKLOG.md` | P7 | Prioritized implementation items |

---

## Reverse-Engineering Documentation

| File | Contents |
|------|----------|
| `kkisi.web/01-discovery.md` | Stack, deps, session vars, config |
| `kkisi.web/02-modules.md` | All controllers, models, helpers |
| `kkisi.web/03-routes.md` | Full URL route inventory |
| `kkisi.web/04-database.md` | All DB tables with columns |
| `kkisi.web/05-data-flow.md` | SQL patterns & data flows |
| `kkisi.web/06-business-rules.md` | Business logic & validations |
| `kkisi.web/07-integrations.md` | IAK API, PHPMailer, SMS, Excel |
| `kkisi.web/08-background-jobs.md` | No cron — all synchronous |
| `kkisi.web/09-security.md` | Vulnerabilities & fixes |
| `kkisi.web/10-diagrams.md` | Architecture & flow diagrams |
