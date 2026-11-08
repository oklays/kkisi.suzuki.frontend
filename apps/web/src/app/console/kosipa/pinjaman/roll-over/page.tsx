import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { listRollovers, type RolloverPage } from '@koperasi/application/kosipa/loans';
import { FeedbackState, FilterContext, FinancialTable } from '@/components/console/kosipa/KosipaUI';
import { PrivatePagination } from '@/components/console/kosipa/PrivateWorkspace';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LoanPageHeader } from '@/components/console/kosipa/LoanUI';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
import { formatAmount4 } from '@/components/console/kosipa/payroll-format';
import { LOAN_HUB } from '@/components/console/kosipa/loan-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Roll Over Pinjaman · KOSIPA · KKISI TB2' };

const PATH = `${LOAN_HUB}/roll-over`;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const docLink = (docNo: string | null) => (docNo ? <Link prefetch={false} className="kloan-doc" href={`${LOAN_HUB}/${encodeURIComponent(docNo)}`}>{docNo}</Link> : <span className="kloan-muted">Tidak tercatat</span>);

/** Legacy "Roll Over Pinjaman" (over_kredit_c), read only: which older loan was settled into which newer one, and what was left on it. */
export default async function LoanRolloversPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: PATH });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 50);
  let page: RolloverPage | null = null; let failed = false; let invalid = false;
  try { page = await listRollovers({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, sp); }
  catch (error) { if (error instanceof KosipaError) invalid = true; else failed = true; }

  return (
    <div className="console-page kloan-page">
      <LoanPageHeader title={<> Roll over pinjaman </>}>
        <p>Pinjaman lama yang sisanya dilunasi dengan pinjaman baru. Sama dengan submenu Roll Over Pinjaman di KOSIPA lama; satu pinjaman baru bisa melunasi beberapa pinjaman lama.</p>
      </LoanPageHeader>
      <form className="console-search console-search-wide kloan-filter" action={PATH} method="post" data-kosipa-private role="search" aria-label="Cari roll over">
        <div className="console-filter-row kloan-filter-row" data-compact>
          <label className="kloan-filter-search">NIK, nama, atau nomor dokumen (lama atau baru)<input name="q" minLength={2} maxLength={50} autoComplete="off" placeholder="Contoh: 09002 atau PINMOB2026" defaultValue={q} /></label>
          <div className="kloan-filter-actions"><button type="submit"><Search size={16} aria-hidden="true" />Cari</button><button type="submit" name="_reset" value="1" formNoValidate className="kosipa-button-secondary">Reset</button></div>
        </div>
      </form>
      <FilterContext privateReset reset={PATH} filters={[{ label: 'Pencarian', value: q ? 'Aktif' : '' }]} />
      {invalid && <FeedbackState kind="error" title={<> Pencarian tidak valid </>} reset={PATH}><p>Gunakan minimal 2 karakter NIK, nama, atau nomor dokumen. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Riwayat roll over tidak dapat dibaca </>} reset={PATH}><p>Database tidak menjawab tepat waktu. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {page && page.items.length === 0 && <FeedbackState kind="empty" title={<> Tidak ada roll over yang cocok </>} reset={PATH}><p>{q ? 'Tidak ada roll over untuk pencarian ini. Coba nomor dokumen pinjaman lama atau baru.' : 'Belum ada roll over tercatat.'}</p></FeedbackState>}
      {page && page.items.length > 0 && (
        <section aria-label="Daftar roll over" className="console-section">
          <FinancialTable label="Daftar roll over pinjaman" columns={[{ label: 'Pinjaman lama' }, { label: <span className="console-visually-hidden">Arah</span> }, { label: 'Pinjaman baru' }, { label: 'Anggota' }, { label: 'Sisa angsuran', numeric: true }, { label: 'Sisa pinjaman', numeric: true }, { label: 'Jasa', numeric: true }]}>
            <tbody>{page.items.map((r) => (
              <tr key={r.id}>
                <td>{docLink(r.oldDocNo)}<small className="kloan-sub">{r.oldType || 'Jenis tidak tercatat'}</small></td>
                <td className="kloan-flow"><ArrowRight size={15} role="img" aria-label="dilunasi oleh" /></td>
                <td>{docLink(r.newDocNo)}</td>
                <td><span className="kloan-name">{r.name || 'Nama tidak tercatat'}</span><small className="kloan-sub">NIK {maskIdentifier(r.nik)}</small></td>
                <td className="num">{r.remainingInstallments === null ? <span className="kloan-muted">Tidak tercatat</span> : `${r.remainingInstallments}×`}</td>
                <td className="num"><strong>{formatAmount4(r.remainingPrincipal4)}</strong></td>
                <td className="num">{formatAmount4(r.fee4)}</td>
              </tr>
            ))}</tbody>
          </FinancialTable>
          <p className="console-notice">{page.items.length} roll over di halaman ini, terbaru lebih dulu. Sisa angsuran dan sisa pinjaman dicatat oleh KOSIPA lama saat roll over dibuat.</p>
          {page.nextCursor !== null && <PrivatePagination path={PATH} params={{ q, after: String(page.nextCursor) }}>Muat roll over lebih lama</PrivatePagination>}
        </section>
      )}
    </div>
  );
}
