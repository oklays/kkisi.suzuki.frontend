# Register defect UAT — DEV LOCAL (checkpoint 15)

Hasil per skenario: lihat `uat-findings-register.md` (dihasilkan dari checklist + hasil mesin). Register ini dipelihara tangan.

## 1. Defect yang direproduksi

**Belum ada defect aplikasi yang direproduksi.** Owner belum memberi hasil uji manual; sampai ada, tidak ada defect yang dapat dinyatakan terkonfirmasi atau tertutup oleh owner.

Walkthrough otomatis (44 skenario UI pada data sintetis DEV LOCAL, tiga kali berturut-turut dari `reset` bersih) menemukan **0 defect aplikasi**. Pada run pertama 5 skenario gagal; semuanya diselidiki dan ternyata **asumsi uji yang salah**, bukan defect (aplikasi benar pada setiap kasus):

| Gejala pada run pertama | Penyebab sebenarnya | Tindakan |
|---|---|---|
| B6 locator ganda | `aria-label="Jenis scan anggota"` ada pada tombol dan daftar pilihan | selector tombol `.pos-kind-trigger` |
| B8 "tidak menawarkan buka kasir" | tutup kasir adalah alur dua langkah (rekap → "Selesaikan Tutup Kasir"); tes berhenti di rekap | tes menyelesaikan alur; rekap diverifikasi (status, total) |
| B10 tidak ada tautan penjualan | baris riwayat menaut ke `/sales/invoice/{id}`, bukan `/sales/{id}`; tombol "Tinjau retur" memang nonaktif sampai jumlah retur dipilih | tes mengikuti alur sebenarnya; retur penuh melalui UI terverifikasi |
| C1 sesekali gagal | tes membaca halaman sebelum navigasi pencarian selesai (balapan di tes) | tes menunggu `?q=` |
| C2, C7 | judul bagian "Potongan payroll" (huruf kecil) dan rute `/laporan/simpanan` (bukan `mutasi-simpanan`) | ekspektasi tes diperbaiki |

## 2. Pengamatan (bukan defect; untuk diketahui owner)

| ID | Pengamatan | Status |
|---|---|---|
| O-01 | Halaman TOKO (`/sales`, `/products`, `/inventory`, `/pos`) memakai menu samping TOKO sendiri tanpa breadcrumb console; kembali ke console lewat "Dashboard" | desain yang ada (POS tetap fokus); owner menilai |
| O-02 | Tombol "Laporan Keuangan" (menu TOKO) dan "Diskon / Promo" (POS) tampil tetapi nonaktif | sudah ada sebelum console; checklist F |
| O-03 | Kasir yang peran akunnya memegang izin manajemen akan mendarat di `/console` (bukan `/pos`) | R1; kebijakan eksplisit tersedia dan **nonaktif** sampai disetujui; uji: `scripts/dev-local.sh r1-trial` |
| O-04 | Retur Cash memerlukan sesi kasir milik pengguna yang melakukan retur hari itu | aturan bisnis yang ada |
| O-05 | Penjualan Kredit menolak total dengan sen (mis. Rp 4.000,10) | aturan yang ada (`PAYMENT_PRECISION`) |

## 3. Template defect dari owner (setiap temuan diklasifikasi dengan salah satu dari enam kelas di bawah)

| Kolom | Isi |
|---|---|
| ID | D-001, D-002, … |
| Skenario | ID checklist (mis. B6) |
| Peran / akun | |
| Langkah | |
| Diharapkan / Aktual | |
| Klasifikasi | defect fungsional · masalah UX/UI · masalah izin · fitur disetujui yang belum ada · keterbatasan data sintetis · pertanyaan aturan bisnis |
| Prioritas | blokir (login, navigasi, akses data berwenang, POS, interpretasi data keuangan) · tinggi · normal |
| Bukti | tangkapan layar (jangan memuat password) |
| Penyelesaian | reproduksi di DEV LOCAL → penyebab → perbaikan minimal → tes regresi → tes terkait → TOKO tidak terganggu → checklist dan jurnal diperbarui |

Defect belum ada hingga owner melaporkannya. Jangan menandai penerimaan owner tanpa hasil owner yang nyata.
