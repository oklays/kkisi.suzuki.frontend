import { parseWholeRupiah, rupiahSen } from '../../../lib/utils/money.ts';

export type DeductionOption = { type: string; label: string; monthlySen: number };

/**
 * Savings-deduction change (mockup "Pengajuan Potongan"). Rules shown by the mockup: Simpanan Wajib may only go up; any new amount
 * must differ from the current one and be a whole Rupiah amount. Effective from next month.
 */
export function validateDeductionChange(option: DeductionOption | undefined, raw: string): string | null {
  if (!option) return 'Pilih jenis simpanan.';
  const value = parseWholeRupiah(raw);
  if (value === null) return 'Masukkan nominal potongan baru yang valid (Rupiah tanpa desimal).';
  const current = option.monthlySen / 100;
  if (/WAJIB/i.test(option.type) && value <= current) return `Potongan baru Simpanan Wajib harus lebih besar dari ${rupiahSen(option.monthlySen)}.`;
  if (value === current) return 'Potongan baru sama dengan potongan saat ini.';
  if (value > 100_000_000) return 'Nominal terlalu besar.';
  return null;
}

