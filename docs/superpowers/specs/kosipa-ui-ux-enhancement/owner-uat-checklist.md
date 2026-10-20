# Owner Manual UAT — KOSIPA UI/UX

Buka **http://127.0.0.1:3203/login**. Semua data sintetis. Password tetap di private fixture existing; jangan menyalinnya ke hasil UAT. Engineering PASS tidak mengisi kolom owner. Tidak perlu reset data. Gunakan synth_koperasi (operator/export), synth_kasir2 (tanpa payroll/export), synth_admin (unlinked), synth_kasir1 (POS).

| # | Skenario | Bukti engineering | Hasil owner PASS/FAIL/BLOCKED | Catatan |
|---|---|---|---|---|
| 1 | Cari anggota → profil melalui navigasi | Private query, result/profile, 59 UI checks | | |
| 2 | Bedakan mutasi tercatat dan saldo resmi unavailable | Savings/header/provenance screenshots | | |
| 3 | Bedakan A recorded/B derived/C informasi | Rekonsiliasi bertanda Untuk tinjauan | | |
| 4 | Viewer tanpa grant tidak dapat export UI/API | kasir2 no control + API403 | | |
| 5 | Export authorized; error besar/throttle jelas | CSV download + UI413/429 response cases | | |
| 6 | Failed/truncated scan bukan nol | UI-state tests; count tidak dirender | | |
| 7 | Duplikat pinjaman/tanggal invalid tetap jelas | PINSYN9005 + schedule cursor/labels | | |
| 8 | Desktop/tablet/mobile nyaman dan keyboard | 375/390/768/1024/1440, Axe subset + spot check | | |
| 9 | Link revoked gagal tertutup pada read berikutnya | Existing unit contracts + forged target denied; live revoke hanya fixture terpisah | | |
| 10 | Admin tanpa link mendapat state tepat | Ketiga role/page matrix; no financial leak | | |
| 11 | TOKO POS/login/landing tetap | Nav13 + readonly walkthrough32 + existing unit regression; tidak membayar transaksi owner | | |
| 12 | Back/refresh/empty/invalid/loading/outage konsisten | Queries private tidak dipersist; field/reset, skeleton dan outage checks | | |

Tambahan owner: nilai kenyamanan density comfortable, copy finansial dan urutan tugas. Ukur waktu cari anggota→pinjaman/payroll sebelum/after pada kondisi setara bila ingin menerima target perbaikan >=20%; engineering belum mengklaim target itu tercapai.

Untuk FAIL/BLOCKED, catat route, viewport, akun sintetis, langkah, expected/actual dan referensi screenshot tanpa credential. Owner acceptance hanya boleh dicatat setelah keputusan eksplisit owner; tabel ini sengaja belum diisi.
