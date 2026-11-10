import type { ShuRow } from '../../../server/kosipa/member.reader.ts';
import { senOf } from '../../../lib/utils/money.ts';

// SHU per published year, recorded values only (trans_shu_dtl). The mapping of columns to the mockup's labels follows the mockup
// arithmetic (Total SHU + Jasa Simpanan Sukarela = Pendapatan Total); nothing is recomputed here.
export const SHU_LINES = [
  { key: 'jasa_transaksi_usaha', label: 'SHU Jasa Usaha', tone: 'yellow' },
  { key: 'jasa_simpanan', label: 'SHU Jasa Modal', tone: 'blue' },
  { key: 'total_shu', label: 'Total SHU', tone: 'slate' },
  { key: 'total_shu_pembulatan', label: 'Pembulatan', tone: 'slate' },
  { key: 'jasa_simpanan_sukarela', label: 'Jasa Simpanan Sukarela', tone: 'blue' },
] as const;

export type ShuYear = { year: string; incomeSen: number; lines: { label: string; tone: string; amountSen: number }[] };
export function buildShuYears(rows: readonly ShuRow[]): ShuYear[] {
  return rows.map((r) => ({
    year: r.year,
    incomeSen: senOf(r.values.pendapatan_shu),
    lines: SHU_LINES.map((l) => ({ label: l.label, tone: l.tone, amountSen: senOf(r.values[l.key]) })),
  })).sort((a, b) => b.year.localeCompare(a.year));
}
