import {
  DIAGNOSTIC_KIND, KosipaError, amount4ToDecimal, csvDocument, parseReportYear, scanStatusOf,
  type CsvCell, type DiagnosticKind, type LoanReport, type MembershipReport, type PayrollReport, type SavingsMovementReport, type ScanStatus,
} from '@koperasi/domain/kosipa';
import { loadMembershipReport, loadSavingsMovementReport, type OpsDeps } from './reports-ops.ts';
import { audit, loadDataQuality, loadLoanReport, loadPayrollReport, type DataQualityReport, type Part, type ReportActor, type ReportDeps } from './reports.ts';

/**
 * CSV export of the verified KOSIPA reports (checkpoint 10). Exports are AGGREGATE or DIAGNOSTIC only: no row carries a member name, NIK,
 * salary or bank detail, and no per-member export exists. Order of checks: grants (export AND the report's view grant) -> filter validation
 * -> rate limit (a refusal is audited as `denied`) -> audit of the export (if it cannot be written nothing is read) -> bounded reads -> size cap.
 * Recorded figures stay recorded: exact decimals, official balance stated as unavailable, review-only reconciliation, unknown periods labelled,
 * failed / truncated scans written as such (never as zero).
 */
export const EXPORT_CAPABILITY = 'kosipa.report.export' as const;
export const EXPORT_MAX_BYTES = 1_000_000;
export const EXPORT_MAX_ROWS = 5000;
const LOAN_BUCKET_ROW_LIMIT = 600;   // the reader's statement LIMIT: reaching it means the result may be incomplete
export type ExportFile = { filename: string; contentType: 'text/csv; charset=utf-8'; body: string; rows: number };

/** Per-user sliding window, per process (best effort: it bounds accidental and abusive repetition, it is not a security boundary). */
export interface ExportThrottle { consume(userId: number): { allowed: true } | { allowed: false; retryAfterSec: number }; }
export class WindowThrottle implements ExportThrottle {
  private readonly hits = new Map<number, number[]>();
  private readonly max: number; private readonly windowMs: number; private readonly now: () => number;
  constructor(max: number, windowMs: number, now: () => number = Date.now) { this.max = max; this.windowMs = windowMs; this.now = now; }
  consume(userId: number) {
    const t = this.now(); const recent = (this.hits.get(userId) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(userId, recent); return { allowed: false as const, retryAfterSec: Math.max(1, Math.ceil((recent[0] + this.windowMs - t) / 1000)) }; }
    recent.push(t); this.hits.set(userId, recent); return { allowed: true as const };
  }
}
export type ExportDeps = ReportDeps & { throttle?: ExportThrottle };

const META = (name: string, at: string, source: string, extra: [string, string][] = []): CsvCell[][] => [
  ['laporan', name], ['dibuat_utc', at], ['sumber', source], ['sifat_data', 'nilai tercatat di KOSIPA, baca saja; bukan saldo resmi'], ...extra, [],
];
const dec = (n: number): CsvCell => amount4ToDecimal(n);
const nul = (n: number | null): CsvCell => (n === null ? null : amount4ToDecimal(n));

async function begin(d: ExportDeps, actor: ReportActor, viewCap: 'kosipa.loan.view' | 'kosipa.payroll.view' | 'kosipa.member.view' | 'kosipa.savings.view' | 'either', subject: string, detail: Record<string, unknown>): Promise<void> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  const viewOk = viewCap === 'either' ? has('kosipa.loan.view') || has('kosipa.payroll.view') : has(viewCap);
  if (!has(EXPORT_CAPABILITY) || !viewOk) throw new KosipaError('FORBIDDEN');
  if (d.throttle) {
    const r = d.throttle.consume(actor.userId);
    if (!r.allowed) { await audit(d, actor, 'kosipa.report.export', { ...detail, reason: 'rate_limited' }, { subject, outcome: 'denied' }); throw new KosipaError('EXPORT_RATE_LIMITED'); }
  }
  await audit(d, actor, 'kosipa.report.export', { ...detail, format: 'csv' }, { subject });   // before any data is read; a failure aborts the export
}
function finish(filename: string, lines: CsvCell[][], dataRows: number): ExportFile {
  if (dataRows > EXPORT_MAX_ROWS) throw new KosipaError('EXPORT_TOO_LARGE');
  const body = csvDocument(lines);
  if (body.length > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
  return { filename, contentType: 'text/csv; charset=utf-8', body, rows: dataRows };
}

// ------------------------------------------------------------------------------------------------------------------ loans
export function loanReportLines(report: LoanReport, at: string): CsvCell[][] {
  const lines = META('Laporan pinjaman (pokok rencana tercatat per bulan dokumen)', at, 'trans_pinjaman (doc_date, doc_status, status_bayar, plan_pinjaman)', [
    ['tahun', report.year === null ? 'TIDAK ADA PINJAMAN BERTANGGAL' : String(report.year)],
    ['saldo_resmi', 'TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED): jumlah di bawah adalah pokok rencana, bukan outstanding'],
    ['tanggal_tidak_dapat_dipakai', 'dihitung terpisah (semua tahun); tidak ditempatkan pada bulan tebakan'],
  ]);
  lines.push(['baris', 'periode_atau_kondisi', 'status_dokumen', 'status_pelunasan', 'jumlah_dokumen', 'pokok_rencana']);
  for (const m of report.months) for (const l of m.lines) lines.push(['BULAN', m.bucket, l.docStatus ?? 'TIDAK ADA', l.repayment ?? 'TIDAK ADA', l.count, dec(l.plan4)]);
  for (const u of report.unusableDates) lines.push(['TANGGAL_TIDAK_DAPAT_DIPAKAI', u.kind, null, null, u.count, dec(u.plan4)]);
  return lines;
}
export async function exportLoanReportCsv(d: ExportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const requested = parseReportYear(params.tahun);
  await begin(d, actor, 'kosipa.loan.view', 'report:loan', { year: requested ? 1 : 0 });
  const { report } = await loadLoanReport(d, requested);
  const dataRows = report.months.reduce((n, m) => n + m.lines.length, 0) + report.unusableDates.length;
  if (dataRows >= LOAN_BUCKET_ROW_LIMIT) throw new KosipaError('EXPORT_TOO_LARGE');   // the statement LIMIT was reached: the result may be incomplete
  return finish(`laporan-pinjaman-${report.year ?? 'semua'}.csv`, loanReportLines(report, d.now().toISOString()), dataRows);
}

// ----------------------------------------------------------------------------------------------------------------- payroll
export function payrollReportLines(report: PayrollReport, at: string): CsvCell[][] {
  const lines = META('Laporan payroll (komponen potongan tercatat per batch)', at, 'trans_potongan_bulanan + trans_potongan_matrix (dibandingkan di memori, tanpa join)', [
    ['tahun', report.year === null ? 'TIDAK ADA BATCH' : String(report.year)],
    ['periode', 'dari kolom bulan/tahun tercatat; UNKNOWN bila tidak dapat dipastikan (tidak ditebak)'],
    ['perbandingan_toko', 'hanya untuk ditinjau: pemetaan cabang ke kolom TOKO_* belum dikonfirmasi pemilik proses; selisih A-B bukan otomatis kesalahan'],
  ]);
  lines.push(['periode', 'periode_dapat_dibandingkan', 'batch', 'grup', 'status', 'baris', 'anggota_unik', 'total_header', 'jumlah_baris', 'selisih_header_baris', 'catatan_integritas',
    'toko', 'ppob', 'piutang', 'kasbon', 'simpanan', 'lainnya', 'TOKO_TAMBUN', 'TOKO_MJ', 'TOKO_GIIC']);
  for (const p of report.periods) for (const b of p.batches) {
    const g = (k: string) => dec(b.groups.find((x) => x.group === k)?.amount4 ?? 0);
    lines.push([p.period, p.reconcilable ? 'YA' : 'TIDAK', b.header.docNo, b.header.group, b.status, b.rows, b.distinctNik, nul(b.headerTotal4), dec(b.rowsTotal4), b.headerTotal4 === null ? null : dec(b.headerTotal4 - b.rowsTotal4),
      b.issues.join(' '), g('toko'), g('ppob'), g('piutang'), g('kasbon'), g('simpanan'), g('lainnya'), dec(b.toko4.TOKO_TAMBUN), dec(b.toko4.TOKO_MJ), dec(b.toko4.TOKO_GIIC)]);
  }
  return lines;
}
export async function exportPayrollReportCsv(d: ExportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const requested = parseReportYear(params.tahun);
  await begin(d, actor, 'kosipa.payroll.view', 'report:payroll', { year: requested ? 1 : 0 });
  const report = await loadPayrollReport(d, requested);
  const rows = report.periods.reduce((n, p) => n + p.batches.length, 0);
  return finish(`laporan-payroll-${report.year ?? 'semua'}.csv`, payrollReportLines(report, d.now().toISOString()), rows);
}

// ------------------------------------------------------------------------------------------------------------ data quality
const STATUS_TEXT: Record<ScanStatus, string> = { OK: 'OK', FAILED: 'GAGAL_BACA', TRUNCATED: 'TERPOTONG', RESTRICTED: 'DIBATASI' };
export function dataQualityLines(q: DataQualityReport, at: string): CsvCell[][] {
  const lines = META('Kualitas data keuangan KOSIPA (diagnostik baca-saja)', at, 'trans_pinjaman, trans_pinjaman_dtl, trans_potongan_bulanan, trans_potongan_matrix', [
    ['catatan', 'tidak ada perbaikan data otomatis; jumlah kosong berarti pembacaan gagal/terpotong/dibatasi, BUKAN nol temuan; contoh dibatasi 20 per diagnostik; tanpa NIK atau data anggota'],
  ]);
  lines.push(['bagian', 'diagnostik', 'jenis_temuan', 'status_pembacaan', 'jumlah', 'jumlah_batas_bawah', 'referensi_contoh', 'keterangan']);
  const kindText = (k: DiagnosticKind) => k;
  const row = (section: string, key: string, name: string, part: Part<unknown> | 'restricted', count: (d: never) => number | null, refs: (d: never) => string[], note: string, capped: (d: never) => boolean = () => false) => {
    if (part === 'restricted') { lines.push([section, name, kindText(DIAGNOSTIC_KIND[key]), STATUS_TEXT.RESTRICTED, null, null, null, 'tidak ada hak baca untuk bagian ini']); return; }
    const status = scanStatusOf(part);
    if (part.state !== 'ok') { lines.push([section, name, kindText(DIAGNOSTIC_KIND[key]), STATUS_TEXT[status], null, null, null, `pembacaan tidak lengkap (${part.reason}); bukan nol temuan`]); return; }
    const c = count(part.data as never); const refList = refs(part.data as never);
    lines.push([section, name, kindText(DIAGNOSTIC_KIND[key]), STATUS_TEXT.OK, capped(part.data as never) ? null : c, capped(part.data as never) ? c : null, refList.join(' | ') || null, note]);
  };
  if (q.loans === 'restricted') { for (const [k, n] of [['duplicateRefs', 'nomor dokumen pinjaman ganda'], ['statusConflicts', 'status pinjaman bertentangan'], ['loanDates', 'tanggal dokumen pinjaman tidak dapat dipakai'], ['installmentDates', 'tanggal jatuh tempo angsuran tidak valid'], ['orphanInstallments', 'angsuran tanpa dokumen pinjaman']]) row('PINJAMAN', k, n, 'restricted', () => 0, () => [], ''); }
  else {
    const l = q.loans;
    row('PINJAMAN', 'duplicateRefs', 'nomor dokumen pinjaman ganda', l.duplicateRefs, (x: { total: number }) => x.total, (x: { sample: { docNo: string }[] }) => x.sample.map((s) => s.docNo), 'dokumen dengan nomor sama tidak digabung', (x: { capped: boolean }) => x.capped);
    row('PINJAMAN', 'statusConflicts', 'status pinjaman bertentangan', l.statusConflicts, (x: { total: number }) => x.total, (x: { sample: { docNo: string }[] }) => x.sample.map((s) => s.docNo), 'satu pinjaman dapat memenuhi lebih dari satu kondisi');
    row('PINJAMAN', 'loanDates', 'tanggal dokumen pinjaman tidak dapat dipakai', l.loanDates, (x: { zero: number; missing: number; implausible: number }) => x.zero + x.missing + x.implausible, () => [], 'nol + kosong + tidak wajar (di luar 1990-2100)');
    row('PINJAMAN', 'installmentDates', 'tanggal jatuh tempo angsuran tidak valid', l.installmentDates, (x: { zero: number; missing: number; implausible: number }) => x.zero + x.missing + x.implausible, () => [], 'nol + kosong + tidak wajar (mis. 9999-12-10); tidak ditempatkan pada bulan');
    row('PINJAMAN', 'orphanInstallments', 'angsuran tanpa dokumen pinjaman (nomor dokumen)', l.orphans, (x: { orphanDocs: { total: number } }) => x.orphanDocs.total, (x: { orphanDocs: { sample: { docNo: string }[] } }) => x.orphanDocs.sample.map((s) => s.docNo), 'dibandingkan per nomor dokumen saja: potensi, bukan bukti');
    row('PINJAMAN', 'approvedWithoutSchedule', 'pinjaman APPROVED tanpa jadwal angsuran', l.orphans, (x: { approvedWithoutSchedule: { total: number } }) => x.approvedWithoutSchedule.total, (x: { approvedWithoutSchedule: { sample: { docNo: string }[] } }) => x.approvedWithoutSchedule.sample.map((s) => s.docNo), 'potensi anomali');
  }
  if (q.payroll === 'restricted') { for (const [k, n] of [['batchTotals', 'total header berbeda dari jumlah baris'], ['rowTotalsMaterial', 'total baris berbeda dari komponen (>= setengah sen)'], ['duplicateBatchNik', 'lebih dari satu baris per anggota dalam satu batch']]) row('PAYROLL', k, n, 'restricted', () => 0, () => [], ''); }
  else {
    const p = q.payroll;
    row('PAYROLL', 'batchTotals', 'batch dengan temuan integritas (total header, tanpa baris, total kosong, NIK ganda, status tidak dikenal)', p.batchTotals, (x: { findings: { total: number } }) => x.findings.total, (x: { findings: { sample: { docNo: string }[] } }) => x.findings.sample.map((s) => s.docNo), 'ambang selisih total header: setengah sen');
    row('PAYROLL', 'rowTotalsMaterial', 'total baris berbeda dari jumlah komponen (>= setengah sen)', p.rowTotals, (x: { totalDiffersByHalfSenOrMore: number }) => x.totalDiffersByHalfSenOrMore, (x: { sample: { docNo: string }[] }) => [...new Set(x.sample.map((s) => s.docNo))], 'selisih material');
    row('PAYROLL', 'rowTotalsSubSen', 'total baris berbeda pada tingkat sub-sen', p.rowTotals, (x: { totalDiffersFromComponents: number; totalDiffersByHalfSenOrMore: number }) => x.totalDiffersFromComponents - x.totalDiffersByHalfSenOrMore, () => [], 'presisi desimal data lama; tidak material');
    row('PAYROLL', 'rowTotalsNoComponents', 'baris bertotal tetapi tanpa komponen', p.rowTotals, (x: { totalWithoutComponents: number }) => x.totalWithoutComponents, () => [], 'potensi: komponen mungkin tidak tercatat');
    row('PAYROLL', 'duplicateBatchNik', 'pasangan batch-NIK dengan lebih dari satu baris', p.duplicateBatchNik, (x: { total: number }) => x.total, (x: { sample: { docNo: string }[] }) => [...new Set(x.sample.map((s) => s.docNo))], 'baris tidak digabung; NIK tidak diekspor', (x: { capped: boolean }) => x.capped);
  }
  lines.push(['PEMETAAN', 'pemetaan cabang ke kolom toko payroll', DIAGNOSTIC_KIND.branchMapping, q.branchMapping.state === 'UNVERIFIED' ? 'BELUM_DIVERIFIKASI' : 'DIKONFIRMASI', null, null, null,
    q.branchMapping.state === 'UNVERIFIED' ? 'perbandingan TOKO tetap hanya untuk ditinjau' : 'dikonfirmasi pemilik proses melalui konfigurasi']);
  return lines;
}
export async function exportDataQualityCsv(d: ExportDeps, actor: ReportActor): Promise<ExportFile> {
  await begin(d, actor, 'either', 'report:quality', {});
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  const q = await loadDataQuality(d, has('kosipa.loan.view'), has('kosipa.payroll.view'));
  const lines = dataQualityLines(q, d.now().toISOString());
  return finish('kualitas-data-keuangan.csv', lines, lines.length);
}

// -------------------------------------------------------------------------------------------------------------- membership
export type ExportOpsDeps = OpsDeps & { throttle?: ExportThrottle };
export function membershipLines(r: MembershipReport, at: string): CsvCell[][] {
  const lines = META('Ringkasan keanggotaan (status tercatat)', at, 'm_anggota (status_anggota, status_karyawan, kd_group, tgl_keluar): hanya hitungan, tanpa data anggota', [
    ['total_anggota', String(r.total)],
    ['tgl_keluar', 'fakta tercatat saja: bukan daftar nonaktif; perlakuan kontrak berakhir menunggu keputusan pemilik (D3)'],
    ['nilai_tidak_dikenal', `status=${r.unrecognised.status}; karyawan=${r.unrecognised.employment}; grup=${r.unrecognised.group} (nilai di luar daftar dihitung terpisah, tidak ditebak)`],
  ]);
  lines.push(['bagian', 'status_anggota', 'status_karyawan_atau_grup', 'dikenal', 'jumlah', 'tgl_keluar_terisi', 'tgl_keluar_sudah_lewat', 'tanpa_nik']);
  for (const l of r.lines) lines.push(['STATUS', l.status ?? 'KOSONG', l.employment ?? 'KOSONG', l.statusKnown && l.employmentKnown ? 'YA' : 'TIDAK', l.members, l.withExitDate, l.exitDateBeforeToday, l.withoutNik]);
  for (const g of r.groups) lines.push(['GRUP', null, g.group ?? 'KOSONG', g.known ? 'YA' : 'TIDAK', g.members, null, null, null]);
  return lines;
}
export async function exportMembershipReportCsv(d: ExportOpsDeps, actor: ReportActor): Promise<ExportFile> {
  await begin(d, actor, 'kosipa.member.view', 'report:membership', {});
  const part = await loadMembershipReport(d);
  if (part.state !== 'ok') throw new KosipaError(part.reason === 'SOURCE_TRUNCATED' ? 'EXPORT_TOO_LARGE' : 'EXPORT_SOURCE_UNAVAILABLE');   // never a partial or empty-looking file
  const lines = membershipLines(part.data, d.now().toISOString());
  return finish('ringkasan-keanggotaan.csv', lines, lines.length);
}

// ------------------------------------------------------------------------------------------------------- savings movements
export function savingsMovementLines(r: SavingsMovementReport, at: string): CsvCell[][] {
  const lines = META('Ringkasan mutasi simpanan (jumlah mutasi tercatat, BUKAN saldo)', at, 'trans_simpanan_dtl + trans_simpanan (dicocokkan per nomor dokumen di memori, tanpa join)', [
    ['tahun', r.year === null ? 'TIDAK ADA MUTASI BERTANGGAL' : String(r.year)],
    ['saldo_resmi', 'TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED): definisi saldo awal belum diverifikasi; kolom saldo pada baris mutasi tidak pernah diisi'],
    ['status', 'status dokumen (header) menentukan: APPROVED disetujui, OPEN menunggu, lainnya tidak berlaku'],
  ]);
  lines.push(['baris', 'bulan_atau_kondisi', 'jenis_simpanan', 'jumlah_mutasi', 'kredit_disetujui', 'debit_disetujui', 'jasa_disetujui', 'kredit_menunggu', 'debit_menunggu', 'mutasi_status_lain']);
  for (const l of r.lines) lines.push(['BULAN', l.bucket, l.type, l.rows, dec(l.posted4.credit), dec(l.posted4.debit), dec(l.posted4.interest), dec(l.pending4.credit), dec(l.pending4.debit), l.voidRows]);
  for (const u of r.unplaced) lines.push(['TIDAK_DITEMPATKAN', u.kind, u.type, u.rows, null, null, null, null, null, null]);
  return lines;
}
export async function exportSavingsMovementCsv(d: ExportOpsDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const year = parseReportYear(params.tahun);
  await begin(d, actor, 'kosipa.savings.view', 'report:savings', { year: year ? 1 : 0 });
  const part = await loadSavingsMovementReport(d, year);
  if (part.state !== 'ok') throw new KosipaError(part.reason === 'SOURCE_TRUNCATED' ? 'EXPORT_TOO_LARGE' : 'EXPORT_SOURCE_UNAVAILABLE');
  const lines = savingsMovementLines(part.data, d.now().toISOString());
  return finish(`ringkasan-mutasi-simpanan-${part.data.year ?? 'semua'}.csv`, lines, lines.length);
}
