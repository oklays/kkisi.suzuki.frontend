/**
 * Presentation config of the native member form (FA-03B). Labels and widths only: every rule (widths, enumerations, Windows-1252, masters, dates, amounts)
 * is enforced again by the server (packages/domain/src/kosipa/member-command.ts). Keys are exactly the allowlisted m_anggota columns.
 */
export type MemberFieldKind = 'text' | 'textarea' | 'date' | 'amount' | 'select';
export type MemberFieldConfig = { key: string; label: string; kind: MemberFieldKind; max?: number; required?: boolean; registerOnly?: boolean; options?: readonly string[]; hint?: string };
export type MemberFieldGroup = { id: string; title: string; fields: readonly MemberFieldConfig[] };

export const MEMBER_STATUS_OPTIONS = ['AKTIVE', 'LUAR BIASA', 'KONTRAK', 'RESIGN', 'PENSIUN'] as const;
export const MEMBER_GROUP_OPTIONS = ['ANGGOTA', 'NON ANGGOTA', 'BMP', 'KOPERASI'] as const;

export const MEMBER_FIELD_GROUPS: readonly MemberFieldGroup[] = [
  { id: 'identitas', title: 'Identitas', fields: [
    { key: 'nik_kar', label: 'NIK karyawan', kind: 'text', max: 20, required: true, registerOnly: true, hint: 'Huruf/angka, tidak dapat diubah setelah didaftarkan.' },
    { key: 'nama_kar', label: 'Nama lengkap', kind: 'text', max: 50, required: true },
    { key: 'ktp', label: 'No. KTP', kind: 'text', max: 50 },
    { key: 'jenis_kel', label: 'Jenis kelamin', kind: 'text', max: 50 },
    { key: 'tempat_lahir', label: 'Tempat lahir', kind: 'text', max: 50 },
    { key: 'tgl_lahir', label: 'Tanggal lahir', kind: 'date' },
    { key: 'ibu_kandung', label: 'Nama ibu kandung', kind: 'text', max: 50 },
    { key: 'nama_istri', label: 'Nama pasangan', kind: 'text', max: 50 },
    { key: 'status_nikah', label: 'Status nikah', kind: 'text', max: 50 },
    { key: 'pendidikan', label: 'Pendidikan', kind: 'text', max: 50 },
    { key: 'status_rumah', label: 'Status rumah', kind: 'text', max: 50 },
    { key: 'npwp', label: 'NPWP', kind: 'text', max: 50 },
    { key: 'id_card', label: 'ID kartu anggota', kind: 'text', max: 50, registerOnly: true },
  ] },
  { id: 'kontak', title: 'Kontak', fields: [
    { key: 'email', label: 'Email', kind: 'text', max: 50 },
    { key: 'no_telp', label: 'No. telepon', kind: 'text', max: 25, hint: 'Disalin ke akun mobile bila anggota sudah punya akun.' },
    { key: 'no_telp1', label: 'No. telepon lain', kind: 'text', max: 50 },
  ] },
  { id: 'alamat', title: 'Alamat sesuai KTP', fields: [
    { key: 'alamat', label: 'Alamat', kind: 'textarea', max: 250 },
    { key: 'rt', label: 'RT', kind: 'text', max: 50 }, { key: 'rw', label: 'RW', kind: 'text', max: 50 },
    { key: 'provinsi', label: 'Provinsi', kind: 'text', max: 100 }, { key: 'kabupaten', label: 'Kabupaten/Kota', kind: 'text', max: 50 },
    { key: 'kecamatan', label: 'Kecamatan', kind: 'text', max: 50 }, { key: 'kelurahan', label: 'Kelurahan', kind: 'text', max: 50 },
    { key: 'kode_pos', label: 'Kode pos', kind: 'text', max: 50 },
  ] },
  { id: 'tinggal', title: 'Alamat tempat tinggal', fields: [
    { key: 'alamat_tinggal', label: 'Alamat', kind: 'textarea', max: 250, hint: 'Disalin ke akun mobile bila anggota sudah punya akun.' },
    { key: 'kelurahan_tinggal', label: 'Kelurahan', kind: 'text', max: 50 }, { key: 'kecamatan_tinggal', label: 'Kecamatan', kind: 'text', max: 50 },
    { key: 'kabupaten_tinggal', label: 'Kabupaten/Kota', kind: 'text', max: 50 }, { key: 'kode_pos_tinggal', label: 'Kode pos', kind: 'text', max: 50 },
  ] },
  { id: 'kepegawaian', title: 'Kepegawaian', fields: [
    { key: 'kd_group', label: 'Grup anggota', kind: 'select', required: true, options: MEMBER_GROUP_OPTIONS },
    { key: 'bagian', label: 'Bagian', kind: 'select', required: true },
    { key: 'lokasi', label: 'Lokasi', kind: 'select', required: true },
    { key: 'divisi', label: 'Divisi', kind: 'text', max: 50 }, { key: 'dept', label: 'Departemen', kind: 'text', max: 250 }, { key: 'jabatan', label: 'Jabatan', kind: 'text', max: 50 },
    { key: 'status_karyawan', label: 'Status karyawan', kind: 'text', max: 50 },
    { key: 'tgl_daftar', label: 'Tanggal daftar', kind: 'date', registerOnly: true, hint: 'Kosong = hari ini.' },
    { key: 'tgl_karyawan', label: 'Tanggal karyawan', kind: 'date' }, { key: 'tgl_masuk', label: 'Tanggal masuk', kind: 'date' }, { key: 'tgl_keluar', label: 'Tanggal keluar/berakhir', kind: 'date' },
  ] },
  { id: 'keuangan', title: 'Gaji dan rekening', fields: [
    { key: 'gaji', label: 'Gaji (Rp)', kind: 'amount', hint: 'Angka, desimal dengan titik, maksimal 2 digit.' },
    { key: 'bank_rek', label: 'Bank', kind: 'text', max: 20 }, { key: 'no_rek', label: 'No. rekening', kind: 'text', max: 20 }, { key: 'nama_rek', label: 'Nama pemilik rekening', kind: 'text', max: 100 },
  ] },
];

export const BANK_FIELDS = ['no_rek', 'bank_rek', 'nama_rek'] as const;

export const MEMBER_MESSAGES: Record<string, string> = {
  MEMBER_NIK_DUPLICATE: 'NIK ini sudah terdaftar (termasuk penulisan lain seperti angka nol di depan atau huruf besar/kecil).',
  MEMBER_MASTER_INVALID: 'Bagian atau lokasi harus dipilih dari master data yang masih aktif.',
  MEMBER_MIRROR_CONFLICT: 'Email, KTP/telepon bentrok dengan akun mobile anggota lain. Tidak ada yang disimpan.',
  MEMBER_FIELD_INVALID: 'Ada isian yang tidak valid: wajib diisi, terlalu panjang, atau berisi karakter yang tidak didukung.',
  MEMBER_DATE_INVALID: 'Tanggal tidak valid (format tahun-bulan-tanggal; tanggal daftar tidak boleh di masa depan).',
  MEMBER_AMOUNT_INVALID: 'Jumlah tidak valid: gunakan angka dengan titik desimal, maksimal 2 digit desimal.',
  MEMBER_DEDUCTION_NIK_TOO_LONG: 'Potongan awal hanya dapat dibuat untuk NIK sampai 10 karakter. Kosongkan potongan atau gunakan NIK lebih pendek.',
  MEMBER_STATUS_INVALID: 'Status tidak dikenal.',
  MEMBER_NOT_FOUND: 'Anggota tidak ditemukan. Muat ulang halaman.',
  FIELD_NOT_ALLOWED: 'Ada isian yang tidak boleh diubah lewat formulir ini.',
  INVALID_INPUT: 'Isian tidak dapat diproses. Muat ulang halaman lalu ulangi.',
  NO_CHANGE: 'Tidak ada perubahan untuk disimpan.',
  STALE: 'Data anggota ini baru saja diubah (oleh orang lain atau sistem lama). Muat ulang halaman, periksa, lalu ulangi.',
  REASON_INVALID: 'Alasan wajib diisi (5–200 karakter) untuk perubahan rekening bank atau status.',
  VERSION_INVALID: 'Versi data tidak valid. Muat ulang halaman.',
  FORBIDDEN: 'Akun Anda tidak berwenang melakukan tindakan ini.',
  WRITE_DISABLED: 'Perubahan data anggota belum diaktifkan di lingkungan ini. Tidak ada yang disimpan.',
  WRITE_NOT_CONFIGURED: 'Penulisan anggota belum dikonfigurasi di lingkungan ini. Tidak ada yang disimpan.',
  LEGACY_ACTIVE: 'Menu anggota KOSIPA lama aktif kembali, jadi perubahan di sini ditolak agar tidak ada dua tempat penulisan. Hubungi operator.',
  BUSY_RETRY: 'Sistem sedang sibuk. Coba kirim lagi; permintaan yang sama tidak akan tercatat dua kali.',
  IDEMPOTENCY_CONFLICT: 'Permintaan bentrok dengan pengiriman sebelumnya. Muat ulang halaman lalu ulangi.',
  DOCUMENT_NUMBER_CONFLICT: 'Nomor dokumen bentrok. Coba lagi.',
  NETWORK: 'Koneksi terputus. Coba kirim lagi; permintaan yang sama tidak akan tercatat dua kali.',
};
export const RETRY_SAME_KEY = new Set(['BUSY_RETRY', 'NETWORK', 'KOSIPA_UNAVAILABLE']);
