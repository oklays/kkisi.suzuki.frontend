# Temuan UAT & register defect — DEV LOCAL

Kolom **Mesin** = hasil walkthrough otomatis (`tests/owner-uat-walkthrough-browser.mjs`) pada data sintetis DEV LOCAL; ini **bukan** penerimaan owner. Kolom **Owner** diambil apa adanya dari sel *Lulus/Gagal* di `owner-uat-checklist.md` yang diisi owner (PASS / FAIL / BLOCKED); sel kosong = NOT TESTED; isian yang tidak dikenali dilaporkan sebagai INVALID dan dihitung NOT TESTED.

Dihasilkan: 2026-10-18 dari checklist + results.json. Jenis: F fungsional · B baca saja · S pratinjau sintetis · N nonaktif sengaja · E terblokir eksternal.

## Ringkasan

| | PASS | FAIL | BLOCKED | NOT TESTED / belum otomatis |
|---|---|---|---|---|
| **Owner** (46 baris) | 0 | 0 | 0 | 46 |
| Mesin | 44 | 0 | — | 2 |

**Penerimaan owner: BELUM ADA** — status ini tidak pernah diturunkan dari hasil mesin.

## A. Login & console

| ID | Peran | Langkah (ringkas) | Hasil yang diharapkan | Jenis | Mesin | Catatan mesin | Owner | Catatan owner |
|---|---|---|---|---|---|---|---|---|
| A1 | synth_admin | masuk dengan password benar | masuk ke /console | F | PASS |  | NOT TESTED |  |
| A2 | synth_admin | password salah | pesan "Username atau password salah."; URL tetap /login tanpa parameter | F | PASS |  | NOT TESTED |  |
| A3 | synth_admin | ketik password lalu tekan Enter | masuk; alamat browser tidak pernah berisi username/password | F | PASS |  | NOT TESTED |  |
| A4 | synth_kasir1 | masuk | langsung ke /pos (kasir) | F | PASS |  | NOT TESTED |  |
| A5 | synth_off | masuk | ditolak (akun nonaktif) | F | PASS |  | NOT TESTED |  |
| A6 | synth_admin | masuk | langsung ke /sales (deep link dipertahankan) | F | PASS |  | NOT TESTED |  |
| A7 | synth_admin | masuk | tetap di aplikasi (/console), tidak keluar situs | F | PASS |  | NOT TESTED |  |
| A8 | synth_admin | keluar (logout), lalu buka /console | diarahkan ke /login | F | PASS |  | NOT TESTED |  |
| A9 | synth_admin | lihat sidebar | TOKO & POS, Warehouse, Pengaturan; **tidak** ada KOSIPA (admin belum ditautkan) | F | PASS |  | NOT TESTED |  |
| A10 | synth_koperasi | lihat sidebar | KOSIPA (Keanggotaan, Simpanan, Pinjaman, Payroll), Laporan; tidak ada Warehouse/Pengaturan | F | PASS |  | NOT TESTED |  |
| A11 | siapa saja | klik beberapa menu | menu aktif ditandai; breadcrumb sesuai halaman | F | PASS | active item + breadcrumb follow the page on 3 KOSIPA menus | NOT TESTED |  |
| A12 | siapa saja | perkecil jendela < 768 px, tekan tombol menu | menu laci terbuka/tertutup; fokus kembali ke tombol | F | PASS |  | NOT TESTED |  |
| A13 | synth_kasir1 | buka /console/kosipa/payroll dan /console/settings/identitas | "Akses ditolak"/tidak tersedia, tanpa data | F | PASS |  | NOT TESTED |  |
| A14 | siapa saja | navigasi dengan Tab/Enter di login dan sidebar | semua kontrol dapat dicapai dan dipakai | F | PASS | sidebar reachable by Tab+Enter; login order username, password, button | NOT TESTED |  |
| A15 | siapa saja | biarkan sesi berakhir (atau hapus cookie), muat ulang | diarahkan ke /login, lalu kembali ke halaman semula setelah masuk | F | PASS | expired session -> /login?next=…, back to the same page after sign-in | NOT TESTED |  |
| A16 | — | — | kebijakan landing eksplisit **belum aktif** sampai R1 disetujui | E | NOT AUTOMATED |  | NOT TESTED |  |

## B. TOKO (database sintetis DEV LOCAL)

| ID | Peran | Langkah (ringkas) | Hasil yang diharapkan | Jenis | Mesin | Catatan mesin | Owner | Catatan owner |
|---|---|---|---|---|---|---|---|---|
| B1 | synth_kasir1 | buka POS | kasir terbuka (cabang SYNTH BRANCH 1), daftar barang tampil | F | PASS |  | NOT TESTED |  |
| B2 | synth_kasir1 | cari "SYNTH" / scan barcode `SYNTH1A` | barang ditemukan | F | PASS | barcode SYNTH1B finds exactly one item; text search finds several | NOT TESTED |  |
| B3 | synth_kasir1 | tambah, ubah jumlah, hapus dari keranjang | total berubah benar; stok kosong tidak bisa ditambah | F | PASS | add, +1, -1, clear all; out-of-stock item is not addable | NOT TESTED |  |
| B4 | synth_kasir1 | bayar **Cash** dengan uang lebih | struk tampil, kembalian benar | F | PASS | Transaksi tersimpan · S126101800001 Total Rp 4.000,10 · Cash Bayar Rp 10.000 · Kembalian Rp 5.999,90 Cetak Ulang Struk L | NOT TESTED |  |
| B5 | synth_kasir1 | bayar **QRIS** | dialog konfirmasi "Sudah Terverifikasi — Proses"; struk "Lunas (QRIS Non-Tunai)" | F | PASS |  | NOT TESTED |  |
| B6 | synth_kasir1 | tambah **SYNTH ITEM BRANCH1 B** (`SYNTH1B`), pilih jenis scan "NIK karyawan", masukkan `S9001`, bayar **Kredit Anggota** | sisa limit tampil; transaksi tersimpan (harga sen seperti Rp 4.000,10 ditolak untuk pembayaran ini: aturan `PAYMENT_PRECISION`) | F | PASS | member found by NIK, Kredit preselected, sale saved | NOT TESTED |  |
| B7 | synth_kasir1 | cetak / lihat struk | halaman struk terbuka | F | PASS | receipt page /pos/receipt/9018 renders | NOT TESTED |  |
| B8 | synth_kasir1 | tutup kasir lalu buka kembali | status register berubah sesuai aturan | F | PASS | recap shown (status/total), closing completed, "Buka kasir" offered | NOT TESTED |  |
| B9 | synth_kepala | buka riwayat | transaksi uji B4–B6 tampil | F | PASS | rows/links visible: 9 | NOT TESTED |  |
| B10 | synth_kepala | buka kasir **KRS02** dengan saldo awal (mis. Rp 100.000), lalu dari riwayat buat retur atas transaksi Cash | retur `RS9001…` tercatat; refund dari laci supervisor; stok kembali. Tanpa sesi kasir sendiri retur ditolak (`REGISTER_CLOSED`, aturan) | F | PASS | supervisor opened own register KRS02, returned an item through the form (review -> confirm); return RS9001… listed | NOT TESTED |  |
| B11 | synth_kepala | buka, cari, ubah barang | perubahan tersimpan (database sintetis) | F | PASS | detail dialog and edit form open (save: API-verified) | NOT TESTED |  |
| B12 | synth_admin | buat stock opname | dokumen opname tercatat; barang terkunci selama opname | F | PASS | draft saved from the UI | NOT TESTED |  |

## C. KOSIPA (baca saja; data sintetis)

| ID | Peran | Langkah (ringkas) | Hasil yang diharapkan | Jenis | Mesin | Catatan mesin | Owner | Catatan owner |
|---|---|---|---|---|---|---|---|---|
| C1 | synth_koperasi | cari `S9001` | anggota SYNTH ANGGOTA SATU | B | PASS |  | NOT TESTED |  |
| C2 | synth_koperasi | buka profil | bagian profil, simpanan, pinjaman, payroll; data sensitif dibatasi | B | PASS | profile, savings, loans, payroll sections; no 16-digit identifiers | NOT TESTED |  |
| C3 | synth_koperasi | buka buku simpanan 9001, filter jenis | mutasi tercatat; tulisan "Saldo resmi belum tersedia" | B / E | PASS |  | NOT TESTED |  |
| C4 | synth_koperasi | daftar → detail PINSYN9001 → jadwal | jadwal angsuran; tanggal tidak valid diberi label; outstanding resmi tidak tersedia | B / E | PASS |  | NOT TESTED |  |
| C5 | synth_koperasi | daftar → batch POTSYN202608A → anggota → rekonsiliasi | angka tercatat; perbandingan "hanya untuk ditinjau" | B / E | PASS |  | NOT TESTED |  |
| C6 | synth_koperasi | filter periode 2026-13 | "Filter tidak valid" | B | PASS |  | NOT TESTED |  |
| C7 | synth_koperasi | pinjaman, payroll, keanggotaan, mutasi simpanan, kualitas data | tampil dengan angka tercatat | B | PASS |  | NOT TESTED |  |
| C8 | synth_koperasi | Unduh CSV | file CSV terunduh; maks. 6 ekspor / 10 menit | B | PASS |  | NOT TESTED |  |
| C9 | synth_kasir2 | buka | dapat dibaca | B | PASS |  | NOT TESTED |  |
| C10 | synth_kasir2 | buka | ditolak (grup KOSIPA-nya tidak punya payroll; bukan pengguna ekspor) | B | PASS |  | NOT TESTED |  |
| C11 | — | cari tombol setujui/posting/penarikan | **tidak ada** (sengaja) | N | PASS | no financial action control on any KOSIPA page | NOT TESTED |  |

## D. Warehouse (pratinjau sintetis)

| ID | Peran | Langkah (ringkas) | Hasil yang diharapkan | Jenis | Mesin | Catatan mesin | Owner | Catatan owner |
|---|---|---|---|---|---|---|---|---|
| D1 | synth_admin | buka | banner **DATA SINTETIS — BELUM TERHUBUNG KE GUDANG OPERASIONAL** | S | PASS |  | NOT TESTED |  |
| D2 | synth_admin | daftar → detail dokumen | status, penerimaan, selisih, intent stok (bukan posting) | S | PASS |  | NOT TESTED |  |
| D3 | synth_admin | filter status | status dan konversi eksplisit | S | PASS |  | NOT TESTED |  |
| D4 | synth_admin | buka | hanya dokumen yang menunggu/selisih | S | PASS |  | NOT TESTED |  |
| D5 | synth_admin | cari tombol kirim/terima/posting | tidak ada | N | PASS |  | NOT TESTED |  |
| D6 | synth_koperasi | buka /console/warehouse | ditolak | S | PASS |  | NOT TESTED |  |
| D7 | — | — | belum terhubung (skema Gudang, D7) | E | NOT AUTOMATED |  | NOT TESTED |  |
