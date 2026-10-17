import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search } from 'lucide-react';
import { KosipaError, LOAN_DISBURSEMENT_STATUSES, LOAN_DOC_STATUSES, LOAN_REPAYMENT_STATUSES } from '@koperasi/domain/kosipa';
import { listLoans, type LoanListPage } from '@koperasi/application/kosipa/loans';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { STATUS_FLAG_TEXT } from '@/components/console/kosipa/loan-format';
import { formatAmount4, formatLegacyDate, qs } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pinjaman · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function LoanListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/pinjaman' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  const q = one(params.q).slice(0, 50); const status = one(params.status); const cair = one(params.cair); const bayar = one(params.bayar);
  let page: LoanListPage | null = null; let failed = false; let invalid = false;
  try {
    page = await listLoans({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params);
  } catch (error) { if (error instanceof KosipaError) invalid = true; else failed = true; }

  return (
    <div className="console-page">
      <header className="console-page-head">
        <h1>Pinjaman</h1>
        <p>Dokumen pinjaman KOSIPA beserta status tercatat. Halaman ini <strong>hanya membaca</strong>; saldo resmi belum ditampilkan karena definisinya belum diverifikasi.</p>
      </header>
      <form className="console-search console-search-wide" action="/console/kosipa/pinjaman" method="get" role="search" aria-label="Filter pinjaman">
        <div className="console-filter-row console-filter-row-4">
          <label>NIK, nomor dokumen atau nama<input name="q" defaultValue={q} maxLength={50} autoComplete="off" /></label>
          <label>Status dokumen<select name="status" defaultValue={status}><option value="">Semua</option>{LOAN_DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Pencairan<select name="cair" defaultValue={cair}><option value="">Semua</option>{LOAN_DISBURSEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Pelunasan<select name="bayar" defaultValue={bayar}><option value="">Semua</option>{LOAN_REPAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <button type="submit"><Search size={16} aria-hidden="true" />Cari</button>
        </div>
      </form>
      {invalid && <section className="console-panel" role="alert"><h2>Filter tidak valid</h2><p>Status harus salah satu dari daftar. Tidak ada data yang dibaca.</p></section>}
      {failed && <section className="console-panel" role="alert"><h2>Daftar pinjaman tidak dapat dibaca</h2><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></section>}
      {page && page.items.length === 0 && <section className="console-panel" role="status"><h2>Tidak ada pinjaman</h2><p>Tidak ada pinjaman yang cocok dengan filter ini.</p></section>}
      {page && page.items.length > 0 && (
        <section aria-label="Daftar pinjaman" className="console-section">
          <table className="console-table">
            <thead><tr><th scope="col">Dokumen</th><th scope="col">NIK</th><th scope="col">Nama</th><th scope="col">Jenis</th><th scope="col">Pokok (rencana)</th><th scope="col">Tenor</th><th scope="col">Tgl. pencairan</th><th scope="col">Status</th></tr></thead>
            <tbody>{page.items.map((l) => (
              <tr key={l.header.id}>
                <td><Link href={`/console/kosipa/pinjaman/${encodeURIComponent(l.header.docNo)}`}>{l.header.docNo}</Link></td>
                <td>{l.header.nik || '—'}</td><td>{l.header.name || '—'}</td>
                <td>{[l.header.type, l.header.method].filter(Boolean).join(' · ') || '—'}</td>
                <td className="num">{formatAmount4(l.planPrincipal4)}</td><td>{l.header.planMonths ? `${l.header.planMonths} bln` : '—'}</td>
                <td>{formatLegacyDate(l.disbursedDate)}</td>
                <td>{[l.header.docStatus, l.header.disbursement, l.header.repayment].filter(Boolean).join(' · ') || '—'}{l.statusFlags.map((f) => <span key={f} className="console-badge" data-state="partial"> {STATUS_FLAG_TEXT[f]}</span>)}</td>
              </tr>
            ))}</tbody>
          </table>
          {page.nextCursor !== null && <p><Link className="console-more" href={`/console/kosipa/pinjaman${qs({ q, status, cair, bayar, after: String(page.nextCursor) })}`}>Muat pinjaman lebih lama</Link></p>}
          <p className="console-notice">Status ditampilkan sebagaimana tercatat; kombinasi yang saling bertentangan ditandai, tidak diperbaiki.</p>
        </section>
      )}
    </div>
  );
}
