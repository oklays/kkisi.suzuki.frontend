import { BookText, Building2, ClipboardCheck, FileSpreadsheet, FileText, House, Landmark, Pencil, UserPlus, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { NavSection } from '@koperasi/domain/console/navigation';
import { SECTION_ICONS, type ConsoleNavEntry } from '../../features/console/navigation.ts';
import type { BreadcrumbItem } from './Breadcrumbs';
import { CONSOLE_ICONS } from './icons.ts';

/** Icons for trails written by hand on a page (the registry covers the ones derived from navigation). */
export const CRUMB_ICONS = {
  home: House, kosipa: Landmark, admin: Building2, members: Users, member: UserRound, register: UserPlus, edit: Pencil, detail: FileText,
  book: BookText, batch: FileSpreadsheet, reconcile: ClipboardCheck,
} as const satisfies Record<string, LucideIcon>;
export type CrumbIconKey = keyof typeof CRUMB_ICONS;
/** A crumb a page adds after its registered entry. The icon is a key, so a server page can hand it to the client breadcrumb. */
export type TailCrumb = { label: string; href?: string; icon?: CrumbIconKey };

/** Registry entries whose "new record" page is named after the action rather than a generic "Tambah". */
const NEW_LABELS: Readonly<Record<string, string>> = { 'kosipa-members': 'Daftarkan anggota' };

/** Registry entries whose detail page has a more specific icon than the generic document. */
const DETAIL_ICONS: Readonly<Record<string, LucideIcon>> = { 'kosipa-members': UserRound };

type TrailEntry = Pick<ConsoleNavEntry, 'id' | 'label' | 'href' | 'icon'>;
const kosipaPrefetch = (href: string) => (href.startsWith('/console/kosipa') ? false as const : undefined);

/**
 * Trail of the console header: root, module, optional parent entry, current entry, and "Detail" when the path is deeper than the registered page.
 * Pure, so every console screen gets the same trail from the same navigation registry. The dashboard has no trail beyond its root.
 */
export function buildConsoleTrail(input: { current: TrailEntry | null; section: { section: NavSection; label: string } | null; parent: TrailEntry | null; deeper: boolean; pathname?: string; /** Replaces the generic deeper crumbs when a page knows better (a record's name, a sub-view). */ tail?: readonly TailCrumb[] }): BreadcrumbItem[] {
  const { current, section, parent, deeper } = input;
  const trail: BreadcrumbItem[] = [{ label: 'KKISI TB2', href: '/console', icon: House, iconOnly: true }];
  if (section && section.section !== 'dashboard') trail.push({ label: section.label, icon: CONSOLE_ICONS[SECTION_ICONS[section.section]] });
  if (parent) trail.push({ label: parent.label, href: parent.href, icon: CONSOLE_ICONS[parent.icon], prefetch: kosipaPrefetch(parent.href) });
  if (current && current.id !== 'dashboard') {
    const { tail } = input;
    trail.push({ label: current.label, href: deeper || tail?.length ? current.href : undefined, icon: CONSOLE_ICONS[current.icon], prefetch: kosipaPrefetch(current.href) });
    if (tail?.length) trail.push(...tail.map((t) => ({ label: t.label, href: t.href, icon: t.icon ? CRUMB_ICONS[t.icon] : undefined, prefetch: t.href ? kosipaPrefetch(t.href) : undefined })));
    else if (deeper) trail.push(...deeperCrumbs(current, input.pathname));
  }
  return trail;
}

/** What follows the registered page: "baru" and "ubah" name their action, anything else is the record's detail. */
function deeperCrumbs(current: TrailEntry, pathname = ''): BreadcrumbItem[] {
  const base = current.href.split('?')[0];
  const rest = pathname.replace(/\/$/, '').slice(base.length).split('/').filter(Boolean);
  const detail = (href?: string): BreadcrumbItem => ({ label: 'Detail', href, icon: DETAIL_ICONS[current.id] ?? FileText, prefetch: href ? kosipaPrefetch(href) : undefined });
  if (rest.length === 1 && rest[0] === 'baru') return [{ label: NEW_LABELS[current.id] ?? 'Tambah', icon: UserPlus }];
  if (rest.length === 2 && rest[1] === 'ubah') return [detail(`${base}/${rest[0]}`), { label: 'Ubah', icon: Pencil }];
  return [detail()];
}
