# Characterization Test Catalog — KKISI Migration Baseline

> **Purpose:** Each scenario here pins a precise slice of legacy behavior.  
> These are **characterization tests** — they describe what the system *does*, not what it *should* do.  
> Before any Next.js module ships, the equivalent behavior must pass these scenarios.  
> Reference: `docs/legacy-reference/05-data-flow.md`, `docs/legacy-reference/06-business-rules.md`.

---

## How to Read This Document

- **Preconditions:** DB state and session state that must exist before the test
- **Input:** HTTP request or function call parameters
- **Expected DB mutations:** Exact table/column changes that must occur
- **Expected output:** HTTP response body or rendered content
- **Expected side effects:** External calls, cache rebuilds, session changes
- **Failure scenario:** What happens when the operation fails (partial, full rollback, etc.)

---

## MODULE: Authentication

---

### CT-AUTH-001 — Successful Login, Branch User

**Scenario ID:** CT-AUTH-001  
**Module:** Authentication  

**Preconditions:**
- `db_users` row: `username='kasir1'`, `password=bcrypt('password123')`, `role_id=3`, `company_id=2`, `status=1`
- `db_roles` row: `id=3, role_name='Kasir'`
- `db_permissions` rows for `role_id=3`

**Input:**
```
POST /login/verify
Body: { username: 'kasir1', password: 'password123' }
```

**Expected DB mutations:** None — login does not write to DB (bcrypt verify only)

**Expected output:**
```
HTTP 302 Redirect → /dashboard
Session set:
  logged_in   = true
  role_id     = 3
  company_id  = 2
  inv_userid  = <db_users.id>
  inv_username = 'kasir1'
  role_name   = 'Kasir'
```

**Expected side effects:** None

**Failure scenario (wrong password):**
```
HTTP 302 Redirect → /login
No session set
```

---

### CT-AUTH-002 — Permission Block (No Permission Slug)

**Scenario ID:** CT-AUTH-002  
**Module:** Authentication / RBAC  

**Preconditions:**
- Session: `logged_in=true`, `role_id=3`
- `db_permissions`: role_id=3 does NOT have `purchase_report`

**Input:**
```
GET /reports/purchase_report
```

**Expected DB mutations:** None

**Expected output:**
```
HTTP 302 Redirect → /dashboard
```

**Expected side effects:** None

**Failure scenario:** If permission check is missing from controller — page renders (security gap)

---

### CT-AUTH-003 — OTP Password Reset Flow

**Scenario ID:** CT-AUTH-003  
**Module:** Authentication  

**Preconditions:**
- `db_users` row with `email='user@example.com'`
- SMTP settings valid in `db_sitesettings`

**Input (step 1):**
```
POST /login/forgot_password
Body: { email: 'user@example.com' }
```

**Expected DB mutations:** OTP stored (table/column to be confirmed during validation)

**Expected output (step 1):**
```
Email sent to user@example.com containing 6-digit OTP
HTTP 302 → OTP verification page
```

**Input (step 2):**
```
POST /login/verify_otp
Body: { otp: '<received_otp>' }
```

**Expected output (step 2):**
```
HTTP 302 → new password form
```

**Failure scenario (wrong OTP):**
```
Error message displayed, no session change
```

---

## MODULE: Kasir Session

---

### CT-KSR-001 — Open Kasir Session

**Scenario ID:** CT-KSR-001  
**Module:** POS / Kasir  

**Preconditions:**
- Session: `logged_in=true`, `company_id=1`, `inv_userid=5`
- `db_kasir`: row `id=2, no_kasir='KSR-01', company_id=1`
- NO existing `db_buka_kasir` row for user_id=5, company_id=1, today

**Input:**
```
POST /pos/pilih_kasir
Body: { kasir_id: 2, saldo_awal: 500000 }
```

**Expected DB mutations:**
```sql
INSERT INTO db_buka_kasir:
  user_id     = 5
  company_id  = 1
  no_kasir    = 'KSR-01'
  tgl_buka    = NOW()
  saldo_awal  = 500000
  status      = 1
```

**Expected output:**
```
HTTP 302 → /pos  (POS screen now accessible)
Session:
  id_kasir    = <new db_buka_kasir.id>
  noref_kasir = <noref>
```

**Expected side effects:** None

**Failure scenario (kasir already open for today):**
```
Existing db_buka_kasir row reused — no duplicate INSERT
```

---

### CT-KSR-002 — Close Kasir Session

**Scenario ID:** CT-KSR-002  
**Module:** POS / Kasir  

**Preconditions:**
- `db_buka_kasir`: row `id=10, user_id=5, company_id=1, status=1, saldo_awal=500000, tgl_buka=TODAY`
- `db_sales`: 3 Cash sales today for company_id=1, id_kasir=10, grand_total=200000, 300000, 150000
- `db_sales`: 1 Kredit sale today, grand_total=100000

**Input:**
```
POST /kasir/ajax_tutup_kasir
Body: { id: 10 }
```

**Expected DB mutations:**
```sql
UPDATE db_buka_kasir SET
  tgl_tutup    = NOW(),
  saldo_akhir  = 500000 + 650000,   -- saldo_awal + cash sales sum
  saldo_kredit = 100000,             -- credit sales sum
  status       = 0
WHERE id = 10
```

**Expected output:** `{ success: true }`

**Failure scenario:** If no sales exist, `saldo_akhir = saldo_awal`, `saldo_kredit = 0`

---

## MODULE: POS Sales

---

### CT-POS-001 — POS Cash Sale, Single Item, No Tax

**Scenario ID:** CT-POS-001  
**Module:** POS  

**Preconditions:**
- Session: `logged_in=true`, `company_id=1`, `inv_userid=5`, `id_kasir=10`
- `db_buka_kasir`: id=10, status=1
- `db_items`: id=7, `item_name='Mie Instan'`, `unit_price=3500`, `purchase_price=2800`, `tax_id=NULL`, `stock=100`
- `db_cart`: 1 row — `invoice='UUID-ABC'`, `item_id=7`, `qty=2`, `unit_price=3500`, `customer_id=1`, `company_id=1`, `user_id=5`

**Input:**
```
POST /pos/pos_save
Body: {
  invoice:       'UUID-ABC',
  customer_id:   1,
  nik_kar:       '',
  payment_type:  'Cash',
  paid_amount:   10000,
  grand_total:   7000
}
```

**Expected DB mutations:**
```sql
-- 1. Sales header
INSERT INTO db_sales:
  sales_code    = 'INV{ymd}00001'  (if first sale this month)
  sales_date    = TODAY
  customer_id   = 1
  company_id    = 1
  grand_total   = 7000
  paid_amount   = 10000
  payment_type  = 'Cash'
  sales_status  = 'Final'
  nik_kar       = ''
  id_kasir      = 10
  created_by    = 5

-- 2. Line items (1 row)
INSERT INTO db_salesitems:
  sales_id       = <new db_sales.id>
  item_id        = 7
  qty            = 2
  unit_price     = 3500
  purchase_price = 2800
  tax_amt        = 0
  total          = 7000

-- 3. Stock decrement
UPDATE db_items SET stock = 98 WHERE id = 7

-- 4. Stock audit
INSERT INTO db_stockentry:
  item_id      = 7
  qty          = -2
  type         = 'sales'
  reference_id = <new db_sales.id>
  company_id   = 1

-- 5. Payment record
INSERT INTO db_salespayments:
  sales_id     = <new db_sales.id>
  payment_type = 'Cash'
  payment      = 10000
  change_return = 3000

-- 6. Cart cleared
DELETE FROM db_cart WHERE invoice = 'UUID-ABC'
```

**Expected output:**
```json
{ "success": true, "sales_id": <N>, "sales_code": "INV{ymd}00001" }
```

**Expected side effects:**
- No SMS (customer_id=1 is walk-in)
- `record_customer_payment(1)` — walk-in, may be skipped

**Failure scenario (kasir not open):**
```
{ "success": false, "message": "Kasir belum dibuka" }
No DB writes
```

---

### CT-POS-002 — POS Kredit Sale, Member, Exclusive Tax

**Scenario ID:** CT-POS-002  
**Module:** POS / Member Credit  

**Preconditions:**
- `m_anggota`: `nik_kar='12345'`, `limit_toko=500000`, `gaji_minus=0`, `status_anggota='AKTIVE'`
- `db_sales`: 0 Kredit+Final sales for nik_kar='12345' this month (tagihan=0)
- `db_items`: id=10, `unit_price=50000`, `purchase_price=40000`, `tax_id=2` (tax_percent=11, tax_type='exclusive')
- Cart: 1 item × qty=1, unit_price=50000

**Input:**
```
POST /pos/pos_save
Body: {
  invoice: 'UUID-DEF',
  customer_id: 99,
  nik_kar: '12345',
  payment_type: 'Kredit',
  paid_amount: 0,
  grand_total: 55500   (50000 + 11% = 5500 tax)
}
```

**Expected DB mutations:**
```sql
INSERT INTO db_sales:
  payment_type = 'Kredit'
  nik_kar      = '12345'
  grand_total  = 55500

INSERT INTO db_salesitems:
  tax_type = 'exclusive'
  tax_amt  = 5500
  total    = 55500

UPDATE db_items SET stock = stock - 1 WHERE id = 10
INSERT INTO db_stockentry (type='sales')
INSERT INTO db_salespayments (payment_type='Kredit', payment=0)
DELETE FROM db_cart WHERE invoice='UUID-DEF'
```

**Expected output:** `{ "success": true, "sales_id": <N> }`

**Expected side effects:**
- Credit usage for nik_kar='12345' now = 55500
- Subsequent `tagihan_anggota('12345')` returns 55500

**Failure scenario (over credit limit):**
```
Before save: tagihan=480000, limit=500000, sisa=20000
Cart total=55500 > 20000 → blocked
{ "success": false, "message": "Limit kredit tidak cukup" }
```

---

### CT-POS-003 — Invoice Code Sequence (Counter Increment)

**Scenario ID:** CT-POS-003  
**Module:** POS  

**Preconditions:**
- `db_sales`: existing rows for company_id=1, month=June 2025, last `RIGHT(sales_code,5) = '00003'`

**Input:** POS save triggers invoice code generation

**Expected behavior:**
```
SELECT MAX(RIGHT(sales_code,5)) FROM db_sales
WHERE company_id=1 AND MONTH(sales_date)=6 AND YEAR(sales_date)=2025
→ returns '00003'
new_code = 3 + 1 = 4
sales_code = 'INV2506' + date_part + '00004'
```

**Expected output:** `sales_code = 'INV250615 00004'` (exact format to be confirmed)

**Failure scenario (MAX returns NULL — first sale of month):**
```
new_code = 0 + 1 = 1
sales_code = 'INV{ymd}00001'
```

---

### CT-POS-004 — Hold Invoice and Retrieve

**Scenario ID:** CT-POS-004  
**Module:** POS  

**Preconditions:**
- Cart: `invoice='UUID-GHI'`, 2 items for user_id=5, company_id=1

**Input (Hold):**
```
POST /pos/hold_invoice
Body: { invoice: 'UUID-GHI', customer_id: 1, ... }
```

**Expected DB mutations (Hold):**
```sql
INSERT INTO db_hold: { invoice, customer_id, total, ... }
INSERT INTO db_holditems: { ... } (2 rows)
DELETE FROM db_cart WHERE invoice='UUID-GHI'
```

**Input (Retrieve):**
```
POST /pos/get_hold_invoice
Body: { hold_id: <id> }
```

**Expected DB mutations (Retrieve):**
```sql
INSERT INTO db_cart: rows from db_holditems
DELETE FROM db_hold WHERE id = <id>
DELETE FROM db_holditems WHERE hold_id = <id>
```

**Expected output (Retrieve):** New `invoice` UUID for the session cart

---

## MODULE: Member Credit Limit

---

### CT-MBR-001 — Credit Limit: gaji_minus Overrides limit_toko

**Scenario ID:** CT-MBR-001  
**Module:** Member / Credit Limit  

**Preconditions:**
- `m_anggota`: `nik_kar='99001'`, `limit_toko=1000000`, `gaji_minus=300000`
- `db_sales`: 1 Kredit+Final sale this month, `nik_kar='99001'`, `grand_total=100000`

**Input:**
```
POST /pos/detailanggota/{encrypted_id_of_member_99001}
```

**Expected computation:**
```
effective_limit = gaji_minus (300000)  ← NOT limit_toko
tagihan         = 100000
sisa_limit      = 300000 - 100000 = 200000
```

**Expected output:**
```json
{
  "status": "AKTIVE",
  "nik_kar": "99001",
  "nama_kar": "...",
  "limit": 300000,
  "tagihan": 100000,
  "sisa": 200000
}
```

---

### CT-MBR-002 — Credit Limit: Monthly Reset at Month Boundary

**Scenario ID:** CT-MBR-002  
**Module:** Member / Credit Limit  

**Preconditions:**
- `m_anggota`: `nik_kar='99002'`, `limit_toko=500000`, `gaji_minus=0`
- `db_sales`: 1 Kredit+Final sale with `sales_date = LAST MONTH`, `grand_total=400000`
- No Kredit+Final sales THIS month for this member

**Input:**
```
POST /pos/detailanggota/{member_id}
```

**Expected computation:**
```
tagihan_anggota('99002'):
  SUM(grand_total) WHERE nik_kar='99002'
    AND payment_type='Kredit'
    AND sales_status='Final'
    AND sales_date BETWEEN first_of_THIS_month AND last_of_THIS_month
→ returns 0  (last month's sale NOT included)

sisa_limit = 500000 - 0 = 500000
```

**Expected output:**
```json
{ "limit": 500000, "tagihan": 0, "sisa": 500000 }
```

---

## MODULE: Inventory & Stock

---

### CT-INV-001 — Purchase Increases Stock, Writes stockentry

**Scenario ID:** CT-INV-001  
**Module:** Purchase / Inventory  

**Preconditions:**
- `db_items`: id=15, `stock=20`, `company_id=1`
- `db_suppliers`: id=3, `supplier_name='Supplier A'`

**Input:**
```
POST /purchase/purchase_save_and_update
Body: {
  supplier_id:    3,
  company_id:     1,
  payment_type:   'Cash',
  items: [{ item_id: 15, qty: 10, unit_price: 5000, purchase_price: 4500 }],
  grand_total:    50000,
  paid_amount:    50000
}
```

**Expected DB mutations:**
```sql
INSERT INTO db_purchase: { supplier_id=3, grand_total=50000, purchase_type='Regular' }
INSERT INTO db_purchaseitems: { item_id=15, qty=10 }

UPDATE db_items SET stock = 30 WHERE id = 15  -- 20 + 10

INSERT INTO db_stockentry:
  item_id      = 15
  qty          = +10
  type         = 'purchase'
  reference_id = <new db_purchase.id>
  company_id   = 1

INSERT INTO db_purchasepayments: { payment=50000 }
```

**Expected side effects:**
```
record_supplier_payment(3) → rebuilds db_supplier_payments
```

**Failure scenario:** If DB write fails mid-transaction, stock should NOT be modified (atomicity required)

---

### CT-INV-002 — Stock Opname: Create → Physical Count → Approve

**Scenario ID:** CT-INV-002  
**Module:** Inventory / Stock Opname  

**Preconditions:**
- `db_items`: id=20, `stock=50`; id=21, `stock=30`
- Session: company_id=1

**Step 1 — Create SO:**
```
POST /inventory/new_so
```
```sql
INSERT INTO db_inventory_so:
  doc_status = 'Draft'
  company_id = 1

INSERT INTO db_inventory_so_dtl:
  { item_id=20, qty_system=50, qty_actual=NULL }
  { item_id=21, qty_system=30, qty_actual=NULL }
```

**Step 2 — Enter Physical Count:**
```
POST /inventory/update_so_detail
Body: { so_id: <id>, items: [{item_id:20, qty_actual:48}, {item_id:21, qty_actual:31}] }
```
```sql
UPDATE db_inventory_so_dtl:
  item_id=20: qty_actual=48, qty_adjust=-2
  item_id=21: qty_actual=31, qty_adjust=+1
```

**Step 3 — Approve SO:**
```
POST /inventory/approve_so
Body: { so_id: <id> }
```

**Expected DB mutations (Approve):**
```sql
UPDATE db_items SET stock = 48 WHERE id = 20  -- replaces, not adds
UPDATE db_items SET stock = 31 WHERE id = 21

INSERT INTO db_stockentry: { item_id=20, qty=-2, type='adjustment' }
INSERT INTO db_stockentry: { item_id=21, qty=+1, type='adjustment' }

UPDATE db_inventory_so SET doc_status = 'Approved' WHERE id = <id>
```

**Failure scenario (already Approved):**
```
Blocked — doc_status='Approved' prevents re-approval
```

---

### CT-INV-003 — Sales Return Restores Stock

**Scenario ID:** CT-INV-003  
**Module:** Sales / Inventory  

**Preconditions:**
- `db_sales`: id=500, `sales_status='Final'`
- `db_salesitems`: `sales_id=500`, `item_id=8`, `qty=3`, `unit_price=10000`
- `db_items`: id=8, `stock=17`

**Input:**
```
POST /sales_return/save_return
Body: { sales_id: 500, items: [{item_id: 8, qty: 2}], ... }
```

**Expected DB mutations:**
```sql
INSERT INTO db_salesreturn: { sales_id=500, grand_total=20000, ... }
INSERT INTO db_salesitemsreturn: { return_id=<id>, item_id=8, qty=2 }

UPDATE db_items SET stock = 19 WHERE id = 8  -- 17 + 2

INSERT INTO db_stockentry:
  item_id = 8, qty = +2, type = 'return'
```

---

## MODULE: PPOB

---

### CT-PPOB-001 — Pulsa Top-Up Success

**Scenario ID:** CT-PPOB-001  
**Module:** PPOB  

**Preconditions:**
- `m_anggota`: `nik_kar='11111'`, `limit_ppob=200000`
- `orders` table: 0 PPOB orders this month for nik_kar='11111' (ppob_tagihan=0)
- `db_items`: id=50, `ppob=1`, `ppob_type='pulsa'`, `item_name='Pulsa Telkomsel 25rb'`, `unit_price=26000`, `stock=999`
- IAK API (sandbox): returns `rc='00'` for topUp

**Input:**
```
POST /ppob/pos_ppob/pos_save
Body: {
  nik_kar:    '11111',
  item_id:    50,
  target:     '081234567890',
  payment_type: 'Kredit'
}
```

**Expected external call:**
```
IAK API: topUp(productCode, '081234567890', refId)
Response: { data: { rc: '00', sn: 'SN12345' } }
```

**Expected DB mutations:**
```sql
INSERT INTO db_sales:
  payment_type = 'Kredit'
  ppob         = 1
  nik_kar      = '11111'
  grand_total  = 26000
  sales_code   = 'PPOB{ymd}00001'

UPDATE db_items SET stock = 998 WHERE id = 50
```

**Expected output:**
```json
{ "success": true, "sn": "SN12345" }
```

**Failure scenario (IAK rc ≠ '00'):**
```
NO db_sales INSERT
{ "success": false, "message": "<IAK error message>" }
```

---

### CT-PPOB-002 — PPOB Blocked by Credit Limit

**Scenario ID:** CT-PPOB-002  
**Module:** PPOB / Member  

**Preconditions:**
- `m_anggota`: `nik_kar='22222'`, `limit_ppob=50000`
- Current month PPOB usage = 45000 (from `orders` table)
- Requested top-up item: `unit_price=26000`

**Input:**
```
POST /ppob/pos_ppob/pos_save
Body: { nik_kar: '22222', item_id: 50, ... }
```

**Expected computation:**
```
sisa_ppob = 50000 - 45000 = 5000
requested = 26000
26000 > 5000 → BLOCKED
```

**Expected output:**
```json
{ "success": false, "message": "Limit PPOB tidak cukup" }
```

**Expected DB mutations:** None

---

## MODULE: Loan / Installment

---

### CT-LOAN-001 — Loan Approval Generates Installment Schedule

**Scenario ID:** CT-LOAN-001  
**Module:** Loan / Koperasi  

**Preconditions:**
- `trans_pinjaman`:
  ```
  doc_no           = 'PIN/2025/VI/001'
  nik              = '33333'
  plan_pinjaman    = 6000000
  plan_jangka_waktu = 12  (months)
  awal_pinjaman    = 2025-07-01
  doc_status       = 'APPROVED'
  ```
- `v_trans_pinjaman_flat`: VIEW provides `angsuran=550000`, `biaya_suku_bunga=50000`
- `trans_pinjaman_dtl`: EMPTY for this doc_no

**Input:** `update_biaya_flat('PIN/2025/VI/001')` called

**Expected DB mutations:**
```sql
-- update_biaya_flat phase
UPDATE trans_pinjaman SET
  pokok_angsuran = 500000,  -- from VIEW
  biaya_admin    = ...,
  plan_angsuran  = 550000
WHERE doc_no = 'PIN/2025/VI/001'

-- get_bungan_bulanan phase
DELETE FROM trans_pinjaman_dtl WHERE doc_no = 'PIN/2025/VI/001'

INSERT INTO trans_pinjaman_dtl (12 rows):
  Row 1: ke_cicilan=1, tgl_cicilan=2025-07-01, angsuran_cicilan=550000, status_cicilan='Belum Bayar'
  Row 2: ke_cicilan=2, tgl_cicilan=2025-08-01, ...
  ...
  Row 12: ke_cicilan=12, tgl_cicilan=2026-06-01, ...

-- get_update_cicilan phase (called TODAY = 2025-06-15, so no past installments)
-- No rows updated (all tgl_cicilan >= 2025-07-01 > TODAY)

UPDATE trans_pinjaman SET akhir_pinjaman = 2026-06-01
```

**Expected state after:**
- 12 rows in `trans_pinjaman_dtl` all with `status_cicilan='Belum Bayar'`
- `trans_pinjaman.status_bayar = 'BELUM LUNAS'`

---

### CT-LOAN-002 — Payroll Auto-Mark Past Installments

**Scenario ID:** CT-LOAN-002  
**Module:** Loan / Payroll Deduction  

**Preconditions:**
- `trans_pinjaman_dtl` for `doc_no='PIN/2025/I/005'`:
  ```
  Row 1: ke_cicilan=1, tgl_cicilan=2025-01-01, status_cicilan='Belum Bayar'
  Row 2: ke_cicilan=2, tgl_cicilan=2025-02-01, status_cicilan='Belum Bayar'
  Row 3: ke_cicilan=3, tgl_cicilan=2025-03-01, status_cicilan='Belum Bayar'
  Row 4: ke_cicilan=4, tgl_cicilan=2025-04-01, status_cicilan='Belum Bayar'
  Row 5: ke_cicilan=5, tgl_cicilan=2025-05-01, status_cicilan='Belum Bayar'
  Row 6: ke_cicilan=6, tgl_cicilan=2025-06-01, status_cicilan='Belum Bayar'
  Row 7: ke_cicilan=7, tgl_cicilan=2025-07-01, status_cicilan='Belum Bayar'
  Row 8–12: future months ...
  ```
- TODAY = 2025-06-15

**Input:** `get_update_cicilan('PIN/2025/I/005')`

**Expected DB mutations:**
```sql
-- Rows 1–5 are PAST (tgl_cicilan < 2025-06-15)
UPDATE trans_pinjaman_dtl SET
  status_cicilan = 'Bayar',
  type_cicilan   = 'PAYROLL'
WHERE doc_no = 'PIN/2025/I/005'
  AND tgl_cicilan < '2025-06-15'
  AND status_cicilan = 'Belum Bayar'
-- Affects: rows 1, 2, 3, 4, 5

-- Rows 6–12 remain 'Belum Bayar'
-- Last row (12) is still 'Belum Bayar' → status_bayar = 'BELUM LUNAS'
UPDATE trans_pinjaman SET status_bayar = 'BELUM LUNAS'
  WHERE doc_no = 'PIN/2025/I/005'
```

---

### CT-LOAN-003 — December→January Month Rollover

**Scenario ID:** CT-LOAN-003  
**Module:** Loan / Installment Date Calculation  

**Preconditions:**
- Loan `awal_pinjaman = 2025-12-01`, `plan_jangka_waktu = 3`

**Expected installment dates generated:**
```
ke_cicilan=1: tgl_cicilan = 2025-12-01
ke_cicilan=2: tgl_cicilan = 2026-01-01   ← month=13 wraps → year+1, month=1
ke_cicilan=3: tgl_cicilan = 2026-02-01
```

**Failure scenario (bug):** If month rollover is wrong:
```
ke_cicilan=2: tgl_cicilan = 2025-13-01  ← INVALID DATE
```

---

## MODULE: Financial Reporting

---

### CT-RPT-001 — Laporan Toko P&L Calculation

**Scenario ID:** CT-RPT-001  
**Module:** Reports / Laporan Toko  

**Preconditions (June 2025, company_id=1):**
- `db_items`: total `SUM(purchase_price × stock)` at June start = 5,000,000
- `db_purchase` June: Depo=1,000,000; Cash=500,000; Kredit=2,000,000
- `db_sales` June, Final: `SUM(grand_total)` = 4,500,000
- `db_salesitems` for above sales: `SUM(purchase_price × qty)` = 3,000,000 (HPP/COGS)
- `db_expense` June: `SUM(amount)` = 200,000

**Input:**
```
GET /reports/lap_toko?bulan=6&tahun=2025&company_id=1
```

**Expected computation:**
```
Total Persediaan = 5,000,000 + 1,000,000 + 500,000 + 2,000,000 = 8,500,000
Penjualan        = 4,500,000
HPP (COGS)       = 3,000,000
Laba Kotor       = 4,500,000 - 3,000,000 = 1,500,000
Biaya Operasional = 200,000
Laba Bersih      = 1,500,000 - 200,000 = 1,300,000
```

**Expected output:** Report view with all above figures

**Failure scenario (no sales in period):**
```
Penjualan = 0, HPP = 0, Laba Bersih = -200,000 (biaya only)
```

---

### CT-RPT-002 — Dashboard KPIs — Branch Scoped

**Scenario ID:** CT-RPT-002  
**Module:** Dashboard  

**Preconditions:**
- Session: `role_id=4` (branch staff), `company_id=2`
- `db_sales` today: 3 Final sales for company_id=2, totaling 750,000
- `db_sales` today: 2 Final sales for company_id=1 (different branch), totaling 400,000
- `db_purchase` today, company_id=2: 1 purchase, 200,000
- `db_expense` today, company_id=2: 1 expense, 50,000

**Input:**
```
GET /dashboard
```

**Expected output (only company_id=2 data):**
```
Today's Sales:    750,000   ← NOT 1,150,000
Today's Purchase: 200,000
Today's Expense:   50,000
```

---

## MODULE: Multi-Company RBAC

---

### CT-RBAC-001 — Super-Admin Sees All Companies

**Scenario ID:** CT-RBAC-001  
**Module:** Admin / RBAC  

**Preconditions:**
- Session: `role_id=1`, `company_id=1`
- `db_company`: 3 active companies (id=1, 2, 3)

**Input:**
```
GET /reports/lap_toko
```

**Expected output:**
- Company dropdown shows all 3 companies
- Data can be filtered per any company

---

### CT-RBAC-002 — Branch User Cannot See Other Companies

**Scenario ID:** CT-RBAC-002  
**Module:** Admin / RBAC  

**Preconditions:**
- Session: `role_id=4`, `company_id=2`
- `db_company`: 3 active companies

**Input:**
```
GET /reports/lap_toko
```

**Expected output:**
- Company dropdown shows ONLY company_id=2 (own branch)
- Cannot pass `company_id=1` to get other branch's data

---

## Test Coverage Summary

| Module | Scenarios | Coverage Focus |
|--------|-----------|---------------|
| Authentication | CT-AUTH-001–003 | Login, RBAC, OTP |
| Kasir Session | CT-KSR-001–002 | Open/close register |
| POS Sales | CT-POS-001–004 | Cash, Kredit, invoice codes, hold |
| Member Credit | CT-MBR-001–002 | gaji_minus override, monthly reset |
| Inventory | CT-INV-001–003 | Purchase stock-in, SO approval, sales return |
| PPOB | CT-PPOB-001–002 | Success path, credit limit block |
| Loan | CT-LOAN-001–003 | Installment generation, payroll auto-mark, month rollover |
| Reports | CT-RPT-001–002 | P&L formula, branch scoping |
| RBAC | CT-RBAC-001–002 | All-company vs branch-scoped |
| **TOTAL** | **22 scenarios** | |

---

## Notes on Parity Testing

For each scenario, the Next.js implementation must produce **identical DB mutations** and **identical response shapes** to the legacy system.

Acceptable differences:
- HTTP status codes (legacy uses 302 redirects; Next.js API routes use 200/201/400/401)
- Session storage mechanism (PHP sessions → JWT/server sessions)
- Response field names may be camelCase instead of snake_case

Non-negotiable:
- All DB mutations must be identical (same rows, same values, same audit trail)
- All business rule outcomes must be identical (credit limit, stock deltas, installment dates)
- All IAK API calls must use same parameters with same response handling
