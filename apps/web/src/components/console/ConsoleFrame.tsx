'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Menu,
  MessageSquare,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { currentEntryId } from '@koperasi/domain/console/navigation';
import { CONSOLE_ICONS } from './icons';
import { landingFont } from '@/components/landing/fonts';
import { AppSidebar } from './sidebar/AppSidebar';
import { SIDEBAR_COOKIE, SIDEBAR_THEME_COOKIE, writeSidebarCookie, type SidebarPrefs } from './sidebar/prefs';
import { useMediaQuery } from './sidebar/use-media-query';
import type { ConsoleNavGroup, ConsoleViewer } from './sidebar/types';

export type { ConsoleNavGroup, ConsoleViewer };

/** Client chrome for /console: sidebar (drawer at <=767px), breadcrumb and session controls. Data arrives pre-authorised. */
export function ConsoleFrame({
  groups,
  viewer,
  prefs,
  children,
}: {
  groups: ConsoleNavGroup[];
  viewer: ConsoleViewer;
  prefs: SidebarPrefs;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '/console';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activePopover, setActivePopover] = useState<'notifications' | 'messages' | 'help' | 'user' | null>(null);
  const [collapsedPref, setCollapsedPref] = useState(prefs.collapsed);
  const [theme, setTheme] = useState(prefs.theme);
  const toggle = useRef<HTMLButtonElement>(null);
  const drawerClose = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const entries = groups.flatMap((g) => g.items);
  const current = entries.find((e) => e.id === currentEntryId(entries, pathname)) ?? null;
  const currentGroup = current ? groups.find((g) => g.items.includes(current)) : undefined;
  // Deeper than the registered page (e.g. a member or loan detail): the registered page becomes a link and the last crumb is the detail itself.
  const deeper = current !== null && pathname.replace(/\/$/, '') !== current.href.split('?')[0];
  const currentParent = current?.parent ? entries.find((e) => e.id === current.parent) ?? null : null;
  // The rail is the user's saved choice on desktop and always on tablets; phones get the drawer, which is always the full sidebar.
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const collapsed = !isMobile && (isTablet || collapsedPref);
  const drawerOpen = open && isMobile;
  // Focus goes back to the toggle only after the drawer has closed: the page behind it is inert until then and cannot take focus.
  const restoreFocus = useRef(false);
  const closeDrawer = () => {
    restoreFocus.current = true;
    setOpen(false);
  };

  // Close the drawer and popovers on navigation.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
    setSearchOpen(false);
    setActivePopover(null);
  }

  // Open drawer: Escape closes it, the page behind it does not scroll, focus starts on the close control (the page itself is inert).
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        restoreFocus.current = true;
        setOpen(false);
      }
    };
    const returnTo = toggle.current;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerClose.current?.focus();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = scroll;
      document.removeEventListener('keydown', onKey);
      if (restoreFocus.current) {
        restoreFocus.current = false;
        returnTo?.focus();
      }
    };
  }, [drawerOpen]);

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
    <div className={`console-shell ${landingFont.variable}`} data-drawer={drawerOpen ? 'open' : 'closed'} data-sidebar-theme={theme}>
      <a className="console-skip" href="#console-main">
        Langsung ke konten
      </a>
      <AppSidebar
        groups={groups}
        viewer={viewer}
        currentId={current?.id ?? null}
        collapsed={collapsed}
        theme={theme}
        drawerOpen={drawerOpen}
        onToggleCollapsed={() => {
          const next = !collapsedPref;
          setCollapsedPref(next);
          writeSidebarCookie(SIDEBAR_COOKIE, next ? 'collapsed' : 'expanded');
        }}
        onToggleTheme={() => {
          const next = theme === 'dark' ? 'light' : 'dark';
          setTheme(next);
          writeSidebarCookie(SIDEBAR_THEME_COOKIE, next);
        }}
        onCloseDrawer={closeDrawer}
        closeRef={drawerClose}
      />

      <button
        type="button"
        className="console-overlay"
        aria-label="Tutup menu"
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />

      <div className="console-main" inert={drawerOpen}>
        <header className="console-header">
          <div className="console-header-left">
            <button
              ref={toggle}
              type="button"
              className="console-icon-button console-drawer-toggle"
              aria-label="Buka menu"
              aria-controls="console-nav"
              aria-expanded={drawerOpen}
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
