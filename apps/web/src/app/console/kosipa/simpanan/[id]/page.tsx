import { KosipaPageHeader, FeedbackState, CursorPagination, StatusBadge, FinancialTable, ContextNotice, FilterContext } from '@/components/console/kosipa/KosipaUI';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { readMemberSavings, type MemberSavings } from '@koperasi/application/kosipa/savings';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatAmount4, formatLegacyDate, qs } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Buku Simpanan · KOSIPA · KKISI TB2' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const STATE_LABEL: Record<string, string> = { POSTED: 'Disetujui (APPROVED)', PENDING: 'Menunggu (OPEN)', VOID: 'Tidak berlaku (status lain)', UNVERIFIED: 'Tidak dapat dipastikan' };
const FLAG_TEXT: Record<string, string> = {
  HEADER_MISSING: 'header dokumen tidak ditemukan', HEADER_AMBIGUOUS: 'header dokumen ganda', DETAIL_STATUS_DIFFERS: 'status baris berbeda dari header (header dipakai)',
  DATE_UNUSABLE: 'tanggal dokumen kosong/tidak valid', NEGATIVE_AMOUNT: 'nilai negatif',
};
const REASON: Record<string, string> = { READ_FAILED: 'Data tidak dapat dibaca saat ini (batas waktu atau gangguan database). Coba lagi beberapa saat lagi.', MEMBER_NIK_UNUSABLE: 'NIK anggota ini tidak dapat dipakai untuk mencari mutasi; tidak ditebak.' };

export default async function MemberSavingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { id } = await params;
  const auth = await requireConsoleSession({ next: `/console/kosipa/simpanan/${encodeURIComponent(id)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.savings.view') || !auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  const sp = await searchParams; const jenis = one(sp.jenis);
  let data: MemberSavings | null = null; let failed = false;
  try {
    data = await readMemberSavings({ savings: services.savings, members: services.members, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, { memberId: id, params: sp });
  } catch (error) { if (error instanceof KosipaError && error.code !== 'AMOUNT_INVALID') notFound(); failed = true; }
  if (!failed && !data) notFound();
  const base = `/console/kosipa/simpanan/${encodeURIComponent(id)}`;

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/simpanan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pencarian</Link>
      <KosipaPageHeader title={<> Buku simpanan </>}><p>{data ? `${data.member.name || 'Anggota'} · NIK ${data.member.nik || '—'} · mutasi tercatat, baca saja` : 'Data KOSIPA, baca saja.'}</p></KosipaPageHeader>
      {failed && <FeedbackState kind="error" title={<> Buku simpanan tidak dapat dibaca </>} reset={base}><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></FeedbackState>}
      {data && (<>
        <ContextNotice title="Saldo resmi belum tersedia" expandable><p>Jumlah berikut adalah mutasi tercatat, bukan saldo. Saldo awal dan definisi saldo resmi belum diverifikasi. Status dokumen menentukan apakah mutasi berlaku.</p></ContextNotice>
        <section className="console-card" aria-labelledby="sec-ringkasan">
          <h2 id="sec-ringkasan">Mutasi tercatat per jenis</h2>
          {data.summary.state === 'unavailable' ? <p className="console-unavailable" role="status">{REASON[data.summary.reason]}</p> : data.summary.data.length === 0 ? <p>Belum ada mutasi simpanan tercatat.</p> : (
            <FinancialTable label="Ringkasan mutasi per jenis" columns={[{ label: "Jenis" }, { label: "Mutasi", numeric: true }, { label: "Σ mutasi disetujui (kredit + jasa − debit)", numeric: true }, { label: "Debit menunggu", numeric: true }, { label: "Kredit menunggu", numeric: true }, { label: "Status lain", numeric: true }, { label: "Tidak dapat dipastikan", numeric: true }]}>
              <tbody>{data.summary.data.map((t) => (
                <tr key={t.type}><td><Link prefetch={false} href={`${base}${qs({ jenis: t.type })}`}>{t.type}</Link></td><td>{t.rows}</td><td className="num">{formatAmount4(t.posted4)}</td><td className="num">{formatAmount4(t.pendingDebit4)}</td><td className="num">{formatAmount4(t.pendingCredit4)}</td><td>{t.voidRows}</td><td>{t.unverifiedRows}</td></tr>
              ))}</tbody>
            </FinancialTable>
          )}
        </section>
        <section className="console-section" aria-labelledby="sec-mutasi">
          <h2 id="sec-mutasi">Mutasi{jenis ? ` · ${jenis}` : ''} (terbaru dahulu)</h2>
          <FilterContext reset={base} filters={[{ label: 'Jenis simpanan', value: jenis }]} />
          {data.summary.state === 'ok' && data.summary.data.length > 0 && <form className="console-search" action={base} method="get"><label htmlFor="savings-type">Jenis simpanan</label><div><select id="savings-type" name="jenis" defaultValue={jenis}><option value="">Semua jenis</option>{data.summary.data.map((type) => <option key={type.type} value={type.type}>{type.type}</option>)}</select><button type="submit">Terapkan filter</button><Link prefetch={false} className="kosipa-button-secondary" href={base}>Reset filter</Link></div></form>}
          {data.ledger.state === 'unavailable' ? <p className="console-unavailable" role="status">{REASON[data.ledger.reason]}</p> : data.ledger.data.items.length === 0 ? <FeedbackState kind="empty" title={<> Tidak ada mutasi </>} level={3} reset={base}><p>Tidak ada mutasi tercatat{jenis ? ' untuk jenis ini' : ''}.</p></FeedbackState> : (
            <FinancialTable label="Mutasi simpanan tercatat" columns={[{ label: "Tanggal" }, { label: "Dokumen" }, { label: "Jenis" }, { label: "Transaksi" }, { label: "Kredit", numeric: true }, { label: "Debit", numeric: true }, { label: "Jasa", numeric: true }, { label: "Status" }]}>
              <tbody>{data.ledger.data.items.map((m) => (
                <tr key={m.id}>
                  <td>{formatLegacyDate(m.date)}</td><td>{m.docNo || '—'}</td><td>{m.type}</td><td>{m.kind ?? '—'}{m.opening ? ' (saldo awal)' : ''}</td>
                  <td className="num">{formatAmount4(m.credit4)}</td><td className="num">{formatAmount4(m.debit4)}</td><td className="num">{formatAmount4(m.interest4)}</td>
                  <td><StatusBadge value={m.state} label={STATE_LABEL[m.state]} />{m.headerStatus ? ` · ${m.headerStatus}` : ''}{m.flags.map((f) => <span key={f} className="console-badge" data-state="partial"> {FLAG_TEXT[f]}</span>)}</td>
                </tr>
              ))}</tbody>
            </FinancialTable>
          )}
          {data.ledger.state === 'ok' && data.ledger.data.nextCursor !== null && <CursorPagination href={`${base}${qs({ jenis, after: String(data.ledger.data.nextCursor) })}`}>Muat mutasi lebih lama</CursorPagination>}
        </section>
      </>)}
    </div>
  );
}
