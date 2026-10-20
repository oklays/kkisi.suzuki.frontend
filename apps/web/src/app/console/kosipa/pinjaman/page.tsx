import { KosipaPageHeader, FeedbackState, StatusBadge, FinancialTable, FilterContext } from '@/components/console/kosipa/KosipaUI';
import { PrivatePagination } from '@/components/console/kosipa/PrivateWorkspace';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
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
  const periode = one(params.periode);
  let page: LoanListPage | null = null; let failed = false; let invalid = false;
  try {
    page = await listLoans({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, params);
  } catch (error) { if (error instanceof KosipaError) invalid = true; else failed = true; }

  return (
    <div className="console-page">
      <KosipaPageHeader title={<> Pinjaman </>}>
        <p>Telusuri dokumen dan jadwal angsuran berdasarkan nilai tercatat. Outstanding resmi belum tersedia.</p>
      </KosipaPageHeader>
      <form className="console-search console-search-wide" action="/console/kosipa/pinjaman" method="post" data-kosipa-private role="search" aria-label="Filter pinjaman">
        <div className="console-filter-row console-filter-row-4">
          <label>NIK, nomor dokumen atau nama<input name="q" minLength={2} placeholder="NIK, nama, atau nomor dokumen" defaultValue={q} maxLength={50} autoComplete="off" /></label>
          <label>Status dokumen<select name="status" defaultValue={status}><option value="">Semua</option>{LOAN_DOC_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Pencairan<select name="cair" defaultValue={cair}><option value="">Semua</option>{LOAN_DISBURSEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Pelunasan<select name="bayar" defaultValue={bayar}><option value="">Semua</option>{LOAN_REPAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label>Periode dokumen<input name="periode" type="month" min="2000-01" max="2100-12" defaultValue={periode} /></label>
          <button type="submit"><Search size={16} aria-hidden="true" />Terapkan filter</button><button type="submit" name="_reset" value="1" formNoValidate>Reset filter</button>
        </div>
      </form>
      <FilterContext privateReset reset="/console/kosipa/pinjaman" filters={[{ label: 'Status', value: status }, { label: 'Pencairan', value: cair }, { label: 'Pelunasan', value: bayar }, { label: 'Periode', value: periode }, { label: 'Pencarian', value: q ? 'Aktif' : '' }]} />
      {invalid && <FeedbackState kind="error" title={<> Filter tidak valid </>} reset="/console/kosipa/pinjaman"><p>Periksa status dan periode dokumen. Gunakan pilihan yang tersedia dan periode yang valid. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Daftar pinjaman tidak dapat dibaca </>} reset="/console/kosipa/pinjaman"><p>Data tidak tersedia saat ini. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {page && page.items.length === 0 && <FeedbackState kind="empty" title={<> Tidak ada pinjaman </>} reset="/console/kosipa/pinjaman"><p>Tidak ada pinjaman yang cocok dengan filter ini.</p></FeedbackState>}
      {page && page.items.length > 0 && (
        <section aria-label="Daftar pinjaman" className="console-section">
          <FinancialTable label="Daftar dokumen pinjaman" columns={[{ label: "Dokumen" }, { label: "NIK tersamar", type: "text" }, { label: "Nama" }, { label: "Jenis" }, { label: "Pokok (rencana)", numeric: true }, { label: "Tenor", numeric: true }, { label: "Tgl. pencairan" }, { label: "Status" }]}>
            <tbody>{page.items.map((l) => (
              <tr key={l.header.id}>
                <td><Link prefetch={false} href={`/console/kosipa/pinjaman/${encodeURIComponent(l.header.docNo)}${qs({ periode, status, cair, bayar })}`}>{l.header.docNo}</Link>{page!.items.some((other) => other.header.docNo === l.header.docNo && other.header.id !== l.header.id) && <span className="console-badge" data-state="partial">Nomor ganda pada halaman ini</span>}</td>
                <td>{maskIdentifier(l.header.nik)}</td><td>{l.header.name || '—'}</td>
                <td>{[l.header.type, l.header.method].filter(Boolean).join(' · ') || '—'}</td>
                <td className="num">{formatAmount4(l.planPrincipal4)}</td><td>{l.header.planMonths ? `${l.header.planMonths} bln` : '—'}</td>
                <td>{formatLegacyDate(l.disbursedDate)}</td>
                <td><div className="kosipa-status-stack"><StatusBadge value={l.header.docStatus} /><small>Pencairan: {l.header.disbursement || 'Tidak tercatat'}</small><small>Pelunasan: {l.header.repayment || 'Tidak tercatat'}</small></div>{l.statusFlags.map((f) => <span key={f} className="console-badge" data-state="partial"> {STATUS_FLAG_TEXT[f]}</span>)}</td>
              </tr>
            ))}</tbody>
          </FinancialTable>
          <p className="console-notice">Menampilkan {page.items.length} dokumen pada halaman ini. Jumlah seluruh dokumen tidak dihitung.</p>
          {page.nextCursor !== null && <PrivatePagination path="/console/kosipa/pinjaman" params={{ q, status, cair, bayar, periode, after: String(page.nextCursor) }}>Muat pinjaman lebih lama</PrivatePagination>}
          <p className="console-notice">Status ditampilkan sebagaimana tercatat; kombinasi yang saling bertentangan ditandai, tidak diperbaiki.</p>
        </section>
      )}
    </div>
  );
}
