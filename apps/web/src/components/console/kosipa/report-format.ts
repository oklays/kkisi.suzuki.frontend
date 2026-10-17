export const REPORT_REASON: Record<string, string> = {
  READ_FAILED: 'Bagian ini tidak dapat dibaca saat ini (batas waktu atau gangguan database). Bagian lain tetap ditampilkan.',
  SOURCE_TRUNCATED: 'Sumber data melebihi batas baca sehingga hasilnya tidak ditampilkan; hasil yang tidak lengkap bisa menyesatkan.',
};
export const UNUSABLE_DATE_LABEL: Record<string, string> = {
  ZERO: 'Tanggal dokumen 0000-00-00 (kosong)', MISSING: 'Tanggal dokumen kosong (NULL)', IMPLAUSIBLE: 'Tanggal dokumen tidak wajar (mis. 9999-12-10)',
};
export const YEAR_NOTE = 'Tahun dipilih berdasarkan tanggal dokumen / kolom periode yang tercatat. Data dengan tanggal tidak dapat dipakai dihitung terpisah dan tidak ditempatkan pada bulan tebakan.';
export const BATCH_ISSUE_SHORT: Record<string, string> = {
  STATUS_UNKNOWN: 'status tidak dikenal', NO_ROWS: 'tanpa baris', HEADER_TOTAL_MISMATCH: 'total header ≠ jumlah baris', DUPLICATE_NIK_ROWS: 'NIK ganda', PERIOD_DATE_INVALID: 'tanggal periode tidak valid',
  PERIOD_COLUMNS_MISMATCH: 'kolom periode ≠ tanggal', HEADER_TOTAL_MISSING: 'total header kosong',
};
