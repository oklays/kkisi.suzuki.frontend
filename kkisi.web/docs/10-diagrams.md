# Phase 10 — System Diagrams

## 10.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    KKISI TOKO WEB SYSTEM                        │
│                  CodeIgniter 3.1.11 / PHP                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Browser / POS Terminal          Mobile App (External)         │
│         │                                │                      │
│         ▼                                ▼                      │
│   ┌──────────────┐              ┌──────────────┐               │
│   │  Web Routes  │              │   Api_c      │               │
│   │  (CI Router) │              │ (Unauthenticated)│           │
│   └──────┬───────┘              └──────┬───────┘               │
│          │                             │                        │
│          ▼                             │                        │
│   ┌──────────────────────────────────────────────────┐         │
│   │              MY_Controller (Base)                 │         │
│   │  - Session auth check                             │         │
│   │  - permission_check($perm)                        │         │
│   │  - load_global() → company context               │         │
│   └──────────────────────────────────────────────────┘         │
│          │                                                       │
│          ▼                                                       │
│   ┌────────────────────────────────────────────┐               │
│   │              Controllers                    │               │
│   │  Pos  Sales  Purchase  Member  Kasir        │               │
│   │  Reports  Items  Inventory  ppob/Pos_ppob   │               │
│   └────────────────────────────────────────────┘               │
│          │                                                       │
│          ▼                                                       │
│   ┌────────────────────────────────────────────┐               │
│   │                 Models                      │               │
│   │  CI Active Record / Raw Query              │               │
│   └──────────────────┬─────────────────────────┘               │
│                       │                                          │
│                       ▼                                          │
│              ┌────────────────┐                                 │
│              │  MySQL Database│                                 │
│              │  (db_* / m_*)  │                                 │
│              └────────────────┘                                 │
│                                                                  │
│   External Services:                                            │
│   ┌─────────┐  ┌─────────┐  ┌──────────┐                      │
│   │ IAK API │  │  SMTP   │  │ SMS Gate │                      │
│   │ (PPOB)  │  │ (Email) │  │  (SMS)   │                      │
│   └─────────┘  └─────────┘  └──────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10.2 Entity Relationship Diagram (Core Tables)

```
db_company
    │ id
    ├──────────────────────────────────────────────────┐
    │                                                  │
    ▼                                                  ▼
db_users ──── role_id ──── db_roles ─── db_permissions
    │
    ▼
db_buka_kasir (kasir sessions per user/company/day)
    │
    ▼  id_kasir
db_sales ─────────────── customer_id ──── db_customers
    │ id
    ├── db_salesitems ─── item_id ──── db_items
    │       └── tax_id ──── db_tax
    ├── db_salespayments
    └── db_salesreturn
            ├── db_salesitemsreturn
            └── db_salespaymentsreturn

db_customers ◄── db_customer_payments (cache, rebuilt from db_salespayments)

db_suppliers ─── db_purchase ─────────── db_purchaseitems
                     │ id                      └── db_items
                     ├── db_purchasepayments
                     └── db_purchasereturn
                             ├── db_purchaseitemsreturn
                             └── db_purchasepaymentsreturn

db_suppliers ◄── db_supplier_payments (cache, rebuilt from db_purchasepayments)

db_items ─── category_id ──── db_category
         ─── brand_id    ──── db_brands
         ─── unit_id     ──── db_units
         ─── tax_id      ──── db_tax
         ─── company_id  ──── db_company

db_items ──── db_items_stock (per branch/warehouse)
         ──── db_stockentry (audit log of all movements)

db_inventory_so ─── db_inventory_so_dtl ─── item_id ──── db_items

m_anggota (employee members — separate namespace)
    │ nik_kar
    ├── referenced by db_sales.nik_kar (credit sales)
    └── referenced by orders.nik_kar (PPOB)

trans_pinjaman (loans)
    │ doc_no, nik
    └── trans_pinjaman_dtl (installment schedule)
    └── uses v_trans_pinjaman_flat (VIEW for calculations)

db_cart (POS session cart — per invoice UUID)
db_hold / db_holditems (held invoices)
db_kasir (master kasir register list)
db_expense ─── expense_category_id ──── db_expense_category
db_sitesettings (singleton, id=1)
db_company ──── db_warehouse
db_paymenttypes
db_currency
db_smsapi
db_smstemplates
db_menu
db_languages
```

---

## 10.3 POS Transaction Request Flow

```
Browser (POS page)
    │
    │ POST /pos/pos_save
    │ {invoice, customer_id, nik_kar, payment_type, ...}
    │
    ▼
Pos::pos_save()
    │
    ├── 1. Session: get user_id, company_id, id_kasir
    │
    ├── 2. SELECT db_cart WHERE invoice=? AND user_id=? AND company_id=?
    │
    ├── 3. Generate sales_code (MAX + 1)
    │
    ├── 4. INSERT db_sales {header}
    │
    ├── 5. FOR each cart item:
    │       ├── INSERT db_salesitems
    │       ├── UPDATE db_items SET stock -= qty
    │       └── INSERT db_stockentry {type='sales'}
    │
    ├── 6. INSERT db_salespayments
    │
    ├── 7. DELETE db_cart WHERE invoice=?
    │
    ├── 8. [If SMS enabled] → send_sms_using_template → SMS Gateway HTTP
    │
    └── 9. JSON response {success: true, sales_id: N}
         │
         ▼
    Browser: redirect to print_invoice_pos
```

---

## 10.4 Member Credit Check Flow

```
POS: User scans member QR/types NIK
    │
    │ POST /pos/detailanggota/{encrypted_id}
    │
    ▼
Pos::detailanggota($ids)
    │
    ├── decrypt_url($ids) → raw m_anggota.id
    │
    ├── SELECT m_anggota WHERE id=?
    │
    ├── tagihan_anggota(nik_kar):
    │   SELECT SUM(grand_total) FROM db_sales
    │   WHERE nik_kar=? AND payment_type='Kredit'
    │     AND sales_status='Final'
    │     AND sales_date within CURRENT MONTH
    │
    ├── effective_limit = gaji_minus > 0 ? gaji_minus : limit_toko
    │
    ├── sisa_limit = effective_limit - tagihan
    │
    └── JSON {status, id, nik_kar, nama_kar, limit, tagihan, sisa}
```

---

## 10.5 PPOB Transaction Flow

```
Kasir enters phone/meter number
    │
    │ POST /ppob/pos_ppob/get_item
    │ {ppob_type, phoneNumber, filter}
    │
    ▼
[If pulsa/data]
    │ → IAK API: check_operator(phone)
    │   Response: {rc:'00', operator:'Telkomsel'}
    │
    │ → SELECT db_items WHERE ppob=1 AND ppob_type=? AND operator=?
    │
[If pln]
    │ → IAK API: inquiryPLN(meter_no)
    │   Response: {status:'1', ...}
    │
    │ → SELECT db_items WHERE ppob=1 AND ppob_type='pln'
    │
    ▼ JSON product list
    │
    │ Kasir selects product, clicks Save
    │ POST /ppob/pos_ppob/pos_save
    │
    ▼
Pos_ppob::pos_save()
    │
    ├── Validate member PPOB credit limit
    ├── IAK API: topUp(...)
    │   Response: {rc:'00', sn: 'serial_number'}
    ├── INSERT db_sales (payment_type='Kredit', ppob=1)
    ├── UPDATE db_items SET stock -= 1
    └── JSON {success, sn}
```

---

## 10.6 Loan Installment Lifecycle

```
Loan Application
    │
    ▼
trans_pinjaman {doc_status='PENDING', status_pencairan='PENDING'}
    │
    │ Admin approves
    ▼
doc_status = 'APPROVED', status_pencairan = 'APPROVED'
    │
    │ update_biaya_flat(doc_no) triggered
    ▼
v_trans_pinjaman_flat (VIEW) ──────────────────┐
    │                                           │
    │ Flat rate calculation                     │
    ▼                                           │
trans_pinjaman {                                │
  pokok_angsuran = angsuran,                    │
  biaya_admin, biaya_asuransi,                 │
  plan_angsuran = angsuran_plus_jasa           │
}                                              │
    │                                           │
    │ get_bungan_bulanan(doc_no)                │
    ▼                                           │
DELETE trans_pinjaman_dtl WHERE doc_no=?        │
    │                                           │
    │ Loop months 0..jangka_waktu               │
    ▼                                           │
trans_pinjaman_dtl [n rows] {                  │
  ke_cicilan = 1..n,                           │
  tgl_cicilan = monthly dates,                 │
  status_cicilan = 'Belum Bayar'               │
}                                              │
    │                                           │
    │ get_update_cicilan(doc_no)               │
    ▼                                           │
UPDATE trans_pinjaman_dtl                      │
  SET status_cicilan='Bayar',                  │
      type_cicilan='PAYROLL'                   │
  WHERE tgl_cicilan < TODAY (past months)      │
    │                                           │
    ▼                                           │
Check last row: if 'Bayar' → LUNAS             │
               else → BELUM LUNAS              │
    │                                           │
    ▼                                           │
UPDATE trans_pinjaman SET akhir_pinjaman=last_tgl_cicilan
```

---

## 10.7 Request Authentication Flow

```
HTTP Request → CI Router → Controller::method()
                                │
                                ▼
                        extends MY_Controller?
                          YES ─────────────┐
                           │               │
                           ▼               ▼
                    load_global()    Api_c (no auth)
                           │
                           ▼
                    session->userdata('logged_in')
                      TRUE ─────────────────────┐
                       │                         │
                       ▼                         ▼
               permission_check($perm)    redirect('/login')
                       │
               role_id in db_permissions?
                YES ──────────────────┐
                 │                    │
                 ▼                    ▼
           Execute action      redirect('dashboard')
                                 (403 effectively)
```

---

## 10.8 Stock Movement Audit Trail

```
All stock changes write to db_stockentry:
┌─────────────────────────────────────────┐
│           db_stockentry                  │
├──────────┬──────────────────────────────┤
│ type     │ reference_id                 │
├──────────┼──────────────────────────────┤
│ purchase │ db_purchase.id               │
│ sales    │ db_sales.id                  │
│ return   │ db_salesreturn.id /          │
│          │ db_purchasereturn.id         │
│ adjustment│ (penyesuaian stok)          │
│ opname   │ db_inventory_so.id           │
└──────────┴──────────────────────────────┘

Current stock always readable from:
  1. db_items.stock (denormalized total)
  2. db_items_stock.stock (per branch/warehouse)
  3. Computed: SUM(stockentry) by direction
```
