import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowRight, Info } from 'lucide-react';
import { postLoginLanding } from '@koperasi/domain/console/capabilities';
import { visibleNavigation } from '@koperasi/domain/console/navigation';
import { CONSOLE_ICONS } from '@/components/console/icons';
import { CONSOLE_MODULES, CONSOLE_NAVIGATION } from '@/features/console/navigation';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';

export const dynamic = 'force-dynamic';

type ModuleState = 'available' | 'partial' | 'planned' | 'restricted';
const STATE_LABEL: Record<ModuleState, string> = { available: 'Tersedia', partial: 'Tersedia sebagian', planned: 'Segera hadir', restricted: 'Tidak ada akses' };

export default async function ConsoleDashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console' });
  if (auth.kind !== 'ok') return null; // the layout renders the unavailable state
  const { ctx, capabilities } = auth;

  // Fresh login without `next`: cashier-focused users keep the one-step path to the POS (spec REQ-014).
  if ((await searchParams).entry === 'login' && postLoginLanding({ capabilities, consoleEnabled: true }) === '/pos') redirect('/pos');

  const visible = visibleNavigation(CONSOLE_NAVIGATION, capabilities);
  const linksFor = (section: string) => visible.find((g) => g.section === section)?.items ?? [];
  const modules = CONSOLE_MODULES.map((m) => {
    const links = linksFor(m.section);
    const planned = CONSOLE_NAVIGATION.filter((e) => e.section === m.section && e.readiness === 'planned');
    const state: ModuleState = links.length === 0 ? (planned.length > 0 && m.section !== 'toko' ? 'planned' : 'restricted') : planned.length > 0 ? 'partial' : 'available';
    return { ...m, links, planned, state };
  }).filter((m) => m.state !== 'restricted');
  const quick = [...linksFor('toko'), ...linksFor('kosipa'), ...linksFor('warehouse'), ...linksFor('settings')];

  return (
    <div className="console-page">
      <header className="console-page-head">
        <h1>Selamat datang, {ctx.userName || 'Pengguna'}</h1>
        <p>Ruang kerja terpadu KKISI TB2. Menu yang tampil mengikuti izin akun dan cabang aktif.</p>
      </header>

      {quick.length > 0 && (
        <section aria-labelledby="quick-title" className="console-section">
          <h2 id="quick-title">Akses cepat</h2>
          <ul className="console-quick">
            {quick.map((item) => {
              const Icon = CONSOLE_ICONS[item.icon];
              return <li key={item.id}><Link href={item.href}><Icon size={20} aria-hidden="true" /><span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span><ArrowRight size={16} aria-hidden="true" /></Link></li>;
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="modules-title" className="console-section">
        <h2 id="modules-title">Modul</h2>
        <ul className="console-modules">
          {modules.map((m) => (
            <li key={m.section} className="console-module" data-state={m.state}>
              <div className="console-module-head"><h3>{m.title}</h3><span className="console-badge" data-state={m.state}>{STATE_LABEL[m.state]}</span></div>
              <p>{m.summary}</p>
              {m.links.length > 0 && <ul className="console-module-links">{m.links.map((l) => <li key={l.id}><Link href={l.href}>{l.label}</Link></li>)}</ul>}
              {m.planned.length > 0 && <p className="console-module-planned">Dalam pengembangan: {m.planned.map((p) => p.label).join(', ')}.</p>}
            </li>
          ))}
        </ul>
      </section>

      {auth.kosipa === 'unavailable' && <p className="console-message console-message-error" role="status">Akses KOSIPA sementara tidak dapat diperiksa, sehingga menu KOSIPA disembunyikan. Modul TOKO tetap dapat digunakan.</p>}

      {quick.length === 0 && (
        <section className="console-panel" role="status"><h2>Belum ada modul untuk akun ini</h2><p>Akun Anda belum memiliki izin modul operasional. Hubungi administrator koperasi bila Anda memerlukan akses.</p></section>
      )}

      <p className="console-notice"><Info size={16} aria-hidden="true" />Ringkasan angka operasional belum ditampilkan. Angka hanya akan muncul setelah sumber data dan perhitungannya diverifikasi.</p>
    </div>
  );
}
