'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Menu, Store, X } from 'lucide-react';
import { currentEntryId, nestNavigation } from '@koperasi/domain/console/navigation';
import type { ConsoleNavEntry } from '@/features/console/navigation';
import { CONSOLE_ICONS } from './icons';
import type { PosSession } from '@/features/pos/types';
import { SessionControls } from '@/components/pos/SessionControls';

export type ConsoleViewer = Pick<PosSession, 'userId' | 'userName' | 'branchName' | 'companyId' | 'canSwitchBranch' | 'companies' | 'csrfToken'>;
export type ConsoleNavGroup = { section: string; label: string; items: ConsoleNavEntry[] };

/** Client chrome for /console: sidebar (drawer at <=767px), breadcrumb and session controls. Data arrives pre-authorised. */
export function ConsoleFrame({ groups, viewer, children }: { groups: ConsoleNavGroup[]; viewer: ConsoleViewer; children: React.ReactNode }) {
  const pathname = usePathname() ?? '/console';
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const entries = groups.flatMap((g) => g.items);
  const current = entries.find((e) => e.id === currentEntryId(entries, pathname)) ?? null;
  const currentGroup = current ? groups.find((g) => g.items.includes(current)) : undefined;
  // Deeper than the registered page (e.g. a member or loan detail): the registered page becomes a link and the last crumb is the detail itself.
  const deeper = current !== null && pathname.replace(/\/$/, '') !== current.href.split('?')[0];
  const currentParent = current?.parent ? entries.find((e) => e.id === current.parent) ?? null : null;
  // A submenu is open while it holds the current page; a manual toggle only lasts until the next navigation.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  // Close the drawer on navigation.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setOpen(false); setToggled({}); }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // SessionControls only reads the session/branch fields; the POS-specific ones are inert here.
  const session: PosSession = { ...viewer, checkoutAvailable: false, register: { open: null, multiple: false } };

  return (
    <div className="console-shell" data-drawer={open ? 'open' : 'closed'}>
      <a className="console-skip" href="#console-main">Langsung ke konten</a>
      <aside id="console-nav" className="console-sidebar" aria-label="Navigasi console">
        <div className="console-sidebar-top">
          <Link href="/console" className="console-brand">
            <Image className="console-brand-image" src="/illustrations/new-landscape-logo.jpeg" width={443} height={185} unoptimized alt="SMART KKISI Tambun 2" />
          </Link>
          <button type="button" className="console-icon-button console-drawer-close" aria-label="Tutup menu" onClick={() => { setOpen(false); toggle.current?.focus(); }}><X size={18} /></button>
        </div>
        <div className="console-branch"><Store size={18} aria-hidden="true" /><div><small>CABANG AKTIF</small><strong>{viewer.branchName}</strong></div></div>
        <nav aria-label="Menu utama">
          {groups.map((group) => (
            <div key={group.section} className="console-nav-group">
              {group.section !== 'dashboard' && <p className="console-nav-label" id={`nav-${group.section}`}>{group.label}</p>}
              <ul aria-labelledby={group.section !== 'dashboard' ? `nav-${group.section}` : undefined}>
                {nestNavigation(group.items).map(({ entry: item, children }) => {
                  const Icon = CONSOLE_ICONS[item.icon];
                  const submenu = `nav-sub-${item.id}`;
                  const expanded = toggled[item.id] ?? (current?.id === item.id || children.some((c) => c.id === current?.id));
                  return (
                    <li key={item.id}>
                      <div className="console-nav-row">
                        <Link href={item.href} aria-current={current?.id === item.id ? 'page' : undefined}><Icon size={18} aria-hidden="true" />{item.label}</Link>
                        {children.length > 0 && <button type="button" className="console-nav-toggle" aria-expanded={expanded} aria-controls={submenu} aria-label={`Submenu ${item.label}`} onClick={() => setToggled((t) => ({ ...t, [item.id]: !expanded }))}><ChevronDown size={16} aria-hidden="true" /></button>}
                      </div>
                      {children.length > 0 && (
                        <ul id={submenu} className="console-nav-sub" hidden={!expanded} aria-label={`Submenu ${item.label}`}>
                          {children.map((child) => <li key={child.id}><Link href={child.href} aria-current={current?.id === child.id ? 'page' : undefined}>{child.label}</Link></li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="console-sidebar-bottom">
          <SessionControls session={session} />
          <p className="console-sidebar-foot">KKISI TB2 · Management Console{process.env.APP_VERSION && <span>Versi {process.env.APP_VERSION}</span>}</p>
        </div>
      </aside>
      <button type="button" className="console-overlay" aria-label="Tutup menu" tabIndex={-1} onClick={() => setOpen(false)} />
      <div className="console-main">
        <header className="console-header">
          <button ref={toggle} type="button" className="console-icon-button console-drawer-toggle" aria-label="Buka menu" aria-controls="console-nav" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={20} /></button>
          <nav aria-label="Breadcrumb" className="console-breadcrumb">
            <ol>
              <li><Link href="/console">KKISI TB2</Link></li>
              {currentGroup && currentGroup.section !== 'dashboard' && <li>{currentGroup.label}</li>}
              {currentParent && <li><Link href={currentParent.href}>{currentParent.label}</Link></li>}
              {current && current.id !== 'dashboard' && (deeper
                ? <><li><Link href={current.href}>{current.label}</Link></li><li aria-current="page">Detail</li></>
                : <li aria-current="page">{current.label}</li>)}
            </ol>
          </nav>
          <div className="console-user">
            <span aria-hidden="true">{viewer.userName.trim().slice(0, 1).toUpperCase() || 'U'}</span>
            <div><strong>{viewer.userName || 'Pengguna'}</strong><small>{viewer.branchName}</small></div>
          </div>
        </header>
        <main id="console-main" className="console-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
