import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readMember360, type Member360, type Section } from '@koperasi/application/kosipa/member-360';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatRupiah } from '@/components/pos/preview';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Anggota 360 · KOSIPA · KKISI TB2' };

const REASON: Record<string, string> = {
  INDEX_REQUIRED: 'Belum ditampilkan: tabel sumbernya sangat besar dan belum memiliki indeks di produksi. Data ini akan muncul setelah indeks yang direview dipasang.',
  READ_FAILED: 'Data tidak dapat dibaca saat ini. Coba lagi beberapa saat lagi.',
};

function SectionBlock<T>({ title, section, children }: { title: string; section: Section<T>; children: (data: T) => React.ReactNode }) {
  if (section.state === 'restricted') return null;
  return (
    <section className="console-card" aria-labelledby={`sec-${title}`}>
      <h2 id={`sec-${title}`}>{title}</h2>
      {section.state === 'ok' ? children(section.data) : <p className="console-unavailable" role="status">{REASON[section.reason]}</p>}
    </section>
  );
}

const ELIGIBILITY: Record<string, string> = { NO_NIK: 'NIK kosong', STATUS_NOT_ACTIVE: 'status anggota tidak AKTIVE', CONTRACT_EXPIRED: 'kontrak sudah berakhir' };

export default async function Member360Page({ params }: { params: Promise<{ id: string }> }) {
  if (!consoleEnabled()) notFound();
  const { id } = await params;
  const auth = await requireConsoleSession({ next: `/console/kosipa/anggota/${encodeURIComponent(id)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  if (!/^\d{1,10}$/.test(id)) notFound();
  let member: Member360 | null;
  try {
    member = await readMember360({ reader: services.members, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, Number(id));
  } catch { return <KosipaNotice state="unavailable" />; }
  if (!member) notFound();
  const p = member.profile;

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/kosipa/anggota"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pencarian</Link>
      <header className="console-page-head">
        <h1>{p.name || 'Anggota'}</h1>
        <p>NIK {p.nik || '—'} · {p.group ?? 'Grup tidak tercatat'} · Data KOSIPA, baca saja</p>
      </header>

      <section className="console-card" aria-labelledby="sec-profil">
        <h2 id="sec-profil">Profil</h2>
        <dl className="console-dl">
          <div><dt>Status anggota</dt><dd>{p.status ?? '—'}</dd></div>
          <div><dt>Status karyawan</dt><dd>{p.employment ?? '—'}{p.exitOn ? ` · berakhir ${p.exitOn}` : ''}</dd></div>
          <div><dt>Tanggal daftar</dt><dd>{p.joinedOn ?? '—'}</dd></div>
          <div><dt>Divisi / Bagian</dt><dd>{[p.division, p.section].filter(Boolean).join(' / ') || '—'}</dd></div>
          <div><dt>Telepon</dt><dd>{p.phone ?? '—'}</dd></div>
          <div><dt>E-mail</dt><dd>{p.email ?? '—'}</dd></div>
          <div><dt>Rekening</dt><dd>{p.bankAccount ? `${p.bankName ?? ''} ${p.bankAccount}`.trim() : '—'}</dd></div>
          <div><dt>Layanan kredit anggota</dt><dd>{p.eligibility.eligible ? 'Memenuhi syarat' : `Tidak memenuhi syarat: ${p.eligibility.reasons.map((r) => ELIGIBILITY[r]).join(', ')}`}</dd></div>
        </dl>
        <p className="console-notice">Kontak dan rekening ditampilkan tersamar. Alamat, KTP, dan gaji tidak ditampilkan.</p>
      </section>

      <SectionBlock title="Simpanan" section={member.savings}>{(rows) => rows.length === 0 ? <p>Belum ada mutasi simpanan tercatat.</p> : (
        <>
          <table className="console-table">
            <thead><tr><th scope="col">Jenis</th><th scope="col">Mutasi bersih disetujui</th><th scope="col">Penarikan menunggu</th><th scope="col">Setoran menunggu</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.type}><td>{r.type}</td><td className="num">{formatRupiah(r.postedSen)}</td><td className="num">{formatRupiah(r.pendingDebitSen)}</td><td className="num">{formatRupiah(r.pendingCreditSen)}</td></tr>)}</tbody>
          </table>
          <p className="console-notice">Ini jumlah mutasi yang tercatat, <strong>bukan saldo resmi</strong>: definisi saldo awal KOSIPA belum diverifikasi.</p>
        </>
      )}</SectionBlock>

      <SectionBlock title="Pinjaman" section={member.loans}>{(rows) => rows.length === 0 ? <p>Tidak ada pinjaman tercatat.</p> : (
        <table className="console-table">
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Tanggal</th><th scope="col">Jenis</th><th scope="col">Pokok</th><th scope="col">Tenor</th><th scope="col">Angsuran rencana</th><th scope="col">Status</th></tr></thead>
          <tbody>{rows.map((l) => <tr key={l.docNo}><td>{l.docNo}</td><td>{l.docDate ?? '—'}</td><td>{[l.type, l.method].filter(Boolean).join(' · ') || '—'}</td><td className="num">{formatRupiah(l.principalSen)}</td><td>{l.months ? `${l.months} bln` : '—'}</td><td className="num">{formatRupiah(l.installmentSen)}</td><td>{[l.docStatus, l.disbursement, l.repayment].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody>
        </table>
      )}</SectionBlock>

      <SectionBlock title="Rincian angsuran" section={member.installments}>{() => null}</SectionBlock>
      <SectionBlock title="Potongan payroll" section={member.payroll}>{() => null}</SectionBlock>

      <SectionBlock title="Kredit toko bulan berjalan" section={member.storeCredit}>{(c) => (
        <dl className="console-dl">
          <div><dt>Belanja Kredit</dt><dd>{formatRupiah(c.spentSen)}</dd></div>
          <div><dt>Retur Kredit</dt><dd>{formatRupiah(c.returnedSen)}</dd></div>
          <div><dt>Pemakaian bersih</dt><dd>{formatRupiah(c.netSen)}</dd></div>
          <div><dt>Limit / sisa</dt><dd>{c.limitSen === null ? 'Tidak berlaku (tidak memenuhi syarat kredit)' : `${formatRupiah(c.limitSen)} / ${formatRupiah(c.remainingSen ?? 0)}`}</dd></div>
        </dl>
      )}</SectionBlock>
    </div>
  );
}
