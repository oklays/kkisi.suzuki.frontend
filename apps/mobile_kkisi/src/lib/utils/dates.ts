import type { LegacyDate } from '@koperasi/domain/kosipa';

// Indonesian date labels for legacy text dates (YYYY-MM-DD...). Business time zone: Asia/Jakarta (UTC+7, no DST).
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const parts = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12 || m[1] === '0000') return null;
  return { y: Number(m[1]), m: month, d: m[3] ? Number(m[3]) : null };
};

/** "2026-11-05" -> "5 Nov 2026"; unusable -> "Tanggal tidak tercatat". */
export function dayLabel(iso: string | null | undefined): string {
  const p = parts(iso);
  return p && p.d ? `${p.d} ${MONTHS_SHORT[p.m - 1]} ${p.y}` : 'Tanggal tidak tercatat';
}
/** "2026-11" or "2026-11-05" -> "Nov 2026". */
export function monthShort(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS_SHORT[p.m - 1]} ${p.y}` : 'Periode tidak tercatat';
}
/** "2026-10" -> "Oktober 2026". */
export function monthLong(iso: string | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : 'Periode tidak tercatat';
}
export const legacyDayLabel = (d: LegacyDate): string => (d.kind === 'date' ? dayLabel(d.iso) : 'Tanggal tidak tercatat');
export const legacyMonthKey = (d: LegacyDate): string | null => (d.kind === 'date' ? d.iso.slice(0, 7) : null);

/** Jakarta business month of `now`: { key: '2026-11', start, endExclusive }. */
export function businessMonth(now: Date, offset = 0) {
  const j = new Date(now.getTime() + 7 * 3600_000);
  const start = new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { key: iso(start).slice(0, 7), start: iso(start), endExclusive: iso(end) };
}

/** Known acronyms of the legacy masters keep their capitals; everything else is title-cased ("KASBON 1X POT" -> "Kasbon 1x Pot"). */
const ACRONYMS = new Set(['PBS', 'DKM', 'SHU', 'PPOB', 'SIM', 'BTN', 'KPR', 'BJB', 'BSI', 'BSM', 'DKI', 'PAT', 'BPAT', 'PLN', 'PDAM', 'TB', 'TB2', 'II', 'MJ', 'GIIC', 'NIK', 'SPV', 'SBC', 'EHS', 'TC4W', 'UP', 'S-MART']);
export function titleCase(raw: string | null | undefined): string {
  return (raw ?? '').trim().split(/\s+/).filter(Boolean).map((w) => (ACRONYMS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
}
