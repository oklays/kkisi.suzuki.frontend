'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Store,
  X,
} from 'lucide-react';
import { currentEntryId, nestNavigation } from '@koperasi/domain/console/navigation';
import type { ConsoleNavEntry } from '@/features/console/navigation';
import { CONSOLE_ICONS } from './icons';
import type { PosSession } from '@/features/pos/types';
import { SessionControls } from '@/components/pos/SessionControls';
import { landingFont } from '@/components/landing/fonts';

export type ConsoleViewer = Pick<
  PosSession,
  'userId' | 'userName' | 'branchName' | 'companyId' | 'canSwitchBranch' | 'companies' | 'csrfToken'
>;
export type ConsoleNavGroup = { section: string; label: string; items: ConsoleNavEntry[] };

/** Client chrome for /console: sidebar (drawer at <=767px), breadcrumb and session controls. Data arrives pre-authorised. */
export function ConsoleFrame({
  groups,
  viewer,
  children,
}: {
  groups: ConsoleNavGroup[];
  viewer: ConsoleViewer;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '/console';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activePopover, setActivePopover] = useState<'notifications' | 'messages' | 'help' | 'user' | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const entries = groups.flatMap((g) => g.items);
  const current = entries.find((e) => e.id === currentEntryId(entries, pathname)) ?? null;
  const currentGroup = current ? groups.find((g) => g.items.includes(current)) : undefined;
  // Deeper than the registered page (e.g. a member or loan detail): the registered page becomes a link and the last crumb is the detail itself.
  const deeper = current !== null && pathname.replace(/\/$/, '') !== current.href.split('?')[0];
  const currentParent = current?.parent ? entries.find((e) => e.id === current.parent) ?? null : null;
  // A submenu is open while it holds the current page; a manual toggle only lasts until the next navigation.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  // Close the drawer and popovers on navigation.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
    setToggled({});
    setSearchOpen(false);
    setActivePopover(null);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    const onGlobalKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (event.key === 'Escape') {
        setSearchOpen(false);
        setActivePopover(null);
      }
    };
    document.addEventListener('keydown', onGlobalKey);
    return () => document.removeEventListener('keydown', onGlobalKey);
  }, []);

  useEffect(() => {
    const w = window as Window & { $RV?: (q: unknown[]) => void; $RB?: unknown[] };
    if (typeof w.$RV === 'function' && Array.isArray(w.$RB) && w.$RB.length > 0) {
      w.$RV(w.$RB);
    }
  });

  // SessionControls only reads the session/branch fields; the POS-specific ones are inert here.
  const session: PosSession = {
    ...viewer,
    checkoutAvailable: false,
    register: { open: null, multiple: false },
  };

  const isDashboardRoot = !current || current.id === 'dashboard';
  const settingsEntry = entries.find((e) => e.section === 'settings');
  const filteredEntries = searchQuery.trim()
    ? entries.filter(
        (e) =>
          e.label.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
          (e.description && e.description.toLowerCase().includes(searchQuery.trim().toLowerCase())),
      )
    : entries.slice(0, 6);

  return (
    <div className={`console-shell ${landingFont.variable}`} data-drawer={open ? 'open' : 'closed'}>
      <a className="console-skip" href="#console-main">
        Langsung ke konten
      </a>
      <aside id="console-nav" className="console-sidebar" aria-label="Navigasi console">
        <div className="console-sidebar-top">
          <Link href="/console" className="console-brand">
            <Image
              className="console-brand-image"
              src="/illustrations/new-landscape-logo.jpeg"
              width={1024}
              height={355}
              unoptimized
              alt="SMART KKISI Tambun 2"
            />
          </Link>
          <button
            type="button"
            className="console-icon-button console-drawer-close"
            aria-label="Tutup menu"
            onClick={() => {
              setOpen(false);
              toggle.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="console-branch">
          <span className="console-branch-icon" aria-hidden="true">
            <Store size={17} />
            <i className="console-branch-dot" />
          </span>
          <div className="console-branch-info">
            <small>Cabang Aktif</small>
            <strong>{viewer.branchName}</strong>
          </div>
          <ChevronDown size={15} className="console-branch-chevron" aria-hidden="true" />
        </div>

        <nav aria-label="Menu utama">
          {groups.map((group) => (
            <div key={group.section} className="console-nav-group">
              {group.section !== 'dashboard' && (
                <p className="console-nav-label" id={`nav-${group.section}`}>
                  {group.label}
                </p>
              )}
              <ul aria-labelledby={group.section !== 'dashboard' ? `nav-${group.section}` : undefined}>
                {nestNavigation(group.items).map(({ entry: item, children }) => {
                  const Icon = CONSOLE_ICONS[item.icon];
                  const submenu = `nav-sub-${item.id}`;
                  const expanded =
                    toggled[item.id] ??
                    (current?.id === item.id || children.some((c) => c.id === current?.id));
                  const isCurrent = current?.id === item.id;
                  return (
                    <li key={item.id}>
                      <div className="console-nav-row">
                        <Link
                          href={item.href}
                          prefetch={item.href.startsWith('/console/kosipa') ? false : undefined}
                          aria-current={isCurrent ? 'page' : undefined}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span className="console-nav-item-text">{item.label}</span>
                          {isCurrent && children.length === 0 && (
                            <ChevronRight
                              size={14}
                              className="console-nav-active-chevron"
                              aria-hidden="true"
                            />
                          )}
                        </Link>
                        {children.length > 0 && (
                          <button
                            type="button"
                            className="console-nav-toggle"
                            aria-expanded={expanded}
                            aria-controls={submenu}
                            aria-label={`Submenu ${item.label}`}
                            onClick={() => setToggled((t) => ({ ...t, [item.id]: !expanded }))}
                          >
                            <ChevronDown size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {children.length > 0 && (
                        <ul
                          id={submenu}
                          className="console-nav-sub"
                          hidden={!expanded}
                          aria-label={`Submenu ${item.label}`}
                        >
                          {children.map((child) => (
                            <li key={child.id}>
                              <Link
                                href={child.href}
                                prefetch={child.href.startsWith('/console/kosipa') ? false : undefined}
                                aria-current={current?.id === child.id ? 'page' : undefined}
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
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
          <p className="console-sidebar-foot">
            KKISI TB2 · Management Console
            {process.env.APP_VERSION && <span>Versi {process.env.APP_VERSION}</span>}
          </p>
        </div>
      </aside>

      <button
        type="button"
        className="console-overlay"
        aria-label="Tutup menu"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />

      <div className="console-main">
        <header className="console-header">
          <div className="console-header-left">
            <button
              ref={toggle}
              type="button"
              className="console-icon-button console-drawer-toggle"
              aria-label="Buka menu"
              aria-controls="console-nav"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="console-header-brand-block">
              <div className="console-header-title">KKISI TB2</div>
              <nav aria-label="Breadcrumb" className="console-breadcrumb">
                {isDashboardRoot ? (
                  <>
                    <span className="console-header-subtitle">Konsol Terpadu Koperasi Suzuki</span>
                    <ol className="console-visually-hidden">
                      <li>
                        <Link href="/console">KKISI TB2</Link>
                      </li>
                    </ol>
                  </>
                ) : (
                  <ol>
                    <li>
                      <Link href="/console">KKISI TB2</Link>
                    </li>
                    {currentGroup && currentGroup.section !== 'dashboard' && (
                      <li>{currentGroup.label}</li>
                    )}
                    {currentParent && (
                      <li>
                        <Link
                          href={currentParent.href}
                          prefetch={currentParent.href.startsWith('/console/kosipa') ? false : undefined}
                        >
                          {currentParent.label}
                        </Link>
                      </li>
                    )}
                    {current &&
                      current.id !== 'dashboard' &&
                      (deeper ? (
                        <>
                          <li>
                            <Link
                              href={current.href}
                              prefetch={current.href.startsWith('/console/kosipa') ? false : undefined}
                            >
                              {current.label}
                            </Link>
                          </li>
                          <li aria-current="page">Detail</li>
                        </>
                      ) : (
                        <li aria-current="page">{current.label}</li>
                      ))}
                  </ol>
                )}
              </nav>
            </div>
          </div>

          <div className="console-header-center">
            <div className="console-global-search">
              <Search size={16} className="console-global-search-icon" aria-hidden="true" />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                aria-expanded={searchOpen}
                aria-controls="console-quick-nav-list"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Cari anggota, transaksi, produk, atau menu..."
                aria-label="Cari anggota, transaksi, produk, atau menu"
                className="console-global-search-input"
              />
              <kbd className="console-global-search-kbd" aria-hidden="true">
                Ctrl + K
              </kbd>
              {searchOpen && (
                <div id="console-quick-nav-list" className="console-search-dropdown" role="listbox" aria-label="Pintasan menu">
                  <div className="console-search-dropdown-head">
                    Navigasi Cepat ({filteredEntries.length} menu diizinkan)
                  </div>
                  {filteredEntries.length > 0 ? (
                    <ul className="console-search-dropdown-list">
                      {filteredEntries.map((entry) => {
                        const EntryIcon = CONSOLE_ICONS[entry.icon];
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              className="console-search-dropdown-item"
                              onMouseDown={() => {
                                setSearchOpen(false);
                                setSearchQuery('');
                                router.push(entry.href);
                              }}
                            >
                              <EntryIcon size={15} aria-hidden="true" />
                              <span>{entry.label}</span>
                              <small>{entry.href}</small>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="console-search-dropdown-empty">
                      Tidak ada menu yang cocok dengan pencarian Anda.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="console-header-right">
            <div className="console-header-tools">
              <button
                type="button"
                className="console-tool-btn"
                aria-label="Notifikasi sistem"
                onClick={() =>
                  setActivePopover((prev) => (prev === 'notifications' ? null : 'notifications'))
                }
              >
                <Bell size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="console-tool-btn"
                aria-label="Pesan dan informasi"
                onClick={() => setActivePopover((prev) => (prev === 'messages' ? null : 'messages'))}
              >
                <MessageSquare size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="console-tool-btn"
                aria-label="Bantuan konsol"
                onClick={() => setActivePopover((prev) => (prev === 'help' ? null : 'help'))}
              >
                <CircleHelp size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="console-tool-btn"
                aria-label="Pengaturan konsol"
                onClick={() => {
                  if (settingsEntry) {
                    router.push(settingsEntry.href);
                  } else {
                    setActivePopover((prev) => (prev === 'user' ? null : 'user'));
                  }
                }}
              >
                <Settings size={18} aria-hidden="true" />
              </button>
            </div>

            <span className="console-header-divider" aria-hidden="true" />

            <div className="console-user-wrap">
              <div
                className="console-user"
                role="button"
                tabIndex={0}
                aria-label={`Profil pengguna ${viewer.userName || 'Pengguna'}`}
                onClick={() => setActivePopover((prev) => (prev === 'user' ? null : 'user'))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActivePopover((prev) => (prev === 'user' ? null : 'user'));
                  }
                }}
              >
                <span aria-hidden="true">
                  {viewer.userName.trim().slice(0, 1).toUpperCase() || 'U'}
                </span>
                <div>
                  <strong>{viewer.userName || 'Pengguna'}</strong>
                  <small>{viewer.branchName}</small>
                </div>
                <ChevronDown size={14} className="console-user-chevron" aria-hidden="true" />
              </div>

              {activePopover && (
                <div className="console-header-popover" role="dialog" aria-label="Informasi sesi">
                  <div className="console-header-popover-head">
                    <strong>
                      {activePopover === 'notifications'
                        ? 'Notifikasi Sistem'
                        : activePopover === 'messages'
                          ? 'Pesan Operasional'
                          : activePopover === 'help'
                            ? 'Bantuan Konsol Terpadu'
                            : viewer.userName || 'Pengguna'}
                    </strong>
                    <button
                      type="button"
                      className="console-popover-close"
                      aria-label="Tutup panel"
                      onClick={() => setActivePopover(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {activePopover === 'notifications' && (
                    <p className="console-header-popover-body">
                      Tidak ada notifikasi belum dibaca untuk cabang <strong>{viewer.branchName}</strong>.
                    </p>
                  )}
                  {activePopover === 'messages' && (
                    <p className="console-header-popover-body">
                      Lihat panel <strong>Pengumuman &amp; Informasi</strong> di dashboard untuk pembaruan operasional terbaru.
                    </p>
                  )}
                  {activePopover === 'help' && (
                    <p className="console-header-popover-body">
                      Gunakan pintasan <strong>Ctrl + K</strong> untuk berpindah antar modul Toko, KOSIPA, dan Warehouse sesuai izin akun Anda.
                    </p>
                  )}
                  {activePopover === 'user' && (
                    <div className="console-header-popover-body">
                      <p>
                        Cabang aktif: <strong>{viewer.branchName}</strong>
                      </p>
                      <p>Gunakan panel sesi di bagian bawah sidebar untuk berpindah cabang atau keluar.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="console-main" className="console-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
