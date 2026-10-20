# Panduan DEV LOCAL — uji langsung oleh owner (checkpoint 14)

Status: **siap dipakai untuk uji manual lokal.** Bukan staging dan bukan produksi. Semua data **sintetis** (`synth_*`, "SYNTH …"); tidak ada angka yang boleh dibaca sebagai angka produksi.

## 1. Akses

| | |
|---|---|
| URL | **http://127.0.0.1:3200/login** (mode produksi lokal: build `next start`) |
| Mode pengembangan | `scripts/dev-local.sh start dev` → http://127.0.0.1:3201. Next.js hanya mengizinkan **satu** `next dev` per folder: jika server `next dev` Anda sendiri sedang berjalan (mis. di :3000), hentikan dulu atau pakai mode produksi |
| Prasyarat | Docker Desktop berjalan, container `kkisi-staging` (MariaDB lokal, 127.0.0.1:3307), `pnpm install` dan `pnpm build` sudah pernah dijalankan |

Perintah (dari folder `apps/web`):

```sh
docker start kkisi-staging
bash scripts/dev-local.sh reset          # pertama kali / untuk mengulang dari data bersih: seed sintetis, bangun ulang DB DEV LOCAL, jalankan server
bash scripts/dev-local.sh start          # menjalankan lagi tanpa reset (mode produksi, :3200)
bash scripts/dev-local.sh status         # cek URL dan proses
bash scripts/dev-local.sh accounts       # daftar akun uji dan perannya
bash scripts/dev-local.sh links          # pasang ulang tautan KOSIPA (perlu setelah scripts/uat-run.sh dijalankan)
bash scripts/dev-local.sh seed-products   # OPSIONAL: salin katalog produk saja (5.125 barang cabang 1 salinan 30 Sep) ke SYNTH BRANCH 1; ulangi setelah setiap reset (atau: reset --with-products)
bash scripts/dev-local.sh flag-states    # KOSIPA nonaktif / console nonaktif / store console mati, di instance sementara :3202 (server utama tidak disentuh)
bash scripts/dev-local.sh r1-trial       # uji kebijakan landing R1 di instance sementara :3202 (peran kasir sintetis diberi izin manajemen sementara, lalu dikembalikan); server utama tidak disentuh
bash scripts/dev-local.sh stop           # menghentikan server DEV LOCAL (tidak menyentuh server lain)
```

Setelah ada perubahan kode: `pnpm build` di root repository, lalu `scripts/dev-local.sh stop && scripts/dev-local.sh start`.

## 2. Isolasi data (diverifikasi otomatis setiap start)

* `scripts/lib/dev-local-preflight.mjs` menghitung lingkungan **efektif** (profil `.env.dev-local` di atas `.env.local`) dan **menolak start** bila ada target database yang bukan: `kkisi_devlocal_staging`, `kkisi_auth_staging`, `kkisi_console_staging` di `127.0.0.1:3307`, atau memakai akun root/admin, atau `APP_ENV=production`, atau `CONSOLE_LANDING_ROLES` terisi. Diuji: `tests/dev-local-preflight.test.mjs`.
* `kkisi_devlocal_staging` = **struktur** salinan legacy lokal (tanpa satu baris pun dari sana) + **baris sintetis** dari `kkisi_e2e_legacy` + pengaturan uji (lihat §4). Reset hanya menghapus database ini dan hanya jika bertanda `_devlocal_marker`.
* Akun database DEV LOCAL terpisah (`devlocal_*`, termasuk akun console store sendiri). Hak penulisnya disalin dari akun penulis staging lokal yang sudah ada (POS, register, retur, produk) dan hak penulis inventory yang terdokumentasi; tidak ada hak yang diperlebar.
* Terbukti pada run ini: transaksi uji hanya tercatat di `kkisi_devlocal_staging`; salinan 30 Sep (`kkisi_staging`) dan skema sintetis sumber tidak berubah.

## 3. Feature flag DEV LOCAL

`CONSOLE_ENABLED=true`, `KOSIPA_READ_ENABLED=true`, `WAREHOUSE_PREVIEW_ENABLED=true`, `KOSIPA_EXPORT_ENABLED=true` dengan `KOSIPA_EXPORT_USER_IDS=900002` (hanya `synth_koperasi`), `POS/PRODUCTS/SALES_RETURN/INVENTORY_WRITES_ENABLED=1` **hanya ke database sintetis DEV LOCAL**. Tetap nonaktif: `CONSOLE_LANDING_ROLES` (R1 belum disetujui), `KOSIPA_STORE_COLUMN_MAP` (D5), semua penulis keuangan KOSIPA dan posting stok Warehouse (tidak ada di aplikasi).

## 4. Akun uji

Password **tidak** dicetak di mana pun: buka `apps/web/.env.dev-local-accounts.json` (file lokal, diabaikan Git), kuncinya nama setelah `synth_`. Jangan salin password ke Git, chat, atau tiket.

| Akun | Peran uji (HANYA lokal) | Catatan |
|---|---|---|
| `synth_admin` | Administrator console + pratinjau Warehouse | role 1 (pemilih cabang); izin uji: kelola tautan, penjualan, produk, inventory. **Sengaja tidak ditautkan ke KOSIPA**: menu KOSIPA tidak tampil dan kartu KOSIPA menyatakan "Akun belum ditautkan" (peran administrator saja tidak membuka data keuangan; aplikasi juga menolak administrator menautkan akunnya sendiri, `SELF_LINK`) |
| `synth_kepala` | Supervisor TOKO (cabang 9001) | role 3 diaktifkan khusus DEV LOCAL (seed sintetis menonaktifkannya sebagai kasus negatif) |
| `synth_kasir1` | Kasir TOKO (cabang 9001) | hanya `sales_add` → langsung ke /pos; dipakai juga untuk uji akses tanpa izin |
| `synth_koperasi` | Administrator KOSIPA — **akun utama untuk menguji menu KOSIPA** | ditautkan ke `synth_ksp` (semua tampilan KOSIPA); satu-satunya pengguna ekspor CSV |
| `synth_kasir2` | Staf KOSIPA baca-saja (cabang 9002) | ditautkan ke `synth_ksp_staff` (anggota, simpanan, pinjaman; tanpa payroll) |
| `synth_off` / `synth_nobranch` | Pengguna terbatas | akun nonaktif / cabang nonaktif → tidak bisa masuk |

Operator Warehouse **tidak punya peran sendiri** (keputusan W5 belum ada); pratinjau Warehouse dibuka lewat kemampuan yang ada (pemilih cabang + `inventory_view`), di sini `synth_admin`.

## 5. Batasan yang perlu diketahui

* Saldo resmi simpanan/pinjaman, paritas payroll, pemetaan kolom toko: **belum tersedia** (menunggu bukti operator O1/O5 dan D5). Halaman menampilkannya sebagai "belum tersedia", bukan angka tebakan.
* Warehouse: **data sintetis**, tidak terhubung ke Gudang, tanpa aksi operasional.
* `scripts/uat-run.sh` mencabut tautan identitas sintetis di console store bersama; jalankan `scripts/dev-local.sh links` sesudahnya. Password DEV LOCAL disimpan terpisah (`.env.dev-local-accounts.json`) sehingga seed e2e berikutnya tidak membuatnya tidak berlaku.
* Skema sintetis tidak memiliki data merek/satuan/pajak; halaman Produk tetap terbuka tetapi daftar master lebih sedikit dibanding data nyata.

## 6. Stabilitas yang diverifikasi (checkpoint 15)

* **Restart tanpa reset:** `stop` lalu `start` mempertahankan login dan tautan KOSIPA (7 akun diuji; `synth_off`/`synth_nobranch` tetap ditolak).
* **Reset konsisten:** dua `reset` berturut-turut menghasilkan sidik jari data yang sama (284 tabel, baris identik).
* **Kredensial:** `.env.dev-local` dan `.env.dev-local-accounts.json` bermode 600 dan diabaikan Git; tidak ada password sintetis di log aplikasi maupun 728 file yang dilacak Git; password tidak muncul di URL (diuji setiap run oleh `login-security-browser.mjs` dan walkthrough).
* **Akun console terpisah:** DEV LOCAL memakai akun console sendiri, sehingga server `next dev` Anda di :3000 tidak berebut batas koneksi.
* **Penolakan tempat salah:** skrip reset menolak target selain `kkisi_devlocal_staging` dan hanya menghapusnya jika bertanda `_devlocal_marker` (tes statis `dev-local-preflight.test.mjs`).
* **Walkthrough UI otomatis (bukan penerimaan owner):** `node tests/owner-uat-walkthrough-browser.mjs` setelah `reset` → 44 skenario, 3 kali berturut-turut tanpa kegagalan; hasil per baris di `uat-findings-register.md`.

## 7. Cara menyerahkan hasil UAT owner

1. Jalankan `bash scripts/dev-local.sh reset` (di `apps/web`) untuk data bersih, lalu buka http://127.0.0.1:3200/login.
2. Isi kolom **Lulus/Gagal** dan **Catatan** di `owner-uat-checklist.md` per baris. Nilai yang dikenali: `PASS`/`Lulus`, `FAIL`/`Gagal`, `BLOCKED`/`Terblokir`; kosong = belum diuji. Isian lain dilaporkan sebagai INVALID dan dihitung belum diuji (tidak ditebak).
3. Untuk setiap FAIL/BLOCKED, tambahkan entri `D-001`, `D-002`, … di `uat-defect-register.md` (template §3). Jangan menempelkan password pada tangkapan layar.
4. Engineering menjalankan `node scripts/lib/render-uat-findings.mjs <results.json> <docs/…/uat-findings-register.md>`: ringkasan owner, daftar triase FAIL/BLOCKED dan penerimaan diperbarui. **Penerimaan owner hanya ada jika owner menyatakannya tertulis**; tidak ada alat yang menurunkannya dari hasil mesin.
5. Setiap defect yang terkonfirmasi diproses: reproduksi di DEV LOCAL → akar masalah → perbaikan minimal → tes regresi → tes TOKO → register dan jurnal diperbarui.

## 8. Mengapa data DEV LOCAL jauh lebih sedikit daripada `kkisi_staging`

`kkisi_staging` adalah **salinan data nyata 30 Sep** (20.499 barang, 9.276 anggota, 230.863 penjualan). DEV LOCAL sengaja dibangun dari **struktur** tabelnya (tanpa baris) ditambah **data sintetis** (6 barang, 3 anggota, 6 penjualan), supaya data anggota dan keuangan nyata tidak dipakai untuk uji manual. Untuk uji produk yang realistis ada perintah opsional `seed-products`: hanya katalog (barang, kategori, merek, satuan, pajak) satu cabang nyata disalin ke cabang sintetis 1, dengan kolom nama staf/IP dikosongkan; **anggota, penjualan, dan tabel keuangan tidak disalin**. Harga dan stok hasil salinan adalah angka salinan lokal, bukan data operasional. Suite otomatis (`dev-local-smoke`, `walkthrough`, `uat-run`) mengandalkan katalog sintetis: jalankan `reset` **tanpa** produk sebelum menjalankannya.

## 9. Navigasi KOSIPA (checkpoint 16)

**Mengapa menu KOSIPA tidak terlihat.** Menu KOSIPA berasal dari *tautan identitas* (akun console → akun KOSIPA), bukan dari peran. Akun yang paling dulu dicoba, `synth_admin`, sengaja tidak punya tautan, dan kartu KOSIPA di dashboard menampilkan "Segera hadir". Perbaikan: kartu kini menyatakan keadaan sebenarnya ("Akun belum ditautkan", "Belum diaktifkan", "Tidak tersedia sementara"); KOSIPA menjadi grup tersendiri dengan Ringkasan KOSIPA, dan Laporan (lima laporan) menjadi submenu di dalamnya. Tidak ada izin yang dilonggarkan. Untuk melihat KOSIPA, masuk sebagai `synth_koperasi` (semua tampilan) atau `synth_kasir2` (baca saja, tanpa payroll).

Struktur menu KOSIPA (nyata, bukan rencana):

| Menu | Rute | Izin |
|---|---|---|
| Ringkasan KOSIPA | /console/kosipa | salah satu izin lihat KOSIPA (tidak membaca data) |
| Keanggotaan (Anggota 360) | /console/kosipa/anggota → /anggota/{id} | kosipa.member.view |
| Simpanan | /console/kosipa/simpanan → /simpanan/{id} | kosipa.savings.view |
| Pinjaman | /console/kosipa/pinjaman → /pinjaman/{dokumen} | kosipa.loan.view |
| Payroll | /console/kosipa/payroll → batch → anggota, rekonsiliasi kredit TOKO | kosipa.payroll.view |
| Laporan ▸ Keanggotaan, Mutasi simpanan, Pinjaman, Payroll, Kualitas data | /console/kosipa/laporan[/…] | izin lihat masing-masing; CSV perlu izin ekspor terpisah |
| Angsuran | belum ada halaman | tidak ditampilkan sebagai tautan; tertulis "Dalam pengembangan" |

Rekonsiliasi payroll dan detail anggota/pinjaman dicapai dari halaman induknya (butuh nomor dokumen/ID), bukan dari sidebar.

Verifikasi otomatis di server yang berjalan (tanpa reset, tanpa mengubah data uji): `PLAYWRIGHT_MODULE=… node tests/console-kosipa-nav-browser.mjs` (12 pemeriksaan: sidebar nyata, submenu, setiap tujuan, status aktif, breadcrumb, refresh, tautan mati, laci ponsel, ekspor, akun lain, `SELF_LINK`) dan `bash scripts/dev-local.sh flag-states`. `OWNER_UAT_ONLY=A,C,D node tests/owner-uat-walkthrough-browser.mjs` menjalankan walkthrough hanya untuk bagian yang tidak menulis transaksi.
