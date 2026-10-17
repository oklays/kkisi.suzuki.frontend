import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Laporan KOSIPA · KKISI TB2' };

export default async function ReportsHubPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/laporan' });
  if (auth.kind !== 'ok') return null;
  const loan = auth.capabilities.has('kosipa.loan.view'), payroll = auth.capabilities.has('kosipa.payroll.view');
  if (!loan && !payroll) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  if (!kosipaServices()) return <KosipaNotice state="unavailable" />;
  const cards = [
    loan && { href: '/console/kosipa/laporan/pinjaman', title: 'Laporan pinjaman', text: 'Jumlah dan pokok tercatat per bulan dan status dokumen. Saldo/outstanding resmi tidak ditampilkan.' },
    payroll && { href: '/console/kosipa/laporan/payroll', title: 'Laporan payroll', text: 'Ringkasan batch per periode, komponen potongan tercatat, dan temuan integritas.' },
    { href: '/console/kosipa/laporan/kualitas-data', title: 'Kualitas data keuangan', text: 'Diagnostik baca-saja: referensi ganda, status bertentangan, tanggal tidak valid, angsuran yatim, selisih total payroll, dan pemetaan cabang yang belum diverifikasi.' },
  ].filter(Boolean) as { href: string; title: string; text: string }[];
  return (
    <div className="console-page">
      <header className="console-page-head"><h1>Laporan KOSIPA</h1><p>Semua laporan hanya membaca nilai yang tercatat di KOSIPA. Tidak ada perbaikan data otomatis dan tidak ada saldo resmi.</p></header>
      <section className="console-modules" aria-label="Daftar laporan">
        {cards.map((c) => <article className="console-module" key={c.href}><h2><Link href={c.href}>{c.title}</Link></h2><p>{c.text}</p></article>)}
      </section>
    </div>
  );
}
