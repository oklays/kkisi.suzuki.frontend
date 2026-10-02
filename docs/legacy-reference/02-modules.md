# Phase 2 — Modules & Components

## 2.1 Base Controller (`MY_Controller`)

All authenticated controllers extend `MY_Controller` which provides:

```php
class MY_Controller extends CI_Controller {
    protected $data = [];       // View data array
    
    public function load_info()        // Loads site/company settings into $this->data
    public function permission_check($perm) // RBAC gate — redirect if no permission
    public function load_global()      // Calls load_info() + loads currency helper
}
```

`Api_c` is the only controller extending `CI_Controller` directly (unauthenticated JSON API).

---

## 2.2 Controller Inventory

### Authentication & Session

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Login` | `Login_model` | `verify` — bcrypt auth, session setup; `forgot_password`; OTP flow (`send_otp`, `verify_otp`); `getKasir` — fetch available kasir |
| `Logout` | — | Destroys session, redirects to login |
| `Csrfdata` | — | Returns CSRF token via JSON |

---

### POS & Sales

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Pos` | `Pos_model` | `index` — POS UI; `pos_save` — save new invoice; `pos_update` — edit invoice; `add_to_cart` / `update_cart`; `new_invoice` — UUID invoice; `print_invoice_pos`; `get_hold_invoice_list`; `detailanggota` — member credit check; `pilih_kasir` — open kasir |
| `Print_pos` | `Pos_model` | `pos` — print-only POS invoice view |
| `Sales` | `Sales_model` | Standard CRUD sales list, invoice PDF/print, payment recording, due management |
| `Sales_return` | `Sales_return_model` | Return processing, refund payments |
| `Sales_mobile` | `Sales_mobile_model` | Mobile order management (pending→confirmed→processing→delivered→returned→canceled) |
| `ppob/Pos_ppob` | `Pos_ppob_model` | PPOB POS UI; IAK API calls; PLN inquiry; pulsa/data item lookup; member NIK/QR scanning |

---

### Purchase & Supplier

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Purchase` | `Purchase_model` | Purchase order create/edit/delete; konsinyasi (consignment) flow; supplier quick-add; payment tracking; RR print; Excel export |
| `Purchase_return` | `Purchase_returns_model` | Purchase return for both regular and consignment |
| `Suppliers` | `Suppliers_model` | CRUD suppliers; payment due tracking; opening balance |

---

### Inventory & Items

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Items` | `Items_model` | Product CRUD; stock adjustment (`penyesuaian_stok`); barcode label print; brand/category/unit quick-save |
| `Inventory` | `Inventory_model` | Stock opname (SO) — create, view detail, download; `ajax_list_so_detail` — SO line items |
| `Barcode` | — | Barcode rendering controller |
| `Import` | — | CSV import for customers, suppliers, items, PO items, SO items, stock adjustment |

---

### Members (Anggota Koperasi)

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Member` | `Member_model` | Employee member CRUD (m_anggota); divisi/bagian/jabatan management; credit limit display; NIK/QR/ID-card JSON lookup; payment due tracking |

---

### Kasir (Register Management)

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Kasir` | `Kasir_model` | Buka kasir (open register); tutup kasir (close register); detail register view; master kasir CRUD; print kasir report |

---

### Reporting

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Reports` | `Reports_model` | Sales report; sales return; purchase; purchase return; expense; toko (branch P&L); profit/loss; stock; brand-wise stock; item sales; purchase/sales payments; expired items; Excel export |
| `Dashboard` | `Dashboard_model` | Dashboard KPIs (`dashboard_values`); items stok; terlaris (bestsellers); expiring items |

---

### Master Data

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Customers` | `Customers_model` | Customer CRUD; payment due; opening balance |
| `Company` | `Company_model` | Multi-company branch management |
| `Brands` | `Brand_model` | Product brand CRUD |
| `Category` | `Category_model` | Product category CRUD |
| `Units` | `Units_model` | Unit of measure CRUD |
| `Tax` | `Tax_model` | Tax rate CRUD |
| `Tax_group` | `Tax_group_model` | Tax group (grouped rates) |
| `Currency` | `Currency_model` | Multi-currency CRUD |
| `Payment_types` | `Payment_types_model` | Payment method CRUD |
| `Country` | `Country_model` | Country master |
| `State` | `State_model` | State/province master |
| `Expense` | `Expense_model` / `Expense_category_model` | Operational expense CRUD + categories |
| `Warehouse` | `Warehouse_model` | Warehouse location management |

---

### Configuration & System

| Controller | Model | Key Actions |
|-----------|-------|-------------|
| `Site` | `Site_model` | Site settings update; language switch |
| `Users` | `Users_model` | User management; password reset; DB backup/restore |
| `Roles` | `Roles_model` | RBAC role CRUD |
| `Menu` | `Menu_model` | Dynamic nav menu management |
| `Templates` | `Templates_model` | SMS notification templates |
| `Sms` | `Sms_model` | SMS gateway management; send test SMS |
| `Updates` | — | DB migration utilities (`update_db`) |
| `Kalkulator` | — | Simple calculator utility (`persen`) |
| `Api_c` | `Api_m` | Internal JSON API: `getListSo`, `getListDetailSo` |
| `Welcome` | — | Default CI welcome (unused) |

---

## 2.3 Model Inventory

| Model | Table(s) | Notes |
|-------|---------|-------|
| `Login_model` | `db_users`, `db_roles` | Auth + kasir lookup |
| `Pos_model` | `db_sales`, `db_salesitems`, `db_cart`, `db_hold`, `db_holditems`, `db_buka_kasir`, `db_items`, `db_items_stock`, `db_stockentry` | Core POS |
| `Pos_ppob_model` | `m_anggota`, `db_items` | IAK API wrapping |
| `Sales_model` | `db_sales`, `db_salesitems`, `db_salespayments`, `db_salesreturn` | Sales CRUD |
| `Sales_return_model` | `db_salesreturn`, `db_salesitemsreturn`, `db_salespaymentsreturn` | Returns |
| `Sales_mobile_model` | `db_sales` (with order fields) | Mobile order flow |
| `Purchase_model` | `db_purchase`, `db_purchaseitems`, `db_purchasepayments`, `db_stockentry`, `db_suppliers` | Purchase |
| `Purchase_returns_model` | `db_purchasereturn`, `db_purchaseitemsreturn`, `db_purchasepaymentsreturn` | Purchase returns |
| `Inventory_model` | `db_items`, `db_inventory_so`, `db_inventory_so_dtl`, `db_units` | Stock opname |
| `Items_model` | `db_items`, `db_items_stock`, `db_stockentry`, `db_brands`, `db_category`, `db_units`, `db_tax` | Items |
| `Member_model` | `m_anggota` | Employee members |
| `Kasir_model` | `db_kasir`, `db_buka_kasir` | Cashier register |
| `Reports_model` | Multiple (see Phase 4) | Reporting queries |
| `Dashboard_model` | `db_sales`, `db_purchase`, `db_expense`, `db_items` | Dashboard KPIs |
| `Customers_model` | `db_customers`, `db_salespayments` | Customers |
| `Suppliers_model` | `db_suppliers`, `db_purchasepayments` | Suppliers |
| `Api_m` | `db_inventory_so`, `db_inventory_so_dtl` | Internal API |
| `Users_model` | `db_users` | User management |
| `Roles_model` | `db_roles`, `db_permissions` | RBAC |
| `Company_model` | `db_company` | Multi-company |
| `Site_model` | `db_sitesettings` | Config |
| `Sms_model` | `db_smsapi` | SMS API |
| `Templates_model` | `db_smstemplates` | SMS templates |
| `Expense_model` | `db_expense`, `db_expense_category` | Expenses |
| `Menu_model` | `db_menu` | Navigation |
| `Warehouse_model` | `db_warehouse` | Warehouses |
| `Language_model` | `db_languages` | i18n |
| `Constant_model` | — | Static constants (commented out in PPOB) |
| `Brand_model` | `db_brands` | Brands |
| `Category_model` | `db_category` | Categories |
| `Tax_model` | `db_tax` | Tax rates |
| `Tax_group_model` | `db_tax` (grouped) | Tax groups |
| `Units_model` | `db_units` | Units of measure |
| `Currency_model` | `db_currency` | Currencies |
| `Payment_types_model` | `db_paymenttypes` | Payment methods |
| `Country_model` | `db_country` | Countries |
| `State_model` | `db_states` | States |

---

## 2.4 Helper Functions Summary

### `custom_helper.php`
| Function | Purpose |
|----------|---------|
| `cetak($str)` | Sanitize + escape string for DB (XSS + SQL escape) |
| `demo_app()` | Returns `false` — demo mode disabled |
| `app_version()` | Returns `'2.0.1'` |
| `system_fromatted_date($date)` | Converts display date to `Y-m-d` per session format |
| `show_date($date)` | Formats date for display per session setting |
| `show_time($time)` | Formats time 12h/24h per session setting |
| `rupiah($n)` | `number_format($n, 2, '.', ',')` |
| `rupiah2($n)` | No decimals format |
| `rupiah3($n)` | Indonesian format `number_format($n, 2, ',', '.')` |
| `penyebut($n)` / `terbilang($n)` | Number to Indonesian words (for invoice printing) |
| `app_number_format($n)` | `number_format($n, 2)` |
| `tagihan_anggota($nik)` | Monthly credit sales total for member NIK (current month) |
| `tagihan_anggota_ppob($nik)` | Monthly PPOB bill total for member NIK |
| `cek_gaji_minus($nik)` | Check active salary-deduction loan (2 months prior) |
| `cek_buka_kasir($company_id)` | Check if current user has open kasir today |
| `record_customer_payment($cust_id)` | Rebuild `db_customer_payments` from `db_salespayments` |
| `record_supplier_payment($sup_id)` | Rebuild `db_supplier_payments` from `db_purchasepayments` |
| `calculate_inclusive($amt,$tax)` | Tax-inclusive calculation |
| `calculate_exclusive($amt,$tax)` | Tax-exclusive calculation |
| `change_return_status()` | Whether to show change return in POS |
| `get_invoice_format_id()` | Invoice format setting ID from `db_sitesettings` |
| `is_enabled_round_off()` | Round-off enabled flag from `db_sitesettings` |
| `update_biaya_flat($doc_no)` | Recalculate flat-rate loan installments |
| `get_bungan_bulanan($doc_no)` | Generate monthly installment schedule in `trans_pinjaman_dtl` |
| `get_update_cicilan($doc_no)` | Mark past installments as paid (PAYROLL); update loan status |
| `getRomawiBulan($bln)` | Month number → Roman numeral |

### `mysecurity_helper.php`
| Function | Purpose |
|----------|---------|
| `encrypt_url($string)` | AES-256-CBC encrypt ID for URL (from `security.ini`) |
| `decrypt_url($string)` | AES-256-CBC decrypt ID from URL |

### `sms_template_helper.php`
| Function | Purpose |
|----------|---------|
| `send_sms_using_template($data_id,$template_id)` | Template-based SMS (Sales/Sales Return) |
| `is_sms_enabled()` | Check `db_company.sms_status` |
| `kirim_email($subjek,$message,$tujuan)` | PHPMailer SMTP send |
| `sendmail($to,$subject,$message)` | PHPMailer SMTP with SMTP debug |

### `appinfo_helper.php`
| Function | Purpose |
|----------|---------|
| `appinfo($salt)` | Hardware fingerprint → license hash |
| `get_dbmid()` | Fetch stored machine ID from `db_sitesettings` |
| `get_domain()` / `get_dbdomain()` | Domain validation |
