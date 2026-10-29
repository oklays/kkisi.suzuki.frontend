'use client';

import { usePathname } from 'next/navigation';
import { useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { buildSidebarTree, trailTo } from '@/features/console/sidebar-model';
import { SidebarFooter } from './SidebarFooter';
import { SidebarHeader } from './SidebarHeader';
import { SidebarNavigation } from './SidebarNavigation';
import type { ConsoleNavGroup, ConsoleViewer, NavContext, SidebarTheme } from './types';

const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled])';

/**
 * The console sidebar: header, independently scrolling navigation body, pinned footer. Data arrives pre-authorised (the registry entries the user
 * may open); this component only presents them, it never decides access. Expanded, collapsed rail and mobile drawer share the same tree.
 */
export function AppSidebar({ groups, viewer, currentId, collapsed, theme, drawerOpen, onToggleCollapsed, onToggleTheme, onCloseDrawer, closeRef }: {
  groups: ConsoleNavGroup[];
  viewer: ConsoleViewer;
  currentId: string | null;
  collapsed: boolean;
  theme: SidebarTheme;
  drawerOpen: boolean;
  onToggleCollapsed: () => void;
  onToggleTheme: () => void;
  onCloseDrawer: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const tree = useMemo(() => buildSidebarTree(groups), [groups]);
  const trail = useMemo(() => new Set(trailTo([...tree.main, ...tree.footer], currentId)), [tree, currentId]);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    // An entry submenu stays as toggled only until the next navigation; a module parent the user collapsed stays collapsed unless the new page lives in it.
    setToggled((t) => Object.fromEntries(Object.entries(t).filter(([id]) => id.startsWith('section-') && !trail.has(id))));
  }
  const ctx: NavContext = { currentId, trail, toggled, onToggle: (id, open) => setToggled((t) => ({ ...t, [id]: open })) };

  // Keep Tab inside the open drawer (the page behind it is inert).
  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!drawerOpen || event.key !== 'Tab') return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <aside id="console-nav" className="console-sidebar" aria-label="Navigasi console" data-collapsed={collapsed} onKeyDown={trapFocus}>
      <SidebarHeader collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} onCloseDrawer={onCloseDrawer} closeRef={closeRef} />
      <SidebarNavigation nodes={tree.main} label="Menu utama" collapsed={collapsed} ctx={ctx} className="console-nav-body" />
      <SidebarFooter nodes={tree.footer} viewer={viewer} collapsed={collapsed} theme={theme} onToggleTheme={onToggleTheme} ctx={ctx} />
    </aside>
  );
}
