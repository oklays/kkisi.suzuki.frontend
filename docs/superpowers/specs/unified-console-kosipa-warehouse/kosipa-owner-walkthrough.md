# Panduan uji manual owner — KOSIPA di console (checkpoint 16)

**Status penerimaan owner: BELUM ADA.** Dokumen ini hanya panduan urutan uji (± 30 menit). Hasil dicatat di `owner-uat-checklist.md` (kolom *Lulus/Gagal* dan *Catatan*); sel owner sengaja dibiarkan kosong sampai Anda mengisinya. Hasil mesin tidak pernah dihitung sebagai hasil owner.

Alamat: **http://127.0.0.1:3200/login** (produksi-lokal, data sintetis). Password: `apps/web/.env.dev-local-accounts.json` (kunci setelah `synth_`; jangan disalin ke chat/tiket/tangkapan layar). Data uji Anda **tidak direset**; produk salinan (jika sudah di-seed) tetap ada. Perintah: `bash scripts/dev-local.sh status` (cek) · `restart prod` (nyalakan ulang hanya server yang dikelola skrip).

## Urutan uji

| Langkah | Akun | Lakukan | Harapan | Baris checklist |
|---|---|---|---|---|
| 1 | `synth_koperasi` | masuk; lihat sidebar dan dashboard | grup **KOSIPA** (Ringkasan, Keanggotaan, Simpanan, Pinjaman, Payroll, Laporan) | G1 |
| 2 | `synth_koperasi` | buka **Ringkasan KOSIPA** | menu yang diizinkan, status baca-saja, batasan data; tanpa angka keuangan | G1, G3 |
| 3 | `synth_koperasi` | panah **Laporan** → buka kelima laporan | submenu terbuka/tertutup; satu menu aktif; breadcrumb benar | G2, G3 |
| 4 | `synth_koperasi` | Keanggotaan: cari `S9001` → profil → buku simpanan; Pinjaman → `PINSYN9001` → jadwal | data tercatat; data sensitif dibatasi; label "saldo resmi belum tersedia" | G4, C1–C4 |
| 5 | `synth_koperasi` | Payroll → batch `POTSYN202608A` → anggota → rekonsiliasi kredit TOKO | perbandingan berlabel "hanya untuk ditinjau"; tidak ada tombol buat/setujui/posting | G4, C5, C11 |
| 6 | `synth_koperasi` | laporan: ubah filter (mis. periode `2026-13`) | filter tidak valid ditolak dengan pesan, bukan angka nol | C6, C7 |
| 7 | `synth_koperasi` | laporan pinjaman → **Unduh CSV** | file terunduh (maks. 6 ekspor / 10 menit) | G7, C8 |
| 8 | `synth_koperasi` | muat ulang halaman laporan; hapus cookie lalu muat ulang | tetap di tempat; lalu `/login?next=…` dan kembali ke halaman semula | G5, A15 |
| 9 | `synth_koperasi` | persempit jendela < 768 px; buka laci menu, Laporan, Kualitas data | laci menampilkan KOSIPA; menutup setelah pindah halaman; tanpa scroll horizontal | G6, E1–E3 |
| 10 | `synth_kasir2` | masuk; lihat sidebar; buka `/console/kosipa/payroll`; cari "Unduh CSV" | tanpa Payroll/Laporan payroll; payroll "Akses ditolak"; tanpa CSV | G7, G8, C9, C10 |
| 11 | `synth_kasir1` | masuk; buka `/console/kosipa` | mendarat di `/pos`; KOSIPA ditolak | G9 |
| 12 | `synth_admin` | masuk; lihat sidebar dan kartu KOSIPA | tanpa menu KOSIPA; kartu "Akun belum ditautkan" (bukan "Segera hadir"); administrasi (Tautan Akun KOSIPA) tetap ada | G10, A9 |

Catatan keamanan yang **tidak** terlihat di layar (bukti mesin, bukan baris owner): pembacaan data KOSIPA dicatat dalam audit **sebelum** data dikirim, dan gagal-tertutup bila audit tidak tersedia; tautan yang dicabut berlaku pada permintaan berikutnya; administrator tidak dapat menautkan akunnya sendiri (`SELF_LINK`). Bukti: `console-persona-matrix.test.mjs`, `console-kosipa-nav-browser.mjs` (N12), `scripts/uat-run.sh`.

## Jika menemukan masalah

1. Catat di `owner-uat-checklist.md`: **Gagal** (atau **Terblokir**) pada baris yang bersangkutan, dan nomor defect di *Catatan*.
2. Tambahkan entri `D-002`, `D-003`, … di `uat-defect-register.md` memakai template §3: skenario, akun, langkah, diharapkan/aktual, klasifikasi (defect fungsional · UX/UI · izin · fitur disetujui yang belum ada · keterbatasan data sintetis · pertanyaan aturan bisnis), prioritas, bukti (tangkapan layar tanpa password).
3. Reproduksi: `bash scripts/dev-local.sh status`; masuk dengan akun yang sama; catat URL tepat dan jam kejadian (log: `/tmp/kkisi-devlocal-3200.log`).
4. Engineering memproses: reproduksi → akar masalah → perbaikan minimal → tes regresi → tes TOKO → register dan jurnal diperbarui. Tidak ada push/merge sebelum Anda mengizinkan.

## Yang belum tersedia (bukan defect)

Saldo resmi simpanan/pinjaman dan paritas payroll (O1/O5), pemetaan kolom toko (D5), halaman Angsuran, semua penulis keuangan KOSIPA, Warehouse nyata dan posting stok.
