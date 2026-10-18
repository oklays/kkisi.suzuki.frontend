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
| `synth_admin` | Administrator console + pratinjau Warehouse | role 1 (pemilih cabang); izin uji: kelola tautan, penjualan, produk, inventory |
| `synth_kepala` | Supervisor TOKO (cabang 9001) | role 3 diaktifkan khusus DEV LOCAL (seed sintetis menonaktifkannya sebagai kasus negatif) |
| `synth_kasir1` | Kasir TOKO (cabang 9001) | hanya `sales_add` → langsung ke /pos; dipakai juga untuk uji akses tanpa izin |
| `synth_koperasi` | Administrator KOSIPA | ditautkan ke `synth_ksp` (semua tampilan KOSIPA); satu-satunya pengguna ekspor CSV |
| `synth_kasir2` | Staf KOSIPA baca-saja (cabang 9002) | ditautkan ke `synth_ksp_staff` (anggota, simpanan, pinjaman; tanpa payroll) |
| `synth_off` / `synth_nobranch` | Pengguna terbatas | akun nonaktif / cabang nonaktif → tidak bisa masuk |

Operator Warehouse **tidak punya peran sendiri** (keputusan W5 belum ada); pratinjau Warehouse dibuka lewat kemampuan yang ada (pemilih cabang + `inventory_view`), di sini `synth_admin`.

## 5. Batasan yang perlu diketahui

* Saldo resmi simpanan/pinjaman, paritas payroll, pemetaan kolom toko: **belum tersedia** (menunggu bukti operator O1/O5 dan D5). Halaman menampilkannya sebagai "belum tersedia", bukan angka tebakan.
* Warehouse: **data sintetis**, tidak terhubung ke Gudang, tanpa aksi operasional.
* `scripts/uat-run.sh` mencabut tautan identitas sintetis di console store bersama; jalankan `scripts/dev-local.sh links` sesudahnya. Password DEV LOCAL disimpan terpisah (`.env.dev-local-accounts.json`) sehingga seed e2e berikutnya tidak membuatnya tidak berlaku.
* Skema sintetis tidak memiliki data merek/satuan/pajak; halaman Produk tetap terbuka tetapi daftar master lebih sedikit dibanding data nyata.
