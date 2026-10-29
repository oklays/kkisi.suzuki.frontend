import { KosipaPageHeader, FeedbackState, FinancialTable, ContextNotice, Provenance } from '@/components/console/kosipa/KosipaUI';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
import { ExportControl } from '@/components/console/kosipa/ExportControl';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { DIAGNOSTIC_KIND, KosipaError, type DiagnosticKind } from '@koperasi/domain/kosipa';
import { readDataQuality, type DataQualityReport, type Part } from '@koperasi/application/kosipa/reports';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, formatPayrollDecimal } from '@/components/console/kosipa/payroll-format';
import { BATCH_ISSUE_SHORT, REPORT_REASON } from '@/components/console/kosipa/report-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kualitas Data Keuangan · KOSIPA · KKISI TB2' };

const KIND_LABEL: Record<DiagnosticKind, string> = {
  CONFIRMED: 'Terdeteksi', POTENTIAL: 'Perlu pemeriksaan', EXPECTED_PRECISION: 'Presisi wajar', UNVERIFIED: 'Belum terverifikasi',
};
const Kind = ({ kind }: { kind: string }) => <span className="console-badge" data-state={DIAGNOSTIC_KIND[kind] === 'CONFIRMED' ? 'partial' : 'planned'}>{KIND_LABEL[DIAGNOSTIC_KIND[kind]]}</span>;
function Block<T>({ id, kind, title, source, part, children }: { id: string; kind: string; title: string; source: string; part: Part<T>; children: (d: T) => React.ReactNode }) {
  return (
    <section className="console-card" aria-labelledby={`sec-${id}`}>
      <h2 id={`sec-${id}`}>{title}</h2>
      <p>{part.state === 'ok' ? <Kind kind={kind} /> : <Provenance kind="unavailable" />}{part.state === 'unavailable' && <span className="console-badge" data-state="partial">Scan tidak tersedia · {part.reason === 'SOURCE_TRUNCATED' ? 'pemindaian terpotong' : 'pemindaian gagal'}: bukan nol temuan</span>}</p>
      <details className="kosipa-source"><summary>Rincian pemeriksaan</summary><p className="console-notice">Sumber: {source}. Dibaca saja; tidak ada perbaikan otomatis.</p></details>
      {part.state === 'ok' ? children(part.data) : <p className="console-unavailable" role="status">{REASON_TEXT(part.reason)}</p>}
    </section>
  );
}
const REASON_TEXT = (r: string) => REPORT_REASON[r] ?? 'Tidak tersedia.';
const Count = ({ total, capped }: { total: number; capped: boolean }) => <strong>{capped ? `≥ ${total}` : total}</strong>;

export default async function DataQualityPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan/kualitas-data' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view') && !auth.capabilities.has('kosipa.payroll.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let q: DataQualityReport | null = null; let failed = false;
  try { q = await readDataQuality({ reader: services.reports, audit: services.audit, now: services.now, storeColumnMap: services.storeColumnMap }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }); }
  catch (error) { if (error instanceof KosipaError && error.code === 'FORBIDDEN') notFound(); failed = true; }

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/laporan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke laporan</Link>
      <KosipaPageHeader title={<> Kualitas data keuangan </>}><p>Diagnostik baca-saja atas data lama KOSIPA. Temuan menunjukkan <strong>kondisi data yang tercatat</strong>; tidak ada yang diubah, dan sebuah selisih belum tentu kesalahan akuntansi.</p></KosipaPageHeader>
      {failed && <FeedbackState kind="error" title={<> Diagnostik tidak dapat dibaca </>} reset="/console/kosipa/laporan/kualitas-data"><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {q && (<>
        <ContextNotice title="Cara membaca pemeriksaan" expandable><p>Temuan menunjukkan kondisi data tercatat, bukan otomatis kesalahan akuntansi. Contoh dibatasi maksimal 20 baris: <strong>sampel, bukan seluruh data</strong>. Jumlah temuan hanya tersedia bila pemeriksaan berhasil; pemindaian gagal atau terpotong tidak berarti nol masalah.</p></ContextNotice>
        {auth.capabilities.has('kosipa.report.export') && <ExportControl href="/api/kosipa/reports/data-quality/export" />}
        <section className="console-card" aria-labelledby="sec-pemetaan">
          <h2 id="sec-pemetaan">Pemetaan cabang ke kolom toko payroll</h2>
          <p><Kind kind="branchMapping" /></p>
          {q.branchMapping.state === 'UNVERIFIED'
            ? <p className="console-notice" role="status"><strong>Belum diverifikasi.</strong> Pemetaan company 1/2/3 ke TOKO_TAMBUN/TOKO_MJ/TOKO_GIIC berasal dari pola data, belum dikonfirmasi pemilik proses. Rekonsiliasi toko tetap hanya untuk ditinjau.</p>
            : <p className="console-notice" role="status">Pemetaan dikonfirmasi pemilik proses melalui konfigurasi.</p>}
        </section>

        {q.loans === 'restricted' ? null : (<>
          <Block id="ref-ganda" kind="duplicateRefs" title="Nomor dokumen pinjaman ganda" source="trans_pinjaman (dikelompokkan per nomor dokumen)" part={q.loans.duplicateRefs}>{(d) => (
            <>
              <p><Count total={d.total} capped={d.capped} /> nomor dokumen dipakai lebih dari satu dokumen; <strong>{d.conflictingStatuses}</strong> di antaranya memiliki kombinasi status berbeda. Jadwal angsuran dikaitkan lewat nomor dokumen sehingga dipakai bersama; pinjaman tidak digabung berdasarkan nomor saja.</p>
              {d.sample.length > 0 && <FinancialTable label="Sampel nomor dokumen ganda" columns={[{ label: "Nomor dokumen" }, { label: "Jumlah dokumen", numeric: true }, { label: "Kombinasi status" }]}>
                <tbody>{d.sample.map((x) => <tr key={x.docNo}><td><Link prefetch={false} href={`/console/kosipa/pinjaman/${encodeURIComponent(x.docNo)}`}>{x.docNo}</Link></td><td>{x.count}</td><td>{x.statusCombinations}</td></tr>)}</tbody></FinancialTable>}
            </>
          )}</Block>
          <Block id="status" kind="statusConflicts" title="Status pinjaman saling bertentangan" source="trans_pinjaman (status dokumen, pencairan, pelunasan)" part={q.loans.statusConflicts}>{(d) => (
            <>
              <dl className="console-dl">
                <div><dt>REJECTED tetapi LUNAS</dt><dd>{d.counts.rejectedSettled}</dd></div><div><dt>REJECTED tetapi pencairan APPROVED</dt><dd>{d.counts.rejectedDisbursed}</dd></div>
                <div><dt>LUNAS padahal belum APPROVED</dt><dd>{d.counts.settledNotApproved}</dd></div><div><dt>Pencairan APPROVED padahal dokumen belum APPROVED</dt><dd>{d.counts.disbursedNotApproved}</dd></div>
              </dl>
              {d.sample.length > 0 && <FinancialTable label="Sampel status pinjaman bertentangan" columns={[{ label: "Dokumen" }, { label: "Status" }]}>
                <tbody>{d.sample.map((x) => <tr key={x.docNo}><td><Link prefetch={false} href={`/console/kosipa/pinjaman/${encodeURIComponent(x.docNo)}`}>{x.docNo}</Link></td><td>{[x.docStatus, x.disbursement, x.repayment].map((s) => s ?? '—').join(' / ')}</td></tr>)}</tbody></FinancialTable>}
              {d.total > d.sample.length && <p className="console-notice">Menampilkan {d.sample.length} contoh terbaru dari {d.total} temuan (satu pinjaman dapat memenuhi lebih dari satu kondisi).</p>}
            </>
          )}</Block>
          <Block id="tgl-pinjaman" kind="loanDates" title="Tanggal dokumen pinjaman tidak dapat dipakai" source="trans_pinjaman.doc_date" part={q.loans.loanDates}>{(d) => <p>Dari {d.total} dokumen: <strong>{d.zero}</strong> bernilai 0000-00-00, <strong>{d.missing}</strong> kosong, <strong>{d.implausible}</strong> tidak wajar (di luar 1990–2100).</p>}</Block>
          <Block id="tgl-angsuran" kind="installmentDates" title="Tanggal jatuh tempo angsuran tidak valid" source="trans_pinjaman_dtl.tgl_cicilan" part={q.loans.installmentDates}>{(d) => <p>Dari {d.total} baris angsuran: <strong>{d.zero}</strong> bernilai 0000-00-00, <strong>{d.missing}</strong> kosong, <strong>{d.implausible}</strong> tidak wajar (mis. 9999-12-10). Baris ini tidak pernah ditempatkan pada suatu bulan.</p>}</Block>
          <Block id="yatim" kind="orphanInstallments" title="Angsuran tanpa dokumen pinjaman dan pinjaman tanpa jadwal" source="trans_pinjaman_dtl dan trans_pinjaman, dibandingkan per nomor dokumen di memori" part={q.loans.orphans}>{(d) => (
            <>
              <p><strong>{d.orphanDocs.total}</strong> nomor dokumen angsuran ({d.orphanRows} baris) tidak memiliki dokumen pinjaman; <strong>{d.approvedWithoutSchedule.total}</strong> pinjaman APPROVED tidak memiliki baris angsuran.</p>
              {d.orphanDocs.sample.length > 0 && <FinancialTable label="Sampel angsuran tanpa induk" columns={[{ label: "Nomor dokumen angsuran (contoh terbesar)" }, { label: "Baris", numeric: true }]}><tbody>{d.orphanDocs.sample.map((x) => <tr key={x.docNo}><td>{x.docNo}</td><td>{x.rows}</td></tr>)}</tbody></FinancialTable>}
              {d.approvedWithoutSchedule.sample.length > 0 && <FinancialTable label="Sampel pinjaman tanpa jadwal" columns={[{ label: "Pinjaman APPROVED tanpa jadwal (contoh)" }]}><tbody>{d.approvedWithoutSchedule.sample.map((x) => <tr key={x.docNo}><td><Link prefetch={false} href={`/console/kosipa/pinjaman/${encodeURIComponent(x.docNo)}`}>{x.docNo}</Link></td></tr>)}</tbody></FinancialTable>}
            </>
          )}</Block>
        </>)}

        {q.payroll === 'restricted' ? null : (<>
          <Block id="total-batch" kind="batchTotals" title="Total header berbeda dari jumlah baris, header tanpa baris, baris tanpa header" source="trans_potongan_bulanan dan trans_potongan_matrix, dibandingkan per batch di memori" part={q.payroll.batchTotals}>{(d) => (
            <>
              <p>{d.checked} batch diperiksa: <strong>{d.findings.total}</strong> dengan temuan; <strong>{d.rowsWithoutHeader.total}</strong> nomor batch pada baris tanpa header.</p>
              {d.findings.sample.length > 0 && <FinancialTable label="Sampel integritas total batch" columns={[{ label: "Batch" }, { label: "Temuan" }, { label: "Total header", numeric: true }, { label: "Σ baris", numeric: true }, { label: "Selisih", numeric: true }]}>
                <tbody>{d.findings.sample.map((f) => <tr key={f.docNo}><td><Link prefetch={false} href={`/console/kosipa/payroll/${encodeURIComponent(f.docNo)}`}>{f.docNo}</Link></td><td>{f.issues.map((i) => BATCH_ISSUE_SHORT[i] ?? i).join(', ')}</td><td className="num">{f.headerTotal4 === null ? '—' : formatAmount4(f.headerTotal4)}</td><td className="num">{formatAmount4(f.rowsTotal4)}</td><td className="num">{f.differenceFrom4 === null ? '—' : formatAmount4(f.differenceFrom4)}</td></tr>)}</tbody></FinancialTable>}
              {d.rowsWithoutHeader.sample.length > 0 && <FinancialTable label="Sampel baris tanpa header" columns={[{ label: "Nomor batch pada baris tanpa header" }, { label: "Baris", numeric: true }]}><tbody>{d.rowsWithoutHeader.sample.map((x) => <tr key={x.docNo}><td>{x.docNo}</td><td>{x.rows}</td></tr>)}</tbody></FinancialTable>}
            </>
          )}</Block>
          <Block id="total-baris" kind="rowTotalsMaterial" title="Total potongan baris berbeda dari jumlah komponen" source="trans_potongan_matrix (total_potongan vs jumlah 59 komponen)" part={q.payroll.rowTotals}>{(d) => (
            <>
              <p>Dari {d.rows} baris: <strong>{d.totalDiffersFromComponents}</strong> berbeda pada tingkat sub-sen, <strong>{d.totalDiffersByHalfSenOrMore}</strong> berbeda setengah sen atau lebih (selisih terbesar {d.maxDifference}); <strong>{d.totalWithoutComponents}</strong> memiliki total tetapi tanpa komponen. <strong>{d.totalDiffersFromComponents - d.totalDiffersByHalfSenOrMore}</strong> di antaranya hanya selisih sub-sen: presisi desimal pada data lama (wajar, tidak dianggap material).</p>
              {d.sample.length > 0 && <FinancialTable label="Sampel presisi total potongan" columns={[{ label: "Batch" }, { label: "NIK tersamar", type: "text" }, { label: "Total tercatat", numeric: true }, { label: "Σ komponen", numeric: true }]}>
                <tbody>{d.sample.map((x, i) => <tr key={`${x.docNo}-${x.nik}-${i}`}><td>{x.docNo}</td><td>{maskIdentifier(x.nik)}</td><td className="num">{formatPayrollDecimal(x.total)}</td><td className="num">{formatPayrollDecimal(x.componentSum)}</td></tr>)}</tbody></FinancialTable>}
            </>
          )}</Block>
          <Block id="nik-ganda" kind="duplicateBatchNik" title="Anggota dengan lebih dari satu baris dalam satu batch" source="trans_potongan_matrix (dikelompokkan per batch dan NIK)" part={q.payroll.duplicateBatchNik}>{(d) => (
            <>
              <p><Count total={d.total} capped={d.capped} /> pasangan batch–NIK memiliki lebih dari satu baris; baris ditampilkan terpisah di halaman batch dan tidak digabung.</p>
              {d.sample.length > 0 && <FinancialTable label="Sampel anggota ganda dalam batch" columns={[{ label: "Batch" }, { label: "NIK tersamar" }, { label: "Baris", numeric: true }]}><tbody>{d.sample.map((x) => <tr key={`${x.docNo}-${x.nik}`}><td><Link prefetch={false} href={`/console/kosipa/payroll/${encodeURIComponent(x.docNo)}`}>{x.docNo}</Link></td><td>{maskIdentifier(x.nik)}</td><td>{x.count}</td></tr>)}</tbody></FinancialTable>}
            </>
          )}</Block>
        </>)}
      </>)}
    </div>
  );
}
