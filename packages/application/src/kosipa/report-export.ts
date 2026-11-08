import {
  DIAGNOSTIC_KIND, KosipaError, amount4ToDecimal, csvDocument, parseReportYear, renderKosipaPdfDocument, scanStatusOf, xlsxDocument,
  type CsvCell, type DiagnosticKind, type KosipaPdfDocumentSpec, type LoanReport, type MembershipReport, type PayrollReport, type SavingsMovementReport, type ScanStatus,
} from '@koperasi/domain/kosipa';
import { formatRupiahDocument, rupiahFromAmount4 } from '@koperasi/domain/money/rupiah';
import { loadMembershipReport, loadSavingsMovementReport, type OpsDeps } from './reports-ops.ts';
import { audit, loadDataQuality, loadLoanReport, loadPayrollReport, type DataQualityReport, type Part, type ReportActor, type ReportDeps } from './reports.ts';

/**
 * Multi-format (`CSV`, `XLSX`, `PDF`) export of the verified KOSIPA reports (checkpoint 10 + IE-BL-020).
 * Exports are AGGREGATE or DIAGNOSTIC only: no row carries a member name, NIK, salary or bank detail.
 * Order of checks: grants (export AND the report's view grant) -> filter & format validation -> rate limit
 * (a refusal is audited as `denied`) -> audit of the export (if it cannot be written nothing is read) -> bounded reads -> size cap.
 */
export const EXPORT_CAPABILITY = 'kosipa.report.export' as const;
export const EXPORT_MAX_BYTES = 1_000_000;
export const EXPORT_MAX_ROWS = 5000;
const LOAN_BUCKET_ROW_LIMIT = 600;   // the reader's statement LIMIT: reaching it means the result may be incomplete

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';
export type ExportContentType =
  | 'text/csv; charset=utf-8'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/pdf';

export type ExportFile = {
  filename: string;
  contentType: ExportContentType;
  body: string | Uint8Array;
  rows: number;
};

export type CsvExportFile = ExportFile & { contentType: 'text/csv; charset=utf-8'; body: string };

export function parseExportFormat(params?: Record<string, string | string[] | undefined>): ExportFormat {
  const raw = Array.isArray(params?.format) ? params?.format[0] : params?.format;
  if (raw === undefined || raw === '') return 'csv';
  if (raw === 'csv' || raw === 'xlsx' || raw === 'pdf') return raw;
  throw new KosipaError('FORMAT_INVALID');
}

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
const rp = (units: number | null): string => (units === null ? '-' : formatRupiahDocument(rupiahFromAmount4(units), { placeholder: '-' }));

async function begin(
  d: ExportDeps,
  actor: ReportActor,
  viewCap: 'kosipa.loan.view' | 'kosipa.payroll.view' | 'kosipa.member.view' | 'kosipa.savings.view' | 'either',
  subject: string,
  detail: Record<string, unknown>,
  format: ExportFormat = 'csv',
): Promise<void> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  const viewOk = viewCap === 'either' ? has('kosipa.loan.view') || has('kosipa.payroll.view') : has(viewCap);
  if (!has(EXPORT_CAPABILITY) || !viewOk) throw new KosipaError('FORBIDDEN');
  if (d.throttle) {
    const r = d.throttle.consume(actor.userId);
    if (!r.allowed) { await audit(d, actor, 'kosipa.report.export', { ...detail, reason: 'rate_limited' }, { subject, outcome: 'denied' }); throw new KosipaError('EXPORT_RATE_LIMITED'); }
  }
  await audit(d, actor, 'kosipa.report.export', { ...detail, format }, { subject });   // before any data is read; a failure aborts the export
}

function splitMetaAndTable(lines: CsvCell[][]): { meta: CsvCell[][]; table: CsvCell[][] } {
  const sep = lines.findIndex((r) => r.length === 0);
  if (sep === -1) return { meta: [], table: lines };
  return { meta: lines.slice(0, sep), table: lines.slice(sep + 1) };
}

function finishCsv(baseName: string, lines: CsvCell[][], dataRows: number): CsvExportFile {
  if (dataRows > EXPORT_MAX_ROWS) throw new KosipaError('EXPORT_TOO_LARGE');
  const body = csvDocument(lines);
  if (body.length > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
  return { filename: `${baseName}.csv`, contentType: 'text/csv; charset=utf-8', body, rows: dataRows };
}

function finishMulti(
  baseName: string,
  format: ExportFormat,
  lines: CsvCell[][],
  dataRows: number,
  buildPdf: () => KosipaPdfDocumentSpec,
): ExportFile {
  if (format === 'csv') return finishCsv(baseName, lines, dataRows);
  if (dataRows > EXPORT_MAX_ROWS) throw new KosipaError('EXPORT_TOO_LARGE');
  if (format === 'xlsx') {
    const { meta, table } = splitMetaAndTable(lines);
    const body = xlsxDocument([
      { name: 'Laporan', rows: table },
      { name: 'Info', rows: [['properti', 'nilai'], ...meta] },
    ]);
    if (body.byteLength > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
    return {
      filename: `${baseName}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      body,
      rows: dataRows,
    };
  }
  const body = renderKosipaPdfDocument(buildPdf());
  if (body.byteLength > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
  return {
    filename: `${baseName}.pdf`,
    contentType: 'application/pdf',
    body,
    rows: dataRows,
  };
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

function loanReportPdfSpec(report: LoanReport, at: string): KosipaPdfDocumentSpec {
  const totalDocs = report.months.reduce((n, m) => n + m.count, 0);
  const totalPlan4 = report.months.reduce((n, m) => n + m.plan4, 0);
  const unusableCount = report.unusableDates.reduce((n, u) => n + u.count, 0);
  const rows: string[][] = [];
  for (const m of report.months) {
    for (const l of m.lines) {
      rows.push(['BULAN', m.bucket, l.docStatus ?? 'TIDAK ADA', l.repayment ?? 'TIDAK ADA', String(l.count), rp(l.plan4)]);
    }
  }
  for (const u of report.unusableDates) {
    rows.push(['TANGGAL_TIDAK_VALID', u.kind, '-', '-', String(u.count), rp(u.plan4)]);
  }
  return {
    orientation: 'portrait',
    title: 'LAPORAN PINJAMAN TERCATAT',
    subtitle: 'Agregasi pokok rencana berdasarkan bulan dokumen, status persetujuan, dan status pelunasan.',
    badge: { label: `TAHUN ${report.year ?? 'SEMUA'}`, tone: 'info' },
    docMeta: [
      { label: 'Laporan', value: 'Pinjaman Tercatat' },
      { label: 'Tahun', value: report.year === null ? 'Semua' : String(report.year) },
      { label: 'Dicetak (UTC)', value: at.slice(0, 19).replace('T', ' ') },
    ],
    sections: [
      {
        kind: 'kpi-strip',
        items: [
          { label: 'TOTAL DOKUMEN', value: String(totalDocs), subtext: `Tahun ${report.year ?? 'Semua'}` },
          { label: 'POKOK RENCANA', value: rp(totalPlan4), subtext: 'Rekaman trans_pinjaman', highlight: true },
          { label: 'TANGGAL TIDAK VALID', value: String(unusableCount), subtext: 'Dihitung terpisah' },
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Status Saldo Resmi: TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED)',
        lines: [
          'Angka pada laporan ini adalah pokok rencana pada dokumen pinjaman (plan_pinjaman), bukan saldo outstanding resmi.',
          'Dokumen dengan tanggal kosong, nol, atau di luar rentang wajar ditampilkan terpisah tanpa ditebak bulannya.',
        ],
      },
      {
        kind: 'table',
        title: 'Rincian Bulanan & Kondisi Tanggal',
        columns: [
          { header: 'Kelompok', width: 95, align: 'left' },
          { header: 'Periode / Kondisi', width: 85, align: 'left', mono: true },
          { header: 'Status Dokumen', width: 85, align: 'left' },
          { header: 'Pelunasan', width: 85, align: 'left' },
          { header: 'Dokumen', width: 55, align: 'right' },
          { header: 'Pokok Rencana', width: 118, align: 'right' },
        ],
        rows: rows.length > 0 ? rows : [['-', 'Tidak ada data', '-', '-', '0', rp(0)]],
        footerRow: ['TOTAL BULANAN', '', '', '', String(totalDocs), rp(totalPlan4)],
      },
    ],
  };
}

export async function exportLoanReport(d: ExportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.loan.view')) throw new KosipaError('FORBIDDEN');
  const requested = parseReportYear(params.tahun);
  const format = parseExportFormat(params);
  await begin(d, actor, 'kosipa.loan.view', 'report:loan', { year: requested ? 1 : 0 }, format);
  const { report } = await loadLoanReport(d, requested);
  const dataRows = report.months.reduce((n, m) => n + m.lines.length, 0) + report.unusableDates.length;
  if (dataRows >= LOAN_BUCKET_ROW_LIMIT) throw new KosipaError('EXPORT_TOO_LARGE');
  const at = d.now().toISOString();
  return finishMulti(`laporan-pinjaman-${report.year ?? 'semua'}`, format, loanReportLines(report, at), dataRows, () => loanReportPdfSpec(report, at));
}

export async function exportLoanReportCsv(d: ExportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<CsvExportFile> {
  return (await exportLoanReport(d, actor, { ...params, format: 'csv' })) as CsvExportFile;
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

function payrollReportPdfSpec(report: PayrollReport, at: string): KosipaPdfDocumentSpec {
  const batches = report.periods.flatMap((p) => p.batches.map((b) => ({ period: p.period, reconcilable: p.reconcilable, b })));
  const totalRows = batches.reduce((n, x) => n + x.b.rows, 0);
  const totalAmount4 = batches.reduce((n, x) => n + x.b.rowsTotal4, 0);
  const rows = batches.map(({ period, b }) => [
    period,
    b.header.docNo,
    b.header.group ?? '-',
    b.status,
    String(b.rows),
    rp(b.headerTotal4),
    rp(b.rowsTotal4),
    b.issues.join(', ') || 'OK',
  ]);
  return {
    orientation: 'landscape',
    title: 'LAPORAN BATCH POTONGAN PAYROLL',
    subtitle: 'Ringkasan total header dibandingkan dengan jumlah baris matriks potongan per batch.',
    badge: { label: 'REVIEW_ONLY · TOKO', tone: 'warning' },
    docMeta: [
      { label: 'Laporan', value: 'Batch Payroll' },
      { label: 'Tahun', value: report.year === null ? 'Semua' : String(report.year) },
      { label: 'Dicetak (UTC)', value: at.slice(0, 19).replace('T', ' ') },
    ],
    sections: [
      {
        kind: 'kpi-strip',
        items: [
          { label: 'TOTAL BATCH', value: String(batches.length), subtext: `Tahun ${report.year ?? 'Semua'}` },
          { label: 'TOTAL BARIS MATRIKS', value: String(totalRows), subtext: 'Baris anggota tercatat' },
          { label: 'JUMLAH BARIS TERCATAT', value: rp(totalAmount4), subtext: 'Akumulasi trans_potongan_matrix', highlight: true },
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Catatan Rekonsiliasi Toko (REVIEW_ONLY)',
        lines: [
          'Perbandingan kolom TOKO_* bersifat hanya untuk ditinjau (REVIEW_ONLY) karena pemetaan cabang belum dikonfirmasi pemilik proses.',
        ],
      },
      {
        kind: 'table',
        title: 'Daftar Batch Potongan Payroll',
        columns: [
          { header: 'Periode', width: 65, align: 'left', mono: true },
          { header: 'No. Batch', width: 95, align: 'left', mono: true },
          { header: 'Grup', width: 75, align: 'left' },
          { header: 'Status', width: 65, align: 'left' },
          { header: 'Baris', width: 45, align: 'right' },
          { header: 'Total Header', width: 115, align: 'right' },
          { header: 'Jumlah Baris', width: 115, align: 'right' },
          { header: 'Integritas', width: 140, align: 'left' },
        ],
        rows: rows.length > 0 ? rows : [['-', 'Tidak ada batch', '-', '-', '0', '-', rp(0), '-']],
        footerRow: ['TOTAL', `${batches.length} batch`, '', '', String(totalRows), '', rp(totalAmount4), ''],
      },
    ],
  };
}

export async function exportPayrollReport(d: ExportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.payroll.view')) throw new KosipaError('FORBIDDEN');
  const requested = parseReportYear(params.tahun);
  const format = parseExportFormat(params);
  await begin(d, actor, 'kosipa.payroll.view', 'report:payroll', { year: requested ? 1 : 0 }, format);
  const report = await loadPayrollReport(d, requested);
  const rows = report.periods.reduce((n, p) => n + p.batches.length, 0);
  const at = d.now().toISOString();
  return finishMulti(`laporan-payroll-${report.year ?? 'semua'}`, format, payrollReportLines(report, at), rows, () => payrollReportPdfSpec(report, at));
}

export async function exportPayrollReportCsv(d: ExportDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<CsvExportFile> {
  return (await exportPayrollReport(d, actor, { ...params, format: 'csv' })) as CsvExportFile;
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

function dataQualityPdfSpec(lines: CsvCell[][], at: string): KosipaPdfDocumentSpec {
  const { table } = splitMetaAndTable(lines);
  const dataRows = table.slice(1).map((r) => [
    String(r[0] ?? '-'),
    String(r[1] ?? '-'),
    String(r[2] ?? '-'),
    String(r[3] ?? '-'),
    r[4] !== null && r[4] !== undefined ? String(r[4]) : r[5] !== null && r[5] !== undefined ? `>=${r[5]}` : '-',
    String(r[6] ?? '-'),
  ]);
  return {
    orientation: 'landscape',
    title: 'LAPORAN DIAGNOSTIK KUALITAS DATA',
    subtitle: 'Pemeriksaan integritas rekaman pinjaman dan payroll tanpa modifikasi otomatis.',
    badge: { label: 'DIAGNOSTIK BACA-SAJA', tone: 'info' },
    docMeta: [
      { label: 'Laporan', value: 'Kualitas Data' },
      { label: 'Dicetak (UTC)', value: at.slice(0, 19).replace('T', ' ') },
    ],
    sections: [
      {
        kind: 'callout',
        tone: 'info',
        title: 'Prinsip Diagnostik Tanpa Perbaikan Otomatis',
        lines: [
          'Nilai jumlah yang kosong menunjukkan pembacaan gagal, terpotong, atau dibatasi hak akses, bukan nol temuan.',
          'Contoh referensi hanya menampilkan nomor dokumen (maksimal 20 per pemeriksaan) tanpa NIK atau data pribadi anggota.',
        ],
      },
      {
        kind: 'table',
        title: 'Ringkasan Pemeriksaan Integritas Data',
        columns: [
          { header: 'Bagian', width: 70, align: 'left' },
          { header: 'Diagnostik', width: 220, align: 'left' },
          { header: 'Klasifikasi', width: 110, align: 'left', mono: true },
          { header: 'Status Baca', width: 85, align: 'left' },
          { header: 'Jumlah', width: 60, align: 'right' },
          { header: 'Contoh Dokumen', width: 160, align: 'left', mono: true },
        ],
        rows: dataRows,
      },
    ],
  };
}

export async function exportDataQuality(d: ExportDeps, actor: ReportActor, params?: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || (!has('kosipa.loan.view') && !has('kosipa.payroll.view'))) throw new KosipaError('FORBIDDEN');
  const format = parseExportFormat(params);
  await begin(d, actor, 'either', 'report:quality', {}, format);
  const q = await loadDataQuality(d, has('kosipa.loan.view'), has('kosipa.payroll.view'));
  const at = d.now().toISOString();
  const lines = dataQualityLines(q, at);
  return finishMulti('kualitas-data-keuangan', format, lines, lines.length, () => dataQualityPdfSpec(lines, at));
}

export async function exportDataQualityCsv(d: ExportDeps, actor: ReportActor): Promise<CsvExportFile> {
  return (await exportDataQuality(d, actor, { format: 'csv' })) as CsvExportFile;
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

function membershipPdfSpec(r: MembershipReport, at: string): KosipaPdfDocumentSpec {
  const rows: string[][] = [
    ...r.lines.map((l) => ['STATUS', l.status ?? 'KOSONG', l.employment ?? 'KOSONG', l.statusKnown && l.employmentKnown ? 'YA' : 'TIDAK', String(l.members), String(l.withExitDate), String(l.withoutNik)]),
    ...r.groups.map((g) => ['GRUP', '-', g.group ?? 'KOSONG', g.known ? 'YA' : 'TIDAK', String(g.members), '-', '-']),
  ];
  return {
    orientation: 'portrait',
    title: 'LAPORAN KOMPOSISI KEANGGOTAAN',
    subtitle: 'Distribusi anggota berdasarkan status keanggotaan, status kekaryawanan, dan grup.',
    badge: { label: 'AGREGAT TANPA DATA PRIBADI', tone: 'info' },
    docMeta: [
      { label: 'Laporan', value: 'Keanggotaan' },
      { label: 'Total Anggota', value: String(r.total) },
      { label: 'Dicetak (UTC)', value: at.slice(0, 19).replace('T', ' ') },
    ],
    sections: [
      {
        kind: 'kpi-strip',
        items: [
          { label: 'TOTAL REKAMAN ANGGOTA', value: String(r.total), subtext: 'Tabel m_anggota', highlight: true },
          { label: 'STATUS TIDAK DIKENAL', value: String(r.unrecognised.status), subtext: 'Di luar daftar baku' },
          { label: 'GRUP TIDAK DIKENAL', value: String(r.unrecognised.group), subtext: 'Di luar daftar baku' },
        ],
      },
      {
        kind: 'callout',
        tone: 'info',
        title: 'Catatan Interpretasi Status & Tanggal Keluar',
        lines: [
          'Kolom tgl_keluar disajikan sebagai fakta tercatat, bukan penentu otomatis status nonaktif.',
          'Nilai status atau grup yang tidak dikenal ditampilkan terpisah tanpa ditebak.',
        ],
      },
      {
        kind: 'table',
        title: 'Rincian Status & Grup Anggota',
        columns: [
          { header: 'Bagian', width: 65, align: 'left' },
          { header: 'Status Anggota', width: 95, align: 'left' },
          { header: 'Karyawan / Grup', width: 110, align: 'left' },
          { header: 'Dikenal', width: 55, align: 'center' },
          { header: 'Jumlah', width: 65, align: 'right' },
          { header: 'Tgl Keluar', width: 65, align: 'right' },
          { header: 'Tanpa NIK', width: 65, align: 'right' },
        ],
        rows,
      },
    ],
  };
}

export async function exportMembershipReport(d: ExportOpsDeps, actor: ReportActor, params?: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const format = parseExportFormat(params);
  await begin(d, actor, 'kosipa.member.view', 'report:membership', {}, format);
  const part = await loadMembershipReport(d);
  if (part.state !== 'ok') throw new KosipaError(part.reason === 'SOURCE_TRUNCATED' ? 'EXPORT_TOO_LARGE' : 'EXPORT_SOURCE_UNAVAILABLE');
  const at = d.now().toISOString();
  const lines = membershipLines(part.data, at);
  return finishMulti('ringkasan-keanggotaan', format, lines, lines.length, () => membershipPdfSpec(part.data, at));
}

export async function exportMembershipReportCsv(d: ExportOpsDeps, actor: ReportActor): Promise<CsvExportFile> {
  return (await exportMembershipReport(d, actor, { format: 'csv' })) as CsvExportFile;
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

function savingsMovementPdfSpec(r: SavingsMovementReport, at: string): KosipaPdfDocumentSpec {
  const totalCredit4 = r.lines.reduce((n, l) => n + l.posted4.credit, 0);
  const totalDebit4 = r.lines.reduce((n, l) => n + l.posted4.debit, 0);
  const totalInterest4 = r.lines.reduce((n, l) => n + l.posted4.interest, 0);
  const rows: string[][] = [
    ...r.lines.map((l) => ['BULAN', l.bucket, l.type, String(l.rows), rp(l.posted4.credit), rp(l.posted4.debit), rp(l.posted4.interest), rp(l.pending4.credit)]),
    ...r.unplaced.map((u) => ['TIDAK_DITEMPATKAN', u.kind, u.type, String(u.rows), '-', '-', '-', '-']),
  ];
  return {
    orientation: 'landscape',
    title: 'LAPORAN MUTASI SIMPANAN TERCATAT',
    subtitle: 'Ringkasan mutasi kredit, debit, dan jasa per bulan dokumen dan jenis simpanan.',
    badge: { label: `TAHUN ${r.year ?? 'SEMUA'}`, tone: 'info' },
    docMeta: [
      { label: 'Laporan', value: 'Mutasi Simpanan' },
      { label: 'Tahun', value: r.year === null ? 'Semua' : String(r.year) },
      { label: 'Dicetak (UTC)', value: at.slice(0, 19).replace('T', ' ') },
    ],
    sections: [
      {
        kind: 'kpi-strip',
        items: [
          { label: 'KREDIT DISETUJUI', value: rp(totalCredit4), subtext: 'Status header APPROVED', highlight: true },
          { label: 'DEBIT DISETUJUI', value: rp(totalDebit4), subtext: 'Status header APPROVED' },
          { label: 'JASA DISETUJUI', value: rp(totalInterest4), subtext: 'Status header APPROVED' },
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Status Saldo Resmi: TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED)',
        lines: [
          'Angka pada laporan ini adalah mutasi tercatat per periode, bukan saldo akhir simpanan.',
          'Definisi saldo awal belum diverifikasi dan kolom saldo pada tabel detail tidak pernah diisi.',
        ],
      },
      {
        kind: 'table',
        title: 'Mutasi Simpanan per Bulan & Jenis',
        columns: [
          { header: 'Kelompok', width: 90, align: 'left' },
          { header: 'Periode / Kondisi', width: 80, align: 'left', mono: true },
          { header: 'Jenis Simpanan', width: 95, align: 'left' },
          { header: 'Baris', width: 50, align: 'right' },
          { header: 'Kredit (APPROVED)', width: 115, align: 'right' },
          { header: 'Debit (APPROVED)', width: 115, align: 'right' },
          { header: 'Jasa (APPROVED)', width: 105, align: 'right' },
          { header: 'Kredit (OPEN)', width: 105, align: 'right' },
        ],
        rows: rows.length > 0 ? rows : [['-', 'Tidak ada mutasi', '-', '0', rp(0), rp(0), rp(0), rp(0)]],
        footerRow: ['TOTAL DISETUJUI', '', '', '', rp(totalCredit4), rp(totalDebit4), rp(totalInterest4), ''],
      },
    ],
  };
}

export async function exportSavingsMovement(d: ExportOpsDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.savings.view')) throw new KosipaError('FORBIDDEN');
  const year = parseReportYear(params.tahun);
  const format = parseExportFormat(params);
  await begin(d, actor, 'kosipa.savings.view', 'report:savings', { year: year ? 1 : 0 }, format);
  const part = await loadSavingsMovementReport(d, year);
  if (part.state !== 'ok') throw new KosipaError(part.reason === 'SOURCE_TRUNCATED' ? 'EXPORT_TOO_LARGE' : 'EXPORT_SOURCE_UNAVAILABLE');
  const at = d.now().toISOString();
  const lines = savingsMovementLines(part.data, at);
  return finishMulti(`ringkasan-mutasi-simpanan-${part.data.year ?? 'semua'}`, format, lines, lines.length, () => savingsMovementPdfSpec(part.data, at));
}

export async function exportSavingsMovementCsv(d: ExportOpsDeps, actor: ReportActor, params: Record<string, string | string[] | undefined>): Promise<CsvExportFile> {
  return (await exportSavingsMovement(d, actor, { ...params, format: 'csv' })) as CsvExportFile;
}
