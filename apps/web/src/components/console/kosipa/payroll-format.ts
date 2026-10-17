import type { LegacyDate } from '@koperasi/domain/kosipa';

/** amount4 = integer in 1/10,000 rupiah (exact; 14% of recorded payroll totals carry fractions of a sen). Shown without rounding. */
export function formatAmount4(units: number): string {
  const negative = units < 0;
  const abs = Math.abs(units);
  const whole = String(Math.floor(abs / 10000)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let frac = String(abs % 10000).padStart(4, '0').replace(/0+$/, '');
  if (frac.length === 1) frac += '0';
  return `${negative ? '-' : ''}Rp ${whole}${frac ? `,${frac}` : ''}`;
}

/** Legacy dates are shown as stored; zero/implausible values are labelled, never replaced by a guess. */
export function formatLegacyDate(date: LegacyDate): string {
  switch (date.kind) {
    case 'date': return date.iso;
    case 'zero': return '0000-00-00 (kosong)';
    case 'missing': return '—';
    default: return `${date.raw} (tidak valid)`;
  }
}

export const STATUS_LABEL: Record<string, string> = { OPEN: 'OPEN · belum disetujui', APPROVED: 'APPROVED · disetujui', UNKNOWN: 'Status tidak dikenal' };
export const GROUP_LABEL: Record<string, string> = { ANGGOTA: 'Anggota', BMP: 'BMP', KOPERASI: 'Koperasi' };

export const ISSUE_TEXT: Record<string, string> = {
  STATUS_UNKNOWN: 'Status dokumen bukan OPEN atau APPROVED; ditampilkan apa adanya.',
  NO_ROWS: 'Header ini tidak memiliki baris potongan anggota.',
  HEADER_TOTAL_MISMATCH: 'Total pada header berbeda dari jumlah seluruh baris. Keduanya dicatat apa adanya, tidak diperbaiki.',
  DUPLICATE_NIK_ROWS: 'Ada NIK dengan lebih dari satu baris di batch ini. Baris ditampilkan terpisah dan tidak digabung.',
  PERIOD_DATE_INVALID: 'Tanggal periode kosong atau tidak valid, sehingga bulan sumber tidak ditebak.',
  PERIOD_COLUMNS_MISMATCH: 'Kolom bulan/tahun periode tidak sesuai dengan tanggal periode.',
  HEADER_TOTAL_MISSING: 'Header tidak mencatat total.',
};

export const DIFFERENCE_LABEL: Record<string, string> = {
  MATCH: 'Sama',
  RECORDED_HIGHER: 'Payroll lebih besar dari turunan',
  RECORDED_LOWER: 'Payroll lebih kecil dari turunan',
  RECORDED_ONLY: 'Hanya ada di payroll',
  DERIVED_ONLY_MEMBER_ABSENT: 'Ada belanja Kredit, anggota tidak ada di payroll periode ini',
  DERIVED_ONLY_RECORDED_ZERO: 'Ada belanja Kredit, payroll tercatat Rp 0',
  NOT_COMPARABLE_ANOMALY: 'Tidak dapat dibandingkan (anomali data)',
};

export const ANOMALY_LABEL: Record<string, string> = {
  DUPLICATE_SALE: 'Transaksi Kredit muncul lebih dari sekali di sumber',
  KREDIT_SALE_INVALID_NIK: 'Transaksi Kredit tanpa NIK anggota yang valid',
  UNMAPPED_COMPANY: 'Cabang belum dipetakan ke kolom toko payroll',
  RETURN_EXCEEDS_SALE: 'Retur melebihi nilai transaksi',
  RETURN_WITHOUT_SALE: 'Retur tanpa transaksi Kredit induk di bulan sumber',
  RECORDED_INVALID_NIK: 'Baris payroll dengan NIK tidak valid',
  SOURCE_TRUNCATED: 'Sumber data melebihi batas baca',
};

export const COMPARABILITY_LABEL: Record<string, string> = {
  STORE_COLUMN_MAP_UNCONFIRMED: 'Pemetaan kolom toko payroll ke cabang berasal dari pola data, belum dikonfirmasi pemilik proses.',
  OPEN_BATCH_IN_PERIOD: 'Ada batch berstatus OPEN pada periode ini; angka payroll belum final.',
  NO_APPROVED_BATCH_IN_PERIOD: 'Belum ada batch APPROVED pada periode ini.',
};

export const REASON_TEXT: Record<string, string> = {
  PERIOD_UNUSABLE: 'Periode batch ini tidak dapat dipastikan (tanggal kosong/tidak valid atau tidak konsisten), sehingga bulan sumber belanja tidak ditebak.',
  NO_RECORDED_ROWS: 'Tidak ada baris payroll pada periode ini untuk dibandingkan.',
  SOURCE_TRUNCATED: 'Transaksi sumber melebihi batas baca, jadi perbandingan tidak ditampilkan agar tidak menghasilkan selisih palsu.',
  READ_FAILED: 'Data tidak dapat dibaca saat ini (batas waktu atau gangguan database). Coba lagi beberapa saat lagi.',
  PERIOD_DATE_UNUSABLE: 'Tanggal periode batch kosong atau tidak valid, sehingga bulan angsuran tidak ditebak.',
};

/** Builds a same-page query string, dropping empty values. */
export const qs = (params: Record<string, string | null | undefined>): string => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
};
