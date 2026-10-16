'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, Store, X } from 'lucide-react';
import { currentEntryId } from '@koperasi/domain/console/navigation';
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

  // Close the drawer on navigation.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) { setSeenPath(pathname); setOpen(false); }

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
                {group.items.map((item) => {
                  const Icon = CONSOLE_ICONS[item.icon];
                  return <li key={item.id}><Link href={item.href} aria-current={current?.id === item.id ? 'page' : undefined}><Icon size={18} aria-hidden="true" />{item.label}</Link></li>;
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
              {current && current.id !== 'dashboard' && <li aria-current="page">{current.label}</li>}
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
