import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Search } from 'lucide-react';
import { KosipaError, SETTLEMENT_REMARKS } from '@koperasi/domain/kosipa';
import { listSettlements, type SettlementPage } from '@koperasi/application/kosipa/loans';
import { FeedbackState, FilterContext, FinancialTable, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { PrivatePagination } from '@/components/console/kosipa/PrivateWorkspace';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LoanPageHeader, Money } from '@/components/console/kosipa/LoanUI';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
import { formatAmount4, qs } from '@/components/console/kosipa/payroll-format';
import { LOAN_HUB, PRODUCT_OPTIONS, count, productLabel, shortDate } from '@/components/console/kosipa/loan-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pelunasan Pinjaman · KOSIPA · KKISI TB2' };

const PATH = `${LOAN_HUB}/pelunasan`;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const REMARK_TEXT: Record<string, string> = { 'LUNAS DIPERCEPAT': 'Lunas dipercepat', 'LUNAS PENSIUN': 'Lunas pensiun', 'LUNAS RESIGN': 'Lunas resign', 'LUNAS NORMAL': 'Lunas normal' };
const remarkText = (r: string | null) => (r ? REMARK_TEXT[r] ?? r : 'Keterangan tidak tercatat');

/** Legacy "Pelunasan Pinjaman" (pelunasan_pinjaman_c), read only: early, retirement and resignation settlements. Roll-over settlements have their own page. */
export default async function LoanSettlementsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: PATH });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams;
  const f = { q: one(sp.q).slice(0, 50), produk: one(sp.produk), keterangan: one(sp.keterangan), periode: one(sp.periode) };
  let page: SettlementPage | null = null; let failed = false; let invalid = false;
  try { page = await listSettlements({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, sp); }
  catch (error) { if (error instanceof KosipaError) invalid = true; else failed = true; }
  const allDocs = page?.summary.reduce((t, s) => t + s.documents, 0) ?? 0;
  const shown = page?.summary.filter((s) => !f.keterangan || s.remark === f.keterangan) ?? [];
  const totalDocs = shown.reduce((t, s) => t + s.documents, 0);
  const totalPaid = shown.reduce((t, s) => t + s.total4, 0);
  const chip = (keterangan: string) => `${PATH}${qs({ produk: f.produk, periode: f.periode, keterangan })}`;

  return (
    <div className="console-page kloan-page">
      <LoanPageHeader title={<> Pelunasan pinjaman </>}>
        <p>Pinjaman yang dilunasi sebelum jadwal berakhir: dipercepat, karena pensiun, atau karena resign. Sama dengan submenu Pelunasan Pinjaman di KOSIPA lama. Pelunasan lewat roll over ada di halaman <Link prefetch={false} href={`${LOAN_HUB}/roll-over`}>Roll Over Pinjaman</Link>.</p>
      </LoanPageHeader>

      <form className="console-search console-search-wide kloan-filter" action={PATH} method="post" data-kosipa-private role="search" aria-label="Filter pelunasan">
        {f.keterangan && <input type="hidden" name="keterangan" value={f.keterangan} />}
        <div className="console-filter-row kloan-filter-row" data-compact>
          <label className="kloan-filter-search">NIK, nama, atau nomor dokumen<input name="q" minLength={2} maxLength={50} autoComplete="off" placeholder="Contoh: 09002 atau PEMBYN2026" defaultValue={f.q} /></label>
          <label>Produk<select name="produk" defaultValue={f.produk}><option value="">Semua produk</option>{PRODUCT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label>Bulan pelunasan<input name="periode" type="month" min="2000-01" max="2100-12" defaultValue={f.periode} /></label>
          <div className="kloan-filter-actions"><button type="submit"><Search size={16} aria-hidden="true" />Terapkan filter</button><button type="submit" name="_reset" value="1" formNoValidate className="kosipa-button-secondary">Reset</button></div>
        </div>
      </form>

      {invalid && <FeedbackState kind="error" title={<> Filter tidak valid </>} reset={PATH}><p>Periksa produk, keterangan, dan bulan pelunasan. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Riwayat pelunasan tidak dapat dibaca </>} reset={PATH}><p>Database tidak menjawab tepat waktu. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {page && <>
        <nav className="kloan-segments" aria-label="Keterangan pelunasan">
          <span className="kloan-segments-label">Keterangan</span>
          <ul>
            <li><Link prefetch={false} href={chip('')} aria-current={!f.keterangan ? 'page' : undefined}>Semua<small>{count(allDocs)} dok</small></Link></li>
            {SETTLEMENT_REMARKS.map((r) => { const s = page!.summary.find((x) => x.remark === r); return s || f.keterangan === r ? (
              <li key={r}><Link prefetch={false} href={chip(r)} aria-current={f.keterangan === r ? 'page' : undefined}>{REMARK_TEXT[r]}<small>{count(s?.documents ?? 0)} dok</small></Link></li>
            ) : null; })}
          </ul>
        </nav>
        <FilterContext privateReset reset={PATH} filters={[{ label: 'Produk', value: PRODUCT_OPTIONS.find((o) => o.value === f.produk)?.label ?? f.produk }, { label: 'Keterangan', value: f.keterangan ? REMARK_TEXT[f.keterangan] ?? f.keterangan : '' }, { label: 'Bulan', value: f.periode }, { label: 'Pencarian', value: f.q ? 'Aktif' : '' }]} />
        {totalDocs > 0 && <p className="kloan-hint"><strong>{count(totalDocs)}</strong> pelunasan cocok dengan filter ini, total dibayar <strong><Money units={totalPaid} compact /></strong> (pokok + admin + penalti).</p>}
        {page.items.length === 0 ? (
          <FeedbackState kind="empty" title={<> Tidak ada pelunasan yang cocok </>} reset={PATH}><p>{f.periode || f.produk || f.keterangan || f.q ? 'Tidak ada pelunasan untuk kombinasi filter ini. Coba bulan lain atau hapus filter produk.' : 'Belum ada pelunasan tercatat.'}</p></FeedbackState>
        ) : (
          <section aria-label="Daftar pelunasan" className="console-section">
            <FinancialTable label="Daftar pelunasan pinjaman" columns={[{ label: 'Dokumen' }, { label: 'Anggota' }, { label: 'Keterangan' }, { label: 'Pokok pinjaman', numeric: true }, { label: 'Pelunasan pokok', numeric: true }, { label: 'Admin', numeric: true }, { label: 'Penalti', numeric: true }, { label: 'Total dibayar', numeric: true }]}>
              <tbody>{page.items.map((s) => (
                <tr key={s.id}>
                  <td><Link prefetch={false} className="kloan-doc" href={`${LOAN_HUB}/${encodeURIComponent(s.docNo)}`}>{s.docNo}</Link><small className="kloan-sub">{shortDate(s.settledOn) ?? 'Tanggal tidak tercatat'} · {productLabel(s.product)}</small></td>
                  <td><span className="kloan-name">{s.name || 'Nama tidak tercatat'}</span><small className="kloan-sub">NIK {maskIdentifier(s.nik)}</small></td>
                  <td><span>{remarkText(s.remark?.trim() || null)}</span><small className="kloan-sub">{[s.method?.trim(), s.status === 'YES' || s.status === 'LUNAS' ? 'Lunas' : s.status ? `Status ${s.status}` : 'Status tidak tercatat'].filter(Boolean).join(' · ')}</small></td>
                  <td className="num">{formatAmount4(s.planPrincipal4)}</td><td className="num">{formatAmount4(s.principal4)}</td><td className="num">{formatAmount4(s.adminFee4)}</td><td className="num">{formatAmount4(s.penalty4)}</td>
                  <td className="num"><strong>{formatAmount4(s.total4)}</strong></td>
                </tr>
              ))}</tbody>
            </FinancialTable>
            <p className="console-notice">{page.items.length} pelunasan di halaman ini, terbaru lebih dulu.</p>
            {page.nextCursor !== null && <PrivatePagination path={PATH} params={{ q: f.q, produk: f.produk, keterangan: f.keterangan, periode: f.periode, after: String(page.nextCursor) }}>Muat pelunasan lebih lama</PrivatePagination>}
          </section>
        )}
        <ContextNotice title="Total dihitung seperti di KOSIPA lama" expandable><p>Total dibayar = pelunasan pokok + admin + penalti, sama seperti kolom total di layar Pelunasan Pinjaman lama. Kolom total yang tersimpan di database tidak dipakai karena berisi nilai yang terpotong. Proses pelunasan sendiri masih dilakukan di KOSIPA lama.</p></ContextNotice>
      </>}
    </div>
  );
}
