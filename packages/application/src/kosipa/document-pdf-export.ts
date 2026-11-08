import {
  KosipaError, LOAN_HEADER_LIMIT, assessSchedule, classifyLegacyDate, describeLoan, describeMovement, describeRow, describeScheduleRow,
  nikLookupKeys, parseDocNo, parseLedgerQuery, parseLoanDocNo, parseMemberId, parsePayrollPeriod, periodLabel, renderKosipaPdfDocument, summarizeTypes,
  type LegacyDate, type PdfSection,
} from '@koperasi/domain/kosipa';
import { formatRupiahDocument, rupiahFromAmount4 } from '@koperasi/domain/money/rupiah';
import type { LoanDeps } from './loans.ts';
import type { PayrollDeps } from './payroll.ts';
import type { ReportActor } from './reports.ts';
import { EXPORT_CAPABILITY, EXPORT_MAX_BYTES, type ExportFile, type ExportThrottle } from './report-export.ts';
import type { SavingsDeps } from './savings.ts';

/**
 * Operational detail PDF exports (KOS-PDF-001/002 Loan Card, KOS-PDF-017 Payroll Member Slip, KOS-PDF-014 Savings Passbook).
 * Read-only, gated by `kosipa.report.export` AND the module's view capability, rate-limited, audited BEFORE any database read,
 * and rendered with the KKISI Financial Document Standard engine (`renderKosipaPdfDocument`). Member NIKs are always masked.
 */

const SCHEDULE_PDF_LIMIT = 240;
const PASSBOOK_MOVEMENT_LIMIT = 100;
const INSTALLMENT_PDF_LIMIT = 50;

export type LoanPdfExportDeps = LoanDeps & { throttle?: ExportThrottle };
export type PayrollPdfExportDeps = PayrollDeps & { throttle?: ExportThrottle };
export type SavingsPdfExportDeps = SavingsDeps & { throttle?: ExportThrottle };

const rp = (units: number | null): string => (units === null ? '-' : formatRupiahDocument(rupiahFromAmount4(units), { placeholder: '-' }));
const fmtDate = (d: LegacyDate): string => (d.kind === 'date' ? d.iso : d.kind === 'missing' ? 'Tidak tercatat' : d.kind === 'zero' ? 'Tanggal nol' : `Tidak valid (${d.raw})`);

export function maskDocumentNik(nik: string | null | undefined): string {
  const clean = String(nik ?? '').trim();
  if (!clean) return '-';
  if (clean.length <= 2) return `***${clean}`;
  return `${'*'.repeat(Math.max(3, clean.length - 2))}${clean.slice(-2)}`;
}

async function gateAndAudit(
  auditLog: LoanDeps['audit'],
  now: () => Date,
  throttle: ExportThrottle | undefined,
  actor: ReportActor,
  requiredCaps: readonly string[],
  subjectType: 'loan' | 'payroll' | 'member',
  subjectId: string,
  kind: 'loan_card' | 'payroll_slip' | 'savings_passbook',
): Promise<void> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !requiredCaps.every(has)) throw new KosipaError('FORBIDDEN');
  if (throttle) {
    const r = throttle.consume(actor.userId);
    if (!r.allowed) {
      await auditLog.append({
        actorUserId: actor.userId,
        action: 'kosipa.report.export',
        subjectType,
        subjectId: subjectId.slice(0, 64),
        outcome: 'denied',
        requestId: actor.requestId,
        detail: { kind, format: 'pdf', reason: 'rate_limited' },
        occurredAt: now(),
      });
      throw new KosipaError('EXPORT_RATE_LIMITED');
    }
  }
  await auditLog.append({
    actorUserId: actor.userId,
    action: 'kosipa.report.export',
    subjectType,
    subjectId: subjectId.slice(0, 64),
    outcome: 'success',
    requestId: actor.requestId,
    detail: { kind, format: 'pdf' },
    occurredAt: now(),
  });
}

// ------------------------------------------------------------------------------------------ 1. Kartu Pinjaman & Jadwal PDF
export async function exportLoanCardPdf(
  d: LoanPdfExportDeps,
  actor: ReportActor,
  input: { docNo: unknown },
): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.loan.view')) throw new KosipaError('FORBIDDEN');
  const docNo = parseLoanDocNo(input.docNo);
  await gateAndAudit(d.audit, d.now, d.throttle, actor, ['kosipa.loan.view'], 'loan', `loan:${docNo}`, 'loan_card');

  const headers = await d.reader.loanHeaders(docNo, LOAN_HEADER_LIMIT + 1);
  if (headers.length === 0) throw new KosipaError('NOT_FOUND');
  const loan = describeLoan(headers[0]);
  const h = loan.header;
  const [aggregate, rawRows] = await Promise.all([
    d.reader.scheduleAggregate(docNo),
    d.reader.scheduleRows(docNo, null, SCHEDULE_PDF_LIMIT),
  ]);
  const integrity = assessSchedule(loan, aggregate, headers.length);
  const scheduleRows = rawRows.map(describeScheduleRow);
  const at = d.now().toISOString().slice(0, 19).replace('T', ' ');

  const progressText = integrity.rows > 0
    ? `${integrity.paidRows} / ${integrity.rows} (${Math.floor((integrity.paidRows / integrity.rows) * 100)}%)`
    : 'Belum ada jadwal';

  const sections: PdfSection[] = [
    {
      kind: 'kpi-strip',
      items: [
        { label: 'POKOK PINJAMAN', value: rp(loan.planPrincipal4), subtext: 'Rencana pada dokumen', highlight: true },
        { label: 'SISA POKOK JADWAL', value: rp(integrity.recorded.unpaidPrincipal4), subtext: `${integrity.unpaidRows} angsuran belum bayar` },
        { label: 'ANGSURAN / BULAN', value: rp(loan.planInstallment4), subtext: h.planMonths ? `Tenor ${h.planMonths} bulan` : 'Tenor tidak tercatat' },
        { label: 'PROGRES JADWAL', value: progressText, subtext: `Total belum bayar ${rp(integrity.recorded.unpaidTotal4)}` },
      ],
    },
    {
      kind: 'kv-grid',
      title: 'Identitas Anggota & Rincian Dokumen Pinjaman',
      items: [
        { label: 'Nama Anggota', value: h.name || 'Tidak tercatat' },
        { label: 'NIK (Disamarkan)', value: maskDocumentNik(h.nik), mono: true },
        { label: 'Jenis Pinjaman', value: h.type || 'Tidak tercatat' },
        { label: 'Pembiaya / Metode', value: `${h.financier || '-'} / ${h.method || '-'}${h.rate ? ` (${h.rate}%)` : ''}` },
        { label: 'Tanggal Dokumen', value: fmtDate(loan.docDate), mono: true },
        { label: 'Tanggal Pencairan', value: fmtDate(loan.disbursedDate), mono: true },
        { label: 'Periode Angsuran', value: `${fmtDate(loan.startDate)} s/d ${fmtDate(loan.endDate)}`, mono: true },
        { label: 'Nominal Pencairan', value: rp(loan.disbursedAmount4) },
        { label: 'Biaya Admin / Asuransi', value: `${rp(loan.adminFee4)} / ${rp(loan.insuranceFee4)}` },
        { label: 'Diterima Anggota', value: rp(loan.totalReceived4) },
        { label: 'Status Pelunasan', value: h.repayment || 'Tidak tercatat' },
        { label: 'Roll Over', value: h.rollOver || 'Tidak ada' },
      ],
    },
    {
      kind: 'callout',
      tone: 'warning',
      title: 'Status Saldo Resmi: TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED)',
      lines: [
        'Sisa pokok dan progres angsuran dihitung dari jadwal angsuran yang tercatat, bukan saldo outstanding resmi.',
        ...(integrity.issues.length > 0 ? [`Catatan integritas jadwal: ${integrity.issues.join(', ')}.`] : []),
      ],
    },
    {
      kind: 'table',
      title: 'Jadwal Angsuran Tercatat',
      subtitle: `${integrity.rows} baris jadwal tercatat untuk dokumen ${docNo}`,
      columns: [
        { header: 'Ke', width: 36, align: 'right' },
        { header: 'Jatuh Tempo', width: 92, align: 'left', mono: true },
        { header: 'Pokok', width: 115, align: 'right' },
        { header: 'Bunga', width: 100, align: 'right' },
        { header: 'Total Angsuran', width: 115, align: 'right' },
        { header: 'Status', width: 65, align: 'left' },
      ],
      rows: scheduleRows.length > 0
        ? scheduleRows.map((r) => [
            String(r.installmentNo ?? '?'),
            fmtDate(r.due),
            rp(r.principal4),
            rp(r.interest4),
            rp(r.total4),
            r.status || 'Tidak tercatat',
          ])
        : [['-', 'Tidak ada jadwal angsuran tercatat', rp(0), rp(0), rp(0), '-']],
      footerRow: [
        'TOTAL',
        `${integrity.rows} angsuran`,
        rp(integrity.recorded.principal4),
        rp(integrity.recorded.interest4),
        rp(integrity.recorded.total4),
        '',
      ],
    },
  ];

  const body = renderKosipaPdfDocument({
    orientation: 'portrait',
    title: 'KARTU PINJAMAN & JADWAL ANGSURAN',
    subtitle: `Dokumen pinjaman ${docNo} sebagaimana tercatat di sistem KOSIPA.`,
    badge: {
      label: [h.docStatus, h.disbursement, h.repayment].map((s) => s || '?').join(' · '),
      tone: h.docStatus === 'APPROVED' ? 'info' : 'warning',
    },
    docMeta: [
      { label: 'No. Dokumen', value: docNo },
      { label: 'NIK', value: maskDocumentNik(h.nik) },
      { label: 'Dicetak (UTC)', value: at },
    ],
    sections,
  });

  if (body.byteLength > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
  return { filename: `kartu-pinjaman-${docNo}.pdf`, contentType: 'application/pdf', body, rows: scheduleRows.length };
}

// ------------------------------------------------------------------------------- 2. Slip Rincian Potongan Payroll Anggota PDF
export async function exportPayrollMemberSlipPdf(
  d: PayrollPdfExportDeps,
  actor: ReportActor,
  input: { docNo: unknown; nik: unknown },
): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.payroll.view')) throw new KosipaError('FORBIDDEN');
  const docNo = parseDocNo(input.docNo);
  if (typeof input.nik !== 'string') throw new KosipaError('NIK_INVALID');
  const nikKeys = nikLookupKeys(input.nik);
  await gateAndAudit(d.audit, d.now, d.throttle, actor, ['kosipa.payroll.view'], 'payroll', `payroll:${docNo}`, 'payroll_slip');

  const headerRaw = await d.reader.batchHeader(docNo);
  if (!headerRaw) throw new KosipaError('NOT_FOUND');
  const memberRows = await d.reader.memberRows(docNo, nikKeys);
  if (memberRows.length === 0) throw new KosipaError('NOT_FOUND');

  const first = memberRows[0];
  const maskedNik = maskDocumentNik(first.nik);
  const periodDate = classifyLegacyDate(headerRaw.periodDate);
  const cashDate = classifyLegacyDate(headerRaw.cashDate);
  const at = d.now().toISOString().slice(0, 19).replace('T', ' ');

  const firstBreakdown = describeRow(first.amounts);
  const sections: PdfSection[] = [
    {
      kind: 'kpi-strip',
      items: [
        { label: 'TOTAL POTONGAN TERCATAT', value: rp(firstBreakdown.recordedTotal4), subtext: `Batch ${docNo}`, highlight: true },
        { label: 'JUMLAH KOMPONEN', value: rp(firstBreakdown.componentSum4), subtext: `${firstBreakdown.components.length} komponen bernilai` },
        { label: 'SELISIH KOMPONEN', value: rp(firstBreakdown.differenceFromTotal4), subtext: firstBreakdown.sumMatchesTotal ? 'Sesuai total tercatat' : 'Berbeda dari total tercatat' },
      ],
    },
    {
      kind: 'kv-grid',
      title: 'Identitas Anggota & Informasi Batch Payroll',
      items: [
        { label: 'Nama Anggota', value: first.name || 'Tidak tercatat' },
        { label: 'NIK (Disamarkan)', value: maskedNik, mono: true },
        { label: 'Grup Anggota', value: first.group || headerRaw.group || '-' },
        { label: 'Nomor Batch', value: docNo, mono: true },
        { label: 'Tanggal Periode', value: fmtDate(periodDate), mono: true },
        { label: 'Tanggal Kas', value: fmtDate(cashDate), mono: true },
        { label: 'Status Batch', value: headerRaw.status || 'UNKNOWN' },
        { label: 'Jumlah Baris Anggota', value: String(memberRows.length) },
      ],
    },
  ];

  if (memberRows.length > 1) {
    sections.push({
      kind: 'callout',
      tone: 'warning',
      title: 'Terdapat Lebih Dari Satu Baris pada Batch Ini',
      lines: [`Anggota ini memiliki ${memberRows.length} baris di batch ${docNo}. Setiap baris ditampilkan terpisah tanpa digabung.`],
    });
  }

  memberRows.forEach((row, idx) => {
    const bd = describeRow(row.amounts);
    const compRows = bd.components.length > 0
      ? bd.components.map((c) => [
          c.label,
          bd.groups.find((g) => g.group === c.group)?.label ?? c.group,
          rp(c.amount4),
        ])
      : [['Tidak ada komponen potongan bernilai', '-', rp(0)]];

    sections.push({
      kind: 'table',
      title: memberRows.length > 1 ? `Rincian Komponen Potongan (Baris ${idx + 1}: ${row.name || 'Anggota'})` : 'Rincian Komponen Potongan Tercatat',
      subtitle: !bd.sumMatchesTotal ? `Perhatian: jumlah komponen berbeda sebesar ${rp(bd.differenceFromTotal4)} dari total tercatat.` : undefined,
      columns: [
        { header: 'Komponen Potongan', width: 220, align: 'left' },
        { header: 'Kelompok', width: 160, align: 'left' },
        { header: 'Jumlah Tercatat', width: 143, align: 'right' },
      ],
      rows: compRows,
      footerRow: ['TOTAL POTONGAN TERCATAT', `Jumlah komponen: ${rp(bd.componentSum4)}`, rp(bd.recordedTotal4)],
    });
  });

  if (has('kosipa.loan.view') && periodDate.kind === 'date') {
    try {
      const period = parsePayrollPeriod(periodDate.iso.slice(0, 7));
      const from = `${periodLabel(period)}-01`;
      const toExclusive = period.month === 12 ? `${period.year + 1}-01-01` : `${period.year}-${String(period.month + 1).padStart(2, '0')}-01`;
      const instRows = await d.reader.memberInstallments(nikKeys, { from, toExclusive }, INSTALLMENT_PDF_LIMIT);
      if (instRows.length > 0) {
        sections.push({
          kind: 'table',
          title: 'Referensi Angsuran Pinjaman Jatuh Tempo (Baca-Saja)',
          subtitle: `Rentang jatuh tempo ${from} s/d sebelum ${toExclusive}. Ini referensi, bukan perhitungan ulang potongan.`,
          columns: [
            { header: 'No. Pinjaman', width: 120, align: 'left', mono: true },
            { header: 'Ke', width: 38, align: 'right' },
            { header: 'Jatuh Tempo', width: 85, align: 'left', mono: true },
            { header: 'Pokok', width: 95, align: 'right' },
            { header: 'Bunga', width: 85, align: 'right' },
            { header: 'Angsuran', width: 100, align: 'right' },
          ],
          rows: instRows.map((i) => [
            i.loanDocNo,
            String(i.installmentNo ?? '-'),
            fmtDate(classifyLegacyDate(i.dueRaw)),
            formatRupiahDocument(i.principal, { placeholder: '-' }),
            formatRupiahDocument(i.interest, { placeholder: '-' }),
            formatRupiahDocument(i.total, { placeholder: '-' }),
          ]),
        });
      }
    } catch {
      // Reference installment section is optional; if unavailable, omit without failing the slip.
    }
  }

  const body = renderKosipaPdfDocument({
    orientation: 'portrait',
    title: 'SLIP RINCIAN POTONGAN PAYROLL ANGGOTA',
    subtitle: `Rincian komponen potongan koperasi pada batch ${docNo} sebagaimana tercatat.`,
    badge: { label: `BATCH ${headerRaw.status || 'UNKNOWN'}`, tone: headerRaw.status === 'APPROVED' ? 'info' : 'warning' },
    docMeta: [
      { label: 'No. Batch', value: docNo },
      { label: 'NIK', value: maskedNik },
      { label: 'Dicetak (UTC)', value: at },
    ],
    sections,
  });

  if (body.byteLength > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
  return { filename: `slip-potongan-payroll-${docNo}.pdf`, contentType: 'application/pdf', body, rows: firstBreakdown.components.length };
}

// ---------------------------------------------------------------------------------- 3. Buku Mutasi Simpanan Anggota PDF
export async function exportMemberSavingsPassbookPdf(
  d: SavingsPdfExportDeps,
  actor: ReportActor,
  input: { memberId: unknown; params?: Record<string, string | string[] | undefined> },
): Promise<ExportFile> {
  const has = (c: string) => (actor.capabilities as ReadonlySet<string>).has(c);
  if (!has(EXPORT_CAPABILITY) || !has('kosipa.savings.view') || !has('kosipa.member.view')) throw new KosipaError('FORBIDDEN');
  const memberId = parseMemberId(input.memberId);
  const query = parseLedgerQuery(input.params ?? {});
  await gateAndAudit(d.audit, d.now, d.throttle, actor, ['kosipa.savings.view', 'kosipa.member.view'], 'member', `member:${memberId}`, 'savings_passbook');

  const m = await d.members.member(memberId);
  if (!m) throw new KosipaError('NOT_FOUND');
  const maskedNik = maskDocumentNik(m.nik);
  const nikKeys = nikLookupKeys(m.nik);

  const summaryRaw = await d.savings.typeSummary(nikKeys);
  const summaries = summarizeTypes(summaryRaw);
  const movementRowsRaw = await d.savings.movements(nikKeys, query.type, null, PASSBOOK_MOVEMENT_LIMIT);
  const refs = new Map((await d.savings.headersByDocNo([...new Set(movementRowsRaw.map((r) => r.docNo))])).map((h) => [h.docNo, h]));
  const movements = movementRowsRaw.map((r) => describeMovement(r, refs.get(r.docNo)));

  const totalPosted4 = summaries.reduce((n, s) => n + s.posted4, 0);
  const totalMovements = summaries.reduce((n, s) => n + s.rows, 0);
  const at = d.now().toISOString().slice(0, 19).replace('T', ' ');

  const sections: PdfSection[] = [
    {
      kind: 'kpi-strip',
      items: [
        { label: 'MUTASI DISETUJUI BERSIH', value: rp(totalPosted4), subtext: 'Kredit + Jasa - Debit (APPROVED)', highlight: true },
        { label: 'JENIS SIMPANAN', value: String(summaries.length), subtext: `${totalMovements} baris mutasi tercatat` },
        { label: 'FILTER JENIS', value: query.type ?? 'SEMUA JENIS', subtext: `Menampilkan ${movements.length} mutasi terbaru` },
      ],
    },
    {
      kind: 'kv-grid',
      title: 'Identitas Anggota',
      items: [
        { label: 'Nama Anggota', value: m.name || 'Tidak tercatat' },
        { label: 'NIK (Disamarkan)', value: maskedNik, mono: true },
        { label: 'ID Anggota', value: String(m.id), mono: true },
        { label: 'Grup / Status', value: `${m.group || '-'} / ${m.status || '-'}` },
      ],
    },
    {
      kind: 'callout',
      tone: 'warning',
      title: 'Status Saldo Resmi: TIDAK TERSEDIA (OFFICIAL_BALANCE_UNVERIFIED)',
      lines: [
        'Angka pada dokumen ini adalah jumlah mutasi tercatat, bukan saldo akhir resmi.',
        'Definisi saldo awal belum diverifikasi dan status header dokumen menentukan keberlakuan mutasi.',
      ],
    },
    {
      kind: 'table',
      title: 'Ringkasan Mutasi Tercatat per Jenis Simpanan',
      columns: [
        { header: 'Jenis Simpanan', width: 120, align: 'left' },
        { header: 'Mutasi', width: 55, align: 'right' },
        { header: 'Mutasi Disetujui (Bersih)', width: 135, align: 'right' },
        { header: 'Debit Menunggu', width: 105, align: 'right' },
        { header: 'Kredit Menunggu', width: 108, align: 'right' },
      ],
      rows: summaries.length > 0
        ? summaries.map((s) => [
            s.type,
            String(s.rows),
            rp(s.posted4),
            rp(s.pendingDebit4),
            rp(s.pendingCredit4),
          ])
        : [['Belum ada mutasi tercatat', '0', rp(0), rp(0), rp(0)]],
      footerRow: ['TOTAL MUTASI DISETUJUI', String(totalMovements), rp(totalPosted4), '', ''],
    },
    {
      kind: 'table',
      title: `Daftar Mutasi Simpanan Tercatat${query.type ? ` (${query.type})` : ''} - Terbaru Dahulu`,
      columns: [
        { header: 'Tanggal', width: 72, align: 'left', mono: true },
        { header: 'No. Dokumen', width: 95, align: 'left', mono: true },
        { header: 'Jenis', width: 70, align: 'left' },
        { header: 'Transaksi', width: 68, align: 'left' },
        { header: 'Kredit', width: 82, align: 'right' },
        { header: 'Debit', width: 82, align: 'right' },
        { header: 'Status', width: 54, align: 'left' },
      ],
      rows: movements.length > 0
        ? movements.map((mv) => [
            fmtDate(mv.date),
            mv.docNo || '-',
            mv.type,
            `${mv.kind ?? '-'}${mv.opening ? ' (Awal)' : ''}`,
            rp(mv.credit4),
            rp(mv.debit4),
            mv.state,
          ])
        : [['-', 'Tidak ada mutasi tercatat', '-', '-', rp(0), rp(0), '-']],
    },
  ];

  const body = renderKosipaPdfDocument({
    orientation: 'portrait',
    title: 'BUKU MUTASI SIMPANAN ANGGOTA',
    subtitle: 'Rekening koran mutasi simpanan anggota sebagaimana tercatat di sistem KOSIPA.',
    badge: { label: m.status || 'ANGGOTA', tone: 'info' },
    docMeta: [
      { label: 'ID Anggota', value: String(m.id) },
      { label: 'NIK', value: maskedNik },
      { label: 'Dicetak (UTC)', value: at },
    ],
    sections,
  });

  if (body.byteLength > EXPORT_MAX_BYTES) throw new KosipaError('EXPORT_TOO_LARGE');
  return { filename: `buku-mutasi-simpanan-${m.id}.pdf`, contentType: 'application/pdf', body, rows: movements.length };
}
