import { KosipaPageHeader, FeedbackState, FinancialTable, ReportYearFilter, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { ExportControl } from '@/components/console/kosipa/ExportControl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import type { SavingsMovementReport } from '@koperasi/domain/kosipa';
import { readSavingsMovementReport, type OpsPart } from '@koperasi/application/kosipa/reports-ops';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, qs } from '@/components/console/kosipa/payroll-format';
import { REPORT_REASON } from '@/components/console/kosipa/report-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ringkasan Mutasi Simpanan · KOSIPA · KKISI TB2' };
const UNPLACED: Record<string, string> = { DATE_UNUSABLE: 'Tanggal dokumen kosong / 0000-00-00 / tidak wajar', HEADER_MISSING: 'Header dokumen tidak ditemukan', HEADER_AMBIGUOUS: 'Header dokumen ganda' };

export default async function SavingsMovementReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/simpanan' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.savings.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  let part: OpsPart<SavingsMovementReport> | null = null; let failed = false; let invalid = false;
  try { part = await readSavingsMovementReport({ reader: services.reports, ops: services.opsReports, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params); }
  catch (error) { if (error instanceof KosipaError && error.code === 'PERIOD_INVALID') invalid = true; else failed = true; }
  const r = part?.state === 'ok' ? part.data : null; const canExport = auth.capabilities.has('kosipa.report.export');

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <KosipaPageHeader title={<> Ringkasan mutasi simpanan </>}><p>Jumlah <strong>mutasi tercatat</strong> per bulan dan jenis. Ini bukan saldo: definisi saldo awal belum diverifikasi, dan kolom saldo pada baris mutasi tidak pernah diisi.</p></KosipaPageHeader>
      {invalid && <FeedbackState kind="error" title={<> Tahun tidak valid </>} reset="/console/kosipa/laporan/simpanan"><p>Tahun harus empat digit antara 2000 dan 2100. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Ringkasan tidak dapat dibaca </>} reset="/console/kosipa/laporan/simpanan"><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {part?.state === 'unavailable' && <FeedbackState kind="empty" title={<> Ringkasan tidak tersedia </>} reset="/console/kosipa/laporan/simpanan"><p>{REPORT_REASON[part.reason]}</p></FeedbackState>}
      {r && (<>
        <ContextNotice title="Mutasi tercatat, bukan saldo resmi" expandable><p>Saldo resmi belum tersedia. Status dokumen menentukan: APPROVED disetujui, OPEN menunggu, status lain tidak berlaku.</p></ContextNotice>
        {canExport && <ExportControl href={`/api/kosipa/reports/savings-movements/export${qs({ tahun: r.year === null ? '' : String(r.year) })}`} />}
        <ReportYearFilter path="/console/kosipa/laporan/simpanan" year={r.year} years={r.years} />
        <section className="console-card" aria-labelledby="sec-bulan">
          <h2 id="sec-bulan">Tahun {r.year ?? '—'}</h2>
          {r.lines.length === 0 ? <p>Tidak ada mutasi bertanggal pada tahun ini.</p> : (
            <FinancialTable label="Mutasi simpanan per bulan" columns={[{ label: "Bulan" }, { label: "Jenis" }, { label: "Mutasi", numeric: true }, { label: "Kredit disetujui", numeric: true }, { label: "Debit disetujui", numeric: true }, { label: "Jasa disetujui", numeric: true }, { label: "Kredit menunggu", numeric: true }, { label: "Debit menunggu", numeric: true }, { label: "Status lain", numeric: true }]}>
              <tbody>{r.lines.map((l) => (
                <tr key={`${l.bucket}|${l.type}`}><td>{l.bucket}</td><td>{l.type}</td><td className="num">{l.rows}</td><td className="num">{formatAmount4(l.posted4.credit)}</td><td className="num">{formatAmount4(l.posted4.debit)}</td><td className="num">{formatAmount4(l.posted4.interest)}</td><td className="num">{formatAmount4(l.pending4.credit)}</td><td className="num">{formatAmount4(l.pending4.debit)}</td><td className="num">{l.voidRows}</td></tr>
              ))}</tbody>
            </FinancialTable>
          )}
        </section>
        {r.unplaced.length > 0 && (
          <section className="console-card" aria-labelledby="sec-tak">
            <h2 id="sec-tak">Mutasi yang tidak dapat ditempatkan pada bulan (semua tahun)</h2>
            <FinancialTable label="Mutasi yang belum dapat ditempatkan" columns={[{ label: "Kondisi" }, { label: "Jenis" }, { label: "Mutasi", numeric: true }]}>
              <tbody>{r.unplaced.map((u) => <tr key={`${u.kind}|${u.type}`}><td>{UNPLACED[u.kind]}</td><td>{u.type}</td><td className="num">{u.rows}</td></tr>)}</tbody></FinancialTable>
          </section>
        )}
      </>)}
    </div>
  );
}
