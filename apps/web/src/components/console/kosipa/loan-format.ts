import { LOAN_PRODUCTS, UNMAPPED_PRODUCT, classifyLoanProduct, loanProduct, statusFlags, type LoanProductFilter } from '@koperasi/domain/kosipa';

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

// ------------------------------------------------------------------------------------------------ products & lifecycle

export const LOAN_HUB = '/console/kosipa/pinjaman';
export const LOAN_LIST = '/console/kosipa/pinjaman/daftar';
export const productHref = (slug: LoanProductFilter) => (slug === 'lainnya' ? `${LOAN_LIST}?produk=lainnya` : `${LOAN_HUB}/produk/${slug}`);
export const productLabel = (slug: LoanProductFilter | null) => (slug === null ? 'Semua produk' : loanProduct(slug)?.label ?? UNMAPPED_PRODUCT.label);
export const productOf = (h: { type: string | null; financier: string | null }) => classifyLoanProduct(h.type, h.financier);
export const PRODUCT_OPTIONS: readonly { value: LoanProductFilter; label: string }[] = [...LOAN_PRODUCTS.map((p) => ({ value: p.slug, label: p.label })), { value: 'lainnya', label: UNMAPPED_PRODUCT.label }];

/**
 * One reading of the three recorded statuses, for scanning a list. The raw statuses are always shown next to it; contradictory
 * combinations are named as such, never resolved into a stage.
 */
export type LoanStage = { key: 'running' | 'settled' | 'awaitingDisbursement' | 'awaitingApproval' | 'submitted' | 'rejected' | 'conflict' | 'unknown'; label: string; state: 'available' | 'partial' | 'planned' | 'warning' };
export function loanStage(h: { docStatus: string | null; disbursement: string | null; repayment: string | null }): LoanStage {
  const flags = statusFlags(h);
  if (flags.includes('STATUS_UNKNOWN')) return { key: 'unknown', label: 'Status tidak dikenal', state: 'warning' };
  if (flags.length) return { key: 'conflict', label: 'Status bertentangan', state: 'warning' };
  if (h.docStatus === 'REJECTED') return { key: 'rejected', label: 'Ditolak', state: 'planned' };
  if (h.repayment === 'LUNAS') return { key: 'settled', label: 'Lunas', state: 'available' };
  if (h.docStatus === 'APPROVED' && h.disbursement === 'APPROVED') return { key: 'running', label: 'Berjalan', state: 'available' };
  if (h.docStatus === 'APPROVED') return { key: 'awaitingDisbursement', label: 'Disetujui, belum cair', state: 'partial' };
  if (h.docStatus === 'POSTING') return { key: 'awaitingApproval', label: 'Menunggu persetujuan', state: 'partial' };
  return { key: 'submitted', label: 'Diajukan', state: 'partial' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** `2026-09-29` → `29 Sep 2026`; anything else → null (callers say "tidak tersedia" in their own words). */
export function shortDate(iso: string | null | undefined): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m || m[1] === '0000' || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}
export const count = (n: number) => n.toLocaleString('id-ID');
