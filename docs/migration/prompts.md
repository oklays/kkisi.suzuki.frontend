# AUDIT & DESIGN PLAN — NEW PAYMENT METHOD: QRIS STATIC FOR POS/KASIR

## Context

Saat ini aplikasi Koperasi Suzuki memiliki modul POS/Kasir yang sudah berjalan untuk melakukan transaksi penjualan.

Saya berencana menambahkan metode pembayaran baru:

    QRIS

Namun pada fase saat ini QRIS yang digunakan masih berupa QRIS STATIC yang secara fisik sudah tersedia di toko.

Artinya:

- Sistem TIDAK perlu membuat QR Code.
- Tidak ada QRIS Dynamic.
- Tidak ada integrasi Payment Gateway.
- Tidak ada API ke provider QRIS.
- Tidak ada callback/webhook pembayaran.
- Tidak ada automatic payment verification.
- Tidak ada inquiry status transaksi ke provider.

Kasir hanya akan memilih metode pembayaran:

    QRIS

ketika customer melakukan pembayaran menggunakan QRIS static yang tersedia di toko.

Tujuan utama penambahan metode pembayaran QRIS pada fase ini adalah agar transaksi dapat:

1. Dibedakan berdasarkan metode pembayaran.
2. Disimpan dengan payment method = QRIS.
3. Dikelompokkan dalam reporting.
4. Dibedakan dari transaksi Cash/Tunai.
5. Direkap dengan benar pada saat Tutup Kasir / Tutup Toko.
6. Nantinya dapat dikembangkan menjadi QRIS Dynamic tanpa merombak struktur transaksi secara besar.

---

# IMPORTANT — READ DOCUMENTATION FIRST

Sebelum melakukan audit source code secara langsung, baca terlebih dahulu dokumentasi project yang sudah tersedia, terutama:

    docs/

dan dokumentasi architecture / migration / database / module boundaries / data ownership yang relevan.

Audit terhadap aplikasi legacy sebelumnya sudah pernah dilakukan dan hasilnya sudah terdokumentasi.

JANGAN melakukan audit keseluruhan aplikasi legacy dari awal.

Gunakan dokumentasi tersebut sebagai baseline / source of truth, kemudian lakukan targeted inspection pada source code hanya pada bagian yang diperlukan untuk memvalidasi flow transaksi POS/Kasir dan payment method.

---

# PRIMARY OBJECTIVE

Lakukan audit terhadap flow transaksi POS/Kasir yang berjalan saat ini dan tentukan bagaimana metode pembayaran QRIS Static nantinya dapat masuk ke flow tersebut.

Fokus utama audit adalah:

    POS / Kasir
        ↓
    Checkout
        ↓
    Payment Method
        ↓
    Sales / Transaction
        ↓
    Database
        ↓
    Cashier Closing / Store Closing
        ↓
    Reporting

Pada tahap ini JANGAN melakukan implementasi apa pun.

Saya ingin mengetahui terlebih dahulu kondisi existing dan rancangan perubahan yang paling aman.

---

# 1. AUDIT CURRENT POS TRANSACTION FLOW

Telusuri flow transaksi POS/Kasir saat user menekan:

    Proses Pembayaran

Identifikasi secara detail:

- UI/component yang menangani checkout.
- State/form payment yang digunakan.
- Request payload yang dikirim.
- API / server action / route handler yang dipanggil.
- Application/service/use-case yang memproses transaksi.
- Repository/data-access yang digunakan.
- Database transaction yang dijalankan.
- Table yang di-INSERT.
- Table yang di-UPDATE.
- Column yang berhubungan dengan payment.
- Table detail transaksi.
- Table header transaksi.
- Table kasir/session.
- Table jurnal/accounting jika ada.
- Table inventory/stock yang terdampak.
- Table member/credit jika relevan.

Buat alur yang jelas seperti:

    POS UI
      ↓
    Checkout Handler
      ↓
    API / Server Action
      ↓
    Transaction Service
      ↓
    Repository
      ↓
    Database Table A
      ↓
    Database Table B
      ↓
    Stock Update
      ↓
    Reporting

Gunakan nama file, function, service, repository, table, dan column yang benar-benar ditemukan.

JANGAN mengasumsikan nama table atau column.

---

# 2. AUDIT EXISTING PAYMENT METHOD MODEL

Cari tahu bagaimana sistem sekarang menyimpan metode pembayaran.

Contohnya apakah menggunakan:

    payment_method = "cash"

atau:

    payment_type_id

atau:

    transaction_type

atau:

    cash / credit flag

atau model lainnya.

Identifikasi:

- Table penyimpan payment method.
- Column terkait.
- Data type column.
- Possible values.
- Enum jika ada.
- Foreign key jika ada.
- Master payment method table jika ada.
- Hardcoded payment method di application.
- Hardcoded payment method di frontend.
- Validation/schema yang membatasi payment method.
- Reporting/query yang bergantung pada nilai tersebut.

Cari seluruh dependency terhadap payment method yang relevan.

Contoh:

    CASH
    CREDIT
    MEMBER_CREDIT
    TRANSFER
    payment_method
    payment_type

atau istilah existing lain yang digunakan project.

---

# 3. AUDIT CASH VS NON-CASH BEHAVIOUR

Ini merupakan bagian yang sangat penting.

QRIS adalah pembayaran NON-CASH.

Pastikan audit mengecek apakah sistem saat ini menganggap seluruh transaksi penjualan sebagai penerimaan kas.

Periksa khususnya:

- saldo awal kasir
- uang tunai diterima
- cash sales
- saldo kas
- setoran kas
- saldo akhir
- closing cashier
- closing store
- rekonsiliasi kas
- laporan cash
- laporan penjualan

Contoh potensi masalah yang perlu dicari:

Jika:

    Total Penjualan = Rp 1.000.000

dan terdiri dari:

    Cash : Rp 600.000
    QRIS : Rp 400.000

maka physical cash seharusnya hanya:

    Rp 600.000

bukan:

    Rp 1.000.000

Audit apakah existing implementation sudah memiliki konsep pemisahan seperti ini atau belum.

---

# 4. AUDIT TUTUP KASIR / TUTUP TOKO

Periksa flow:

    Tutup Kasir
    Tutup Toko
    Rekap Kasir

Cari tahu bagaimana sistem menghitung:

- Saldo Awal
- Total Penjualan
- Penjualan Tunai
- Penjualan Kredit
- Setoran Kas
- Saldo Akhir
- Selisih Kas
- Jumlah Transaksi

Kemudian analisis bagaimana QRIS seharusnya muncul nantinya.

Idealnya report dapat memiliki grouping seperti:

    Total Penjualan
        Cash
        QRIS
        Kredit Anggota

Contoh:

    Total Penjualan        Rp 1.500.000

    Cash                   Rp   700.000
    QRIS                   Rp   500.000
    Kredit Anggota         Rp   300.000

Tetapi jangan langsung mengimplementasikannya.

Tentukan apakah existing schema sudah mampu menghasilkan grouping tersebut.

---

# 5. AUDIT REPORTING IMPACT

Cari semua reporting/query/dashboard yang membaca transaksi POS.

Identifikasi report yang kemungkinan terdampak oleh payment method baru.

Contohnya:

- Daily Sales
- POS Sales
- Cashier Report
- Store Closing
- Transaction History
- Revenue Report
- Payment Summary
- Member Credit Report
- Finance Report

Untuk setiap report, jelaskan apakah penambahan QRIS:

- otomatis sudah ter-support,
- membutuhkan filter baru,
- membutuhkan GROUP BY baru,
- membutuhkan perubahan query,
- atau berpotensi salah menghitung QRIS sebagai cash.

---

# 6. PROPOSE QRIS STATIC DATA FLOW

Setelah memahami existing implementation, buat proposed data flow untuk QRIS Static.

Target conceptual flow:

    Customer memilih barang
            ↓
    Kasir melakukan checkout
            ↓
    Kasir memilih "QRIS"
            ↓
    Customer scan QRIS Static di toko
            ↓
    Kasir memastikan pembayaran secara manual
            ↓
    Kasir klik "Proses Pembayaran"
            ↓
    Transaction disimpan
            ↓
    payment_method = QRIS
            ↓
    Stock berkurang
            ↓
    Transaction selesai
            ↓
    Data dapat dikelompokkan sebagai QRIS
            ↓
    QRIS tidak dihitung sebagai physical cash

Tidak ada:

    generate QR
    payment API
    webhook
    external transaction status
    automatic verification

pada fase ini.

---

# 7. DETERMINE MINIMUM REQUIRED CHANGE

Berdasarkan audit, tentukan perubahan minimum yang nantinya diperlukan untuk mendukung:

    CASH
    QRIS
    MEMBER_CREDIT / CREDIT

atau payment method existing lainnya.

Analisis beberapa kemungkinan.

Contoh:

### Scenario A — Existing column sudah mendukung

Jika sudah ada:

    payment_method VARCHAR(...)

dan saat ini hanya menyimpan:

    CASH
    CREDIT

maka mungkin cukup menambahkan:

    QRIS

tanpa schema migration.

### Scenario B — Existing payment model terlalu hardcoded

Jika payment method menggunakan boolean atau struktur seperti:

    is_credit

maka jelaskan limitation-nya dan rekomendasikan struktur yang lebih scalable.

### Scenario C — Existing system sudah memiliki master payment method

Jika sudah ada master table, jelaskan bagaimana QRIS nantinya seharusnya masuk.

JANGAN langsung memilih salah satu scenario sebelum melihat source code dan database schema yang sebenarnya.

---

# 8. FUTURE-PROOFING

Meskipun sekarang hanya QRIS Static, desain sebaiknya tidak menutup kemungkinan future implementation:

    QRIS Dynamic
    Payment Gateway
    Bank Transfer
    Virtual Account
    E-Wallet

Tetapi jangan over-engineer.

Pada fase QRIS Static kita hanya membutuhkan payment classification.

Bila diperlukan, jelaskan bagaimana struktur sekarang dapat dikembangkan nantinya menjadi:

    payment_method
    payment_provider
    payment_reference
    payment_status
    paid_at

Namun field tersebut TIDAK perlu dibuat sekarang kecuali memang sudah ada.

---

# STRICT CONSTRAINTS

Pada task ini:

DO NOT:

- modify source code
- modify frontend
- modify backend
- modify database
- create migration
- alter table
- create table
- insert master data
- update production/staging data
- install package
- refactor unrelated code
- implement QRIS
- integrate payment gateway
- generate QRIS
- create API QRIS

Database access jika diperlukan hanya:

    READ ONLY

Task ini adalah:

    AUDIT + IMPACT ANALYSIS + DESIGN RECOMMENDATION

bukan implementation.

---

# REQUIRED OUTPUT

Setelah audit selesai, berikan laporan dengan format berikut.

## 1. Executive Summary

Jelaskan secara singkat bagaimana transaksi POS bekerja sekarang dan apakah QRIS Static dapat ditambahkan dengan aman.

## 2. Existing POS Transaction Flow

Tampilkan alur:

    UI
    → API
    → Service
    → Repository
    → Database

Sertakan file/function yang terlibat.

## 3. Database Impact Matrix

Gunakan table:

| Table | Column | Current Purpose | POS Impact | QRIS Impact |
|---|---|---|---|---|

Jelaskan secara eksplisit:

- INSERT
- UPDATE
- READ ONLY

untuk masing-masing table.

## 4. Existing Payment Method Model

Jelaskan bagaimana payment method disimpan sekarang.

## 5. Cash Reconciliation Impact

Jelaskan bagaimana QRIS akan mempengaruhi:

- cash balance
- setoran kas
- saldo akhir
- cashier closing
- store closing

Ini adalah bagian critical.

## 6. Reporting Impact

Daftar report/query yang harus mengetahui payment method QRIS.

## 7. Proposed QRIS Static Flow

Buat sequence / flow dari:

    POS
    → QRIS selected
    → payment manually confirmed
    → transaction saved
    → reporting

## 8. Recommended Minimum Change

Jelaskan perubahan minimum yang nantinya diperlukan.

Pisahkan menjadi:

    MUST CHANGE
    SHOULD CHANGE
    NO CHANGE REQUIRED

## 9. Risks / Edge Cases

Contoh:

- QRIS salah dihitung sebagai cash.
- Payment method tidak tersimpan.
- Report lama menganggap semua transaksi non-credit = cash.
- Closing cashier tidak dapat merekonsiliasi QRIS.
- Void/refund QRIS.
- Transaction cancellation.
- Mixed payment jika ternyata existing system mendukungnya.

## 10. Implementation Plan — NEXT PHASE ONLY

Berikan urutan implementasi yang direkomendasikan setelah audit disetujui.

Contoh:

    Phase 1 — Domain / Payment Method
    Phase 2 — POS UI
    Phase 3 — Transaction Persistence
    Phase 4 — Closing / Reconciliation
    Phase 5 — Reporting
    Phase 6 — Testing

Tetapi JANGAN mengimplementasikan fase tersebut sekarang.

---

# TRACEABILITY REQUIREMENT

Setiap kesimpulan harus sebisa mungkin memiliki evidence.

Gunakan format seperti:

    Finding:
    POS checkout menyimpan transaksi melalui ...

    Evidence:
    apps/.../xxx.ts
    function: processTransaction()

    Database:
    table: ...
    column: ...

    Impact for QRIS:
    ...

Hindari kesimpulan berdasarkan asumsi.

Jika sesuatu belum dapat dipastikan dari source code atau dokumentasi, tuliskan:

    NOT CONFIRMED

dan jelaskan apa yang masih harus diverifikasi.

---

# FINAL GATE

Task dianggap selesai jika kita sudah dapat menjawab dengan jelas:

1. Saat transaksi POS selesai, data masuk ke table mana saja?
2. Table/column mana yang saat ini merepresentasikan payment method?
3. Apakah schema existing sudah mampu menyimpan `QRIS`?
4. Apakah penambahan QRIS membutuhkan schema/database change?
5. Apakah transaksi QRIS saat ini berpotensi dianggap sebagai CASH?
6. Bagaimana QRIS harus diperhitungkan pada Tutup Kasir?
7. Bagaimana QRIS harus muncul dalam reporting?
8. Apa perubahan minimum yang diperlukan untuk implementasi selanjutnya?

STOP setelah audit dan recommendation selesai.

Jangan melakukan implementation sebelum hasil audit ini direview dan disetujui.