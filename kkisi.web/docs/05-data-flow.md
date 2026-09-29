# Phase 5 — SQL Patterns & Data Flow

## 5.1 POS Transaction Flow

```
User clicks "Save" in POS UI
         │
         ▼
POST /pos/pos_save
         │
         ▼
Pos::pos_save()
  1. Validate kasir session (cek_buka_kasir)
  2. Get cart items from db_cart WHERE invoice=? AND user_id=?
  3. Generate sales_code (MAX + 1 per month/company)
  4. INSERT INTO db_sales (header record)
  5. For each cart item:
     a. INSERT INTO db_salesitems
     b. UPDATE db_items SET stock = stock - qty
     c. INSERT INTO db_stockentry (type='sales')
  6. INSERT INTO db_salespayments (payment record)
  7. DELETE FROM db_cart WHERE invoice=?
  8. If member (nik_kar set): record credit against m_anggota limit
  9. If SMS enabled: send_sms_using_template(sales_id, 1)
 10. Return JSON {success, invoice_id}
```

---

## 5.2 Invoice Code Generation Pattern

```php
// Sales invoice
$bl = date("m"); $th = date("Y");
SELECT MAX(RIGHT(sales_code,5)) AS kd_max 
FROM db_sales 
WHERE company_id='$company_id' 
  AND MONTH(sales_date)='$bl' 
  AND YEAR(sales_date)='$th'

// Format: {PREFIX}{ymd}{05d}
// Example: INV2406150001, PPOB2406150001
```

---

## 5.3 Member Credit Limit Check Flow

```
POST /pos/cek_sisa_limit
         │
         ▼
1. SELECT * FROM m_anggota WHERE id=?

2. Determine effective_limit:
   if gaji_minus > 0:
     effective_limit = gaji_minus
   else:
     effective_limit = limit_toko

3. tagihan_anggota(nik_kar):
   SELECT COALESCE(SUM(grand_total),0)
   FROM db_sales
   WHERE nik_kar='$nik'
     AND payment_type='Kredit'
     AND sales_status='Final'
     AND sales_date BETWEEN first_of_month AND last_of_month

4. sisa_limit = effective_limit - tagihan
5. Return JSON {limit, tagihan, sisa}
```

---

## 5.4 Purchase → Stock Flow

```
POST /purchase/purchase_save_and_update
         │
         ▼
Purchase::purchase_save_and_update()
  1. INSERT INTO db_purchase (header)
  2. For each item:
     a. INSERT INTO db_purchaseitems
     b. UPDATE db_items SET stock = stock + qty
            (or INSERT INTO db_items_stock if multi-warehouse)
     c. INSERT INTO db_stockentry (type='purchase')
  3. If paid > 0: INSERT INTO db_purchasepayments
  4. record_supplier_payment(supplier_id)  -- rebuild cache
```

---

## 5.5 Stock Opname (SO) Flow

```
POST /inventory/new_so  →  Create db_inventory_so header
GET  /inventory/view_detail/{id}  →  Load SO with db_inventory_so_dtl

Physical counting process:
  1. SO created with doc_status='Draft'
  2. For each item: INSERT INTO db_inventory_so_dtl
     - qty_system = current db_items.stock
     - qty_actual = entered by user
     - qty_adjust = qty_actual - qty_system
  3. Approve SO:
     - UPDATE db_items SET stock = qty_actual
     - INSERT INTO db_stockentry (type='adjustment')
     - UPDATE db_inventory_so SET doc_status='Approved'
```

---

## 5.6 Kasir (Register) Open/Close Flow

```
Login → GET /login/getKasir → returns list from db_kasir
         │
         ▼
POST /pos/pilih_kasir
  1. Check db_buka_kasir for open session today (current user, company)
  2. If none: INSERT INTO db_buka_kasir
     {user_id, company_id, no_kasir, tgl_buka=NOW(), saldo_awal, status=1}
  3. Store id_kasir and noref_kasir in session

POST /kasir/ajax_tutup_kasir
  1. Calculate saldo_akhir (saldo_awal + cash sales today)
  2. Calculate saldo_kredit (credit sales today)
  3. UPDATE db_buka_kasir SET tgl_tutup=NOW(), saldo_akhir=?, saldo_kredit=?, status=0
```

---

## 5.7 PPOB Transaction Flow

```
POST /ppob/pos_ppob/get_item
  1. Detect ppob_type (pulsa/data/pln)
  2. If pulsa/data: check_operator(phoneNumber) → IAK API
  3. If pln: inquiryPLN(customerNo) → IAK API
  4. SELECT * FROM db_items WHERE ppob=1 AND ppob_type=?
                               [AND paket_data filter]
  Return JSON product list

POST /ppob/pos_ppob/pos_save
  1. Validate member NIK + PPOB credit limit (tagihan_anggota_ppob)
  2. Call IAK API: IAKPrepaid::topUp(...)
  3. On success: INSERT INTO db_sales (payment_type='Kredit', ppob=1)
  4. Deduct from db_items.stock
```

---

## 5.8 Loan Installment Generation Flow

```
update_biaya_flat($doc_no)
  │
  ├─ UPDATE trans_pinjaman (set pokok_angsuran, biaya_admin, etc.)
  │    (via v_trans_pinjaman_flat VIEW join)
  │
  └─ get_bungan_bulanan($doc_no)
       │
       ├─ DELETE FROM trans_pinjaman_dtl WHERE doc_no=?
       │
       ├─ SELECT FROM v_trans_pinjaman_flat (loan params)
       │
       └─ LOOP for i=0 to plan_jangka_waktu:
            ├─ Calculate tgl_cicilan (monthly, based on awal_pinjaman or doc_date)
            ├─ INSERT INTO trans_pinjaman_dtl per installment
            └─ get_update_cicilan($doc_no)
                 ├─ UPDATE status_cicilan='Bayar' for past months (PAYROLL)
                 ├─ Check last installment → update status_bayar LUNAS/BELUM LUNAS
                 └─ UPDATE akhir_pinjaman on trans_pinjaman
```

---

## 5.9 Customer/Supplier Payment Cache Rebuild

```sql
-- record_customer_payment($customer_id)
DELETE FROM db_customer_payments WHERE customer_id=$customer_id;

INSERT INTO db_customer_payments (...)
SELECT a.id, b.customer_id, a.payment_date, a.payment_type,
       COALESCE(SUM(a.payment)), a.payment_note, ...
FROM db_salespayments a
JOIN db_sales b ON b.id = a.sales_id
WHERE b.customer_id=$customer_id
GROUP BY b.customer_id, a.payment_type, a.payment_date, a.created_time, a.created_date;
```

---

## 5.10 Reports SQL Patterns

### Sales Report (date-range)
```sql
SELECT s.*, c.customer_name, u.fullname
FROM db_sales s
LEFT JOIN db_customers c ON c.id = s.customer_id
LEFT JOIN db_users u ON u.id = s.created_by
WHERE s.company_id = ? 
  AND s.sales_date BETWEEN ? AND ?
  AND s.sales_status = 'Final'
ORDER BY s.sales_date DESC
```

### Branch P&L (Laporan Toko)
```sql
-- Persediaan Awal (opening inventory value)
SELECT SUM(purchase_price * stock) AS tot_persedia_awal FROM db_items ...

-- Pembelian (purchases by type)
SELECT SUM(grand_total) FROM db_purchase 
WHERE payment_type='Depo' AND MONTH(purchase_date)=? AND YEAR(purchase_date)=?

-- Penjualan (sales)
SELECT SUM(grand_total) FROM db_sales WHERE sales_status='Final' ...

-- HPP (COGS from items)
SELECT SUM(si.purchase_price * si.qty)
FROM db_salesitems si JOIN db_sales s ON s.id=si.sales_id
WHERE s.sales_status='Final' ...
```

### Profit by Item
```sql
SELECT i.item_name, 
       SUM(si.qty) AS total_qty,
       SUM(si.total) AS total_sales,
       SUM(si.purchase_price * si.qty) AS total_cost,
       SUM(si.total - si.purchase_price * si.qty) AS gross_profit
FROM db_salesitems si
JOIN db_items i ON i.id = si.item_id
JOIN db_sales s ON s.id = si.sales_id
WHERE s.sales_status='Final' AND s.company_id=?
GROUP BY si.item_id
```

---

## 5.11 DataTable Pattern

All list endpoints follow the same pattern:

```php
// Controller
public function ajax_list() {
    $list = $this->model->get_datatables();  // paginated
    // Build $data[] rows with HTML buttons
    $output = [
        "draw" => $_POST['draw'],
        "recordsTotal" => $this->model->count_all(),
        "recordsFiltered" => $this->model->count_filtered(),
        "data" => $data
    ];
    echo json_encode($output);
}

// Model
private function _get_datatables_query() {
    // Apply search across column_search[]
    // Apply order from column_order[]
    // Apply company_id WHERE filter
}
function get_datatables() {
    $this->_get_datatables_query();
    if ($_POST['length'] != -1) $this->db->limit($_POST['length'], $_POST['start']);
    return $this->db->get()->result();
}
```
