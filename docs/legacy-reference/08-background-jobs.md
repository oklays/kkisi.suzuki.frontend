# Phase 8 — Background Jobs & Scheduled Operations

## 8.1 Overview

The application has **no cron jobs, scheduled tasks, or queue workers** built into the codebase. There is no evidence of:
- `cron.php` scripts
- Laravel-style `artisan schedule`
- Queue tables or job tables
- Background process management (Supervisor, etc.)

All operations are **synchronous and request-driven**.

---

## 8.2 Pseudo-Background Operations (Triggered Inline)

Several operations act like "background" tasks but are actually triggered inline during HTTP requests:

### 2a. Customer Payment Cache Rebuild
**Trigger:** After every sales payment operation  
**Function:** `record_customer_payment($customer_id)` in `custom_helper.php`  
**Operation:**
1. DELETE existing cache rows for customer
2. Re-INSERT aggregated payment data from `db_salespayments` → `db_customer_payments`

**Called from:** `Customers::save_payment()`, `Sales::save_payment()`

---

### 2b. Supplier Payment Cache Rebuild
**Trigger:** After every purchase payment operation  
**Function:** `record_supplier_payment($supplier_id)` in `custom_helper.php`  
**Operation:**
1. DELETE existing cache rows for supplier
2. Re-INSERT aggregated payment data from `db_purchasepayments` → `db_supplier_payments`

**Called from:** `Suppliers::save_payment()`, `Purchase::save_payment()`

---

### 2c. Loan Installment Auto-Update
**Trigger:** When a loan is approved/disbursed  
**Function chain:** `update_biaya_flat()` → `get_bungan_bulanan()` → `get_update_cicilan()`  
**Operation:**
1. Recalculate flat-rate installment breakdown
2. Regenerate all `trans_pinjaman_dtl` rows
3. Mark past-due installments as `Bayar` (PAYROLL)
4. Set `status_bayar` on parent loan

**Not triggered on a schedule** — must be called manually when loan data changes.

---

### 2d. Stock Entry Logging
**Trigger:** Every sale, purchase, return, or adjustment  
**Operation:** Inline INSERT into `db_stockentry` within the transaction  
**No separate background process** — stock entries are written synchronously.

---

### 2e. SMS Notification Dispatch
**Trigger:** After POS sale finalized (if SMS enabled)  
**Function:** `send_sms_using_template($data_id, $template_id)`  
**Operation:** Synchronous HTTP call to SMS gateway within the same request  

**⚠️ Risk:** If SMS gateway is slow, it will delay the POS save response to the user.

---

### 2f. Email Dispatch (PHPMailer)
**Trigger:** Password reset OTP flow  
**Operation:** Synchronous SMTP connection within the login request  

**⚠️ Risk:** SMTP failures block the OTP flow response.

---

## 8.3 Database Maintenance Operations

The `Updates` controller has manual migration utilities:

| Method | Operation |
|--------|----------|
| `get_current_version_of_app_db` | Read current DB schema version |
| `update_db` | Apply DB schema migrations |
| `update_tax_type_in_db_salesitems` | Backfill tax_type column in sales items |
| `update_tax_type_in_db_purchaseitems` | Backfill purchase items |
| `update_tax_type_in_db_purchaseitemsreturn` | Backfill purchase return items |
| `update_tax_type_in_db_salesitemsreturn` | Backfill sales return items |
| `fun_temp_update_suppliers_purchase_due` | Recalculate all supplier due balances |
| `fun_temp_update_customers_sales_due` | Recalculate all customer due balances |

These are **manually triggered** via HTTP GET — no automation.

---

## 8.4 DB Backup & Restore

**Controller:** `Users`  
**Methods:** `dbbackup`, `restoredb`, `import_database`

- `dbbackup` — dumps MySQL database (likely via `mysqldump` shell command or PHP-based dump)
- `restoredb` / `import_database` — restore from `.sql` file upload

**Triggered manually** by admin users only.

---

## 8.5 Recommendations for Background Job Implementation

If scheduling is needed (e.g., monthly credit reset notifications, loan due reminders), the following approach would fit the stack:

```bash
# Linux cron — call CI controller as CLI
* 0 1 * * * php /path/to/index.php jobs monthly_reset
```

Or using a dedicated `Jobs` controller:
```php
// application/controllers/Jobs.php
class Jobs extends CI_Controller {
    public function monthly_reset() {
        // Only allow CLI
        if (!$this->input->is_cli_request()) die('CLI only');
        // Reset or notify...
    }
}
```
