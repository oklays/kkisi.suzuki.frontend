import { notFound } from 'next/navigation';
import { visibleNavigation } from '@koperasi/domain/console/navigation';
import { ConsoleFrame, type ConsoleNavGroup } from '@/components/console/ConsoleFrame';
import { deployedNavigation, SECTION_LABELS } from '@/features/console/navigation';
import { publicSavingsConsoleEnabled } from '@/features/public-savings/flags';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import './console.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Console · KKISI TB2' };

function Unavailable() {
  return <main className="console-standalone"><section className="console-panel" role="alert"><h1>Layanan tidak tersedia</h1><p>Console belum dapat dibuka. Coba lagi beberapa saat lagi.</p><a href="/console">Coba lagi</a></section></main>;
}

/** Shell only. Every page under /console calls requireConsoleSession() itself; the layout never authorises a page. */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console' });
  if (auth.kind !== 'ok') return <Unavailable />;
  const { ctx, services, capabilities } = auth;
  let viewer;
  try {
    const [company, companies] = await Promise.all([
      services.deps.companies.findActive(ctx.companyId),
      ctx.canSwitchBranch ? services.deps.companies.listActive() : Promise.resolve([]),
    ]);
    viewer = { userId: ctx.userId, userName: ctx.userName, branchName: company?.name ?? 'Cabang', companyId: ctx.companyId,
      canSwitchBranch: ctx.canSwitchBranch, companies, csrfToken: services.keys.csrfToken(ctx.sidHash) };
  } catch { return <Unavailable />; }
  const groups: ConsoleNavGroup[] = visibleNavigation(deployedNavigation(publicSavingsConsoleEnabled()), capabilities)
    .map((g) => ({ section: g.section, label: SECTION_LABELS[g.section], items: g.items }));
  return <ConsoleFrame key={`${ctx.userId}:${ctx.companyId}`} groups={groups} viewer={viewer}>{children}</ConsoleFrame>;
}
