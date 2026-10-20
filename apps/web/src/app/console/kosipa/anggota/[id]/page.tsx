import { KosipaPageHeader, FinancialTable, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { classifyLegacyDate } from '@koperasi/domain/kosipa';
import { readMember360, type Member360, type Section } from '@koperasi/application/kosipa/member-360';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatRupiah } from '@/components/pos/preview';
import { formatAmount4, formatLegacyDate, STATUS_LABEL } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Anggota 360 · KOSIPA · KKISI TB2' };

const REASON: Record<string, string> = {
  INDEX_REQUIRED: 'Belum ditampilkan: sumber data ini menunggu tinjauan performa (indeks) sebelum dibaca dari database produksi.',
  READ_FAILED: 'Data tidak dapat dibaca saat ini. Coba lagi beberapa saat lagi.',
  NOT_CONFIGURED: 'Sumber data ini belum dikonfigurasi di lingkungan ini.',
};

function SectionBlock<T>({ title, section, children }: { title: string; section: Section<T>; children: (data: T) => React.ReactNode }) {
  if (section.state === 'restricted') return null;
  return (
    <section className="console-card" aria-labelledby={`sec-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <h2 id={`sec-${title.toLowerCase().replaceAll(" ", "-")}`}>{title}</h2>
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
    member = await readMember360({ reader: services.members, payroll: services.payroll, audit: services.audit, now: services.now }, { userId: auth.ctx.userId, capabilities: auth.capabilities, requestId: crypto.randomUUID() }, Number(id));
  } catch { return <KosipaNotice state="unavailable" />; }
  if (!member) notFound();
  const p = member.profile;

  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href="/console/kosipa/anggota"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pencarian</Link>
      <KosipaPageHeader title={<> {p.name || 'Anggota'} </>}>
        <p>NIK {p.nik || '—'} · {p.group ?? 'Grup tidak tercatat'} · Data KOSIPA, baca saja</p>
      </KosipaPageHeader>

      <nav className="kosipa-profile-nav" aria-label="Bagian profil anggota">
        <a href="#sec-profil">Profil</a>
        {member.savings.state !== 'restricted' && <a href="#sec-simpanan">Simpanan</a>}
        {member.loans.state !== 'restricted' && <a href="#sec-pinjaman">Pinjaman</a>}
        {member.payroll.state !== 'restricted' && <a href="#sec-potongan-payroll">Payroll</a>}
        {member.storeCredit.state !== 'restricted' && <a href="#sec-kredit-toko-bulan-berjalan">Kredit TOKO</a>}
      </nav>
      <section className="console-card" aria-labelledby="sec-profil">
        <h2 id="sec-profil">Profil</h2>
        <dl className="console-dl">
          <div><dt>Status anggota</dt><dd>{p.status ?? '—'}</dd></div>
          <div><dt>Status karyawan</dt><dd>{p.employment ?? '—'}{p.exitOn ? ` · berakhir ${p.exitOn}` : ''}</dd></div>
          <div><dt>Tanggal daftar</dt><dd>{formatLegacyDate(classifyLegacyDate(p.joinedOn))}</dd></div>
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
          <p><Link prefetch={false} className="console-more" href={`/console/kosipa/simpanan/${p.id}`}>Lihat buku simpanan lengkap</Link></p>
          <FinancialTable label="Mutasi simpanan anggota" columns={[{ label: "Jenis" }, { label: "Mutasi bersih disetujui", numeric: true }, { label: "Penarikan menunggu", numeric: true }, { label: "Setoran menunggu", numeric: true }]}>
            <tbody>{rows.map((r) => <tr key={r.type}><td>{r.type}</td><td className="num">{formatRupiah(r.postedSen)}</td><td className="num">{formatRupiah(r.pendingDebitSen)}</td><td className="num">{formatRupiah(r.pendingCreditSen)}</td></tr>)}</tbody>
          </FinancialTable>
          <ContextNotice title="Mutasi tercatat, bukan saldo resmi" expandable><p>Saldo resmi belum tersedia. Nilai berikut berasal dari mutasi yang dicatat; definisi saldo awal belum diverifikasi.</p></ContextNotice>
        </>
      )}</SectionBlock>

      <SectionBlock title="Pinjaman" section={member.loans}>{(rows) => rows.length === 0 ? <p>Tidak ada pinjaman tercatat.</p> : (
        <FinancialTable label="Pinjaman anggota" columns={[{ label: "Dokumen" }, { label: "Tanggal" }, { label: "Jenis" }, { label: "Pokok", numeric: true }, { label: "Tenor", numeric: true }, { label: "Angsuran rencana", numeric: true }, { label: "Status" }]}>
          <tbody>{rows.map((l, index) => <tr key={`${l.docNo}-${index}`}><td><Link prefetch={false} href={`/console/kosipa/pinjaman/${encodeURIComponent(l.docNo)}`}>{l.docNo}</Link></td><td>{formatLegacyDate(classifyLegacyDate(l.docDate))}</td><td>{[l.type, l.method].filter(Boolean).join(' · ') || '—'}</td><td className="num">{formatRupiah(l.principalSen)}</td><td>{l.months ? `${l.months} bln` : '—'}</td><td className="num">{formatRupiah(l.installmentSen)}</td><td>{[l.docStatus, l.disbursement, l.repayment].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody>
        </FinancialTable>
      )}</SectionBlock>

      <SectionBlock title="Rincian angsuran" section={member.installments}>{() => null}</SectionBlock>
      <SectionBlock title="Potongan payroll" section={member.payroll}>{(rows) => rows.length === 0 ? <p>Belum ada potongan payroll tercatat.</p> : (
        <>
          <FinancialTable label="Riwayat potongan payroll anggota" columns={[{ label: "Batch" }, { label: "Periode" }, { label: "Status" }, { label: "Toko (Kredit)", numeric: true }, { label: "Total potongan tercatat", numeric: true }]}>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{r.header.state === 'OK' ? <Link prefetch={false} href={`/console/kosipa/payroll/${encodeURIComponent(r.docNo)}/anggota/${encodeURIComponent(p.nik)}`}>{r.docNo}</Link> : r.docNo}</td>
                <td>{r.header.state === 'OK' ? (r.header.period ?? '—') : '—'}</td>
                <td>{r.header.state === 'OK' ? STATUS_LABEL[r.header.status] : r.header.state === 'MISSING' ? 'Header batch tidak ditemukan' : 'Header ganda: status tidak dapat dipastikan'}</td>
                <td className="num">{formatAmount4(r.toko4.TOKO_TAMBUN + r.toko4.TOKO_MJ + r.toko4.TOKO_GIIC)}</td>
                <td className="num">{formatAmount4(r.total4)}</td>
              </tr>
            ))}</tbody>
          </FinancialTable>
          <p className="console-notice">Menampilkan paling banyak 24 baris terbaru, sebagai nilai yang tercatat di KOSIPA. Bukan perhitungan ulang.</p>
        </>
      )}</SectionBlock>

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
