export const SCHEDULE_ISSUE_TEXT: Record<string, string> = {
  DUPLICATE_HEADER: 'Ada lebih dari satu dokumen pinjaman dengan nomor ini. Semuanya ditampilkan; jadwal angsuran dikaitkan lewat nomor dokumen sehingga dipakai bersama.',
  SCHEDULE_ABSENT: 'Pinjaman berstatus APPROVED tetapi tidak memiliki jadwal angsuran.',
  PRINCIPAL_SUM_DIFFERS_FROM_PLAN: 'Jumlah pokok seluruh angsuran berbeda dari pokok pinjaman yang tercatat.',
  ROW_COUNT_DIFFERS_FROM_PLAN_MONTHS: 'Jumlah baris angsuran berbeda dari tenor yang tercatat.',
  DUPLICATE_INSTALLMENT_NUMBERS: 'Ada nomor angsuran yang muncul lebih dari sekali.',
  NUMBERING_HAS_GAPS: 'Nomor angsuran tidak berurutan (ada nomor yang hilang).',
  DUE_DATES_UNUSABLE: 'Sebagian tanggal jatuh tempo kosong, nol (0000-00-00) atau tidak wajar; tidak ditebak.',
  ROW_TOTAL_DIFFERS_FROM_PRINCIPAL_PLUS_INTEREST: 'Pada sebagian baris, angsuran tercatat tidak sama dengan pokok + bunga.',
  SETTLED_WITH_UNPAID_ROWS: 'Pinjaman berstatus LUNAS tetapi masih ada angsuran berstatus Belum Bayar.',
  STATUS_UNRECOGNISED_ROWS: 'Ada baris angsuran dengan status selain Bayar / Belum Bayar.',
  REJECTED_OR_OPEN_WITH_SCHEDULE: 'Pinjaman belum disetujui (atau ditolak) tetapi memiliki jadwal angsuran.',
};
export const STATUS_FLAG_TEXT: Record<string, string> = {
  REJECTED_BUT_SETTLED: 'Berstatus REJECTED tetapi LUNAS',
  REJECTED_BUT_DISBURSED: 'Berstatus REJECTED tetapi pencairan APPROVED',
  SETTLED_BUT_NOT_APPROVED: 'LUNAS padahal dokumen belum APPROVED',
  DISBURSED_BUT_NOT_APPROVED: 'Pencairan APPROVED padahal dokumen belum APPROVED',
  STATUS_UNKNOWN: 'Status tidak dikenal',
};
export const LOAN_REASON_TEXT: Record<string, string> = {
  READ_FAILED: 'Jadwal angsuran tidak dapat dibaca saat ini (batas waktu atau gangguan database). Coba lagi beberapa saat lagi.',
  OFFICIAL_BALANCE_UNVERIFIED: 'Saldo/outstanding resmi belum tersedia: definisi view saldo legacy belum diverifikasi (TASK-003). Jumlah di bawah adalah penjumlahan jadwal yang tercatat, bukan saldo resmi.',
};
