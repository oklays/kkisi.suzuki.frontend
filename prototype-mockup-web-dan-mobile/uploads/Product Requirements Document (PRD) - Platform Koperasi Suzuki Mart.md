# Product Requirements Document (PRD)
## Koperasi Suzuki Mart — Integrated Cooperative Management Platform

**Document Version:** 1.0  
**Status:** Draft for Requirement & Scope Alignment  
**Platform:** Web Application + Mobile Application  
**Target Environment:** Internal Corporate / Factory Ecosystem  
**Primary Users:** Staff Koperasi, Supervisor, Kasir, Admin, Finance, Warehouse Staff, Karyawan/Member

---

# 1. Executive Summary

Koperasi Suzuki Mart merupakan platform digital yang digunakan untuk mengelola seluruh aktivitas operasional koperasi di lingkungan perusahaan pabrik Suzuki.

Platform terdiri dari dua aplikasi utama:

1. **Web Application**
   - Digunakan oleh staff koperasi, kasir, warehouse, finance, supervisor, dan administrator.
   - Berfungsi sebagai pusat pengelolaan operasional dan administrasi koperasi.

2. **Mobile Application**
   - Digunakan oleh karyawan/member koperasi.
   - Digunakan untuk berbelanja produk, makanan/minuman, melakukan transaksi PPOB, melihat saldo/point, melihat histori transaksi, serta menggunakan mekanisme pembayaran tertentu.

Sistem akan mengintegrasikan:

- Product Management
- Warehouse Management
- Inventory
- Stock Opname
- POS
- Purchasing
- Supplier Management
- PPOB
- Member/Karyawan
- Point/Saldo
- Payroll Deduction
- Financial Reporting
- Profit/Loss Calculation
- Dashboard & Reporting
- Notification
- Audit Trail
- Integration dengan sistem eksternal perusahaan/vendor

Tujuan utama sistem adalah menciptakan satu sumber data terintegrasi untuk seluruh aktivitas koperasi sehingga proses yang sebelumnya dilakukan secara manual dapat menjadi lebih cepat, akurat, transparan, dan mudah diaudit.

---

# 2. Business Context

Koperasi beroperasi di dalam lingkungan perusahaan pabrik Suzuki.

Karyawan perusahaan dapat menggunakan layanan koperasi untuk:

- Membeli kebutuhan sehari-hari.
- Membeli makanan/minuman.
- Membeli produk koperasi lainnya.
- Melakukan transaksi PPOB.
- Menggunakan pembayaran langsung.
- Menggunakan point/saldo koperasi.
- Melakukan pembelian yang kemudian diperhitungkan sebagai potongan gaji.

Dari sisi operasional, staff koperasi melakukan:

- Input master data.
- Pengadaan barang.
- Penerimaan barang.
- Pengelolaan warehouse.
- Penjualan.
- Rekap transaksi.
- Rekonsiliasi.
- Stock opname.
- Perhitungan laba.
- Pelaporan.

Stock opname secara rutin dilakukan kurang lebih setiap **3 bulan sekali**, sementara proses rekap dan administrasi dilakukan terutama menjelang akhir bulan.

Supervisor membutuhkan dashboard untuk memantau kondisi koperasi tanpa harus melakukan pengecekan transaksi secara manual.

---

# 3. Problem Statement

## 3.1 Permasalahan Operasional

Tanpa sistem terintegrasi, koperasi berpotensi mengalami:

- Ketidaksesuaian stok fisik dan sistem.
- Kesalahan pencatatan transaksi.
- Kesulitan melakukan stock opname.
- Rekap transaksi yang memakan waktu.
- Kesulitan menghitung laba aktual.
- Kesulitan mengetahui performa masing-masing produk.
- Kesulitan melakukan monitoring transaksi karyawan.
- Kesalahan perhitungan point/potongan gaji.
- Kesulitan melakukan rekonsiliasi pembayaran.
- Kurangnya visibility bagi supervisor.

## 3.2 Permasalahan Data

Data koperasi idealnya terpusat dalam satu sistem.

Contoh hubungan data:

**Employee → Member → Wallet/Point → Transaction → Payment → Payroll Deduction → Financial Report**

dan:

**Supplier → Purchase Order → Goods Receipt → Warehouse → Inventory → POS → Sales → Profit/Loss**

Dengan pendekatan tersebut, setiap transaksi dapat ditelusuri dari sumber hingga laporan akhir.

---

# 4. Product Vision

> "Membangun ekosistem digital koperasi yang terintegrasi, transparan, mudah digunakan, dan mampu mengelola seluruh aktivitas koperasi mulai dari procurement, warehouse, POS, member transaction, PPOB, hingga financial reporting."

---

# 5. Product Goals

## Primary Goals

1. Digitalisasi seluruh proses operasional koperasi.
2. Menjadikan sistem sebagai single source of truth.
3. Menyediakan inventory secara real-time.
4. Mengurangi kesalahan input dan human error.
5. Mempermudah stock opname.
6. Menyediakan POS yang terintegrasi dengan inventory.
7. Menyediakan mobile shopping untuk karyawan.
8. Mengintegrasikan transaksi point/saldo dengan payroll deduction.
9. Menyediakan PPOB.
10. Menyediakan financial reporting.
11. Menyediakan dashboard supervisor.
12. Menyediakan audit trail untuk seluruh aktivitas penting.

---

# 6. Non-Goals

Pada tahap awal, sistem tidak harus menjadi pengganti seluruh sistem ERP perusahaan.

Contoh yang dapat berada di luar scope MVP:

- Full HR Management.
- Full Payroll Management.
- Recruitment.
- Attendance.
- Manufacturing management.
- Accounting ERP secara penuh.

Sistem cukup menyediakan integration layer untuk mengambil atau mengirim data yang dibutuhkan.

---

# 7. User Roles

## 7.1 Super Admin

Memiliki akses konfigurasi sistem secara penuh.

Permissions:

- User management.
- Role management.
- Permission management.
- System configuration.
- Master data.
- Integration configuration.
- Audit log.

---

## 7.2 Admin Koperasi

Bertanggung jawab atas operasional administratif.

Permissions:

- Product.
- Category.
- Supplier.
- Member.
- Purchase.
- Sales.
- Inventory.
- Report.
- Configuration tertentu.

---

## 7.3 Warehouse Staff

Bertanggung jawab terhadap persediaan.

Permissions:

- Goods receiving.
- Stock transfer.
- Stock adjustment.
- Stock opname.
- Inventory monitoring.
- Warehouse management.

---

## 7.4 Cashier

Bertanggung jawab atas transaksi POS.

Permissions:

- POS.
- Payment.
- Refund/void sesuai authorization.
- Shift management.
- Cash reconciliation.

---

## 7.5 Finance

Bertanggung jawab terhadap transaksi dan laporan keuangan.

Permissions:

- Revenue.
- Expense.
- COGS.
- Profit/Loss.
- Settlement.
- Reconciliation.
- Payroll deduction.
- Financial report.

---

## 7.6 Supervisor

Bersifat monitoring dan approval.

Permissions:

- Dashboard.
- Sales report.
- Inventory report.
- Profit report.
- Stock opname.
- Transaction monitoring.
- Approval.
- Employee transaction monitoring.

---

## 7.7 Employee / Member

Menggunakan mobile application.

Capabilities:

- Browse products.
- Shopping.
- Food ordering.
- PPOB.
- View wallet/point.
- View transaction history.
- View spending.
- View deduction.
- Receive notifications.

---

# 8. Platform Architecture

Secara konseptual:

```text
                    ┌──────────────────────┐
                    │   Suzuki Employee    │
                    │       System         │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Integration / API    │
                    │       Layer          │
                    └──────────┬───────────┘
                               │
             ┌─────────────────┼─────────────────┐
             │                 │                 │
             ▼                 ▼                 ▼
      ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
      │ Mobile App  │   │ Web Back     │   │ External    │
      │ Employee    │   │ Office       │   │ Services    │
      └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
             │                 │                 │
             └─────────────────┼─────────────────┘
                               ▼
                    ┌──────────────────────┐
                    │   Core Application   │
                    │        Server        │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
    ┌───────────┐       ┌────────────┐       ┌────────────┐
    │ Inventory │       │ Transaction│       │ Financial  │
    │ Warehouse │       │ POS/PPOB   │       │ Reporting  │
    └───────────┘       └────────────┘       └────────────┘
```

---

# 9. Core Modules

Platform terdiri dari modul berikut:

1. Authentication & Authorization
2. Employee / Member Management
3. Product Management
4. Category Management
5. Supplier Management
6. Warehouse Management
7. Inventory Management
8. Purchasing
9. POS
10. Sales Management
11. Food Ordering
12. PPOB
13. Point / Wallet
14. Payroll Deduction
15. Stock Opname
16. Financial Management
17. Profit & Loss
18. Reporting
19. Dashboard
20. Notification
21. Approval Workflow
22. Audit Trail
23. Integration Management

---

# 10. WEB APPLICATION

## 10.1 Dashboard

Dashboard harus memberikan overview kondisi koperasi.

### KPI

Minimal:

- Total Sales Today.
- Total Sales This Month.
- Total Transaction.
- Total Active Member.
- Current Stock Value.
- Low Stock Product.
- Out of Stock Product.
- Total Purchase.
- Gross Profit.
- Net Profit.
- Outstanding Payroll Deduction.
- PPOB Transaction.
- Stock Opname Status.

### Dashboard Chart

- Sales trend.
- Sales by category.
- Top products.
- Profit trend.
- Payment method.
- Transaction trend.
- Inventory movement.

---

# 11. Master Data

## 11.1 Product

Product fields minimal:

- SKU.
- Barcode.
- Product Name.
- Category.
- Brand.
- Unit.
- Purchase Price.
- Selling Price.
- Minimum Stock.
- Maximum Stock.
- Tax.
- Active Status.
- Product Image.
- Supplier.
- Warehouse.
- Expiry Date configuration.
- Batch/Lot configuration.

### Product Type

System harus mendukung minimal:

1. Physical Product.
2. Food & Beverage.
3. PPOB Product/Service.
4. Non-stock Product.
5. Bundle/Package.

---

# 12. Warehouse Management

Warehouse dapat memiliki beberapa lokasi:

```text
Warehouse
├── Main Warehouse
├── Store
├── Food Counter
└── Other Location
```

Sistem harus mendukung:

- Multiple warehouse.
- Stock location.
- Stock movement.
- Stock transfer.
- Goods receiving.
- Stock adjustment.
- Damaged goods.
- Expired goods.
- Stock reservation.

---

# 13. Inventory Management

Setiap perubahan stok harus tercatat.

Contoh:

```text
Opening Stock
      +
Purchase
      +
Stock Transfer In
      -
Sales
      -
Stock Transfer Out
      -
Adjustment
      =
Current Stock
```

## Inventory Movement

Setiap movement memiliki:

- Transaction ID.
- Product.
- Warehouse.
- Quantity.
- Before Stock.
- Movement.
- After Stock.
- Reference.
- User.
- Timestamp.

---

# 14. Purchasing / Procurement

Workflow:

```text
Purchase Request
        ↓
Approval
        ↓
Purchase Order
        ↓
Supplier
        ↓
Goods Receiving
        ↓
Quality/Quantity Check
        ↓
Inventory
        ↓
Invoice / Payment
```

Fitur:

- Supplier.
- Purchase request.
- Purchase order.
- Purchase receiving.
- Partial receiving.
- Purchase return.
- Purchase invoice.
- Purchase history.

---

# 15. POS

POS merupakan salah satu core module.

## POS Flow

```text
Scan Product
      ↓
Cart
      ↓
Member Identification
      ↓
Payment Method
      ↓
Payment Validation
      ↓
Transaction
      ↓
Inventory Deduction
      ↓
Receipt
```

## Payment Method

Minimal:

- Cash.
- QR/payment gateway jika tersedia.
- Point/Wallet.
- Payroll deduction.
- Combination payment.

---

# 16. Employee / Member Management

Member koperasi berasal dari karyawan perusahaan.

Data minimal:

- Employee ID.
- Employee Number.
- Name.
- Department.
- Position.
- Company.
- Phone.
- Email.
- Membership Status.
- Point Balance.
- Spending Limit.
- Payroll Deduction Status.

Jika tersedia integration dengan sistem HR perusahaan, Employee ID harus menjadi unique identifier.

---

# 17. Point / Wallet System

Sistem harus membedakan:

### Point

Digunakan sebagai benefit/reward atau saldo transaksi internal.

### Wallet / Balance

Saldo yang dapat digunakan untuk pembelian.

Jika bisnis sebenarnya hanya membutuhkan satu mekanisme saldo, keduanya dapat digabung menjadi satu konsep **Member Balance**.

Namun secara desain sebaiknya tetap disiapkan abstraction:

```text
Member
   │
   ├── Cash
   ├── Wallet
   └── Point
```

---

# 18. Payroll Deduction

Salah satu fitur paling penting.

Employee dapat melakukan pembelian dengan mekanisme:

```text
Employee
   ↓
Purchase
   ↓
Payroll Deduction
   ↓
Accumulated Monthly Bill
   ↓
Payroll System
   ↓
Salary Deduction
```

Contoh:

```text
Employee: 12345

Purchase:
Rp25.000
Rp40.000
Rp75.000

Total:
Rp140.000

Payroll Deduction:
Rp140.000
```

## Monthly Closing

Menjelang akhir bulan:

1. Sistem mengambil seluruh transaksi eligible.
2. Mengelompokkan berdasarkan employee.
3. Menghitung total deduction.
4. Membuat payroll deduction statement.
5. Melakukan approval.
6. Export/API ke sistem payroll perusahaan.
7. Menunggu confirmation.
8. Melakukan reconciliation.

---

# 19. Mobile Application

Mobile application ditujukan untuk employee/member.

## Main Navigation

Contoh:

```text
Home
Shop
Orders
PPOB
Wallet
Profile
```

---

# 20. Mobile Home

Menampilkan:

- Greeting.
- Employee name.
- Wallet/Point balance.
- Current month spending.
- Pending orders.
- Promo.
- Featured products.
- Food menu.
- PPOB shortcut.

---

# 21. Product Shopping

Employee dapat:

- Browse.
- Search.
- Filter.
- Sort.
- View product.
- Add to cart.
- Checkout.
- Select payment.
- View order.

Product detail:

- Image.
- Name.
- Price.
- Stock.
- Description.
- Variant.
- Unit.

---

# 22. Food Ordering

Koperasi dapat memiliki kantin/food service.

Flow:

```text
Choose Food
    ↓
Customize
    ↓
Cart
    ↓
Payment
    ↓
Order
    ↓
Kitchen
    ↓
Ready
    ↓
Pickup
```

Order status:

- Pending.
- Confirmed.
- Preparing.
- Ready.
- Completed.
- Cancelled.

---

# 23. PPOB

Mobile application terhubung dengan vendor PPOB.

Contoh:

- Pulsa.
- Paket data.
- Token listrik.
- Tagihan listrik.
- PDAM jika tersedia.
- BPJS jika tersedia.
- E-wallet top-up jika tersedia.
- Produk digital lainnya.

## PPOB Flow

```text
Select PPOB
      ↓
Input Customer Number
      ↓
Inquiry
      ↓
Show Price
      ↓
Confirm
      ↓
Payment
      ↓
Vendor Request
      ↓
Vendor Response
      ↓
Success / Failed
      ↓
Transaction History
```

Sistem harus menangani:

- Success.
- Failed.
- Pending.
- Timeout.
- Reversal.
- Duplicate transaction.
- Vendor unavailable.

---

# 24. PPOB Integration

Integration layer sebaiknya tidak langsung mengikat business logic ke satu vendor.

Gunakan abstraction:

```text
Application
     ↓
PPOB Service
     ↓
Provider Adapter
     ├── Provider A
     ├── Provider B
     └── Provider C
```

Dengan demikian vendor PPOB dapat diganti tanpa mengubah mobile application.

---

# 25. Stock Opname

Stock opname dilakukan minimal setiap 3 bulan.

## Workflow

```text
Create Stock Opname
        ↓
Select Warehouse
        ↓
Freeze / Snapshot Stock
        ↓
Physical Counting
        ↓
Input Actual Quantity
        ↓
System Calculation
        ↓
Variance
        ↓
Review
        ↓
Approval
        ↓
Adjustment
        ↓
Stock Opname Completed
```

## Variance

```text
Variance = Actual Stock - System Stock
```

Sistem harus menghasilkan:

- Surplus.
- Shortage.
- Variance value.
- Variance percentage.

Supervisor harus dapat memberikan approval terhadap adjustment yang signifikan.

---

# 26. Expiry & Batch Management

Untuk produk tertentu, khususnya makanan/minuman, sistem sebaiknya mendukung:

- Batch number.
- Expiry date.
- Production date.
- FEFO.
- Expired stock.
- Near-expiry alert.

**FEFO — First Expired, First Out** lebih sesuai daripada FIFO untuk produk yang memiliki expiration date.

---

# 27. Sales Management

Setiap transaksi harus memiliki:

- Transaction ID.
- Date/time.
- Member.
- Cashier/source.
- Product.
- Quantity.
- Price.
- Discount.
- Tax.
- Total.
- Payment method.
- Status.

Status:

- Completed.
- Pending.
- Cancelled.
- Refunded.
- Voided.

---

# 28. Return & Refund

System harus mendukung:

- Sales return.
- Partial return.
- Full return.
- Refund.
- Wallet refund.
- Point refund.
- Payroll deduction reversal.

Semua refund harus memiliki audit trail dan authorization.

---

# 29. Financial Management

Sistem harus menghitung minimal:

### Revenue

```text
Revenue = Total Sales
```

### COGS

```text
COGS = Cost of Goods Sold
```

### Gross Profit

```text
Gross Profit = Revenue - COGS
```

### Operating Expense

Contoh:

- Operational expense.
- Employee expense.
- Utility.
- Transportation.
- Other expenses.

### Net Profit

```text
Net Profit = Gross Profit - Operating Expense
```

---

# 30. Costing

Untuk menghitung laba secara akurat, sistem harus menentukan metode costing.

Recommended:

**Weighted Average Cost**

Contoh:

```text
100 unit × Rp10.000
+
100 unit × Rp12.000

Total Cost = Rp2.200.000
Total Qty = 200

Average Cost = Rp11.000
```

Alternatif:

- FIFO.
- Specific identification.

Metode harus ditentukan dan dikunci sebagai bagian dari accounting policy koperasi.

---

# 31. Financial Closing

Setiap akhir bulan sistem harus menyediakan:

```text
Monthly Closing
      ↓
Sales Reconciliation
      ↓
Purchase Reconciliation
      ↓
Inventory Valuation
      ↓
COGS Calculation
      ↓
Expense
      ↓
Profit/Loss
      ↓
Payroll Deduction
      ↓
Final Report
```

Setelah closing, transaksi periode tersebut sebaiknya tidak dapat diedit sembarangan.

Jika ada koreksi, gunakan adjustment transaction.

---

# 32. Reporting

## Sales Report

Filter:

- Date.
- Product.
- Category.
- Employee.
- Payment.
- Cashier.
- Warehouse.

---

## Inventory Report

- Current stock.
- Stock movement.
- Stock valuation.
- Low stock.
- Out of stock.
- Expired.
- Near expiry.
- Stock variance.

---

## Purchasing Report

- Purchase.
- Supplier.
- Purchase value.
- Outstanding purchase.
- Purchase return.

---

## Financial Report

Minimal:

- Revenue.
- COGS.
- Gross Profit.
- Expense.
- Net Profit.
- Profit Margin.

---

## Member Report

- Member transaction.
- Spending.
- Payroll deduction.
- Point usage.
- Wallet usage.

---

## PPOB Report

- Transaction.
- Revenue.
- Provider.
- Product.
- Success rate.
- Failed transaction.
- Pending transaction.
- Commission/margin.

---

# 33. Supervisor Dashboard

Supervisor tidak perlu melihat seluruh detail operasional.

Dashboard harus memberikan informasi:

### Business Health

- Today's Sales.
- Monthly Sales.
- Gross Profit.
- Net Profit.
- Transaction Volume.

### Inventory Health

- Stock Value.
- Low Stock.
- Out of Stock.
- Stock Variance.

### Employee Activity

- Active Members.
- Total Spending.
- Payroll Deduction.

### PPOB

- Transaction Volume.
- Transaction Success Rate.
- PPOB Revenue.

### Alert

- Low stock.
- High stock variance.
- Failed PPOB.
- Pending transaction.
- Unapproved transaction.
- Unreconciled payment.
- Unusual transaction.

---

# 34. Approval Workflow

Tidak semua transaksi harus membutuhkan approval.

Gunakan approval berdasarkan threshold.

Contoh:

```text
Stock Adjustment < Rp500.000
→ Warehouse Staff

Stock Adjustment ≥ Rp500.000
→ Supervisor Approval
```

Contoh lainnya:

- Purchase Order.
- Refund.
- Stock Adjustment.
- Payroll Deduction Closing.
- Monthly Closing.

Threshold harus configurable.

---

# 35. Notification

Notification dapat dikirim melalui:

- Push Notification.
- In-app notification.
- Email jika diperlukan.

Contoh:

### Employee

- Order confirmed.
- Food ready.
- PPOB success.
- PPOB failed.
- Wallet transaction.
- Payroll deduction.

### Staff

- Low stock.
- New order.
- PPOB pending.
- Stock opname scheduled.

### Supervisor

- Approval request.
- Large adjustment.
- Monthly closing.
- Unusual transaction.

---

# 36. Audit Trail

Setiap aktivitas kritikal harus tercatat.

Minimal:

- User.
- Role.
- Action.
- Entity.
- Previous value.
- New value.
- IP.
- Timestamp.
- Reference ID.

Contoh:

```text
User: warehouse01
Action: STOCK_ADJUSTMENT
Product: ABC001
Before: 100
After: 95
Reason: Damaged
Timestamp: ...
```

---

# 37. Search & Filtering

Semua module utama harus memiliki:

- Search.
- Filter.
- Sorting.
- Pagination.
- Export.

Export minimal:

- Excel.
- CSV.
- PDF.

---

# 38. Authentication & Security

Web:

- Username/email.
- Password.
- Role based access control.
- Optional 2FA.

Mobile:

- Employee authentication.
- OTP/SSO jika tersedia.
- Device/session management.

Security requirements:

- HTTPS.
- Encryption at rest untuk data sensitif.
- Password hashing.
- Token expiration.
- Session revocation.
- Rate limiting.
- Audit logging.

---

# 39. Integration

Potential integrations:

## Internal Corporate System

- Employee master.
- Employee status.
- Department.
- Payroll.
- Salary deduction.

## Payment

- Payment gateway.
- QR payment.
- Bank/payment provider.

## PPOB

- PPOB aggregator.
- Server pulsa.
- Digital product provider.

## Notification

- Push notification.
- Email/SMS provider jika diperlukan.

---

# 40. API Requirements

API harus menggunakan versioning.

Contoh:

```text
/api/v1/products
/api/v1/orders
/api/v1/inventory
/api/v1/members
/api/v1/wallet
/api/v1/ppob
/api/v1/payroll
```

API harus mendukung:

- Authentication.
- Authorization.
- Idempotency.
- Pagination.
- Filtering.
- Sorting.
- Error standardization.

---

# 41. Idempotency

Sangat penting untuk transaksi finansial dan PPOB.

Contoh:

Jika request PPOB dikirim dua kali karena network timeout, sistem tidak boleh menghasilkan dua transaksi.

Gunakan:

```text
idempotency_key
```

untuk transaksi kritikal.

---

# 42. Transaction State Management

Untuk transaksi yang melibatkan external provider:

```text
CREATED
   ↓
PROCESSING
   ↓
SUCCESS
```

atau:

```text
CREATED
   ↓
PROCESSING
   ↓
FAILED
```

atau:

```text
PROCESSING
   ↓
PENDING
   ↓
SUCCESS / FAILED
```

Jangan hanya menggunakan boolean `success = true/false`.

---

# 43. Data Model High Level

Core entities:

```text
User
Role
Permission

Employee
Member

Product
Category
Brand
Unit

Supplier
PurchaseOrder
PurchaseOrderItem
GoodsReceipt

Warehouse
WarehouseLocation
Inventory
InventoryMovement

StockOpname
StockOpnameItem

SalesOrder
SalesOrderItem
Payment
Refund

Wallet
WalletTransaction
Point
PointTransaction

PayrollDeduction
PayrollDeductionItem

PPOBTransaction
PPOBProvider
PPOBProduct

Expense
FinancialTransaction
MonthlyClosing

Notification
AuditLog
```

---

# 44. Key Business Relationships

```text
Employee
   │
   └── Member
          │
          ├── Wallet
          ├── Point
          ├── Sales Order
          ├── PPOB Transaction
          └── Payroll Deduction
```

Inventory:

```text
Supplier
   ↓
Purchase Order
   ↓
Goods Receipt
   ↓
Inventory
   ↓
Sales
   ↓
Inventory Movement
```

Financial:

```text
Sales
   +
PPOB Revenue
   -
COGS
   -
Expense
   =
Profit
```

---

# 45. Important Business Rules

## BR-001 — Inventory

Setiap transaksi penjualan physical product harus mengurangi inventory.

## BR-002 — Purchase

Goods receipt harus menambah inventory.

## BR-003 — Stock Adjustment

Stock adjustment harus memiliki reason.

## BR-004 — Stock Opname

Stock opname tidak boleh mengubah stok secara langsung sebelum proses approval/finalization.

## BR-005 — Refund

Refund harus mengembalikan nilai transaksi sesuai payment method.

## BR-006 — Payroll

Hanya transaksi dengan status eligible yang boleh masuk payroll deduction.

## BR-007 — Monthly Closing

Setelah monthly closing, transaksi tidak dapat diedit tanpa adjustment/reversal.

## BR-008 — PPOB

Transaksi PPOB yang belum mendapatkan final status dari provider harus masuk status Pending.

## BR-009 — Price

Harga jual harus menggunakan price yang berlaku pada waktu transaksi.

## BR-010 — Audit

Perubahan data kritikal harus dicatat dalam audit log.

---

# 46. End-to-End Scenario

## Scenario A — Employee Shopping

```text
Employee Login
      ↓
Browse Product
      ↓
Add to Cart
      ↓
Checkout
      ↓
Select Payroll Deduction
      ↓
System Validate Limit
      ↓
Order Created
      ↓
Inventory Deducted
      ↓
Payroll Deduction Created
      ↓
Receipt
```

---

# 47. Scenario B — Cash POS

```text
Cashier Login
      ↓
Scan Barcode
      ↓
Cart
      ↓
Cash Payment
      ↓
Payment Confirmed
      ↓
Inventory Deducted
      ↓
Receipt Printed
```

---

# 48. Scenario C — PPOB

```text
Employee
   ↓
Select Token Listrik
   ↓
Input Customer Number
   ↓
Inquiry
   ↓
Confirm
   ↓
Wallet/Payment
   ↓
PPOB Provider
   ↓
Success
   ↓
Receipt
```

---

# 49. Scenario D — Stock Opname

```text
Supervisor
   ↓
Create Stock Opname
   ↓
Warehouse Staff Counts
   ↓
Input Actual Quantity
   ↓
System Calculates Variance
   ↓
Supervisor Review
   ↓
Approve
   ↓
Inventory Adjustment
   ↓
Stock Opname Closed
```

---

# 50. Scenario E — Month End

```text
End of Month
      ↓
Transaction Reconciliation
      ↓
Inventory Valuation
      ↓
COGS
      ↓
Revenue
      ↓
Expense
      ↓
Profit/Loss
      ↓
Payroll Deduction
      ↓
Supervisor Review
      ↓
Monthly Closing
```

---

# 51. MVP Scope

Saya sangat menyarankan project tidak langsung mengerjakan seluruh fitur sekaligus.

## Phase 1 — Foundation

- Authentication.
- User.
- Role.
- Employee.
- Member.
- Product.
- Category.
- Supplier.
- Warehouse.

## Phase 2 — Core Operation

- Inventory.
- Purchasing.
- Goods Receiving.
- POS.
- Sales.
- Payment.
- Stock Adjustment.

## Phase 3 — Employee Mobile

- Login.
- Product catalog.
- Cart.
- Checkout.
- Order.
- Wallet/Point.
- Transaction history.

## Phase 4 — Stock & Finance

- Stock Opname.
- Inventory valuation.
- COGS.
- Profit/Loss.
- Expense.
- Monthly closing.

## Phase 5 — Integration

- Payroll.
- PPOB.
- Payment gateway.
- Corporate employee system.

## Phase 6 — Analytics

- Supervisor dashboard.
- Advanced reports.
- KPI.
- Alert.
- Analytics.

---

# 52. Suggested MVP Priorities

| Module | Priority |
|---|---|
| Authentication | P0 |
| Employee/Member | P0 |
| Product | P0 |
| Inventory | P0 |
| Warehouse | P0 |
| POS | P0 |
| Purchasing | P0 |
| Sales | P0 |
| Payment | P0 |
| Stock Opname | P0 |
| Basic Reporting | P0 |
| Mobile Shopping | P0 |
| Wallet/Point | P0 |
| Payroll Deduction | P0 |
| PPOB | P1 |
| Food Ordering | P1 |
| Advanced Financial | P1 |
| Advanced Analytics | P2 |
| Promotions/Loyalty | P2 |

---

# 53. Non-Functional Requirements

## Performance

Target:

- API response p95 < 500ms untuk operasi normal.
- POS transaction response < 2 seconds untuk local operations.
- Mobile app dapat menangani network yang tidak stabil.

## Availability

Target awal:

- 99.5% availability.

Untuk transaksi PPOB dan financial transaction, availability dan consistency harus diprioritaskan.

## Scalability

System harus mampu menangani:

- Ribuan employee.
- Ribuan transaksi per hari.
- Multiple warehouse.
- Multiple POS terminal.
- Multiple PPOB provider.

---

# 54. Offline Consideration

POS sangat ideal jika memiliki kemampuan terbatas untuk menghadapi network interruption.

Namun transaksi yang berdampak terhadap:

- Wallet.
- Point.
- Payroll.
- PPOB.

sebaiknya **tidak dianggap final ketika server belum dapat melakukan validasi**.

Offline mode dapat dipertimbangkan hanya untuk:

- Product browsing.
- Cached product.
- Draft cart.

Untuk transaksi finansial, server tetap menjadi source of truth.

---

# 55. Observability

System harus memiliki:

- Application logs.
- API logs.
- Error tracking.
- Integration logs.
- PPOB request/response logs.
- Payment logs.
- Audit logs.
- Monitoring.
- Alerting.

Untuk external integration, simpan reference:

```text
internal_transaction_id
external_transaction_id
provider_reference
```

Hal ini akan sangat membantu reconciliation.

---

# 56. Reconciliation

Reconciliation merupakan fitur penting dan sebaiknya bukan pekerjaan manual.

System harus dapat membandingkan:

```text
Internal Transaction
        VS
Payment Provider
```

dan:

```text
Internal PPOB
        VS
PPOB Provider
```

serta:

```text
Payroll Deduction
        VS
Payroll System
```

Status:

- Matched.
- Unmatched.
- Missing.
- Duplicate.
- Amount mismatch.

---

# 57. Reporting Export

Report harus dapat diexport dengan filter yang sama dengan layar.

Contoh:

```text
Date: 01–31 August
Warehouse: Main Warehouse
Category: Food
Payment: Payroll Deduction
```

Kemudian:

**Export Excel**

menghasilkan dataset sesuai filter tersebut.

---

# 58. Auditability

Semua transaksi penting harus dapat ditelusuri:

```text
Transaction
   ↓
Employee
   ↓
Payment
   ↓
Inventory Movement
   ↓
Financial Transaction
   ↓
Payroll Deduction
```

Tujuannya adalah apabila terjadi selisih atau komplain, staff dapat mengetahui **siapa melakukan apa, kapan, dan berasal dari transaksi mana**.

---

# 59. Success Metrics

Product dapat dianggap berhasil jika:

### Operational

- Waktu stock opname turun ≥ 50%.
- Waktu monthly closing turun ≥ 50%.
- Manual spreadsheet berkurang signifikan.
- Inventory variance turun.
- Kesalahan input transaksi turun.

### Business

- Sales dapat dimonitor real-time.
- Profit dapat dihitung otomatis.
- Top-selling product dapat diketahui.
- Slow-moving product dapat diketahui.

### Employee

- Employee dapat melakukan pembelian melalui mobile.
- Employee dapat melihat transaksi.
- Employee dapat melihat payroll deduction.
- PPOB dapat dilakukan tanpa proses manual.

### Management

- Supervisor dapat melihat KPI koperasi.
- Supervisor dapat melihat profit.
- Supervisor dapat melihat inventory.
- Supervisor dapat melakukan approval.

---

# 60. Recommended Technical Architecture

Untuk project seperti ini, saya menyarankan pendekatan:

```text
                    Mobile App
                       │
                       ▼
                 API Gateway
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
         Core Backend      Integration
              │                 │
              │          ┌──────┼──────┐
              │          │      │      │
              │        PPOB   Payroll Payment
              │
       ┌──────┼──────────────┐
       │      │              │
       ▼      ▼              ▼
   PostgreSQL Redis       Object Storage
```

Untuk tahap awal, **modular monolith** lebih disarankan daripada langsung menggunakan microservices.

Modul di dalam backend dapat dipisahkan secara jelas:

```text
Auth
Employee
Member
Product
Inventory
Warehouse
Purchasing
POS
Order
Payment
Wallet
Payroll
PPOB
Finance
Reporting
Notification
Audit
```

Kemudian jika scale meningkat, modul tertentu dapat diekstrak menjadi service tersendiri.

---

# 61. Recommended Architecture Principle

Gunakan prinsip:

### Transactional Source of Truth

Database backend menjadi sumber kebenaran utama.

Mobile dan Web hanya menjadi client.

### Event-Driven untuk Side Effects

Contoh:

```text
Order Completed
       │
       ├── Inventory Deduction
       ├── Financial Record
       ├── Notification
       └── Payroll Record
```

Hal ini dapat dilakukan menggunakan event/message queue ketika sistem mulai berkembang.

---

# 62. Important Decisions Before Development

Sebelum development dimulai, terdapat beberapa business decision yang **wajib dikunci**.

## A. Point vs Wallet

Apakah point:

- 1 point = Rp1?
- Point memiliki expiry?
- Point dapat dikonversi?
- Point berasal dari perusahaan?
- Point berasal dari transaksi?

## B. Payroll Deduction

- Berapa maksimum deduction per bulan?
- Apakah ada spending limit?
- Apakah semua produk dapat dibayar melalui payroll?
- Apakah PPOB dapat menggunakan payroll?
- Kapan payroll cut-off?
- Bagaimana jika employee resign?

## C. Inventory

- Apakah satu produk dapat berada di beberapa warehouse?
- Apakah warehouse memiliki bin/location?
- Apakah menggunakan FIFO atau Weighted Average?
- Apakah makanan menggunakan expiry/batch?

## D. POS

- Apakah POS harus tetap berjalan ketika internet mati?
- Berapa jumlah POS terminal?
- Apakah ada barcode scanner?
- Apakah ada receipt printer?

## E. Finance

- Apakah sistem hanya financial reporting?
- Atau harus menjadi accounting system?
- Apakah perlu chart of accounts?
- Apakah perlu jurnal debit/kredit?

## F. Employee Integration

- Bagaimana employee master diperoleh?
- API?
- Database integration?
- File upload?
- SSO?

## G. PPOB

- Vendor apa?
- API specification?
- Inquiry?
- Callback?
- Reversal?
- Settlement?
- Commission?

---

# 63. Acceptance Criteria — Core Transaction

Sebuah transaksi penjualan dianggap berhasil apabila:

- Product valid.
- Price valid.
- Stock mencukupi untuk produk stockable.
- Member valid apabila transaksi membutuhkan member.
- Payment berhasil.
- Transaction ID terbentuk.
- Inventory movement terbentuk.
- Financial record terbentuk.
- Receipt dapat dibuat.
- Audit log tercatat.

Untuk payroll deduction:

- Member valid.
- Deduction limit valid.
- Transaction eligible.
- Payroll record terbentuk.
- Transaction masuk monthly payroll statement.

Untuk PPOB:

- Inquiry berhasil.
- Product valid.
- Customer number valid.
- Payment berhasil.
- Provider request berhasil dikirim.
- Provider response tercatat.
- Status final/pending tersimpan.
- External reference tersimpan.
- User mendapatkan hasil transaksi.

---

# 64. Risks

## Risk 1 — Payroll Integration

Perbedaan format/data antara koperasi dan sistem payroll dapat menyebabkan reconciliation issue.

**Mitigation:** buat integration contract sejak awal.

## Risk 2 — PPOB Transaction Failure

External provider dapat timeout atau mengembalikan status pending.

**Mitigation:** gunakan asynchronous transaction state + reconciliation.

## Risk 3 — Inventory Inaccuracy

Human error saat receiving/stock opname dapat menyebabkan selisih.

**Mitigation:** barcode, approval, audit trail, dan stock movement history.

## Risk 4 — Financial Inconsistency

Perubahan transaksi setelah closing dapat menyebabkan laporan tidak konsisten.

**Mitigation:** accounting period locking + adjustment transaction.

## Risk 5 — Scope Explosion

Karena koperasi memiliki banyak proses bisnis, project berpotensi berubah menjadi ERP.

**Mitigation:** gunakan MVP dan modular architecture.

---

# 65. Product Roadmap

```text
PHASE 1
Foundation
│
├── Auth
├── Employee
├── Product
├── Supplier
└── Warehouse

        ↓

PHASE 2
Operations
│
├── Purchasing
├── Inventory
├── POS
└── Sales

        ↓

PHASE 3
Employee Experience
│
├── Mobile App
├── Shopping
├── Wallet/Point
└── Order

        ↓

PHASE 4
Financial
│
├── COGS
├── Profit/Loss
├── Payroll Deduction
└── Monthly Closing

        ↓

PHASE 5
Integration
│
├── Payroll
├── PPOB
└── Payment

        ↓

PHASE 6
Analytics
│
├── Supervisor Dashboard
├── Advanced Reporting
├── KPI
└── Business Intelligence
```

---

# 66. Recommended MVP Definition

Jika targetnya adalah mendapatkan sistem yang sudah benar-benar usable secepat mungkin, MVP sebaiknya terdiri dari:

### Web

- Login & RBAC.
- Employee/member.
- Product.
- Category.
- Supplier.
- Warehouse.
- Inventory.
- Purchasing.
- Goods receiving.
- POS.
- Sales.
- Payment.
- Stock adjustment.
- Stock opname.
- Basic financial report.
- Basic dashboard.
- Audit trail.

### Mobile

- Login.
- Home.
- Product catalog.
- Product detail.
- Cart.
- Checkout.
- Payment.
- Order history.
- Wallet/point.
- Transaction history.

### Integration

- Employee master.
- Payroll deduction.
- PPOB.

---

# 67. Final Product Structure

Pada akhirnya platform dapat diposisikan sebagai:

```text
                    KOPERASI SUZUKI MART
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
       WEB APP                             MOBILE APP
          │                                   │
   ┌──────┼───────┐                     ┌─────┼──────┐
   │      │       │                     │     │      │
 Admin  Staff  Supervisor            Shopping PPOB Member
   │      │       │                     │     │      │
   └──────┼───────┘                     └─────┼──────┘
          │                                   │
          └─────────────────┬─────────────────┘
                            │
                     CORE PLATFORM
                            │
       ┌────────────┬──────┼──────┬────────────┐
       │            │      │      │            │
   Inventory       POS   Finance Payroll      PPOB
       │            │      │      │            │
       └────────────┴──────┼──────┴────────────┘
                            │
                       REPORTING
```

---

# 68. Conclusion

Koperasi Suzuki Mart sebaiknya dipandang sebagai **integrated retail & cooperative platform**, bukan hanya aplikasi POS.

Core architecture harus berpusat pada empat domain utama:

1. **Commerce** — POS, mobile shopping, food ordering, PPOB.
2. **Inventory** — purchasing, warehouse, stock movement, stock opname.
3. **Member & Payroll** — employee, wallet/point, spending limit, payroll deduction.
4. **Finance & Analytics** — revenue, COGS, profit/loss, reconciliation, dashboard.

Dengan pemisahan tersebut, sistem dapat berkembang dari koperasi sederhana menjadi platform yang mampu menangani **ribuan karyawan, banyak transaksi, beberapa warehouse/POS, serta integrasi dengan sistem internal Suzuki dan vendor eksternal** tanpa harus melakukan redesign besar di kemudian hari.

**Prioritas terpenting sebelum development:** finalisasi business rules untuk **Point/Wallet, Payroll Deduction, Inventory Costing, Monthly Closing, PPOB transaction lifecycle, dan Employee/Payroll integration**. Keenam area tersebut akan menjadi fondasi hampir seluruh modul lainnya.