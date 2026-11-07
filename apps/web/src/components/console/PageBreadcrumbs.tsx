'use client';

import { usePathname } from 'next/navigation';
import { currentEntryId } from '@koperasi/domain/console/navigation';
import { CONSOLE_NAVIGATION, SECTION_LABELS } from '@/features/console/navigation';
import { Breadcrumbs } from './Breadcrumbs';
import { buildConsoleTrail, CRUMB_ICONS, type TailCrumb } from './breadcrumb-trail';

/**
 * The breadcrumb above a page title. It reads the same navigation registry as the header bar, so every console screen gets a trail
 * without configuring one; a page only passes `tail` to name what the registry cannot know (a record, a sub-view). The home crumb is left
 * out (the header bar already has it), and KOSIPA pages read "KOSIPA > Administrasi Koperasi > ...", the module's own naming.
 */
export function PageBreadcrumbs({ tail }: { tail?: readonly TailCrumb[] }) {
  const pathname = usePathname() ?? '';
  const entries = CONSOLE_NAVIGATION;
  const current = entries.find((e) => e.id === currentEntryId(entries, pathname)) ?? null;
  if (!current) return null;
  const parent = current.parent ? entries.find((e) => e.id === current.parent) ?? null : null;
  const deeper = pathname.replace(/\/$/, '') !== current.href.split('?')[0];
  const [, ...rest] = buildConsoleTrail({ current, section: { section: current.section, label: SECTION_LABELS[current.section] }, parent, deeper, pathname, tail });
  const items = current.section === 'kosipa'
    ? [{ label: 'KOSIPA', href: '/console/kosipa', icon: CRUMB_ICONS.kosipa }, { label: 'Administrasi Koperasi', icon: CRUMB_ICONS.admin }, ...rest.slice(1)]
    : rest;
  return <Breadcrumbs items={items} prefetch={false} className="page-crumbs" />;
}
