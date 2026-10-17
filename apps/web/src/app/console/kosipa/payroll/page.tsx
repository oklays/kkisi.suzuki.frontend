import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KosipaError, PAYROLL_GROUPS, PAYROLL_STATUSES } from '@koperasi/domain/kosipa';
import { listPayrollBatches, type BatchListPage } from '@koperasi/application/kosipa/payroll';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, formatLegacyDate, GROUP_LABEL, qs, STATUS_LABEL } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payroll · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function PayrollListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/payroll' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.payroll.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  const periode = one(params.periode); const status = one(params.status); const grup = one(params.grup);
  let page: BatchListPage | null = null; let failed = false; let invalid = false;
  try {
    page = await listPayrollBatches({ reader: services.payroll, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params);
  } catch (error) { if (error instanceof KosipaError) invalid = true; else failed = true; }

  return (
    <div className="console-page">
      <header className="console-page-head">
        <h1>Payroll</h1>
        <p>Daftar batch potongan bulanan KOSIPA. Halaman ini <strong>hanya membaca</strong>: tidak ada persetujuan, posting, atau pembuatan matriks dari sini.</p>
      </header>
      <form className="console-search console-search-wide" action="/console/kosipa/payroll" method="get" role="search" aria-label="Filter batch payroll">
        <div className="console-filter-row">
          <label>Periode<input name="periode" type="month" defaultValue={periode} /></label>
          <label>Status<select name="status" defaultValue={status}><option value="">Semua</option>{PAYROLL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Grup<select name="grup" defaultValue={grup}><option value="">Semua</option>{PAYROLL_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</select></label>
          <button type="submit">Terapkan</button>
        </div>
      </form>
      {invalid && <section className="console-panel" role="alert"><h2>Filter tidak valid</h2><p>Periode harus berformat YYYY-MM dan status/grup harus salah satu dari daftar. Tidak ada data yang dibaca.</p></section>}
      {failed && <section className="console-panel" role="alert"><h2>Daftar payroll tidak dapat dibaca</h2><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></section>}
      {page && page.items.length === 0 && <section className="console-panel" role="status"><h2>Tidak ada batch</h2><p>Tidak ada batch payroll yang cocok dengan filter ini.</p></section>}
      {page && page.items.length > 0 && (
        <section aria-label="Daftar batch payroll" className="console-section">
          <table className="console-table">
            <thead><tr><th scope="col">Dokumen</th><th scope="col">Periode</th><th scope="col">Grup</th><th scope="col">Status</th><th scope="col">Tgl. periode</th><th scope="col">Tgl. cair</th><th scope="col">Total header (tercatat)</th></tr></thead>
            <tbody>{page.items.map((i) => (
              <tr key={i.header.id}>
                <td><Link href={`/console/kosipa/payroll/${encodeURIComponent(i.header.docNo)}`}>{i.header.docNo}</Link></td>
                <td>{i.header.periodYear && i.header.periodMonth ? `${i.header.periodYear}-${i.header.periodMonth}` : '—'}</td>
                <td>{i.header.group ? (GROUP_LABEL[i.header.group] ?? i.header.group) : '—'}</td>
                <td><span className="console-badge" data-state={i.status === 'APPROVED' ? 'available' : i.status === 'OPEN' ? 'partial' : 'planned'}>{STATUS_LABEL[i.status]}</span></td>
                <td>{formatLegacyDate(i.periodDate)}</td><td>{formatLegacyDate(i.cashDate)}</td>
                <td className="num">{i.headerTotal4 === null ? '—' : formatAmount4(i.headerTotal4)}</td>
              </tr>
            ))}</tbody>
          </table>
          {page.nextCursor !== null && <p><Link className="console-more" href={`/console/kosipa/payroll${qs({ periode, status, grup, after: String(page.nextCursor) })}`}>Muat batch lebih lama</Link></p>}
          <p className="console-notice">Angka adalah nilai yang tercatat di KOSIPA (A). Total header dan jumlah baris dapat berbeda; perbedaan ditandai di halaman batch, tidak diperbaiki.</p>
        </section>
      )}
    </div>
  );
}
