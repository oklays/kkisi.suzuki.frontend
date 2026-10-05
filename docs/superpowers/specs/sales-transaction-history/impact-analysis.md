# Change Impact — Sales Transaction History

## 1. Area dan strategi perubahan

| Area | Perubahan yang direncanakan | Risiko / mitigasi |
|---|---|---|
| Presentation | `/sales`, `/sales/invoice/[id]`, list/filter/detail/payment, sidebar `active="sales"` | Reuse shell/token CSS; sesi read tidak memunculkan kontrol buka/tutup kasir |
| Navigasi | `PosShell`, `PosSession`, caller POS/inventory/products/sales | Capability berasal dari permission server; akun sales_view-only dapat masuk langsung |
| Application/domain | Query validation, read projections, eligibility cetak | Tidak memakai checkout use case untuk riwayat; domain tetap bebas Prisma/Next |
| Infrastructure/API | SELECT repository, GET routes, guard, mapping error | Parent/child company-scope, parameterized SQL, payload allowlist |
| Receipt existing | Allow `sales_add OR sales_view`, reprint mode dan eligibility | Kasir sales_add-only tetap dapat mencetak sesudah checkout; history tak memperluas writer |
| Database | SELECT tabel existing; tanpa schema/data changes | Tidak ada provision, DDL, backfill, view, index baru, atau grants otomatis |
| Auth/tenant | sales_view; payments butuh sales_payment_view juga | Tidak mewarisi bypass role admin legacy; active branch dari auth session |
| Queue/worker | Tidak ada | Tidak menambah print queue atau event ledger |
| Integrasi | Browser print existing | Dialog print bukan konfirmasi printer sukses; tak menulis print counter |
| Deploy | Rilis kode saja, reader existing | Gate reader privileges/schema/latensi; rollback kode tanpa rollback SQL |

Layer yang benar mengikuti workspace aktual: `apps/web` presentation/composition/persistence, `packages/application` use cases/ports, `packages/domain` pure policies. Template skill `apps → features → (ui, core)` diadaptasi ke dependency rule repo, bukan alasan membuat package baru. Mock/fake hanya untuk tests; data history runtime harus menggunakan adapter live SELECT-only. Tidak ada fallback ke katalog fixture atau transaksi synthetic saat layanan gagal.

## 2. Perbaikan wajib dalam scope

| Masalah existing | Rencana | Efek terhadap kompatibilitas |
|---|---|---|
| Rentang tanggal legacy lintas bulan/tahun | Predicate sales_date utuh, inclusive dates | Membetulkan pencarian, tidak mengubah tanggal tersimpan |
| OR search/lookup hanya ID | Predicate tenant luar grouping OR dan scope parent-child | Memperketat akses, tidak menyalin bug legacy |
| Payment display selalu total | Pisahkan total transaksi, paid_amount, dan change yang valid | Histori partial/unpaid tetap jujur |
| Izin detail/print/payment berbeda dari tombol | Matriks permission eksplisit | sales_view-only mendapat detail/cetak; payment tetap granular |
| Master berubah/hilang | Header nama pelanggan tersimpan; item label current diberi provenance | Nilai uang tetap dari sale/line, tak mengambil harga current |
| Plafon current/cross-branch pada struk lama | Reprint mode tidak mengambil/menampilkan plafon | Tidak mengklaim snapshot historis atau membuka aggregate lintas cabang |
| Tax/retur/unknown method tidak didukung struk | Render tax tersimpan jika dapat dipastikan; eligibility fail closed untuk kasus ambigu | Semua row tetap dapat dibaca; cetak reguler dibatasi dan diberi alasan |

## 3. Backlog di luar delivery pertama

| Pengembangan | Trigger untuk merencanakan | Prasyarat / batas |
|---|---|---|
| Halaman riwayat register `/kasir/buka_kasir` dan detail register | Dibutuhkan operasi buka/tutup dan rekonsiliasi penuh | Spec terpisah, master_kasir, scope company; saldo lama jangan ditulis ulang |
| A4 invoice dan export CSV/Excel | Ada kebutuhan pembukuan/ekspor disetujui | Format, privasi, batas volume/permission ditentukan dahulu |
| Edit, void, refund, retur, tambah/hapus pembayaran | Ada kebutuhan mutasi disetujui | Review single-writer, stok, kredit, register, idempotency dan rollback |
| Cetak format retur/metode legacy lain/charges ambigu | Sampel existing menunjukkan kebutuhan | Audit targeted semantik; tetap tanpa schema baru dalam constraint saat ini |
| Snapshot label barang untuk transaksi masa depan | Dibutuhkan bukti nama pada waktu transaksi | Evaluasi pemakaian field existing setelah audit semantik; tidak mengubah checkout pada delivery baca ini |
| Audit perubahan dan bukti cetak | Pengguna secara khusus meminta jejak aktivitas | Tidak tersedia dari daftar transaksi saja; jangan membuat ledger baru untuk menutup gap |
| Optimasi query lanjutan | Benchmark gagal | Optimasi SQL/batas query dahulu; DDL/index baru tetap dilarang |

## 4. Gate dan rollback

Source audit selesai saat spec ditulis; runtime evidence belum ada. Implementasi boleh dilakukan setelah review spec. Sebelum aktivasi pada target yang disetujui, konfirmasi mapping kolom, SELECT privileges, permission, dan EXPLAIN pada staging existing. Tidak menjalankan setup/reset/seed/provision dari tests existing.

Rollback: kembali ke build sebelumnya atau cabut link/rute Sales pada rilis berikutnya; tidak mengubah permission atau schema DB. Pertahankan alur cetak checkout dan semua transaksi existing. Rollback SQL: **tidak diperlukan dan tidak boleh dijalankan**, karena fitur tidak menulis tabel operasional. Auth store session housekeeping tetap perilaku existing.
