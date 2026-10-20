# Status kesiapan per modul (setelah checkpoint 16)

Kolom **Verifikasi lokal** = bukti engineering pada data sintetis DEV LOCAL / salinan lokal (otomatis). **Owner** = penerimaan nyata oleh owner: **belum ada untuk semua modul** (owner belum mengisi checklist). **Staging** dan **Produksi** = belum untuk semua modul. Satu-satunya cara baris Owner berubah adalah hasil dan keputusan tertulis dari owner.

| Modul | Terimplementasi | Verifikasi lokal | Owner | Staging | Produksi | Terblokir oleh |
|---|---|---|---|---|---|---|
| Shell console, login, navigasi | ya | ya (UAT 8 fase, walkthrough 44/44, login security 8/8) | **belum** | belum | tidak | rilis hotfix login (S1); R1 untuk kasir |
| KOSIPA: navigasi console (grup, Ringkasan, submenu Laporan, status akses) | ya (checkpoint 16) | ya (`console-kosipa-nav-browser` 12/12 di sidebar nyata; `flag-states`; UAT 8 fase) | **belum** (temuan owner D-001: perbaikan menunggu uji owner, checklist G1–G10) | belum | tidak | peran nyata (O3); tautan identitas per akun |
| Hotfix login (cabang terpisah) | ya | ya (diff direview; `e2e-local` master vs hotfix; login security) | n/a — keputusan rilis owner | — | **belum dirilis** | otorisasi rilis owner; cek eksposur operator |
| TOKO: POS Cash/QRIS/Kredit, register, retur, produk, opname | ya (sudah ada) | ya (UI + API pada DB sintetis) | **belum** | belum | tidak | smoke owner di staging; B4/B9 untuk cutover |
| KOSIPA: tautan identitas, Anggota 360 | ya | ya | **belum** | belum | tidak | peran nyata (O3) |
| KOSIPA: simpanan, pinjaman, payroll (baca) | ya (nilai tercatat saja) | ya | **belum** | belum | tidak | saldo/outstanding resmi: **O1 → O5**; D6; D5 untuk perbandingan toko |
| KOSIPA: laporan, kualitas data, ekspor CSV | ya | ya (allow-list E1, injeksi, desimal, audit) | **belum** | belum | tidak | pengguna ekspor yang disetujui owner |
| Warehouse: pratinjau (sintetis) | ya | ya (banner, tanpa aksi) | **belum** | belum | tidak | skema Gudang; W1/W5; D7 |
| Warehouse: persistensi, outbox, penerap stok TOKO | harness + penerap **tidak terhubung** | ya (tes kontrak, SIGKILL, kesalahan jaringan) | n/a | belum | tidak | **D7**, O6, B4, B9, kapasitas (O4) |
| KOSIPA: penulis keuangan (pinjaman, simpanan, payroll) | **tidak dibangun** | — | n/a | — | — | D1–D4, D6, O1/O5, maker-checker |
| Kebijakan landing R1 | ya, **nonaktif** | ya (uji DEV LOCAL, UAT fase 7) | **belum disetujui** | — | tidak | persetujuan owner + peran nyata (O3) |

Catatan: "Verifikasi lokal" tidak menyatakan satu pun modul diterima. Angka sintetis tidak boleh dibaca sebagai angka operasional.
