# Spesifikasi `/sales` — Riwayat Transaksi & Cetak Ulang Struk

Tanggal: 5 Oktober 2026. Status: **implementasi lokal tersedia; belum staging-accepted atau diaktifkan**.

Tujuan: pengguna berizin dapat menemukan transaksi POS lama, membuka detail, melihat pembayaran, dan mencetak ulang struk dari data tersimpan. Implementasi memakai database dan tabel existing, tanpa DDL, backfill, atau perubahan ownership tabel.

## Dokumen

1. [Current state](current-state.md): audit source terarah, evidence, dan batas kepastian.
2. [Impact analysis](impact-analysis.md): modul terdampak dan perbaikan perilaku legacy.
3. [Requirements](requirements.md): aturan dan acceptance criteria bernomor.
4. [Design](design.md): UI, layering, query, kontrak API, keamanan, dan rollback.
5. [Tasks](tasks.md): pekerjaan implementasi berurutan beserta dependensi.
6. [Verification](verification.md): matriks traceability, hasil pemeriksaan lokal, dan gate runtime yang tersisa.

## Keputusan scope

- Menu **Riwayat Transaksi** menuju `/sales`; default transaksi POS, status Final, bulan berjalan. Pengguna dapat memilih seluruh penjualan barang/non-POS dan status lainnya. PPOB tetap di luar scope.
- Detail kompatibel dengan pola `/sales/invoice/{id}`, riwayat pembayaran read-only memakai permission existing, dan cetak ulang menggunakan halaman struk 80 mm existing.
- Tidak perlu sesi kasir terbuka atau konfigurasi writer untuk membaca riwayat.
- Riwayat adalah daftar transaksi yang masih tersimpan, bukan audit setiap perubahan atau bukti struk telah tercetak.
- Filter berdasarkan ID sesi kasir dan referensi sesi tersedia. Halaman pengelolaan seluruh register, edit, hapus, bayar ulang, void/refund, A4, dan ekspor menjadi backlog terpisah.
- Transaksi dengan retur, metode tidak dikenal, atau data yang tidak aman dicetak tetap terlihat di detail; cetak reguler diblokir dengan alasan spesifik.

## Alternatif yang dipertimbangkan

| Pendekatan | Trade-off | Keputusan |
|---|---|---|
| Native `/sales` read-only + reuse receipt | Memenuhi pencarian/detail/pembayaran/cetak; tidak mengubah jalur tulis | Direkomendasikan |
| Tautan ke halaman PHP | Cepat tetapi dua sesi login, UI berbeda, kelemahan scope/permission legacy tetap terbawa | Tidak dipilih |
| Port seluruh modul Sales/Kasir termasuk mutasi | Membutuhkan validasi ownership, stok, kredit, dan rekonsiliasi jauh lebih luas | Backlog setelah scope baca diterima |

## Batas evidence

Audit berdasarkan source lokal dan dokumentasi. Tidak mengakses cPanel, DB operasional, atau website produksi; belum memastikan volume, index aktual, assignment permission produksi, maupun proporsi transaksi yang bisa dicetak ulang. Source current mengonfirmasi Cash/QRIS/Kredit, sehingga catatan audit pembayaran lama yang hanya menyebut Cash/Kredit tidak dipakai sebagai baseline runtime.

Gate sebelum implementasi: review dokumen ini. Gate sebelum aktivasi: pengujian pada staging **existing** yang disetujui, verifikasi schema/index secara SELECT-only, permission, performa, dan print. Tidak ada provision database/tabel baru pada task ini maupun rencana ini.

Audit/polish lanjutan: [Sales UI audit](../../../migration/SALES_TRANSACTION_HISTORY_UI_AUDIT.md).
