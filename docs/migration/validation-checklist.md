# Validation Checklist — KKISI Migration Baseline

> **Purpose:** Every item in this checklist must be manually verified against the **running legacy application** at `tokonew.kkisitb2.id` before implementing the corresponding module in Next.js.  
> **Process:** Tester performs the action on legacy, records actual behavior, marks status.  
> **Status values:** `⬜ Pending` · `✅ Verified` · `❌ Discrepancy Found` · `⚠️ Cannot Verify (system unavailable)`

---

## How to Use This Checklist

1. For each item, perform the action on the **live legacy system**
2. Record: exact inputs, exact outputs, any DB state changes observed
3. Capture screenshots or screen recordings for CRITICAL items
4. Note any behavior that differs from what is documented in `kkisi.web/`
5. Discrepancies become **additional business rules** that must be implemented

---

## Section 1 — Authentication & Session

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| AUTH-01 | **CRITICAL** | Login with valid username + password | Session created with `logged_in=true`, `role_id`, `company_id`, `inv_userid`, `inv_username` | | ⬜ |
| AUTH-02 | **CRITICAL** | Login with invalid password | Redirect back to login, no session created | | ⬜ |
| AUTH-03 | **CRITICAL** | Login with unknown username | Redirect back to login, no session | | ⬜ |
| AUTH-04 | **CRITICAL** | Accessing `/pos` without session | Redirect to `/login` | | ⬜ |
| AUTH-05 | **CRITICAL** | Accessing endpoint without required permission | Redirect to `/dashboard` | | ⬜ |
| AUTH-06 | **HIGH** | Password reset: enter email → OTP sent | OTP email received via SMTP | | ⬜ |
| AUTH-07 | **HIGH** | Password reset: enter correct OTP | New password form shown | | ⬜ |
| AUTH-08 | **HIGH** | Password reset: OTP expired/wrong | Error message shown | | ⬜ |
| AUTH-09 | **HIGH** | Logout action | Session destroyed, redirect to login | | ⬜ |
| AUTH-10 | **MEDIUM** | Role 1–2 user login | Can see all companies in dropdowns | | ⬜ |
| AUTH-11 | **MEDIUM** | Role >2 user login | Data filtered to their `company_id` only | | ⬜ |
| AUTH-12 | **MEDIUM** | User with `status=0` (inactive) tries login | Login rejected | | ⬜ |

---

## Section 2 — POS (Point of Sale)

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| POS-01 | **CRITICAL** | Access `/pos` without an open kasir | Redirected to kasir selection, NOT to POS screen | | ⬜ |
| POS-02 | **CRITICAL** | Open kasir: select kasir + enter saldo_awal | `db_buka_kasir` row inserted, session `id_kasir` and `noref_kasir` set | | ⬜ |
| POS-03 | **CRITICAL** | Add item to cart | Item appears in `db_cart`, qty/price correct | | ⬜ |
| POS-04 | **CRITICAL** | Add same item twice | Cart qty incremented (not duplicate row) | | ⬜ |
| POS-05 | **CRITICAL** | POS save — Cash payment | `db_sales` inserted, `db_salesitems` rows, `db_salespayments`, `db_stockentry`, `db_cart` cleared | | ⬜ |
| POS-06 | **CRITICAL** | POS save — Kredit (member) | `db_sales.nik_kar` set, `payment_type='Kredit'`, credit usage incremented | | ⬜ |
| POS-07 | **CRITICAL** | Stock decrements after sale | `db_items.stock -= qty_sold`, `db_stockentry` (type='sales') written | | ⬜ |
| POS-08 | **CRITICAL** | Invoice code format | `INV{ymd}{05d}`, counter per month/company, increments by 1 | | ⬜ |
| POS-09 | **CRITICAL** | First invoice of the month | Counter starts at `00001` | | ⬜ |
| POS-10 | **HIGH** | Hold invoice | `db_hold` + `db_holditems` rows created, cart cleared | | ⬜ |
| POS-11 | **HIGH** | Retrieve held invoice | Cart repopulated from `db_hold`, hold record deleted | | ⬜ |
| POS-12 | **HIGH** | POS update (edit existing invoice) | `db_sales` updated, old `db_salesitems` replaced, stock re-adjusted | | ⬜ |
| POS-13 | **HIGH** | Close kasir (tutup_kasir) | `db_buka_kasir`: `saldo_akhir`, `saldo_kredit`, `tgl_tutup` written, `status=0` | | ⬜ |
| POS-14 | **HIGH** | Print invoice (print_invoice_pos) | Correct customer, items, totals, kasir name printed | | ⬜ |
| POS-15 | **HIGH** | Tax-inclusive item in POS | Tax computed as `amt / ((rate/100)+1) / 10` | | ⬜ |
| POS-16 | **HIGH** | Tax-exclusive item in POS | Tax computed as `(amt × rate) / 100` | | ⬜ |
| POS-17 | **HIGH** | Round-off enabled | `grand_total` rounded to nearest integer | | ⬜ |
| POS-18 | **MEDIUM** | Walk-in customer (customer_id=1) sale | No SMS sent | | ⬜ |
| POS-19 | **MEDIUM** | Named customer with mobile, SMS enabled | SMS sent via gateway after sale | | ⬜ |
| POS-20 | **MEDIUM** | POS with multiple items, different tax rates | Each line taxed correctly, totals sum correctly | | ⬜ |
| POS-21 | **LOW** | Change return calculation | `change = paid_amount - grand_total`, shown on screen | | ⬜ |

---

## Section 3 — Member Credit Limit & Anggota

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| MBR-01 | **CRITICAL** | Scan member NIK/QR in POS | Member record returned from `m_anggota`, credit info displayed | | ⬜ |
| MBR-02 | **CRITICAL** | Member with `gaji_minus > 0` | `effective_limit = gaji_minus` (not `limit_toko`) | | ⬜ |
| MBR-03 | **CRITICAL** | Member with `gaji_minus = 0` | `effective_limit = limit_toko` | | ⬜ |
| MBR-04 | **CRITICAL** | `tagihan_anggota()` scope | Only counts `Kredit + Final` sales in **current calendar month** | | ⬜ |
| MBR-05 | **CRITICAL** | Member over credit limit | Sale blocked / warning shown | | ⬜ |
| MBR-06 | **HIGH** | Member with `status_anggota = 'PENSIUN'` | Warning shown, behavior documented | | ⬜ |
| MBR-07 | **HIGH** | Member with `status_anggota = 'RESIGN'` | Warning shown, behavior documented | | ⬜ |
| MBR-08 | **HIGH** | Credit usage resets at month boundary | On 1st of new month, `tagihan = 0`, full `effective_limit` available | | ⬜ |
| MBR-09 | **HIGH** | PPOB credit limit separate from toko credit | `limit_ppob` tracked independently via `orders` table | | ⬜ |
| MBR-10 | **MEDIUM** | `cek_gaji_minus($nik)` — 2-month lookback | Salary-deduction loan active if disbursed within 2 prior months | | ⬜ |
| MBR-11 | **MEDIUM** | Member ID-card lookup | `/member/get_data_by_id_card` returns member JSON | | ⬜ |

---

## Section 4 — Inventory & Stock

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| INV-01 | **CRITICAL** | Purchase save — stock increases | `db_items.stock += qty`, `db_stockentry (type='purchase')` inserted | | ⬜ |
| INV-02 | **CRITICAL** | Sales return — stock restored | `db_items.stock += returned_qty`, `db_stockentry (type='return')` inserted | | ⬜ |
| INV-03 | **CRITICAL** | Purchase return — stock decrements | `db_items.stock -= returned_qty`, `db_stockentry (type='return')` inserted | | ⬜ |
| INV-04 | **CRITICAL** | Stock opname (SO) create | `db_inventory_so` row inserted (`doc_status='Draft'`), `db_inventory_so_dtl` with `qty_system = db_items.stock` at time of creation | | ⬜ |
| INV-05 | **CRITICAL** | SO: enter physical count (qty_actual) | `qty_adjust = qty_actual - qty_system` computed correctly | | ⬜ |
| INV-06 | **CRITICAL** | SO approve | `db_items.stock = qty_actual` (replaces), `db_stockentry (type='adjustment')`, `doc_status='Approved'` | | ⬜ |
| INV-07 | **CRITICAL** | Manual stock adjustment (penyesuaian_stok) | `db_items.stock = new_qty`, `db_stockentry (type='adjustment')` | | ⬜ |
| INV-08 | **HIGH** | SO: attempt to approve already-Approved SO | Blocked / error message | | ⬜ |
| INV-09 | **HIGH** | `db_stockentry` always written for every movement | Verify stock entry exists for each: purchase, sale, return, adjustment, opname | | ⬜ |
| INV-10 | **HIGH** | Item CSV import | `db_items` rows created, stock set correctly | | ⬜ |
| INV-11 | **MEDIUM** | Multi-warehouse: stock per branch | `db_items_stock` rows per `warehouse_id` and `company_id` | | ⬜ |
| INV-12 | **LOW** | Barcode label print | Correct barcode rendered for item | | ⬜ |

---

## Section 5 — Purchase & Suppliers

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| PUR-01 | **CRITICAL** | Regular purchase save | `db_purchase` (type='Regular'), `db_purchaseitems`, stock up, `db_stockentry`, `record_supplier_payment()` called | | ⬜ |
| PUR-02 | **CRITICAL** | Purchase payment | `db_purchasepayments` inserted, `record_supplier_payment()` rebuilds cache | | ⬜ |
| PUR-03 | **HIGH** | Konsinyasi purchase | `purchase_type='Konsinyasi'`, stock received but payment deferred | | ⬜ |
| PUR-04 | **HIGH** | Konsinyasi return | `Purchase_return::konsinyasi` flow, separate from regular return | | ⬜ |
| PUR-05 | **HIGH** | Purchase invoice code format | `PO{ymd}{05d}`, counter per month | | ⬜ |
| PUR-06 | **HIGH** | Purchase return — supplier balance updated | `record_supplier_payment()` called after return | | ⬜ |
| PUR-07 | **MEDIUM** | Supplier due balance accuracy | `db_suppliers.purchase_due` = sum of outstanding purchase amounts | | ⬜ |
| PUR-08 | **MEDIUM** | Purchase Excel export | Excel file contains correct purchase lines | | ⬜ |

---

## Section 6 — PPOB

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| PPOB-01 | **CRITICAL** | Pulsa: phone number check operator | IAK `check_operator` called, operator returned when `rc='00'` | | ⬜ |
| PPOB-02 | **CRITICAL** | Pulsa: top-up execution | IAK `topUp` called, `db_sales` inserted, `db_items.stock -= 1` | | ⬜ |
| PPOB-03 | **CRITICAL** | PLN: meter number inquiry | IAK `inquiryPLN` called, validated when `status='1'` | | ⬜ |
| PPOB-04 | **CRITICAL** | PLN: top-up execution | IAK `topUp` called, transaction recorded | | ⬜ |
| PPOB-05 | **CRITICAL** | PPOB credit limit check | `tagihan_anggota_ppob(nik)` vs `limit_ppob`, blocked if exceeded | | ⬜ |
| PPOB-06 | **HIGH** | IAK API failure (rc ≠ '00') | Error returned to user, NO `db_sales` record created | | ⬜ |
| PPOB-07 | **HIGH** | PPOB invoice code format | `PPOB{ymd}{05d}` | | ⬜ |
| PPOB-08 | **HIGH** | Phone number < 10 digits | Client-side validation blocks before IAK call | | ⬜ |
| PPOB-09 | **MEDIUM** | Data package filter (paket_data) | Only items with matching `paket_data` shown | | ⬜ |
| PPOB-10 | **MEDIUM** | PPOB via member NIK or QR scan | Member loaded, PPOB limit shown | | ⬜ |

---

## Section 7 — Financial Reporting

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| RPT-01 | **CRITICAL** | Laporan Toko formula | `Laba Bersih = (Penjualan - HPP) - Biaya Operasional`, values match manually calculated sum | | ⬜ |
| RPT-02 | **CRITICAL** | HPP calculation | `SUM(db_salesitems.purchase_price × qty)` for Final sales in period | | ⬜ |
| RPT-03 | **CRITICAL** | Penjualan in report | Only `sales_status='Final'` sales counted, not Draft/Held | | ⬜ |
| RPT-04 | **HIGH** | Date range filter | Report changes when start/end dates change | | ⬜ |
| RPT-05 | **HIGH** | Branch filter (company_id) | Super-admin: can filter by any branch; branch user: only own branch shown | | ⬜ |
| RPT-06 | **HIGH** | Sales report — payment type breakdown | Cash vs Kredit totals shown separately | | ⬜ |
| RPT-07 | **HIGH** | Stock report | Shows current `db_items.stock` per item | | ⬜ |
| RPT-08 | **HIGH** | Profit by item | `(unit_price - purchase_price) × qty` per item line | | ⬜ |
| RPT-09 | **HIGH** | Laporan Toko Excel export | `.xlsx` downloaded with correct data | | ⬜ |
| RPT-10 | **MEDIUM** | Expense report | `db_expense` totals per category for date range | | ⬜ |
| RPT-11 | **MEDIUM** | Dashboard KPIs | Total sales today, total purchase, total expense, low stock items shown | | ⬜ |
| RPT-12 | **MEDIUM** | Expiring items report | Items with `expiry_date` within threshold shown | | ⬜ |
| RPT-13 | **LOW** | Purchase report | `db_purchase` lines for date range | | ⬜ |

---

## Section 8 — Loan / Koperasi Module

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| LOAN-01 | **CRITICAL** | Loan approval triggers installment generation | `get_bungan_bulanan()` called, `trans_pinjaman_dtl` rows created for all tenor months | | ⬜ |
| LOAN-02 | **CRITICAL** | Installment count matches tenor | Rows = `plan_jangka_waktu` exactly | | ⬜ |
| LOAN-03 | **CRITICAL** | Past installments auto-marked PAYROLL | `get_update_cicilan()` sets `status_cicilan='Bayar'`, `type_cicilan='PAYROLL'` for months before today | | ⬜ |
| LOAN-04 | **CRITICAL** | Loan marked LUNAS when last installment paid | `trans_pinjaman.status_bayar='LUNAS'` when last `trans_pinjaman_dtl.status_cicilan='Bayar'` | | ⬜ |
| LOAN-05 | **HIGH** | Month boundary in installment dates | December installment → January next year (no date overflow) | | ⬜ |
| LOAN-06 | **HIGH** | Flat rate installment amounts | Principal + interest + service fee per row correct (verify against v_trans_pinjaman_flat VIEW) | | ⬜ |
| LOAN-07 | **HIGH** | Gaji minus loan blocks toko credit | When `bank_pembiaya='GAJI MINUS'` and within 2-month window, `gaji_minus` overrides `limit_toko` | | ⬜ |
| LOAN-08 | **MEDIUM** | `update_biaya_flat` recalculation | Changing loan amount triggers full recalculation of all installments | | ⬜ |

---

## Section 9 — Payroll Deduction

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| PAY-01 | **CRITICAL** | `get_update_cicilan()` marks past months | All `tgl_cicilan < TODAY` installments get `status_cicilan='Bayar'`, `type_cicilan='PAYROLL'` automatically | | ⬜ |
| PAY-02 | **CRITICAL** | Payroll deduction scope | Only installments with `status_cicilan='Belum Bayar'` and past due are updated | | ⬜ |
| PAY-03 | **HIGH** | Effect on member credit limit | After gaji_minus loan disbursed, `tagihan_anggota` returns updated limit | | ⬜ |
| PAY-04 | **MEDIUM** | `blokir_1angsuran` flag | First installment blocked if flag set — verify actual behavior | | ⬜ |

---

## Section 10 — Mobile Order Lifecycle

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| MOB-01 | **HIGH** | Order status transitions | `pending → confirmed → processing → ready_to_take → delivered` | | ⬜ |
| MOB-02 | **HIGH** | Order revenue counting | Only `delivered` orders count in revenue reports | | ⬜ |
| MOB-03 | **HIGH** | Canceled/returned orders | NOT counted in revenue | | ⬜ |
| MOB-04 | **MEDIUM** | Mobile order converted to POS sale | `pos_update` processes mobile order, `order_status` updated | | ⬜ |

---

## Section 11 — Multi-Company & RBAC

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| RBAC-01 | **HIGH** | Permission slug blocks access | User without `sales_add` permission cannot access POS save | | ⬜ |
| RBAC-02 | **HIGH** | Role 1–2 sees all company data | Dropdown shows all companies | | ⬜ |
| RBAC-03 | **HIGH** | Role >2 sees only own company | Dropdown and data filtered to session `company_id` | | ⬜ |
| RBAC-04 | **MEDIUM** | Kasir session per user/company/day | User at Company A cannot use Company B's kasir session | | ⬜ |
| RBAC-05 | **MEDIUM** | `category` field on `db_company` alters behavior | Verify what `categori_company()` controls | | ⬜ |

---

## Section 12 — Edge Cases & Error Paths

| ID | Priority | Behavior to Verify | Expected (from docs) | Actual | Status |
|----|----------|-------------------|---------------------|--------|--------|
| EDGE-01 | **HIGH** | Selling item with `stock = 0` | Blocked or warning — verify exact behavior | | ⬜ |
| EDGE-02 | **HIGH** | POS save with empty cart | Error returned, no DB write | | ⬜ |
| EDGE-03 | **HIGH** | IAK API top-up succeeds but DB write fails | State consistency — is IAK top-up reversed? | | ⬜ |
| EDGE-04 | **MEDIUM** | Concurrent kasir sessions for same user | Can a user have two open kasir sessions? | | ⬜ |
| EDGE-05 | **MEDIUM** | Loan installment date when `awal_pinjaman` is null | Falls back to `doc_date + 1 month` | | ⬜ |
| EDGE-06 | **MEDIUM** | Invoice code collision (two saves same second) | Verify MAX+1 race condition handling | | ⬜ |
| EDGE-07 | **LOW** | DB backup download | File downloaded, contains valid SQL | | ⬜ |
| EDGE-08 | **LOW** | CSV import with malformed rows | Partial import or full rejection? | | ⬜ |

---

## Verification Summary Tracker

| Section | Total Items | Verified | Discrepancies | Pending |
|---------|-------------|----------|---------------|---------|
| Auth | 12 | 0 | 0 | 12 |
| POS | 21 | 0 | 0 | 21 |
| Members | 11 | 0 | 0 | 11 |
| Inventory | 12 | 0 | 0 | 12 |
| Purchase | 8 | 0 | 0 | 8 |
| PPOB | 10 | 0 | 0 | 10 |
| Reports | 13 | 0 | 0 | 13 |
| Loans | 8 | 0 | 0 | 8 |
| Payroll | 4 | 0 | 0 | 4 |
| Mobile | 4 | 0 | 0 | 4 |
| RBAC | 5 | 0 | 0 | 5 |
| Edge Cases | 8 | 0 | 0 | 8 |
| **TOTAL** | **116** | **0** | **0** | **116** |

---

## Discrepancy Log

> Document any behavior that differs from `kkisi.web/` documentation here.

| ID | Checklist Item | Documented Behavior | Actual Behavior | Impact | Action |
|----|---------------|---------------------|-----------------|--------|--------|
| — | — | — | — | — | — |
