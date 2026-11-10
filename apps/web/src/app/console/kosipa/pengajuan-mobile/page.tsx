import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listMemberRequests, type MemberRequestList } from '@koperasi/application/kosipa/commands/member-request';
import { ContextNotice, FeedbackState, FinancialTable, KosipaPageHeader, StatusBadge } from '@/components/console/kosipa/KosipaUI';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { FlashNotice } from '@/components/console/kosipa/FlashNotice';
import { MemberRequestActions } from '@/components/console/kosipa/MemberRequestActions';
import { rupiah } from '@/components/console/kosipa/deposit-ui';
import { maskIdentifier } from '@/components/console/kosipa/presentation';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaCommandServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pengajuan anggota · KOSIPA · KKISI TB2' };

const PATH = '/console/kosipa/pengajuan-mobile';
const STATUS_LABEL: Record<string, string> = { OPEN: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak', ALL: 'Semua status' };
const CHANNEL_LABEL: Record<string, string> = { pwa: 'Aplikasi anggota', smartkkisi: 'S-MART lama', 'public-link': 'Tautan publik' };
const TYPE_VIEW = { loan: 'kosipa.loan.view', deduction: 'kosipa.savings.view' } as const;

/** Member requests (P1): loan applications and deduction changes from the member apps. Loan requests: reject only (conversion stays legacy F47). */
export default async function MemberRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: PATH });
  if (auth.kind !== 'ok') return null;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 12) : undefined);
  const can = (t: 'loan' | 'deduction') => auth.capabilities.has(TYPE_VIEW[t]) && auth.capabilities.has('kosipa.member.view');
  const wanted = one(sp.type) === 'deduction' ? 'deduction' : one(sp.type) === 'loan' ? 'loan' : can('loan') ? 'loan' : 'deduction';
  if (!can(wanted)) return <KosipaNotice state={auth.kosipa === 'linked' || auth.kosipa === 'role' ? 'no-capability' : auth.kosipa} />;
  const services = kosipaCommandServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let data: MemberRequestList;
  try { data = await listMemberRequests(services, { capabilities: auth.capabilities, kosipaUserId: auth.kosipaUserId, userId: auth.ctx.userId }, { type: wanted, status: one(sp.status), month: one(sp.month) }); }
  catch { return <KosipaNotice state="unavailable" />; }
  const csrfToken = auth.services.keys.csrfToken(auth.ctx.sidHash);
  const { filter } = data;
  const tab = (t: 'loan' | 'deduction') => `${PATH}?type=${t}&status=${filter.status}&month=${filter.month}`;
  const loan = filter.type === 'loan';

  return (
    <div className="console-page">
      <KosipaPageHeader editable title={<> Pengajuan anggota </>}>
        <p>Pengajuan pinjaman dan perubahan potongan simpanan yang dikirim anggota dari aplikasi. Data dibaca langsung dari tabel pengajuan KOSIPA.</p>
      </KosipaPageHeader>

      <nav className="kloan-segments" aria-label="Jenis pengajuan">
        <span className="kloan-segments-label">Jenis</span>
        <ul>
          {can('loan') && <li><Link prefetch={false} href={tab('loan')} aria-current={loan ? 'page' : undefined}>Pinjaman</Link></li>}
          {can('deduction') && <li><Link prefetch={false} href={tab('deduction')} aria-current={!loan ? 'page' : undefined}>Potongan simpanan</Link></li>}
        </ul>
      </nav>

      {loan && <ContextNotice title="Konversi menjadi pinjaman tetap di KOSIPA lama">Pengajuan pinjaman diproses menjadi dokumen pinjaman dan jadwal angsuran di menu Pinjaman Mobile KOSIPA lama. Di sini pengajuan yang belum diproses dapat ditinjau dan ditolak dengan alasan.</ContextNotice>}
      {!loan && data.legacy === 'legacy-active' && !data.shared && <ContextNotice title="Layar Pengajuan Mobile lama masih aktif" tone="warning">Selama menu Pengajuan Mobile di KOSIPA lama aktif, halaman ini hanya menampilkan data. Persetujuan dilakukan di KOSIPA sampai menu lama dinonaktifkan oleh operator.</ContextNotice>}
      {!loan && data.shared && data.writable && <ContextNotice title="Masa transisi" tone="warning">Menu Pengajuan Mobile di KOSIPA lama tetap aktif. Bila pengajuan yang sama diproses di sana lebih dulu, tindakan di sini ditolak karena datanya sudah berubah.</ContextNotice>}
      {!data.owned && <ContextNotice title="Perubahan belum aktif">Pemrosesan pengajuan native belum diaktifkan di lingkungan ini. Halaman ini hanya menampilkan data.</ContextNotice>}
      {data.writable && !data.canDecide && <ContextNotice title="Hanya lihat">Menyetujui atau menolak pengajuan memerlukan hak <strong>Putuskan pengajuan anggota</strong>, diberikan oleh dua administrator.</ContextNotice>}

      <section className="console-section member-requests" aria-labelledby="req-list">
        <h2 id="req-list">{loan ? 'Pengajuan pinjaman' : 'Perubahan potongan simpanan'} <span className="kosipa-result-count">{data.rows.length} pengajuan</span></h2>
        <form className="deposit-filter" method="get" action={PATH}>
          <input type="hidden" name="type" value={filter.type} />
          <label htmlFor="req-f-status"><span>Status</span>
            <select id="req-f-status" name="status" defaultValue={filter.status}>{Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label htmlFor="req-f-month"><span>Bulan pengajuan</span><input id="req-f-month" name="month" type="month" defaultValue={filter.month} /></label>
          <button type="submit" className="mform-link">Terapkan</button>
        </form>
        <FlashNotice key={data.rows.map((r) => `${r.docNo}:${r.status}`).join(',')} />
        {data.rows.length === 0
          ? <FeedbackState kind="empty" title={<> Belum ada pengajuan </>}>
              <p>Tidak ada pengajuan {STATUS_LABEL[filter.status].toLowerCase()} pada bulan {filter.month}.</p>
              <p>Pilih bulan lain bila pengajuan dikirim pada bulan berbeda.</p>
            </FeedbackState>
          : loan
            ? (
              <FinancialTable label="Daftar pengajuan pinjaman" columns={[{ label: 'No. pengajuan' }, { label: 'Tanggal' }, { label: 'Anggota' }, { label: 'Jenis pinjaman' }, { label: 'Nominal', numeric: true }, { label: 'Tenor', numeric: true }, { label: 'Keperluan' }, { label: 'Kanal' }, { label: 'Status' }, { label: 'Aksi' }]}>
                <tbody>{data.rows.map((r) => (
                  <tr key={`${r.id}`} data-request={r.docNo}>
                    <td>{r.docNo || '—'}</td><td>{r.docDate ?? '—'}</td>
                    <td><strong>{r.member.name || '—'}</strong><br /><small>{maskIdentifier(r.member.nik)}{r.member.section ? ` · ${r.member.section}` : ''}</small></td>
                    <td>{r.detail.product || '—'}</td>
                    <td className="num">{r.detail.amount ? rupiah(r.detail.amount) : '—'}</td>
                    <td className="num">{r.detail.months ? `${r.detail.months} bln` : '—'}</td>
                    <td>{r.detail.purpose || '—'}{r.detail.rejection && <><br /><small>Alasan tolak: {r.detail.rejection}</small></>}</td>
                    <td>{CHANNEL_LABEL[r.channel]}</td>
                    <td><StatusBadge value={r.status} label={STATUS_LABEL[r.status ?? ''] ?? r.status ?? undefined} /></td>
                    <td><MemberRequestActions type="loan" docNo={r.docNo} version={r.version} summary="" canApprove={false} canReject={r.canReject} csrfToken={csrfToken} writable={data.writable} /></td>
                  </tr>
                ))}</tbody>
              </FinancialTable>
            )
            : (
              <FinancialTable label="Daftar perubahan potongan simpanan" columns={[{ label: 'No. pengajuan' }, { label: 'Tanggal' }, { label: 'Anggota' }, { label: 'Jenis simpanan' }, { label: 'Potongan lama', numeric: true }, { label: 'Potongan baru', numeric: true }, { label: 'Mulai' }, { label: 'Kanal' }, { label: 'Status' }, { label: 'Aksi' }]}>
                <tbody>{data.rows.map((r) => (
                  <tr key={`${r.id}`} data-request={r.docNo}>
                    <td>{r.docNo || '—'}</td><td>{r.docDate ?? '—'}</td>
                    <td><strong>{r.member.name || '—'}</strong><br /><small>{maskIdentifier(r.member.nik)}{r.member.section ? ` · ${r.member.section}` : ''}</small></td>
                    <td>{r.detail.savingsType || '—'}</td>
                    <td className="num">{r.detail.previous ? rupiah(r.detail.previous) : '—'}</td>
                    <td className="num">{r.detail.requested ? rupiah(r.detail.requested) : '—'}</td>
                    <td>{r.detail.effective ?? '—'}</td>
                    <td>{CHANNEL_LABEL[r.channel]}{r.channel === 'public-link' && <><br /><small><Link prefetch={false} href="/console/kosipa/simpanan-sukarela">Lihat di Pengajuan sukarela</Link></small></>}</td>
                    <td><StatusBadge value={r.status} label={STATUS_LABEL[r.status ?? ''] ?? r.status ?? undefined} /></td>
                    <td><MemberRequestActions type="deduction" docNo={r.docNo} version={r.version} canApprove={r.canApprove} canReject={r.canReject} csrfToken={csrfToken} writable={data.writable}
                      summary={`perubahan ${r.detail.savingsType ?? 'potongan'} ${r.member.name || ''} menjadi ${r.detail.requested ? rupiah(r.detail.requested) : '—'} per bulan`} /></td>
                  </tr>
                ))}</tbody>
              </FinancialTable>
            )}
      </section>
    </div>
  );
}
