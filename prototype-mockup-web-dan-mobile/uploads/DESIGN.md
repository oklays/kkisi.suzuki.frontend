# DESIGN.md --- Koperasi Suzuki Mart

> **Design System & UI/UX Guidelines --- Mobile Application**
>
> Status: Proposed\
> Platform: Mobile App (Android & iOS)\
> Product: Koperasi Suzuki Mart\
> Audience: Karyawan/anggota koperasi Suzuki\
> Primary language: Bahasa Indonesia

------------------------------------------------------------------------

## 1. Design Direction

Koperasi Suzuki Mart diposisikan sebagai **employee cooperative shopping
app**, bukan sekadar aplikasi e-commerce.

Pengalaman utama yang ingin dibangun:

-   **Cepat** --- karyawan dapat menemukan dan membeli kebutuhan
    sehari-hari dengan sedikit langkah.
-   **Terpercaya** --- transaksi, saldo, pembayaran, dan riwayat harus
    terasa aman dan jelas.
-   **Praktis** --- cocok digunakan saat jam kerja, istirahat, maupun
    sebelum/sesudah shift.
-   **Familiar** --- pola interaksi mengikuti aplikasi commerce modern
    sehingga pengguna tidak perlu belajar dari awal.
-   **Suzuki-oriented** --- identitas visual mengambil inspirasi dari
    warna dan karakter Suzuki tanpa membuat UI terlalu berat dengan
    branding.

### Design principle

1.  **Content first** --- produk, harga, saldo, dan status transaksi
    harus selalu mudah dipindai.
2.  **One primary action** --- setiap layar utama memiliki satu CTA yang
    paling dominan.
3.  **Progressive disclosure** --- detail kompleks ditampilkan ketika
    dibutuhkan.
4.  **Trust through clarity** --- harga, subtotal, biaya, metode
    pembayaran, dan status tidak boleh ambigu.
5.  **Consistent interaction** --- pola button, card, form, navigation,
    dan feedback harus konsisten.
6.  **Accessible by default** --- kontras, ukuran teks, touch target,
    dan status tidak hanya mengandalkan warna.

------------------------------------------------------------------------

# 2. Brand & Color Strategy

Suzuki's official corporate guidance identifies **Suzuki Red (PANTONE
485)** and **Suzuki Blue (PANTONE 294)** as designated brand colors.
Suzuki's corporate typography guidance also emphasizes simple, clear
headlines and regular/bold copy styles.

Untuk aplikasi digital, Pantone diperlakukan sebagai **brand
reference**, sedangkan implementasi UI menggunakan token digital HEX/RGB
yang ditetapkan oleh design team.

> **Catatan:** HEX di bawah adalah digital working palette untuk product
> UI. Jika terdapat official digital brand guideline dari pihak
> Suzuki/brand owner yang berbeda, token brand harus disesuaikan dengan
> guideline resmi tersebut.

### 2.1 Primary palette

  -----------------------------------------------------------------------
  Token                   HEX                     Usage
  ----------------------- ----------------------- -----------------------
  `brand.primary`         `#003399`               Primary action,
                                                  navigation, header,
                                                  links

  `brand.primary-hover`   `#002A80`               Hover/pressed state

  `brand.primary-soft`    `#E8F0FF`               Selected state, soft
                                                  background

  `brand.red`             `#E20A17`               Suzuki accent,
                                                  important highlight

  `brand.red-soft`        `#FDEBEC`               Soft red background
  -----------------------------------------------------------------------

### 2.2 Neutral palette

  Token           HEX         Usage
  --------------- ----------- --------------------------
  `neutral.0`     `#FFFFFF`   Main surface
  `neutral.25`    `#FCFCFD`   App background
  `neutral.50`    `#F7F8FA`   Secondary background
  `neutral.100`   `#EEF0F3`   Divider / subtle surface
  `neutral.200`   `#D9DDE3`   Border
  `neutral.300`   `#C2C8D0`   Disabled border
  `neutral.500`   `#737B87`   Secondary text
  `neutral.700`   `#3E4652`   Body text
  `neutral.900`   `#101828`   Heading / primary text

### 2.3 Semantic palette

  Token                     HEX         Usage
  ------------------------- ----------- -------------------------------
  `semantic.success`        `#16A34A`   Success, available, completed
  `semantic.success-soft`   `#EAF8EF`   Success background
  `semantic.warning`        `#F59E0B`   Warning, low stock, pending
  `semantic.warning-soft`   `#FFF7E6`   Warning background
  `semantic.error`          `#DC2626`   Failed, cancelled, validation
  `semantic.error-soft`     `#FDECEC`   Error background
  `semantic.info`           `#2563EB`   Informational status
  `semantic.info-soft`      `#EAF1FF`   Information background

### 2.4 Recommended color ratio

Gunakan prinsip:

-   **70%** neutral / white
-   **20%** Suzuki Blue
-   **5%** Suzuki Red
-   **5%** semantic/accent colors

Suzuki Red **jangan digunakan sebagai warna utama untuk seluruh CTA**.
Red sebaiknya menjadi brand accent atau attention color agar tetap kuat
dan tidak mengganggu hierarchy.

### 2.5 Color rules

**Do:**

-   Gunakan blue untuk primary CTA.
-   Gunakan red untuk brand accent dan highlight penting.
-   Gunakan semantic colors secara konsisten.
-   Pastikan text dan icon memiliki kontras yang memadai.
-   Gunakan neutral background untuk memberi ruang visual pada produk.

**Don't:**

-   Menggunakan red untuk semua button.
-   Menggunakan warna semantic hanya untuk dekorasi.
-   Membuat seluruh layar berwarna biru.
-   Menggunakan warna berbeda untuk status yang sama.
-   Mengandalkan warna saja untuk membedakan status.

------------------------------------------------------------------------

# 3. Typography

## 3.1 Font recommendation

### Primary

**Inter**

Alasan:

-   Sangat baik untuk UI mobile.
-   Angka dan currency mudah dibaca.
-   Banyak weight tersedia.
-   Open-source dan mudah diintegrasikan.
-   Cocok untuk Bahasa Indonesia.
-   Konsisten antara Android, iOS, dan web.

### Brand typography

Jika project memperoleh akses dan approval terhadap **SuzukiPRO**,
gunakan SuzukiPRO sesuai brand guideline untuk kebutuhan
branding/headline tertentu.

Untuk product UI sehari-hari, Inter dapat digunakan sebagai operational
UI font agar konsistensi rendering dan development lebih mudah.

------------------------------------------------------------------------

## 3.2 Type scale

  Style       Size Weight     Line Height Usage
  --------- ------ -------- ------------- -----------------------
  Display     32px 700               40px Hero / major balance
  H1          24px 700               32px Page title
  H2          20px 700               28px Section title
  H3          18px 600               24px Card title
  Body L      16px 400               24px Important body
  Body M      14px 400               20px Default body
  Body S      12px 400               18px Supporting text
  Label       12px 600               16px Form label / metadata
  Button      14px 600               20px CTA
  Caption     11px 400               16px Timestamp / helper

### Currency

Harga harus menggunakan format Indonesia:

**Rp 28.000**

Bukan:

**IDR 28,000**

Untuk angka penting, gunakan weight `600` atau `700`.

Contoh:

> Total Pembayaran\
> **Rp 117.000**

------------------------------------------------------------------------

# 4. Spacing System

Gunakan base unit **4px**.

  Token          Value Typical usage
  ------------ ------- ------------------------
  `space.1`        4px Icon gap
  `space.2`        8px Tight spacing
  `space.3`       12px Small component gap
  `space.4`       16px Standard spacing
  `space.5`       20px Card content
  `space.6`       24px Section spacing
  `space.8`       32px Large section
  `space.10`      40px Major separation
  `space.12`      48px Hero / page separation

### Mobile page padding

Default:

**16px horizontal**

For larger screens/tablets:

**24px horizontal**

------------------------------------------------------------------------

# 5. Layout & Grid

## Mobile

Target baseline:

-   Width: 360--430px
-   Horizontal padding: 16px
-   Bottom navigation: fixed
-   Content: vertically scrollable
-   Primary CTA: sticky only when necessary

### Safe area

Support:

-   iOS safe area
-   Android gesture navigation
-   Notch / Dynamic Island
-   Bottom system navigation

------------------------------------------------------------------------

# 6. Border Radius

Gunakan radius yang modern tetapi tidak terlalu playful.

  Token             Value Usage
  --------------- ------- -----------------------
  `radius.sm`         8px Small input / chip
  `radius.md`        12px Button / input
  `radius.lg`        16px Card
  `radius.xl`        20px Large card / promo
  `radius.full`     999px Avatar / pill / badge

### Recommendation

Mayoritas card:

**16px**

Button:

**12px**

Input:

**12px**

Promo banner:

**16--20px**

------------------------------------------------------------------------

# 7. Elevation & Shadow

Gunakan shadow secara subtle.

### Level 0

Flat surface.

### Level 1

Untuk card:

``` text
0 2px 8px rgba(16, 24, 40, 0.06)
```

### Level 2

Untuk floating component:

``` text
0 8px 24px rgba(16, 24, 40, 0.10)
```

### Level 3

Untuk modal / bottom sheet:

``` text
0 16px 40px rgba(16, 24, 40, 0.14)
```

Hindari shadow berat pada setiap card.

------------------------------------------------------------------------

# 8. Iconography

Recommended:

**Lucide Icons** atau icon set yang memiliki gaya outline konsisten.

### Rules

-   Default: 24px
-   Small: 20px
-   Large feature icon: 32px
-   Stroke: sekitar 1.75--2px
-   Jangan mencampur outline icon dengan filled icon secara sembarangan.

Untuk kategori produk, filled/illustrative icons boleh digunakan agar
lebih friendly.

------------------------------------------------------------------------

# 9. Navigation

## Bottom Navigation

Gunakan maksimal **5 item**.

Recommended:

1.  **Beranda**
2.  **Kategori**
3.  **Keranjang**
4.  **Riwayat**
5.  **Akun**

### Active state

Active:

-   Suzuki Blue
-   Icon + label
-   Sedikit emphasis

Inactive:

-   Neutral 500

Keranjang boleh memiliki badge jumlah item.

Contoh:

``` text
┌──────────────────────────────────────┐
│                                      │
│  🏠       ◉       🛒       🧾       👤
│ Beranda  Kategori Keranjang Riwayat Akun
│    ●                                 │
└──────────────────────────────────────┘
```

------------------------------------------------------------------------

# 10. Home Screen

Beranda adalah layar paling penting.

Prioritas hierarchy:

1.  Greeting
2.  Wallet / saldo
3.  Search
4.  Quick actions
5.  Promo
6.  Category
7.  Best seller
8.  Recommended products

### Suggested structure

``` text
Halo, Budi 👋

┌─────────────────────────────┐
│ Saldo Koperasi              │
│ Rp 250.000          Top Up  │
└─────────────────────────────┘

[ 🔎 Cari produk... ]

[ Belanja ] [ PPOB ] [ Promo ] [ Riwayat ]

┌─────────────────────────────┐
│       PROMO SPESIAL         │
│       Diskon hingga 20%     │
│       [Belanja Sekarang]    │
└─────────────────────────────┘

Kategori Populer

🍜 Makanan   🧴 Sembako   💊 Perawatan   📚 ATK

Produk Terlaris
```

------------------------------------------------------------------------

# 11. Product Card

Product card harus memprioritaskan:

1.  Image
2.  Product name
3.  Price
4.  Stock/availability
5.  Add button

Example:

``` text
┌──────────────────────┐
│                      │
│      PRODUCT IMG     │
│                      │
├──────────────────────┤
│ Minyak Goreng 2L     │
│ Rp 28.000             │
│ Stok tersedia         │
│                 [ + ] │
└──────────────────────┘
```

### Rules

-   Product name maksimal 2 lines.
-   Harga selalu visible.
-   CTA `+` harus memiliki touch target minimal 44x44px.
-   Jangan menampilkan terlalu banyak metadata.

------------------------------------------------------------------------

# 12. Product Detail

Hierarchy:

``` text
Image
↓
Product Name
↓
Price
↓
Stock
↓
Description
↓
Quantity
↓
Add to Cart
```

Primary CTA harus sticky di bagian bawah jika screen cukup panjang:

**Tambah ke Keranjang**

------------------------------------------------------------------------

# 13. Cart

Cart harus sangat transparan.

Tampilkan:

-   Product
-   Quantity
-   Unit price
-   Subtotal
-   Discount
-   Shipping/pickup fee
-   Total

Example:

``` text
Subtotal                Rp 109.000
Diskon                  -Rp 10.000
Biaya antar              Rp 8.000
────────────────────────────────────
Total                    Rp 107.000
```

CTA:

**Checkout**

------------------------------------------------------------------------

# 14. Checkout & Payment

Checkout dibagi menjadi section:

### 1. Delivery

-   Ambil di koperasi
-   Antar ke alamat

### 2. Payment

-   Saldo koperasi
-   QRIS
-   Transfer bank
-   Cash, jika tersedia

### 3. Summary

-   Item
-   Discount
-   Fee
-   Total

### 4. Confirmation

Primary CTA:

**Buat Pesanan**

Jangan menyembunyikan total akhir.

------------------------------------------------------------------------

# 15. Wallet / Saldo Koperasi

Wallet adalah salah satu differentiator utama aplikasi.

Tampilan:

``` text
Saldo Koperasi

Rp 250.000

[ Top Up ]

Transaksi terakhir
+ Rp 100.000   Top Up
- Rp 75.000    Belanja
- Rp 50.000    PPOB
```

Status transaksi:

-   Hijau = masuk
-   Merah = keluar
-   Abu = pending

------------------------------------------------------------------------

# 16. PPOB

PPOB harus dibuat seperti mini marketplace.

Kategori:

-   Pulsa
-   Paket Data
-   PLN
-   BPJS
-   PDAM
-   E-wallet
-   Voucher
-   Layanan lain

Flow:

``` text
Pilih layanan
      ↓
Input nomor
      ↓
Pilih nominal
      ↓
Review
      ↓
Payment
      ↓
Success
```

Pastikan nomor pelanggan selalu dapat direview sebelum pembayaran.

------------------------------------------------------------------------

# 17. Barcode / Scan

Barcode scanner menggunakan full-screen camera.

UI:

``` text
┌─────────────────────────────┐
│ ← Scan Barcode              │
│                             │
│      ┌──────────────┐       │
│      │              │       │
│      │   BARCODE    │       │
│      │              │       │
│      └──────────────┘       │
│                             │
│ Arahkan kamera ke barcode   │
│ produk                      │
│                             │
│      ⚡ Flash     Gallery   │
└─────────────────────────────┘
```

Scanner harus memiliki:

-   Scan frame
-   Flash
-   Gallery import
-   Haptic feedback
-   Success state
-   Error state

------------------------------------------------------------------------

# 18. Status System

Status harus konsisten di seluruh aplikasi.

  Status       Color         Example
  ------------ ------------- ------------
  Success      Green         Selesai
  Processing   Blue          Diproses
  Pending      Orange        Menunggu
  Failed       Red           Gagal
  Cancelled    Neutral/Red   Dibatalkan
  Info         Blue          Informasi

Jangan membuat status hanya berdasarkan warna.

Gunakan:

**Icon + label + color**

------------------------------------------------------------------------

# 19. Button System

## Primary

Suzuki Blue background + white text.

Example:

**Checkout**

## Secondary

White/neutral background + blue border/text.

Example:

**Lanjut Belanja**

## Tertiary

Text button.

Example:

**Lihat Semua**

## Destructive

Red.

Example:

**Batalkan Pesanan**

### Button height

Recommended:

**48px**

Small:

**40px**

Minimum interactive target:

**44×44px**

------------------------------------------------------------------------

# 20. Form & Input

Default input:

-   Height: 48px
-   Radius: 12px
-   Border: `neutral.200`
-   Label: 12--14px
-   Text: 14--16px

States:

``` text
Default
Focus
Filled
Error
Disabled
Success
```

Error harus memiliki text explanation.

Bad:

> Nomor salah

Better:

> Nomor pelanggan harus terdiri dari 12 digit.

------------------------------------------------------------------------

# 21. Card System

Gunakan card untuk:

-   Wallet
-   Product
-   Promo
-   Order
-   Payment
-   Notification

Card anatomy:

``` text
┌─────────────────────────────┐
│ Title                       │
│                             │
│ Content                     │
│                             │
│ Metadata              CTA   │
└─────────────────────────────┘
```

Jangan menggunakan card untuk setiap elemen kecil. Gunakan grouping dan
whitespace terlebih dahulu.

------------------------------------------------------------------------

# 22. Empty State

Empty state harus membantu user melakukan tindakan berikutnya.

Example:

``` text
        🛒

Keranjang masih kosong

Yuk cari kebutuhan harianmu
di Koperasi Suzuki Mart.

[ Mulai Belanja ]
```

------------------------------------------------------------------------

# 23. Loading

Gunakan skeleton untuk content-heavy screen.

Recommended:

-   Product list → skeleton card
-   Home → skeleton section
-   Order history → skeleton list

Hindari spinner full-screen jika content masih dapat ditampilkan
sebagian.

------------------------------------------------------------------------

# 24. Feedback & Motion

Animation harus cepat dan functional.

Recommended:

-   Button feedback: 100--150ms
-   Small transition: 150--200ms
-   Bottom sheet: 200--300ms
-   Page transition: 200--300ms

Gunakan haptic feedback untuk:

-   Barcode berhasil
-   Add to cart
-   Payment success
-   Important confirmation

Jangan menggunakan animasi dekoratif yang menghambat transaksi.

------------------------------------------------------------------------

# 25. Accessibility

Target baseline:

-   Touch target ≥ 44×44px
-   Body text minimum 14px untuk mayoritas UI
-   Jangan gunakan warna sebagai satu-satunya indikator
-   Support dynamic text sizing
-   Kontras teks harus memadai
-   Semua icon penting memiliki accessible label
-   CTA harus tetap jelas ketika text diperbesar

------------------------------------------------------------------------

# 26. UX Rules untuk Lingkungan Pabrik

Karena aplikasi digunakan oleh karyawan pabrik, beberapa konteks harus
menjadi perhatian khusus.

### Shift / jam istirahat

User kemungkinan melakukan transaksi dalam waktu singkat.

Prioritaskan:

-   Search cepat
-   Quick reorder
-   Recent purchases
-   Favorite products
-   One-tap add to cart

### Connectivity

Asumsikan kualitas jaringan tidak selalu ideal.

UX harus:

-   Menampilkan loading state yang jelas.
-   Tidak membuat user mengulang pembayaran tanpa kepastian status.
-   Menampilkan retry.
-   Menyimpan cart secara lokal.
-   Memastikan idempotency pada transaksi backend.

### Checkout

Kurangi jumlah langkah.

Ideal:

**Cart → Checkout → Payment → Success**

Bukan flow panjang dengan banyak halaman.

------------------------------------------------------------------------

# 27. Design Tokens

Contoh struktur token untuk implementation:

``` json
{
  "color": {
    "brand": {
      "primary": "#003399",
      "red": "#E20A17"
    },
    "neutral": {
      "0": "#FFFFFF",
      "50": "#F7F8FA",
      "100": "#EEF0F3",
      "200": "#D9DDE3",
      "500": "#737B87",
      "700": "#3E4652",
      "900": "#101828"
    },
    "semantic": {
      "success": "#16A34A",
      "warning": "#F59E0B",
      "error": "#DC2626",
      "info": "#2563EB"
    }
  },
  "radius": {
    "sm": 8,
    "md": 12,
    "lg": 16,
    "xl": 20,
    "full": 999
  },
  "spacing": {
    "1": 4,
    "2": 8,
    "3": 12,
    "4": 16,
    "5": 20,
    "6": 24,
    "8": 32,
    "10": 40,
    "12": 48
  }
}
```

------------------------------------------------------------------------

# 28. Component Library

Minimum component yang perlu dibuat di Figma/codebase:

### Foundation

-   Colors
-   Typography
-   Spacing
-   Radius
-   Shadow
-   Icon

### Navigation

-   Bottom navigation
-   Top app bar
-   Back button
-   Tab
-   Breadcrumb-like context where needed

### Input

-   Text field
-   Search
-   Number input
-   Select
-   Radio
-   Checkbox
-   Quantity selector

### Commerce

-   Product card
-   Category card
-   Cart item
-   Price
-   Discount
-   Promo banner
-   Order card

### Feedback

-   Toast
-   Snackbar
-   Modal
-   Bottom sheet
-   Alert
-   Badge
-   Status chip
-   Skeleton
-   Empty state

### Payment

-   Wallet card
-   Payment method
-   Transaction item
-   Payment summary
-   Success screen
-   Failure screen

------------------------------------------------------------------------

# 29. Figma Naming Convention

Gunakan struktur:

``` text
Foundation/
  Colors
  Typography
  Spacing
  Radius
  Shadows

Components/
  Button
  Input
  Search
  ProductCard
  CategoryCard
  OrderCard
  WalletCard
  BottomNavigation
  StatusChip

Patterns/
  Checkout
  ProductList
  OrderHistory
  PaymentSummary

Screens/
  Auth
  Home
  Category
  ProductDetail
  Cart
  Checkout
  Payment
  PPOB
  Scan
  Orders
  Profile
```

------------------------------------------------------------------------

# 30. Design QA Checklist

Sebelum sebuah screen dianggap siap development:

-   [ ] Menggunakan color token, bukan arbitrary color.
-   [ ] Typography menggunakan type scale.
-   [ ] Spacing menggunakan 4px grid.
-   [ ] Touch target minimal 44×44px.
-   [ ] Semua interactive state sudah dibuat.
-   [ ] Loading state tersedia.
-   [ ] Empty state tersedia jika diperlukan.
-   [ ] Error state tersedia.
-   [ ] Success state tersedia.
-   [ ] Long text sudah diuji.
-   [ ] Harga menggunakan format Rupiah.
-   [ ] Accessibility label tersedia.
-   [ ] Dark mode dipertimbangkan jika menjadi requirement.
-   [ ] Safe area iOS/Android sudah diperhitungkan.
-   [ ] Screen diuji pada minimal 360px dan 430px width.

------------------------------------------------------------------------

# 31. Recommended Visual Personality

**Keywords:**

> Clean · Trustworthy · Modern · Practical · Corporate · Friendly · Fast

Hindari:

> Overly playful · Luxury · Gaming-like · Excessive gradients ·
> Excessive shadows · Overly dense UI

Target visual:

**"Digital convenience store untuk karyawan Suzuki."**

Bukan:

**"Corporate ERP yang dipindahkan ke mobile."**

------------------------------------------------------------------------

# 32. Relationship dengan Web Platform

Mobile dan Web harus menggunakan **shared design language**, tetapi
bukan shared layout.

### Shared

-   Brand colors
-   Typography
-   Iconography
-   Status colors
-   Component language
-   Spacing principles
-   Product imagery
-   Terminology

### Berbeda

  Web                    Mobile
  ---------------------- --------------------
  Admin / operator       Employee / member
  Dense data             Task-oriented
  Sidebar                Bottom navigation
  Dashboard              Home
  Tables                 Cards/lists
  Advanced filters       Simple filters
  Warehouse management   Shopping
  Finance management     Wallet/transaction
  Reports                Purchase history

**Prinsip utama:**

> Web mengelola koperasi.\
> Mobile digunakan untuk menikmati layanan koperasi.

------------------------------------------------------------------------

# 33. Implementation Recommendation

Untuk development, design system sebaiknya diimplementasikan sebagai
shared tokens.

Contoh:

``` text
Design Tokens
     │
     ├── Colors
     ├── Typography
     ├── Spacing
     ├── Radius
     ├── Shadows
     └── Motion
           │
           ▼
    Component Library
           │
      ┌────┴────┐
      ▼         ▼
    Mobile      Web
      │         │
      ▼         ▼
 Employee     Admin
    App       Platform
```

Jika stack menggunakan Flutter, React Native, atau native Android/iOS,
token tetap sebaiknya didefinisikan secara platform-agnostic terlebih
dahulu.

------------------------------------------------------------------------

# 34. Source & Brand Reference

Suzuki Indonesia's corporate guidance identifies:

-   Suzuki Red --- **PANTONE 485**
-   Suzuki Blue --- **PANTONE 294**

Suzuki's typography guidance describes SuzukiPRO Headline, SuzukiPRO
Regular, and SuzukiPRO Bold, with emphasis on clear/simple headlines and
regular/bold styles for supporting copy.

Reference:

-   Suzuki Indonesia --- Corporate color guidance
-   Suzuki Indonesia --- Corporate typography guidance

------------------------------------------------------------------------

## Final Design Principle

> **Make every transaction feel effortless.**
>
> Pengguna harus bisa membuka aplikasi, menemukan kebutuhan, membeli,
> membayar, dan mengetahui status pesanannya tanpa merasa sedang
> menggunakan sistem enterprise.

Koperasi Suzuki Mart sebaiknya terasa seperti **aplikasi shopping
modern**, dengan **trust dan ketegasan visual Suzuki**, tetapi tetap
ringan, cepat, dan mudah digunakan oleh karyawan.
