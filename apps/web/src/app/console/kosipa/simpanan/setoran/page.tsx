import { notFound } from 'next/navigation';
import { businessDates } from '@koperasi/domain/pos/sale';
import { listSavingsDeposits } from '@koperasi/application/kosipa/commands/savings-deposit';
import { ContextNotice, FeedbackState, FinancialTable, KosipaPageHeader, StatusBadge } from '@/components/console/kosipa/KosipaUI';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { DepositActions } from '@/components/console/kosipa/DepositActions';
import { DepositForm } from '@/components/console/kosipa/DepositForm';
import { FlashNotice } from '@/components/console/kosipa/FlashNotice';
import { rupiah } from '@/components/console/kosipa/deposit-ui';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaCommandServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Setoran Simpanan · KOSIPA · KKISI TB2' };

const STATUS_LABEL: Record<string, string> = { POSTING: 'Menunggu persetujuan', APPROVED: 'Disetujui', REJECTED: 'Ditolak', ALL: 'Semua status' };
/** Short labels for the table's status badge (the column is narrow; the filter keeps the full wording). */
const BADGE_LABEL: Record<string, string> = { POSTING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' };

/** Voluntary-savings deposits (FA-03C T07): create (maker), approve/reject (another officer, FD-35), filter by status and month. */
export default async function SavingsDepositsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/simpanan/setoran' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.savings.view') || !auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' || auth.kosipa === 'role' ? 'no-capability' : auth.kosipa} />;
  const services = kosipaCommandServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 10) : undefined);
  let data;
  try { data = await listSavingsDeposits(services, { capabilities: auth.capabilities, kosipaUserId: auth.kosipaUserId, userId: auth.ctx.userId }, { status: one(sp.status), month: one(sp.month) }); }
  catch { return <KosipaNotice state="unavailable" />; }
  const today = businessDates(services.now()).day;
  const csrfToken = auth.services.keys.csrfToken(auth.ctx.sidHash);
  const total = data.rows.reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0);

  return (
    <div className="console-page">
      <KosipaPageHeader editable title={<> Setoran simpanan </>}>
        <p>Setoran simpanan sukarela tunai atau transfer. Petugas membuat setoran; petugas LAIN menyetujui. Saldo bertambah setelah disetujui.</p>
      </KosipaPageHeader>
      {data.legacy === 'legacy-active' && <ContextNotice title="Layar Setor Simpanan lama masih aktif" tone="warning">Selama menu Setor Simpanan di KOSIPA lama aktif, halaman ini hanya menampilkan data. Perubahan dilakukan di KOSIPA sampai menu lama dinonaktifkan oleh operator.</ContextNotice>}
      {data.legacy !== 'legacy-active' && !data.writable && <ContextNotice title="Perubahan belum aktif">Setoran simpanan native belum diaktifkan di lingkungan ini. Halaman ini hanya menampilkan data.</ContextNotice>}
      {data.writable && !data.canPrepare && !data.canDecide && <ContextNotice title="Hanya lihat">Membuat setoran memerlukan hak <strong>Siapkan simpanan</strong>; menyetujui memerlukan hak <strong>Setujui simpanan</strong>. Keduanya diberikan dua administrator.</ContextNotice>}

      {data.canPrepare && data.writable && (
        <section className="console-section" aria-labelledby="dep-new"><h2 id="dep-new">Buat setoran</h2>
          <DepositForm csrfToken={csrfToken} today={today} monthStart={`${today.slice(0, 7)}-01`} canSubmit={data.writable} />
        </section>
      )}

      <section className="console-section" aria-labelledby="dep-list">
        <h2 id="dep-list">Daftar setoran <span className="kosipa-result-count">{data.rows.length} dokumen · {rupiah(String(total / 100))}</span></h2>
        <form className="deposit-filter" method="get" action="/console/kosipa/simpanan/setoran">
          <label htmlFor="dep-f-status"><span>Status</span>
            <select id="dep-f-status" name="status" defaultValue={data.filter.status}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label htmlFor="dep-f-month"><span>Bulan</span><input id="dep-f-month" name="month" type="month" defaultValue={data.filter.month} /></label>
          <button type="submit" className="mform-link">Terapkan</button>
        </form>
        <FlashNotice key={data.rows.map((r) => `${r.id}:${r.status}`).join(',')} />
        {data.rows.length === 0
          ? <FeedbackState kind="empty" title={<> Belum ada setoran </>}><p>Tidak ada setoran {STATUS_LABEL[data.filter.status].toLowerCase()} pada bulan {data.filter.month}.</p></FeedbackState>
          : (
            <FinancialTable label="Daftar setoran simpanan" columns={[{ label: 'No. dokumen' }, { label: 'Tanggal' }, { label: 'Anggota' }, { label: 'Metode' }, { label: 'Nominal', numeric: true }, { label: 'Dibuat oleh' }, { label: 'Status' }, { label: 'Aksi' }]}>
              <tbody>{data.rows.map((r) => (
                <tr key={r.id} data-deposit-id={r.id}>
                  <td>{r.docNo || '—'}</td><td>{r.docDate}</td>
                  <td><strong>{r.member.name || '—'}</strong><br /><small>{maskIdentifier(r.member.nik)}</small></td>
                  <td>{r.paymentType || '—'}</td><td className="num">{rupiah(r.amount)}</td>
                  <td>{r.createdBy || '—'}{!r.native && <><br /><small>layar lama</small></>}</td>
                  <td><StatusBadge value={r.status} label={BADGE_LABEL[r.status] ?? r.status} /></td>
                  <td><DepositActions id={r.id} version={r.version} amount={r.amount} member={r.member.name} docNo={r.docNo} canApprove={r.canApprove} canReject={r.canReject}
                    isOwn={r.makerConsoleUserId === auth.ctx.userId} csrfToken={csrfToken} writable={data.writable} /></td>
                </tr>
              ))}</tbody>
            </FinancialTable>
          )}
      </section>
    </div>
  );
}
