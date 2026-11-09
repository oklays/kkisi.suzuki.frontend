import type { ProductMasterType } from '@koperasi/domain/kosipa/product-master';

/** Presentation of the product masters (FA-03B T06). Labels only; every rule is enforced by the server (packages/domain/src/kosipa/product-master.ts). */
export const PRODUCT_PURPOSE: Readonly<Record<ProductMasterType, string>> = {
  'jenis-simpanan': 'Produk simpanan: bunga, akun COA dan izin tarik deposito.',
  'jenis-pinjaman': 'Produk pinjaman: induk jenis, biaya, bunga, plafon dan akun.',
  'jenis-pembiayaan': 'Skema pembiayaan pinjaman: biaya, bunga, kunci angsuran dan akun.',
  'suku-bunga': 'Parameter yang dibaca saat pinjaman dihitung (tanggal jatuh tempo).',
  'pinjaman-mobile': 'Master parameter pengajuan pinjaman pada aplikasi mobile anggota (nominal, tenor, jasa).',
};

/** List columns per product master: the identifying fields plus the parameters an operator checks first. */
export const PRODUCT_LIST_COLUMNS: Readonly<Record<ProductMasterType, readonly { key: string; label: string; numeric?: boolean }[]>> = {
  'jenis-simpanan': [{ key: 'jenis_simpanan_code', label: 'Kode' }, { key: 'jenis_simpanan_name', label: 'Nama' }, { key: 'bunga_simpanan', label: 'Bunga (%)', numeric: true }, { key: 'akun_code', label: 'Akun' }, { key: 'is_active_tarik_deposito', label: 'Tarik deposito' }],
  'jenis-pinjaman': [{ key: 'jenis_pinjaman_code', label: 'Kode' }, { key: 'jenis_pinjaman_name', label: 'Nama' }, { key: 'parent_id', label: 'Induk' }, { key: 'jenis_bunga', label: 'Bunga' }, { key: 'biaya_bunga', label: 'Bunga (%)', numeric: true }, { key: 'max_angsuran', label: 'Maks. bulan', numeric: true }, { key: 'max_pinjaman', label: 'Maks. pinjaman (Rp)', numeric: true }],
  'jenis-pembiayaan': [{ key: 'pembiayaan_code', label: 'Kode' }, { key: 'pembiayaan_name', label: 'Nama' }, { key: 'jenis_bunga', label: 'Bunga' }, { key: 'biaya_jasa', label: 'Biaya jasa', numeric: true }, { key: 'lock_1angsuran', label: 'Kunci 1 angsuran' }, { key: 'akun_code', label: 'Akun' }],
  'suku-bunga': [{ key: 'code_suku_bunga', label: 'Kode' }, { key: 'desc_suku_bunga', label: 'Deskripsi' }, { key: 'field', label: 'Parameter' }, { key: 'nilai_persen', label: 'Nilai', numeric: true }],
  'pinjaman-mobile': [
    { key: 'jenis_pinjaman', label: 'Jenis Pinjaman' },
    { key: 'min_nominal', label: 'Min. Nominal (Rp)', numeric: true },
    { key: 'max_nominal', label: 'Maks. Nominal (Rp)', numeric: true },
    { key: 'min_jw', label: 'Min. Tenor (Bulan)', numeric: true },
    { key: 'max_jw', label: 'Maks. Tenor (Bulan)', numeric: true },
    { key: 'jasa', label: 'Jasa/Bunga (%)', numeric: true },
  ],
};

/** Form sections: field keys in display order. Keys missing here are appended to the last section, so no field can be lost. */
export const PRODUCT_FORM_GROUPS: Readonly<Record<ProductMasterType, readonly { id: string; title: string; keys: readonly string[] }[]>> = {
  'jenis-simpanan': [{ id: 'identitas', title: 'Identitas', keys: ['jenis_simpanan_code', 'jenis_simpanan_name', 'jenis_simpanan_remarks'] }, { id: 'parameter', title: 'Parameter keuangan', keys: ['bunga_simpanan', 'is_active_tarik_deposito', 'akun_code'] }],
  'jenis-pinjaman': [
    { id: 'identitas', title: 'Identitas', keys: ['jenis_pinjaman_code', 'jenis_pinjaman_name', 'jenis_pinjaman_remarks', 'parent_id', 'jenis_pembiayaan'] },
    { id: 'biaya', title: 'Bunga dan biaya', keys: ['jenis_bunga', 'biaya_bunga', 'biaya_jasa', 'biaya_admin', 'biaya_asuransi', 'biaya_pinalty'] },
    { id: 'batas', title: 'Batas dan angsuran', keys: ['max_pinjaman', 'max_angsuran', 'tgl_tempo', 'lock_1angsuran'] },
    { id: 'akun', title: 'Akun COA', keys: ['akun_code', 'akun_code_pembiayaan', 'akun_code_pendapatan'] },
  ],
  'jenis-pembiayaan': [
    { id: 'identitas', title: 'Identitas', keys: ['pembiayaan_code', 'pembiayaan_name', 'pembiayaan_remarks'] },
    { id: 'biaya', title: 'Bunga dan biaya', keys: ['jenis_bunga', 'biaya_bunga', 'biaya_jasa', 'biaya_admin', 'biaya_asuransi', 'biaya_pinalty'] },
    { id: 'angsuran', title: 'Angsuran dan akun', keys: ['tgl_tempo', 'lock_1angsuran', 'akun_code'] },
  ],
  'suku-bunga': [{ id: 'parameter', title: 'Parameter', keys: ['code_suku_bunga', 'desc_suku_bunga', 'field', 'nilai_persen', 'remarks_suku_bunga'] }],
  'pinjaman-mobile': [
    { id: 'identitas', title: 'Identitas', keys: ['jenis_pinjaman'] },
    { id: 'nominal', title: 'Batas Nominal Pinjaman', keys: ['min_nominal', 'max_nominal'] },
    { id: 'tenor', title: 'Jangka Waktu & Jasa', keys: ['min_jw', 'max_jw', 'jasa'] },
  ],
};

export const PRODUCT_MESSAGES: Record<string, string> = {
  PRODUCT_FIELD_INVALID: 'Isian tidak valid: wajib diisi, angka dengan titik desimal sesuai jumlah digit kolom, atau pilihan yang tersedia.',
  PRODUCT_COA_INVALID: 'Akun COA tidak ditemukan di bagan akun.',
  PRODUCT_COA_DESC_TOO_LONG: 'Deskripsi akun COA lebih panjang dari kolom penyimpanannya, jadi akun ini tidak dapat dipakai di kolom tersebut (tidak akan dipotong).',
  PRODUCT_FINANCING_INVALID: 'Pilih jenis pembiayaan yang masih aktif.',
  PRODUCT_PARENT_INVALID: 'Induk jenis tidak valid: pilih jenis induk; jenis induk bawaan KOSIPA dan jenis yang sudah memiliki anak tidak dapat dipindah.',
  PRODUCT_FIELD_DUPLICATE: 'Nilai ini sudah dipakai baris lain.',
  MASTER_CODE_DUPLICATE: 'Kode sudah dipakai data lain (termasuk yang tidak aktif).',
  MASTER_REFERENCED: 'Nilai ini sudah dipakai transaksi atau master lain, sehingga tidak dapat diubah.',
  MASTER_FIELD_IMMUTABLE: 'Nilai ini ditetapkan saat dibuat dan tidak dapat diubah.',
  MASTER_NOT_FOUND: 'Data tidak ditemukan. Muat ulang halaman.',
  NO_CHANGE: 'Tidak ada perubahan untuk disimpan.',
  STALE: 'Data ini baru saja diubah (oleh orang lain atau layar KOSIPA lama). Muat ulang halaman, periksa, lalu ulangi.',
  REASON_INVALID: 'Alasan wajib diisi (5–200 karakter) untuk perubahan parameter keuangan atau status.',
  VERSION_INVALID: 'Versi data tidak valid. Muat ulang halaman.',
  FIELD_NOT_ALLOWED: 'Ada isian yang tidak boleh dikirim lewat formulir ini.',
  INVALID_INPUT: 'Isian tidak dapat diproses. Muat ulang halaman lalu ulangi.',
  FORBIDDEN: 'Akun Anda tidak berwenang mengubah master data KOSIPA.',
  WRITE_DISABLED: 'Perubahan master ini belum diaktifkan di lingkungan ini. Tidak ada yang disimpan.',
  WRITE_NOT_CONFIGURED: 'Penulisan belum dikonfigurasi di lingkungan ini. Tidak ada yang disimpan.',
  LEGACY_ACTIVE: 'Menu KOSIPA lama untuk master ini aktif kembali, jadi perubahan ditolak agar tidak ada dua tempat penulisan. Hubungi operator.',
  BUSY_RETRY: 'Sistem sedang sibuk. Coba simpan lagi; permintaan yang sama tidak akan tercatat dua kali.',
  IDEMPOTENCY_CONFLICT: 'Permintaan bentrok dengan pengiriman sebelumnya. Muat ulang halaman lalu ulangi.',
  NETWORK: 'Koneksi terputus. Coba simpan lagi; permintaan yang sama tidak akan tercatat dua kali.',
};
export const PRODUCT_RETRY_SAME_KEY = new Set(['BUSY_RETRY', 'NETWORK', 'KOSIPA_UNAVAILABLE']);
