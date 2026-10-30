import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MASTER_DEFINITIONS, MASTER_TYPES } from '@koperasi/domain/kosipa/master';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Master Data KOSIPA · KKISI TB2' };

const PURPOSE: Record<string, string> = {
  lokasi: 'Lokasi kerja yang dipilih pada data anggota.',
  bagian: 'Bagian (departemen) anggota; juga dibaca aplikasi anggota.',
  'jenis-dokumen': 'Daftar jenis dokumen pendukung.',
  'rekening-bank': 'Bank pembiaya untuk pinjaman bank; kode tersimpan di pinjaman.',
  'periode-angsuran': 'Pilihan jangka waktu angsuran dalam bulan.',
};

/** Index of the KOSIPA reference masters available natively (F52). */
export default async function KosipaMasterIndexPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/master' });
  if (auth.kind !== 'ok') return null;
  if (auth.kosipa !== 'linked') return <KosipaNotice state={auth.kosipa} />;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state="no-capability" />;
  return (
    <div className="console-page">
      <header className="kosipa-page-head">
        <p className="kosipa-eyebrow">KOSIPA <span>/</span> Master data</p>
        <div className="kosipa-title-row"><h1>Master Data</h1></div>
        <div className="kosipa-page-purpose"><p>Data referensi KOSIPA. Perubahan hanya oleh akun dengan hak kelola master dan tercatat di buku besar perintah.</p></div>
      </header>
      <ul className="kosipa-master-index">
        {MASTER_TYPES.map((type) => (
          <li key={type}><Link href={`/console/kosipa/master/${type}`}><strong>{MASTER_DEFINITIONS[type].title}</strong><span>{PURPOSE[type]}</span></Link></li>
        ))}
      </ul>
    </div>
  );
}
