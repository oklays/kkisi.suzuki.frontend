import Link from 'next/link';
import { PageBreadcrumbs } from '@/components/console/PageBreadcrumbs';
import { notFound } from 'next/navigation';
import { MASTER_DEFINITIONS, MASTER_TYPES } from '@koperasi/domain/kosipa/master';
import { PRODUCT_MASTER_DEFINITIONS, PRODUCT_MASTER_TYPES } from '@koperasi/domain/kosipa/product-master';
import { ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { PRODUCT_PURPOSE } from '@/components/console/kosipa/product-master-ui';
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

/** Index of the KOSIPA masters available natively (F52): five reference masters and four product masters (FA-03B T06). FD-33 retirements are listed. */
const RETIRED = ['Divisi', 'Jabatan', 'Master Surat', 'Cabang', 'Daftar Pajak', 'Mata Uang', 'Kategori Beban', 'Jenis Pembayaran'];
export default async function KosipaMasterIndexPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/master' });
  if (auth.kind !== 'ok') return null;
  if (auth.kosipa !== 'linked' && auth.kosipa !== 'role') return <KosipaNotice state={auth.kosipa} />;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state="no-capability" />;
  return (
    <div className="console-page">
      <header className="kosipa-page-head">
        <PageBreadcrumbs />
        <div className="kosipa-title-row"><h1>Master Data</h1></div>
        <div className="kosipa-page-purpose"><p>Data referensi KOSIPA. Perubahan hanya oleh akun dengan hak kelola master dan tercatat di buku besar perintah.</p></div>
      </header>
      <section className="console-section" aria-labelledby="master-reference">
        <h2 id="master-reference">Data referensi</h2>
        <ul className="kosipa-master-index">
          {MASTER_TYPES.map((type) => (
            <li key={type}><Link href={`/console/kosipa/master/${type}`}><strong>{MASTER_DEFINITIONS[type].title}</strong><span>{PURPOSE[type]}</span></Link></li>
          ))}
        </ul>
      </section>
      <section className="console-section" aria-labelledby="master-product">
        <h2 id="master-product">Produk keuangan</h2>
        <ul className="kosipa-master-index">
          {PRODUCT_MASTER_TYPES.map((type) => (
            <li key={type}><Link prefetch={false} href={`/console/kosipa/master/${type}`}><strong>{PRODUCT_MASTER_DEFINITIONS[type].title}</strong><span>{PRODUCT_PURPOSE[type]}</span></Link></li>
          ))}
        </ul>
      </section>
      <ContextNotice title="Master yang dipensiunkan" expandable>
        {RETIRED.join(', ')} tidak tersedia di aplikasi baru (keputusan pemilik FD-33): tidak dipakai lagi oleh KOSIPA, atau tabelnya dikelola TOKO. Menu lamanya tetap dinonaktifkan.
      </ContextNotice>
    </div>
  );
}
