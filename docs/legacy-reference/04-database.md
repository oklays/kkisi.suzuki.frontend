# Phase 4 — Database Tables

> All tables are in a single MySQL database. Two table prefixes:
> - `db_` — application core tables
> - `m_` — member/anggota tables
> Additional: `trans_*`, `v_*` (views) — loan module tables (referenced from helpers)

---

## 4.1 Authentication & Users

### `db_users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `fullname` | VARCHAR | Display name |
| `username` | VARCHAR | Login username |
| `password` | VARCHAR | bcrypt hash |
| `email` | VARCHAR | For OTP/reset |
| `role_id` | INT FK → `db_roles.id` | |
| `company_id` | INT FK → `db_company.id` | Branch assignment |
| `profile_picture` | VARCHAR | Relative path to image |
| `status` | TINYINT | 1=active |

### `db_roles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `role_name` | VARCHAR | |
| `status` | TINYINT | |

### `db_permissions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `role_id` | INT FK → `db_roles.id` | |
| `perm_name` | VARCHAR | Permission slug (e.g., `sales_add`, `purchase_view`) |
| `status` | TINYINT | |

---

## 4.2 Company & Configuration

### `db_company`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `company_name` | VARCHAR | Branch name |
| `address` | VARCHAR | |
| `mobile` | VARCHAR | |
| `email` | VARCHAR | |
| `company_website` | VARCHAR | |
| `category` | VARCHAR | Company category |
| `sms_status` | TINYINT | 0/1 SMS enabled |
| `status` | TINYINT | 1=active |

### `db_sitesettings`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | Always row id=1 |
| `site_name` | VARCHAR | |
| `machine_id` | VARCHAR | License fingerprint |
| `domain` | VARCHAR | Locked domain |
| `sales_invoice_format_id` | INT | Invoice format |
| `change_return` | TINYINT | Show/hide change return |
| `round_off` | TINYINT | Round-off enabled |
| `show_upi_code` | TINYINT | |
| `email` | VARCHAR | SMTP sender |
| `password` | VARCHAR | SMTP password |
| `smtp_secure` | VARCHAR | `ssl`/`tls` |
| `port` | INT | SMTP port |

---

## 4.3 Sales Module

### `db_sales`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `sales_code` | VARCHAR | Auto-generated invoice code |
| `sales_date` | DATE | |
| `customer_id` | INT FK → `db_customers.id` | |
| `company_id` | INT FK → `db_company.id` | Branch |
| `grand_total` | DECIMAL | Total inc. tax |
| `paid_amount` | DECIMAL | Amount paid |
| `payment_type` | VARCHAR | `Cash`/`Kredit`/etc. |
| `sales_status` | VARCHAR | `Final`/`Draft`/`Held` |
| `nik_kar` | VARCHAR | Employee NIK (member) |
| `order_code` | VARCHAR | Mobile order code |
| `order_status` | VARCHAR | `pending`/`confirmed`/`processing`/`ready_to_take`/`delivered`/`returned`/`canceled` |
| `id_kasir` | INT FK → `db_buka_kasir.id` | Kasir session |
| `created_by` | INT | User ID |
| `created_date` | DATE | |
| `created_time` | TIME | |

### `db_salesitems`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `sales_id` | INT FK → `db_sales.id` | |
| `item_id` | INT FK → `db_items.id` | |
| `item_code` | VARCHAR | |
| `item_name` | VARCHAR | Snapshot |
| `qty` | DECIMAL | Quantity sold |
| `unit_price` | DECIMAL | Sale price |
| `purchase_price` | DECIMAL | Cost price (for profit) |
| `tax_id` | INT FK → `db_tax.id` | |
| `tax_type` | VARCHAR | `inclusive`/`exclusive` |
| `tax_amt` | DECIMAL | Tax amount |
| `total` | DECIMAL | Line total |

### `db_salespayments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `sales_id` | INT FK → `db_sales.id` | |
| `payment_date` | DATE | |
| `payment_type` | VARCHAR | Payment method |
| `payment` | DECIMAL | Amount |
| `change_return` | DECIMAL | Change given |
| `payment_note` | TEXT | |
| `system_ip` | VARCHAR | |
| `system_name` | VARCHAR | |
| `created_by` | INT | |
| `created_date` | DATE | |
| `created_time` | TIME | |
| `status` | TINYINT | |

### `db_salesreturn`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `return_code` | VARCHAR | |
| `return_date` | DATE | |
| `sales_id` | INT FK → `db_sales.id` | Original sale |
| `customer_id` | INT | |
| `grand_total` | DECIMAL | |
| `paid_amount` | DECIMAL | |

### `db_salesitemsreturn`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `return_id` | INT FK → `db_salesreturn.id` | |
| `item_id` | INT | |
| `qty` | DECIMAL | |
| `unit_price` | DECIMAL | |
| `total` | DECIMAL | |

### `db_salespaymentsreturn`
Similar structure to `db_salespayments` — linked to `db_salesreturn.id`

### `db_customer_payments` (denormalized cache)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `salespayment_id` | INT | |
| `customer_id` | INT | |
| `payment_date` | DATE | |
| `payment_type` | VARCHAR | |
| `payment` | DECIMAL | |
| `status` | TINYINT | |

> Rebuilt by `record_customer_payment()` — a snapshot/cache table.

---

## 4.4 Purchase Module

### `db_purchase`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `purchase_code` | VARCHAR | PO code |
| `purchase_date` | DATE | |
| `supplier_id` | INT FK → `db_suppliers.id` | |
| `company_id` | INT | Branch |
| `warehouse_id` | INT FK → `db_warehouse.id` | |
| `grand_total` | DECIMAL | |
| `paid_amount` | DECIMAL | |
| `payment_type` | VARCHAR | Cash/Kredit/Depo |
| `purchase_status` | VARCHAR | Final/Draft |
| `purchase_type` | VARCHAR | Regular/Konsinyasi |
| `no_faktur` | VARCHAR | Supplier invoice number |

### `db_purchaseitems`
Similar to `db_salesitems` — linked to `db_purchase.id`

### `db_purchasepayments`
Similar to `db_salespayments` — linked to `db_purchase.id`

### `db_purchasereturn`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `return_code` | VARCHAR | |
| `purchase_id` | INT FK → `db_purchase.id` | |
| `supplier_id` | INT | |
| `grand_total` | DECIMAL | |
| `return_type` | VARCHAR | Regular/Konsinyasi |

### `db_purchaseitemsreturn` / `db_purchasepaymentsreturn`
Return line items and payments for purchases.

### `db_supplier_payments` (denormalized cache)
Rebuilt by `record_supplier_payment()` — mirrors `db_purchasepayments`.

---

## 4.5 Inventory & Items

### `db_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `item_code` | VARCHAR | |
| `custom_barcode` | VARCHAR | |
| `item_name` | VARCHAR | |
| `item_image` | VARCHAR | Image path |
| `category_id` | INT FK → `db_category.id` | |
| `brand_id` | INT FK → `db_brands.id` | |
| `unit_id` | INT FK → `db_units.id` | |
| `tax_id` | INT FK → `db_tax.id` | |
| `unit_price` | DECIMAL | Selling price |
| `purchase_price` | DECIMAL | Cost price |
| `stock` | DECIMAL | Current stock |
| `unit_perpack` | INT | Units per pack |
| `company_id` | INT | Branch |
| `ppob` | TINYINT | Is PPOB product? |
| `ppob_type` | VARCHAR | `pulsa`/`data`/`pln` |
| `paket_data` | DECIMAL | Data package size (GB) |
| `expiry_date` | DATE | Product expiry |
| `status` | TINYINT | 1=active |

### `db_items_stock`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `item_id` | INT FK → `db_items.id` | |
| `company_id` | INT | |
| `stock` | DECIMAL | Stock per branch |
| `warehouse_id` | INT | |

### `db_stockentry`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `item_id` | INT | |
| `qty` | DECIMAL | |
| `type` | VARCHAR | `purchase`/`sales`/`return`/`adjustment` |
| `reference_id` | INT | Sales or purchase ID |
| `company_id` | INT | |
| `created_date` | DATE | |

### `db_inventory_so` (Stock Opname)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `doc_no` | VARCHAR | SO document number |
| `doc_date_start` | DATE | |
| `doc_date_end` | DATE | |
| `doc_status` | VARCHAR | `Draft`/`Approved` |
| `doc_remarks` | TEXT | |
| `company_id` | INT | |

### `db_inventory_so_dtl` (Stock Opname Detail)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `so_id` | INT FK → `db_inventory_so.id` | |
| `item_id` | INT FK → `db_items.id` | |
| `qty_system` | DECIMAL | System stock count |
| `qty_actual` | DECIMAL | Physical count |
| `qty_adjust` | DECIMAL | Difference |
| `purchase_price` | DECIMAL | |
| `note` | TEXT | |

---

## 4.6 POS Session & Cart

### `db_cart`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `invoice` | VARCHAR | Session invoice UUID |
| `item_id` | INT | |
| `qty` | DECIMAL | |
| `unit_price` | DECIMAL | |
| `customer_id` | INT | |
| `company_id` | INT | |
| `user_id` | INT | |

### `db_hold` / `db_holditems`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `invoice` | VARCHAR | Hold invoice reference |
| `... (hold header)` | | Customer, totals |

`db_holditems` — line items for held invoices.

### `db_buka_kasir` (Open Register Sessions)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `noref` | VARCHAR | Register reference number |
| `no_kasir` | VARCHAR | Kasir number |
| `company_id` | INT | |
| `user_id` | INT FK → `db_users.id` | |
| `tgl_buka` | DATETIME | Open timestamp |
| `tgl_tutup` | DATETIME | Close timestamp |
| `saldo_awal` | DECIMAL | Opening balance |
| `saldo_akhir` | DECIMAL | Closing balance |
| `saldo_kredit` | DECIMAL | Credit total |
| `status` | TINYINT | 1=open, 0=closed |

### `db_kasir` (Master Kasir)
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `no_kasir` | VARCHAR | |
| `company_id` | INT | |
| `description` | TEXT | |

---

## 4.7 Members (Anggota Koperasi)

### `m_anggota`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `nik_kar` | VARCHAR | Employee ID (NIK) — primary lookup key |
| `id_card` | VARCHAR | National ID number |
| `nama_kar` | VARCHAR | Full name |
| `no_telp` | VARCHAR | Phone |
| `divisi` | VARCHAR | Division |
| `bagian` | VARCHAR | Department |
| `jabatan` | VARCHAR | Position |
| `dept` | VARCHAR | Department code |
| `kd_group` | VARCHAR | Group code |
| `limit_toko` | DECIMAL | Monthly store credit limit |
| `limit_ppob` | DECIMAL | Monthly PPOB credit limit |
| `gaji_minus` | DECIMAL | Salary deduction (overrides limit_toko if > 0) |
| `sim_wajib` | DECIMAL | Mandatory savings |
| `sim_pokok` | DECIMAL | Principal savings |
| `status_anggota` | VARCHAR | `AKTIVE`/`PENSIUN`/`RESIGN` |

---

## 4.8 Customers & Suppliers

### `db_customers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | id=1 is "Walk-in customer" |
| `customer_name` | VARCHAR | |
| `mobile` | VARCHAR | For SMS |
| `email` | VARCHAR | |
| `address` | VARCHAR | |
| `country_id` | INT | |
| `state_id` | INT | |
| `sales_due` | DECIMAL | Outstanding balance (cached) |
| `status` | TINYINT | |

### `db_suppliers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `supplier_name` | VARCHAR | |
| `mobile` | VARCHAR | |
| `email` | VARCHAR | |
| `address` | VARCHAR | |
| `purchase_due` | DECIMAL | Outstanding payable (cached) |
| `status` | TINYINT | |

---

## 4.9 Financial & Expense

### `db_expense`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `expense_category_id` | INT FK → `db_expense_category.id` | |
| `expense_date` | DATE | |
| `amount` | DECIMAL | |
| `expense_note` | TEXT | |
| `company_id` | INT | |
| `status` | TINYINT | |

### `db_expense_category`
| Column | Type | Notes |
|--------|------|-------|
| `id` | INT PK | |
| `expense_category_name` | VARCHAR | |
| `status` | TINYINT | |

---

## 4.10 Master Data Tables

### `db_brands`
`id`, `brand_name`, `status`

### `db_category`
`id`, `category_name`, `status`, `company_id`

### `db_units`
`id`, `unit_name`, `status`

### `db_tax`
`id`, `tax_name`, `tax_percent`, `tax_type` (`inclusive`/`exclusive`), `status`

### `db_currency`
`id`, `currency_name`, `currency_code`, `exchange_rate`, `status`

### `db_paymenttypes`
`id`, `payment_type`, `status`

### `db_country`
`id`, `country_name`, `status`

### `db_states`
`id`, `state_name`, `country_id`, `status`

### `db_warehouse`
`id`, `warehouse_name`, `company_id`, `address`, `status`

### `db_languages`
`id`, `language_name`, `language_code`, `status`

---

## 4.11 Communication

### `db_smsapi`
`id`, `api_key`, `sender_id`, `gateway_url`, `status`

### `db_smstemplates`
`id`, `template_name`, `content`, `status`

---

## 4.12 Navigation

### `db_menu`
`id`, `menu_name`, `menu_url`, `menu_icon`, `parent_id`, `sort_order`, `status`

---

## 4.13 Loan Module Tables (Koperasi)

These tables are referenced from `custom_helper.php` functions (`update_biaya_flat`, `get_bungan_bulanan`, `get_update_cicilan`):

### `trans_pinjaman`
| Column | Notes |
|--------|-------|
| `id` | PK |
| `doc_no` | Loan document number |
| `nik` | Employee NIK |
| `doc_date` | Application date |
| `doc_status` | `APPROVED`/`PENDING` |
| `status_pencairan` | Disbursement status |
| `plan_pinjaman` | Loan principal |
| `plan_jangka_waktu` | Tenor (months) |
| `bank_pembiaya` | Financing source (e.g., `GAJI MINUS`) |
| `status_bayar` | `BELUM LUNAS`/`LUNAS` |
| `awal_pinjaman` | First installment date |
| `akhir_pinjaman` | Last installment date |
| `pokok_angsuran` | Principal per installment |
| `biaya_admin` | Admin fee |
| `biaya_asuransi` | Insurance fee |
| `plan_angsuran` | Total installment |
| `blokir_1angsuran` | Block first installment flag |
| `total_potongan` | Total deductions |
| `total_diterima` | Net disbursed amount |

### `trans_pinjaman_dtl`
| Column | Notes |
|--------|-------|
| `id` | PK |
| `doc_no` | FK → `trans_pinjaman.doc_no` |
| `nik_kar` | Employee NIK |
| `doc_no_cicilan` | Installment doc number (`{doc_no}-{i}-{nik}`) |
| `ke_cicilan` | Installment number |
| `tgl_cicilan` | Due date |
| `angsuran_cicilan` | Total installment |
| `pokok_cicilan` | Principal portion |
| `bunga_cicilan` | Interest portion |
| `jasa_cicilan` | Service fee portion |
| `sisa_cicilan` | Remaining balance |
| `status_cicilan` | `Belum Bayar`/`Bayar` |
| `sisa_jasa` | Remaining service fees |
| `rool_over` | Roll-over flag |
| `type_cicilan` | `PAYROLL` if auto-deducted |

### `v_trans_pinjaman_flat` (VIEW)
Used for flat-rate loan calculation — provides pre-computed `angsuran`, `total_plus_bunga`, `biaya_suku_bunga`, `jasa_pinjaman`, etc.

---

## 4.14 Mobile Orders (external app)

### `orders`
Referenced in `tagihan_anggota_ppob()`:
| Column | Notes |
|--------|-------|
| `id` | PK |
| `nik_kar` | Member NIK |
| `order_amount` | Order total |
| `payment_method` | e.g., `pay_by_wallet` |
| `order_status` | `delivered`/etc. |
| `ppob` | 1 if PPOB order |
| `created_at` | Timestamp |
