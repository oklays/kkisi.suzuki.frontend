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
      <Link className="console-back" href="/console/kosipa/simpanan"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pencarian</Link>
      <header className="console-page-head"><h1>Buku simpanan</h1><p>{data ? `${data.member.name || 'Anggota'} · NIK ${data.member.nik || '—'} · mutasi tercatat, baca saja` : 'Data KOSIPA, baca saja.'}</p></header>
      {failed && <section className="console-panel" role="alert"><h2>Buku simpanan tidak dapat dibaca</h2><p>Data tidak tersedia saat ini atau berisi nilai yang tidak dapat dibaca. Coba lagi beberapa saat lagi.</p></section>}
      {data && (<>
        <p className="console-notice" role="status"><strong>Saldo resmi belum tersedia.</strong> Definisi saldo awal dan view saldo legacy belum diverifikasi (TASK-003), dan kolom saldo pada baris mutasi tidak pernah diisi. Jumlah di bawah adalah penjumlahan mutasi yang tercatat, bukan saldo. Status dokumen (header) menentukan apakah suatu mutasi berlaku.</p>
        <section className="console-card" aria-labelledby="sec-ringkasan">
          <h2 id="sec-ringkasan">Ringkasan mutasi per jenis</h2>
          {data.summary.state === 'unavailable' ? <p className="console-unavailable" role="status">{REASON[data.summary.reason]}</p> : data.summary.data.length === 0 ? <p>Belum ada mutasi simpanan tercatat.</p> : (
            <table className="console-table">
              <thead><tr><th scope="col">Jenis</th><th scope="col">Mutasi</th><th scope="col">Σ mutasi disetujui (kredit + jasa − debit)</th><th scope="col">Debit menunggu</th><th scope="col">Kredit menunggu</th><th scope="col">Status lain</th><th scope="col">Tidak dapat dipastikan</th></tr></thead>
              <tbody>{data.summary.data.map((t) => (
                <tr key={t.type}><td><Link href={`${base}${qs({ jenis: t.type })}`}>{t.type}</Link></td><td>{t.rows}</td><td className="num">{formatAmount4(t.posted4)}</td><td className="num">{formatAmount4(t.pendingDebit4)}</td><td className="num">{formatAmount4(t.pendingCredit4)}</td><td>{t.voidRows}</td><td>{t.unverifiedRows}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
        <section className="console-section" aria-labelledby="sec-mutasi">
          <h2 id="sec-mutasi">Mutasi{jenis ? ` · ${jenis}` : ''} (terbaru dahulu)</h2>
          {jenis && <p><Link className="console-more" href={base}>Tampilkan semua jenis</Link></p>}
          {data.ledger.state === 'unavailable' ? <p className="console-unavailable" role="status">{REASON[data.ledger.reason]}</p> : data.ledger.data.items.length === 0 ? <section className="console-panel" role="status"><h3>Tidak ada mutasi</h3><p>Tidak ada mutasi tercatat{jenis ? ' untuk jenis ini' : ''}.</p></section> : (
            <table className="console-table">
              <thead><tr><th scope="col">Tanggal</th><th scope="col">Dokumen</th><th scope="col">Jenis</th><th scope="col">Transaksi</th><th scope="col">Kredit</th><th scope="col">Debit</th><th scope="col">Jasa</th><th scope="col">Status</th></tr></thead>
              <tbody>{data.ledger.data.items.map((m) => (
                <tr key={m.id}>
                  <td>{formatLegacyDate(m.date)}</td><td>{m.docNo || '—'}</td><td>{m.type}</td><td>{m.kind ?? '—'}{m.opening ? ' (saldo awal)' : ''}</td>
                  <td className="num">{formatAmount4(m.credit4)}</td><td className="num">{formatAmount4(m.debit4)}</td><td className="num">{formatAmount4(m.interest4)}</td>
                  <td>{STATE_LABEL[m.state]}{m.headerStatus ? ` · ${m.headerStatus}` : ''}{m.flags.map((f) => <span key={f} className="console-badge" data-state="partial"> {FLAG_TEXT[f]}</span>)}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {data.ledger.state === 'ok' && data.ledger.data.nextCursor !== null && <p><Link className="console-more" href={`${base}${qs({ jenis, after: String(data.ledger.data.nextCursor) })}`}>Muat mutasi lebih lama</Link></p>}
        </section>
      </>)}
    </div>
  );
}
