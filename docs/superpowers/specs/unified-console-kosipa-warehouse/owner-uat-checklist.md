# Checklist UAT manual owner — DEV LOCAL (checkpoint 14)

Buka **http://127.0.0.1:3200/login** (lihat `dev-local-guide.md`). Mulai dari data bersih: `bash scripts/dev-local.sh reset` (di `apps/web`). Password akun ada di `apps/web/.env.dev-local-accounts.json`. Isi kolom **Lulus/Gagal** dan **Catatan** (nomor defect, misalnya D-01).

Status: **F** = fungsional & tersedia · **B** = baca saja · **S** = pratinjau sintetis · **N** = nonaktif sengaja · **E** = terblokir bukti/keputusan eksternal · **X** = belum dibangun.

## A. Login & console

| # | Halaman | Akun | Aksi | Hasil yang diharapkan | Status | Lulus/Gagal | Catatan |
|---|---|---|---|---|---|---|---|
| A1 | /login | synth_admin | masuk dengan password benar | masuk ke /console | F | | |
| A2 | /login | synth_admin | password salah | pesan "Username atau password salah."; URL tetap /login tanpa parameter | F | | |
| A3 | /login | synth_admin | ketik password lalu tekan Enter | masuk; alamat browser tidak pernah berisi username/password | F | | |
| A4 | /login | synth_kasir1 | masuk | langsung ke /pos (kasir) | F | | |
| A5 | /login | synth_off | masuk | ditolak (akun nonaktif) | F | | |
| A6 | /login?next=/sales | synth_admin | masuk | langsung ke /sales (deep link dipertahankan) | F | | |
| A7 | /login?next=https://contoh.com | synth_admin | masuk | tetap di aplikasi (/console), tidak keluar situs | F | | |
| A8 | menu akun | synth_admin | keluar (logout), lalu buka /console | diarahkan ke /login | F | | |
| A9 | /console | synth_admin | lihat sidebar | TOKO & POS, Warehouse, Pengaturan; **tidak** ada KOSIPA (admin belum ditautkan) | F | | |
| A10 | /console | synth_koperasi | lihat sidebar | KOSIPA (Keanggotaan, Simpanan, Pinjaman, Payroll), Laporan; tidak ada Warehouse/Pengaturan | F | | |
| A11 | sidebar | siapa saja | klik beberapa menu | menu aktif ditandai; breadcrumb sesuai halaman | F | | |
| A12 | /console (lebar ponsel) | siapa saja | perkecil jendela < 768 px, tekan tombol menu | menu laci terbuka/tertutup; fokus kembali ke tombol | F | | |
| A13 | ketik URL langsung | synth_kasir1 | buka /console/kosipa/payroll dan /console/settings/identitas | "Akses ditolak"/tidak tersedia, tanpa data | F | | |
| A14 | papan ketik | siapa saja | navigasi dengan Tab/Enter di login dan sidebar | semua kontrol dapat dicapai dan dipakai | F | | |
| A15 | sesi | siapa saja | biarkan sesi berakhir (atau hapus cookie), muat ulang | diarahkan ke /login, lalu kembali ke halaman semula setelah masuk | F | | |
| A16 | landing kasir (R1) | — | — | kebijakan landing eksplisit **belum aktif** sampai R1 disetujui | E | | |

## B. TOKO (database sintetis DEV LOCAL)

| # | Halaman | Akun | Aksi | Hasil yang diharapkan | Status | Lulus/Gagal | Catatan |
|---|---|---|---|---|---|---|---|
| B1 | /pos | synth_kasir1 | buka POS | kasir terbuka (cabang SYNTH BRANCH 1), daftar barang tampil | F | | |
| B2 | /pos | synth_kasir1 | cari "SYNTH" / scan barcode `SYNTH1A` | barang ditemukan | F | | |
| B3 | /pos | synth_kasir1 | tambah, ubah jumlah, hapus dari keranjang | total berubah benar; stok kosong tidak bisa ditambah | F | | |
| B4 | /pos | synth_kasir1 | bayar **Cash** dengan uang lebih | struk tampil, kembalian benar | F | | |
| B5 | /pos | synth_kasir1 | bayar **QRIS** | dialog konfirmasi "Sudah Terverifikasi — Proses"; struk "Lunas (QRIS Non-Tunai)" | F | | |
| B6 | /pos | synth_kasir1 | tambah **SYNTH ITEM BRANCH1 B** (`SYNTH1B`), pilih jenis scan "NIK karyawan", masukkan `S9001`, bayar **Kredit Anggota** | sisa limit tampil; transaksi tersimpan (harga sen seperti Rp 4.000,10 ditolak untuk pembayaran ini: aturan `PAYMENT_PRECISION`) | F | | |
| B7 | /pos | synth_kasir1 | cetak / lihat struk | halaman struk terbuka | F | | |
| B8 | /pos | synth_kasir1 | tutup kasir lalu buka kembali | status register berubah sesuai aturan | F | | |
| B9 | /sales | synth_kepala | buka riwayat | transaksi uji B4–B6 tampil | F | | |
| B10 | /pos lalu /sales | synth_kepala | buka kasir **KRS02** dengan saldo awal (mis. Rp 100.000), lalu dari riwayat buat retur atas transaksi Cash | retur `RS9001…` tercatat; refund dari laci supervisor; stok kembali. Tanpa sesi kasir sendiri retur ditolak (`REGISTER_CLOSED`, aturan) | F | | |
| B11 | /products | synth_kepala | buka, cari, ubah barang | perubahan tersimpan (database sintetis) | F | | |
| B12 | /inventory | synth_admin | buat stock opname | dokumen opname tercatat; barang terkunci selama opname | F | | |

## C. KOSIPA (baca saja; data sintetis)

| # | Halaman | Akun | Aksi | Hasil yang diharapkan | Status | Lulus/Gagal | Catatan |
|---|---|---|---|---|---|---|---|
| C1 | Keanggotaan | synth_koperasi | cari `S9001` | anggota SYNTH ANGGOTA SATU | B | | |
| C2 | Anggota 360 | synth_koperasi | buka profil | bagian profil, simpanan, pinjaman, payroll; data sensitif dibatasi | B | | |
| C3 | Simpanan | synth_koperasi | buka buku simpanan 9001, filter jenis | mutasi tercatat; tulisan "Saldo resmi belum tersedia" | B / E | | |
| C4 | Pinjaman | synth_koperasi | daftar → detail PINSYN9001 → jadwal | jadwal angsuran; tanggal tidak valid diberi label; outstanding resmi tidak tersedia | B / E | | |
| C5 | Payroll | synth_koperasi | daftar → batch POTSYN202608A → anggota → rekonsiliasi | angka tercatat; perbandingan "hanya untuk ditinjau" | B / E | | |
| C6 | Payroll | synth_koperasi | filter periode 2026-13 | "Filter tidak valid" | B | | |
| C7 | Laporan | synth_koperasi | pinjaman, payroll, keanggotaan, mutasi simpanan, kualitas data | tampil dengan angka tercatat | B | | |
| C8 | Laporan | synth_koperasi | Unduh CSV | file CSV terunduh; maks. 6 ekspor / 10 menit | B | | |
| C9 | Simpanan/Pinjaman | synth_kasir2 | buka | dapat dibaca | B | | |
| C10 | Payroll / ekspor | synth_kasir2 | buka | ditolak (grup KOSIPA-nya tidak punya payroll; bukan pengguna ekspor) | B | | |
| C11 | aksi keuangan | — | cari tombol setujui/posting/penarikan | **tidak ada** (sengaja) | N | | |

## D. Warehouse (pratinjau sintetis)

| # | Halaman | Akun | Aksi | Hasil yang diharapkan | Status | Lulus/Gagal | Catatan |
|---|---|---|---|---|---|---|---|
| D1 | Pratinjau Warehouse | synth_admin | buka | banner **DATA SINTETIS — BELUM TERHUBUNG KE GUDANG OPERASIONAL** | S | | |
| D2 | Distribusi | synth_admin | daftar → detail dokumen | status, penerimaan, selisih, intent stok (bukan posting) | S | | |
| D3 | Pemetaan | synth_admin | filter status | status dan konversi eksplisit | S | | |
| D4 | Penerimaan & selisih | synth_admin | buka | hanya dokumen yang menunggu/selisih | S | | |
| D5 | semua halaman | synth_admin | cari tombol kirim/terima/posting | tidak ada | N | | |
| D6 | Warehouse | synth_koperasi | buka /console/warehouse | ditolak | S | | |
| D7 | Gudang nyata, posting stok TOKO | — | — | belum terhubung (skema Gudang, D7) | E | | |

## G. Navigasi KOSIPA di console (checkpoint 16)

Laporan pemilik: menu KOSIPA tidak terlihat. Penyebab terverifikasi: menu KOSIPA hanya muncul untuk akun yang **ditautkan** ke akun KOSIPA; `synth_admin` (akun pertama di `.env.dev-local-accounts.json`) sengaja tidak ditautkan, sedangkan dashboard menampilkan KOSIPA sebagai "Segera hadir". Uji KOSIPA dengan **`synth_koperasi`** (semua tampilan) dan **`synth_kasir2`** (staf baca-saja).

| # | Halaman | Akun | Aksi | Hasil yang diharapkan | Status | Lulus/Gagal | Catatan |
|---|---|---|---|---|---|---|---|
| G1 | /login lalu /console | synth_koperasi | masuk, lihat sidebar | grup **KOSIPA**: Ringkasan KOSIPA, Keanggotaan, Simpanan, Pinjaman, Payroll, Laporan | F | | |
| G2 | sidebar | synth_koperasi | klik panah di samping "Laporan" | submenu lima laporan (Keanggotaan, Mutasi simpanan, Pinjaman, Payroll, Kualitas data) terbuka dan tertutup | F | | |
| G3 | semua menu KOSIPA | synth_koperasi | buka satu per satu, termasuk kelima laporan | halaman terbuka; tepat satu menu aktif; breadcrumb "KKISI TB2 / KOSIPA / …" | B | | |
| G4 | Anggota 360 dan turunannya | synth_koperasi | cari `S9001` → profil → buku simpanan; Pinjaman → detail; Payroll → batch → rekonsiliasi | semua terbuka; menu induk tetap aktif; breadcrumb berakhir "Detail"; rekonsiliasi berlabel "hanya untuk ditinjau" | B | | |
| G5 | muat ulang / URL langsung | synth_koperasi | refresh di halaman laporan; ketik URL KOSIPA langsung | tetap masuk; menu, status aktif, dan submenu Laporan benar | F | | |
| G6 | lebar ponsel (375 px) | synth_koperasi | tombol menu → buka "Laporan" → "Kualitas data" | laci menampilkan KOSIPA; menutup setelah pindah halaman; tidak ada scroll horizontal | F | | |
| G7 | Laporan | synth_koperasi lalu synth_kasir2 | cari tautan "Unduh CSV" di laporan pinjaman | koperasi: ada dan file terunduh; kasir2: tidak ada (izin ekspor terpisah) | B | | |
| G8 | menu dan URL | synth_kasir2 | lihat sidebar; buka /console/kosipa/payroll | tanpa Payroll dan Laporan payroll; payroll "Akses ditolak" | B | | |
| G9 | /login | synth_kasir1 | masuk; buka /console/kosipa | mendarat di /pos; tidak ada menu KOSIPA; halaman KOSIPA ditolak | F | | |
| G10 | /console | synth_admin | lihat sidebar dan kartu KOSIPA | tidak ada menu KOSIPA; kartu "Akun belum ditautkan" (bukan "Segera hadir"); administrator tidak dapat menautkan akunnya sendiri | F | | |

## E. Tampilan (375, 390, 768, 1024, 1440 px)

| # | Aksi | Hasil yang diharapkan | Lulus/Gagal | Catatan |
|---|---|---|---|---|
| E1 | ubah lebar jendela pada dashboard, payroll, laporan, pinjaman | tidak ada scroll horizontal halaman; tabel lebar dapat digeser di dalam kartunya | | |
| E2 | baca angka rupiah di layar sempit | terbaca, tidak terpotong/bertumpuk | | |
| E3 | formulir filter di ponsel | satu kolom, tombol dapat ditekan | | |

## F. Belum tersedia (bukan defect)

Saldo resmi dan paritas keuangan (O1/O5), pemetaan kolom toko payroll (D5), penulis keuangan KOSIPA (D1–D4, D6), Warehouse nyata dan posting stok (skema Gudang, D7, W5), landing kasir eksplisit (R1).

Tombol yang tampil tetapi **sengaja nonaktif / belum diimplementasikan** (ada sejak sebelum console, bukan defect baru): **Laporan Keuangan** (menu TOKO/POS), **Diskon / Promo** ("Belum tersedia") di panel pembayaran POS, kartu modul **Angsuran** ("Dalam pengembangan") di dashboard KOSIPA.
