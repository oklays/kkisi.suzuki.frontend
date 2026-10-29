import { KosipaPageHeader, ContextNotice } from '@/components/console/kosipa/KosipaUI';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { nestNavigation, visibleNavigation } from '@koperasi/domain/console/navigation';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { CONSOLE_ICONS } from '@/components/console/icons';
import { CONSOLE_NAVIGATION, deployedNavigation } from '@/features/console/navigation';
import { publicSavingsConsoleEnabled } from '@/features/public-savings/flags';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ringkasan KOSIPA · KKISI TB2' };

/**
 * KOSIPA module landing page. It reads NO KOSIPA data: it lists the destinations this account may open (derived from the same registry and
 * capabilities as the sidebar), the read-only status and the data limits. Each destination still enforces its own capability.
 */
export default async function KosipaOverviewPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa' });
  if (auth.kind !== 'ok') return null;
  const nodes = nestNavigation((visibleNavigation(deployedNavigation(publicSavingsConsoleEnabled()), auth.capabilities).find((g) => g.section === 'kosipa')?.items ?? []).filter((i) => i.id !== 'kosipa-overview'));
  if (nodes.length === 0) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  if (!kosipaServices()) return <KosipaNotice state="unavailable" />;
  const reports = nodes.find((n) => n.entry.id === 'kosipa-reports')?.children ?? [];
  const planned = CONSOLE_NAVIGATION.filter((e) => e.section === 'kosipa' && e.readiness === 'planned');
  const canExport = auth.capabilities.has('kosipa.report.export');

  return (
    <div className="console-page">
      <KosipaPageHeader title={<> Ringkasan KOSIPA </>}>
        <p>Ruang kerja administrasi koperasi. Pilih layanan untuk meninjau data yang tersedia bagi akun Anda.</p>
      </KosipaPageHeader>

      <section aria-labelledby="kosipa-menu-title" className="console-section">
        <h2 id="kosipa-menu-title">Menu yang tersedia untuk akun ini</h2>
        <ul className="console-quick">
          {nodes.map(({ entry }) => {
            const Icon = CONSOLE_ICONS[entry.icon];
            return <li key={entry.id}><Link prefetch={false} href={entry.href}><Icon size={20} aria-hidden="true" /><span><strong>{entry.label}</strong>{entry.description && <small>{entry.description}</small>}</span><ArrowRight size={16} aria-hidden="true" /></Link></li>;
          })}
        </ul>
      </section>

      {reports.length > 0 && (
        <section aria-labelledby="kosipa-reports-title" className="console-section">
          <h2 id="kosipa-reports-title">Laporan</h2>
          <ul className="console-module-links">{reports.map((r) => <li key={r.id}><Link prefetch={false} href={r.href}>{r.label}</Link></li>)}</ul>
          <p className="console-notice">{canExport ? 'Akun ini diizinkan mengunduh CSV dari halaman laporan.' : 'Akun ini dapat melihat laporan, tetapi tidak diizinkan mengunduh CSV (izin ekspor terpisah).'}</p>
        </section>
      )}

      <ContextNotice title="Informasi data" expandable>
        <p>Nilai yang ditampilkan adalah data tercatat. Saldo resmi belum tersedia; perbandingan payroll hanya untuk tinjauan.</p>
        <ul className="console-limits">
          <li><strong>Dicatat, bukan resmi.</strong> Simpanan dan pinjaman menampilkan mutasi dan dokumen yang tercatat. Saldo simpanan resmi dan outstanding pinjaman resmi belum tersedia dan tidak pernah ditampilkan sebagai nol.</li>
          <li><strong>Payroll ditinjau saja.</strong> Perbandingan kredit TOKO hanya untuk ditinjau (pemetaan kolom toko belum diputuskan); tidak ada pembuatan, persetujuan, atau posting payroll.</li>
          <li><strong>Tanpa aksi keuangan.</strong> Tidak ada persetujuan pinjaman, pencairan, penarikan simpanan, atau SHU di console ini.</li>
          {planned.length > 0 && <li><strong>Dalam pengembangan:</strong> {planned.map((p) => p.label).join(', ')}.</li>}
        </ul>
      </ContextNotice>

      <p className="console-notice">Pembukaan detail keuangan mengikuti jejak audit yang berlaku. Ringkasan ini hanya menampilkan navigasi, tanpa membaca data anggota atau keuangan.</p>
    </div>
  );
}
