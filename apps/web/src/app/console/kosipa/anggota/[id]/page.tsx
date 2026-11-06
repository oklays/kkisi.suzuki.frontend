import { FinancialTable, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { PageBreadcrumbs } from '@/components/console/PageBreadcrumbs';
import { MEMBERS_PATH, MemberHero, ProfileCard, Value } from '@/components/console/kosipa/MemberProfileUI';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { classifyLegacyDate } from '@koperasi/domain/kosipa';
import { readMember360, type Member360, type Section } from '@koperasi/application/kosipa/member-360';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { formatRupiah } from '@/components/pos/preview';
import { formatAmount4, formatLegacyDate, STATUS_LABEL } from '@/components/console/kosipa/payroll-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Anggota · KOSIPA · KKISI TB2' };

const REASON: Record<string, string> = {
  INDEX_REQUIRED: 'Belum ditampilkan: sumber data ini menunggu tinjauan performa (indeks) sebelum dibaca dari database produksi.',
  READ_FAILED: 'Data tidak dapat dibaca saat ini. Coba lagi beberapa saat lagi.',
  NOT_CONFIGURED: 'Sumber data ini belum dikonfigurasi di lingkungan ini.',
};

const slug = (title: string) => `sec-${title.toLowerCase().replaceAll(' ', '-')}`;

function SectionBlock<T>({ title, section, action, className, children }: { title: string; section: Section<T>; action?: React.ReactNode; className?: string; children: (data: T) => React.ReactNode }) {
  if (section.state === 'restricted') return null;
  return (
    <ProfileCard id={slug(title)} title={title} action={section.state === 'ok' ? action : undefined} className={className}>
      {section.state === 'ok' ? children(section.data) : <p className="console-unavailable" role="status">{REASON[section.reason]}</p>}
    </ProfileCard>
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

  const canEdit = auth.capabilities.has('kosipa.member.update') || auth.capabilities.has('kosipa.member.status');
  const unrestricted = (section: Section<unknown>) => section.state !== 'restricted';
  const eligibility = p.eligibility.eligible
    ? <span className="mprofile-elig" data-ok="true">Memenuhi syarat</span>
    : <span className="mprofile-elig" data-ok="false">Tidak memenuhi syarat: {p.eligibility.reasons.map((r) => ELIGIBILITY[r]).join(', ')}</span>;

  return (
    <div className="console-page mprofile">
      <PageBreadcrumbs tail={[{ label: p.name || 'Anggota', icon: 'member' }]} />
      <MemberHero
        name={p.name} nik={p.nik} group={p.group} status={p.status} employment={p.employment} readOnly={!canEdit}
        editHref={canEdit ? `${MEMBERS_PATH}/${id}/ubah` : null}
        savingsHref={unrestricted(member.savings) ? `/console/kosipa/simpanan/${p.id}` : null}
        facts={[
          { label: 'Status karyawan', value: p.employment ? `${p.employment}${p.exitOn ? ` · berakhir ${p.exitOn}` : ''}` : null },
          { label: 'Tanggal daftar', value: formatLegacyDate(classifyLegacyDate(p.joinedOn)) },
          { label: 'Divisi / Bagian', value: [p.division, p.section].filter(Boolean).join(' / ') },
          { label: 'Layanan kredit anggota', value: eligibility },
        ]}
      />
      <nav className="mprofile-tabs" aria-label="Bagian profil anggota">
        <a href="#sec-profil">Profil</a>
        {unrestricted(member.savings) && <a href="#sec-simpanan">Simpanan</a>}
        {unrestricted(member.loans) && <a href="#sec-pinjaman">Pinjaman</a>}
        {unrestricted(member.payroll) && <a href="#sec-potongan-payroll">Payroll</a>}
        {unrestricted(member.storeCredit) && <a href="#sec-kredit-toko-bulan-berjalan">Kredit TOKO</a>}
      </nav>

      <div className="mprofile-split">
        <ProfileCard id="sec-kontak-dan-rekening" title="Kontak dan rekening">
          <dl className="mprofile-dl">
            <div><dt>Telepon</dt><dd><Value>{p.phone}</Value></dd></div>
            <div><dt>E-mail</dt><dd><Value>{p.email}</Value></dd></div>
            <div><dt>Rekening</dt><dd><Value>{p.bankAccount ? `${p.bankName ?? ''} ${p.bankAccount}`.trim() : null}</Value></dd></div>
          </dl>
          <p className="mprofile-note">Kontak dan rekening ditampilkan tersamar. Alamat, KTP, dan gaji tidak ditampilkan.</p>
        </ProfileCard>

        <SectionBlock title="Kredit toko bulan berjalan" section={member.storeCredit}>{(c) => (
          <>
            <dl className="mprofile-tiles">
              <div><dt>Belanja Kredit</dt><dd>{formatRupiah(c.spentSen)}</dd></div>
              <div><dt>Retur Kredit</dt><dd>{formatRupiah(c.returnedSen)}</dd></div>
              <div><dt>Pemakaian bersih</dt><dd>{formatRupiah(c.netSen)}</dd></div>
              <div><dt>Limit / sisa</dt><dd>{c.limitSen === null ? <span className="mprofile-empty">Tidak berlaku</span> : <>{formatRupiah(c.limitSen)} <small>/ {formatRupiah(c.remainingSen ?? 0)}</small></>}</dd></div>
            </dl>
            {c.limitSen === null && <p className="mprofile-note">Anggota ini tidak memenuhi syarat layanan kredit, jadi tidak ada limit.</p>}
          </>
        )}</SectionBlock>
      </div>

      <SectionBlock title="Simpanan" section={member.savings} action={<Link prefetch={false} className="console-more" href={`/console/kosipa/simpanan/${p.id}`}>Buku simpanan lengkap</Link>}>{(rows) => rows.length === 0 ? <p className="mprofile-note">Belum ada mutasi simpanan tercatat.</p> : (
        <>
          <FinancialTable label="Mutasi simpanan anggota" columns={[{ label: "Jenis" }, { label: "Mutasi bersih disetujui", numeric: true }, { label: "Penarikan menunggu", numeric: true }, { label: "Setoran menunggu", numeric: true }]}>
            <tbody>{rows.map((r) => <tr key={r.type}><td>{r.type}</td><td className="num">{formatRupiah(r.postedSen)}</td><td className="num">{formatRupiah(r.pendingDebitSen)}</td><td className="num">{formatRupiah(r.pendingCreditSen)}</td></tr>)}</tbody>
          </FinancialTable>
          <ContextNotice title="Mutasi tercatat, bukan saldo resmi" expandable><p>Saldo resmi belum tersedia. Nilai berikut berasal dari mutasi yang dicatat; definisi saldo awal belum diverifikasi.</p></ContextNotice>
        </>
      )}</SectionBlock>

      <SectionBlock title="Pinjaman" section={member.loans}>{(rows) => rows.length === 0 ? <p className="mprofile-note">Tidak ada pinjaman tercatat.</p> : (
        <FinancialTable label="Pinjaman anggota" columns={[{ label: "Dokumen" }, { label: "Tanggal" }, { label: "Jenis" }, { label: "Pokok", numeric: true }, { label: "Tenor", numeric: true }, { label: "Angsuran rencana", numeric: true }, { label: "Status" }]}>
          <tbody>{rows.map((l, index) => <tr key={`${l.docNo}-${index}`}><td><Link prefetch={false} href={`/console/kosipa/pinjaman/${encodeURIComponent(l.docNo)}`}>{l.docNo}</Link></td><td>{formatLegacyDate(classifyLegacyDate(l.docDate))}</td><td>{[l.type, l.method].filter(Boolean).join(' · ') || <span className="mprofile-empty">Tidak tercatat</span>}</td><td className="num">{formatRupiah(l.principalSen)}</td><td>{l.months ? `${l.months} bln` : <span className="mprofile-empty">Tidak tercatat</span>}</td><td className="num">{formatRupiah(l.installmentSen)}</td><td>{[l.docStatus, l.disbursement, l.repayment].filter(Boolean).join(' · ') || <span className="mprofile-empty">Tidak tercatat</span>}</td></tr>)}</tbody>
        </FinancialTable>
      )}</SectionBlock>

      <SectionBlock title="Rincian angsuran" section={member.installments}>{() => null}</SectionBlock>
      <SectionBlock title="Potongan payroll" section={member.payroll}>{(rows) => rows.length === 0 ? <p className="mprofile-note">Belum ada potongan payroll tercatat.</p> : (
        <>
          <FinancialTable label="Riwayat potongan payroll anggota" columns={[{ label: "Batch" }, { label: "Periode" }, { label: "Status" }, { label: "Toko (Kredit)", numeric: true }, { label: "Total potongan tercatat", numeric: true }]}>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{r.header.state === 'OK' ? <Link prefetch={false} href={`/console/kosipa/payroll/${encodeURIComponent(r.docNo)}/anggota/${encodeURIComponent(p.nik)}`}>{r.docNo}</Link> : r.docNo}</td>
                <td>{r.header.state === 'OK' ? (r.header.period ?? <span className="mprofile-empty">Tidak tercatat</span>) : <span className="mprofile-empty">Tidak tercatat</span>}</td>
                <td>{r.header.state === 'OK' ? STATUS_LABEL[r.header.status] : r.header.state === 'MISSING' ? 'Header batch tidak ditemukan' : 'Header ganda: status tidak dapat dipastikan'}</td>
                <td className="num">{formatAmount4(r.toko4.TOKO_TAMBUN + r.toko4.TOKO_MJ + r.toko4.TOKO_GIIC)}</td>
                <td className="num">{formatAmount4(r.total4)}</td>
              </tr>
            ))}</tbody>
          </FinancialTable>
          <p className="mprofile-note">Menampilkan paling banyak 24 baris terbaru, sebagai nilai yang tercatat di KOSIPA. Bukan perhitungan ulang.</p>
        </>
      )}</SectionBlock>
    </div>
  );
}
