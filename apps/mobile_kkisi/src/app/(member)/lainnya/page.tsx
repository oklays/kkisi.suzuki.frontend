import type { Metadata } from 'next';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { AccountMenu, type MenuSheet } from '@/features/account/components/AccountMenu';
import { getProfile } from '@/features/member/services/member.server';
import { getFaqs } from '@/features/account/services/account.server';
import { dayLabel } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Lainnya' };

const Unavailable = ({ children }: { children: React.ReactNode }) => <p className="detail-copy">{children}</p>;

export default async function LainnyaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, faqs, params] = await Promise.all([getProfile(), getFaqs(), searchParams]);
  const subtitle = [profile.section, profile.location].filter(Boolean).join(' - ') || 'Anggota KKISI TB2';
  const account: MenuSheet[] = [
    { key: 'profil', label: 'Profil', icon: 'user', title: 'Profil', subtitle: 'Data keanggotaan', body: (
      <dl className="dialog-values">
        <div><dt>Nama</dt><dd>{profile.name}</dd></div><div><dt>NIK anggota</dt><dd>{profile.nik}</dd></div>
        <div><dt>Kelompok</dt><dd>{profile.group ?? '-'}</dd></div><div><dt>Status</dt><dd>{profile.status ?? '-'}</dd></div>
        <div><dt>Divisi</dt><dd>{profile.division ?? '-'}</dd></div><div><dt>Bagian</dt><dd>{profile.section ?? '-'}</dd></div>
        <div><dt>Lokasi</dt><dd>{profile.location ?? '-'}</dd></div><div><dt>Telepon</dt><dd>{profile.phone ?? '-'}</dd></div>
        <div><dt>Email</dt><dd>{profile.email ?? '-'}</dd></div><div><dt>Terdaftar</dt><dd>{profile.joinedOn ? dayLabel(profile.joinedOn) : '-'}</dd></div>
      </dl>) },
    { key: 'qr', label: 'QR ID Anggota', icon: 'scan', tone: 'gold', title: 'QR ID Anggota', subtitle: 'Identitas anggota', body: (
      <>
        <div className="qr-placeholder"><Icon name="qr" /><strong>NIK {profile.nik}</strong><p>QR ID anggota belum tersedia.<br />Tunjukkan NIK ini kepada kasir.</p></div>
        <p className="detail-note">Format QR yang dapat dipindai kasir belum ditetapkan koperasi, jadi aplikasi ini belum membuat kode QR.</p>
      </>) },
    { key: 'alamat', label: 'Alamat', icon: 'address', title: 'Alamat', subtitle: 'Alamat tinggal tercatat', body: (
      <><p className="detail-copy">{profile.address ?? 'Alamat belum tercatat di data anggota.'}</p><p className="detail-note">Perubahan alamat dilakukan melalui pengurus koperasi.</p></>) },
    { key: 'keamanan', label: 'Keamanan (Password & PIN)', icon: 'lock', tone: 'slate', title: 'Keamanan (Password & PIN)', subtitle: 'Akun S-MART', body: (
      <Unavailable>Password dan PIN kamu adalah milik akun S-MART KKISI TB2. Penggantian password dan PIN belum tersedia di aplikasi ini; hubungi pengurus koperasi. Jangan pernah memberikan password atau PIN kepada siapa pun.</Unavailable>) },
  ];
  const help: MenuSheet[] = [
    { key: 'tiket', label: 'Tiket Bantuan', icon: 'ticket', tone: 'gold', title: 'Tiket Bantuan', subtitle: 'Bantuan anggota', body: <Unavailable>Layanan tiket bantuan belum tersedia di aplikasi ini. Untuk pertanyaan, hubungi pengurus koperasi KKISI TB2.</Unavailable> },
    { key: 'whatsapp', label: 'Hubungi via WhatsApp', icon: 'chat', title: 'Hubungi via WhatsApp', subtitle: 'Bantuan anggota', body: <Unavailable>Nomor WhatsApp resmi koperasi belum ditetapkan untuk aplikasi ini, jadi aplikasi tidak membuka WhatsApp. Hubungi pengurus koperasi secara langsung.</Unavailable> },
    { key: 'faq', label: 'FAQ', icon: 'help', tone: 'slate', title: 'FAQ', subtitle: 'Pertanyaan yang sering diajukan', body: faqs.state !== 'ok'
      ? <Unavailable>FAQ belum dapat dimuat. Coba lagi nanti.</Unavailable>
      : faqs.data.length === 0 ? <Unavailable>Belum ada FAQ dari koperasi.</Unavailable>
        : <div>{faqs.data.map((f) => <details key={f.id} className="legal-section"><summary>{f.question}</summary><p>{f.answer.replace(/<[^>]*>/g, '')}</p></details>)}</div> },
  ];
  const other: MenuSheet[] = [
    { key: 'tentang', label: 'Syarat, Privasi & Tentang', icon: 'document', tone: 'slate', title: 'Syarat, Privasi & Tentang', subtitle: 'Informasi aplikasi', body: (
      <div>
        <details className="legal-section"><summary>Syarat</summary><p>Naskah syarat penggunaan resmi belum diterbitkan koperasi untuk aplikasi ini.</p></details>
        <details className="legal-section"><summary>Privasi</summary><p>{'Aplikasi ini hanya menampilkan data keanggotaanmu sendiri dan tidak menyimpan data anggota di perangkat.\nSesi berakhir otomatis setelah 30 menit tidak aktif.\nNaskah kebijakan privasi resmi belum diterbitkan koperasi.'}</p></details>
        <details className="legal-section"><summary>Tentang</summary><p>{`S-MART KKISI TB2 — Aplikasi Anggota\nVersi ${process.env.APP_VERSION ?? '-'}\nKoperasi Karyawan KKISI Tambun 2`}</p></details>
      </div>) },
    { key: 'pengaturan', label: 'Pengaturan (Tema & Bahasa)', icon: 'settings', title: 'Pengaturan (Tema & Bahasa)', subtitle: 'Tampilan aplikasi', body: (
      <><dl className="dialog-values"><div><dt>Tema</dt><dd>Terang</dd></div><div><dt>Bahasa</dt><dd>Bahasa Indonesia</dd></div></dl><p className="detail-note">Tema gelap dan bahasa lain belum tersedia.</p></>) },
  ];
  const buka = typeof params.buka === 'string' ? params.buka : null;
  return (
    <Screen name="lainnya" nav>
      <PageHeader title="Lainnya" subtitle="Akun dan bantuan anggota" back="/beranda" symbol="menu" />
      <main id="main" className="content">
        <section className="member-card" aria-label="Profil anggota">
          <span className="member-avatar" aria-hidden="true"><Icon name="user" /></span>
          <div className="member-copy"><h2>{profile.name}</h2><p>{subtitle}</p></div>
        </section>
        <AccountMenu initial={[...account, ...help, ...other].some((m) => m.key === buka) ? buka : null}
          sections={[{ title: 'Akun', items: account }, { title: 'Bantuan', items: help }, { title: 'Lainnya', items: other }]} />
        <p className="footnote">Versi {process.env.APP_VERSION}</p>
      </main>
    </Screen>
  );
}
