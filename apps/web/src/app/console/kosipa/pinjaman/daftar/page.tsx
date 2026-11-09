import { notFound } from 'next/navigation';
import { KosipaError, LOAN_PENDING_FILTER } from '@koperasi/domain/kosipa';
import { listLoans, type LoanListPage } from '@koperasi/application/kosipa/loans';
import { FeedbackState, FilterContext } from '@/components/console/kosipa/KosipaUI';
import { PrivatePagination } from '@/components/console/kosipa/PrivateWorkspace';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { LoanFilterForm, LoanPageHeader, LoanTable, type LoanListFilters } from '@/components/console/kosipa/LoanUI';
import { LOAN_LIST, PRODUCT_OPTIONS } from '@/components/console/kosipa/loan-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Semua Dokumen Pinjaman · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Every loan document, newest first (legacy "Kartu Aktif" = this list filtered to APPROVED · APPROVED · BELUM LUNAS). */
export default async function LoanListPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: LOAN_LIST });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.loan.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const params = await searchParams;
  const f: LoanListFilters = { q: one(params.q).slice(0, 50), status: one(params.status), cair: one(params.cair), bayar: one(params.bayar), periode: one(params.periode), produk: one(params.produk), segmen: '' };
  let page: LoanListPage | null = null; let failed = false; let invalid = false;
  try {
    page = await listLoans({ reader: services.loans, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { ...params, segmen: undefined });
  } catch (error) { if (error instanceof KosipaError) invalid = true; else failed = true; }
  const active = f.status === 'APPROVED' && f.cair === 'APPROVED' && f.bayar === 'BELUM LUNAS';

  return (
    <div className="console-page kloan-page">
      <LoanPageHeader title={<> Semua dokumen pinjaman </>}>
        <p>Seluruh dokumen dari semua produk, terbaru lebih dulu. Untuk kartu pinjaman aktif seperti di legacy, pilih status APPROVED, pencairan APPROVED, dan pelunasan BELUM LUNAS.</p>
      </LoanPageHeader>
      <LoanFilterForm action={LOAN_LIST} f={f} />
      <FilterContext privateReset reset={LOAN_LIST} filters={[{ label: 'Produk', value: PRODUCT_OPTIONS.find((o) => o.value === f.produk)?.label ?? f.produk }, { label: 'Status', value: f.status === LOAN_PENDING_FILTER ? 'Menunggu keputusan' : f.status }, { label: 'Pencairan', value: f.cair }, { label: 'Pelunasan', value: f.bayar }, { label: 'Bulan', value: f.periode }, { label: 'Pencarian', value: f.q ? 'Aktif' : '' }]} />
      {invalid && <FeedbackState kind="error" title={<> Filter tidak valid </>} reset={LOAN_LIST}><p>Periksa produk, status, dan bulan dokumen. Gunakan pilihan yang tersedia. Tidak ada data yang dibaca.</p></FeedbackState>}
      {failed && <FeedbackState kind="error" title={<> Daftar pinjaman tidak dapat dibaca </>} reset={LOAN_LIST}><p>Database tidak menjawab tepat waktu. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {page && page.items.length === 0 && <FeedbackState kind="empty" title={<> Tidak ada dokumen yang cocok </>} reset={LOAN_LIST}><p>{page.filterActive || f.produk ? 'Tidak ada dokumen untuk kombinasi filter ini. Longgarkan salah satu filter, misalnya bulan dokumen.' : 'Belum ada dokumen pinjaman tercatat.'}</p></FeedbackState>}
      {page && page.items.length > 0 && (
        <section aria-label="Daftar pinjaman" className="console-section">
          {active && <p className="kloan-hint">Menampilkan pinjaman aktif: sudah disetujui, sudah cair, dan belum lunas.</p>}
          {f.status === LOAN_PENDING_FILTER && <p className="kloan-hint">Menampilkan dokumen yang menunggu keputusan: OPEN (belum diposting) dan POSTING (menunggu persetujuan). Buka dokumen untuk memposting, menyetujui, atau menolak.</p>}
          <LoanTable items={page.items} detailQuery={{ dari: 'daftar' }} />
          <p className="console-notice">{page.items.length} dokumen di halaman ini. Jumlah seluruh dokumen tidak dihitung di daftar; lihat ringkasan Pinjaman untuk total per produk.</p>
          {page.nextCursor !== null && <PrivatePagination path={LOAN_LIST} params={{ q: f.q, status: f.status, cair: f.cair, bayar: f.bayar, periode: f.periode, produk: f.produk, after: String(page.nextCursor) }}>Muat dokumen lebih lama</PrivatePagination>}
        </section>
      )}
    </div>
  );
}
