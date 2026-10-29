'use client';

import { ChevronsUpDown, Moon, Sun } from 'lucide-react';
import type { PosSession } from '@/features/pos/types';
import { SessionControls } from '@/components/pos/SessionControls';
import { SidebarFloating } from './SidebarFloating';
import { useAnchoredPanel } from './use-anchored-panel';
import type { ConsoleViewer, SidebarTheme } from './types';

export function userInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || 'U';
}

/** The signed-in user's card. Its menu holds what already existed in the sidebar session panel (branch switch, logout) plus the sidebar theme. */
export function SidebarUserMenu({ viewer, collapsed, theme, onToggleTheme }: {
  viewer: ConsoleViewer;
  collapsed: boolean;
  theme: SidebarTheme;
  onToggleTheme: () => void;
}) {
  const { wrap, trigger, pos, toggle } = useAnchoredPanel(collapsed);
  // SessionControls only reads the session/branch fields; the POS-specific ones are inert here.
  const session: PosSession = { ...viewer, checkoutAvailable: false, register: { open: null, multiple: false } };
  const name = viewer.userName || 'Pengguna';
  return (
    <div ref={wrap} className="console-footer-item">
      <button ref={trigger} type="button" className="console-user-card" aria-haspopup="dialog" aria-expanded={pos !== null} aria-label={`Menu akun ${name}`} onClick={toggle}>
        <span className="console-avatar" aria-hidden="true">{userInitial(viewer.userName)}</span>
        <span className="console-user-card-text">
          <strong>{name}</strong>
          <small>{viewer.branchName}</small>
        </span>
        <ChevronsUpDown size={14} className="console-user-card-chevron" aria-hidden="true" />
      </button>
      {pos && (
        <SidebarFloating pos={pos} className="console-menu" role="dialog" label="Menu akun">
          <div className="console-menu-head">
            <span className="console-avatar" aria-hidden="true">{userInitial(viewer.userName)}</span>
            <span className="console-user-card-text">
              <strong>{name}</strong>
              <small>{viewer.branchName}</small>
            </span>
          </div>
          <button type="button" className="console-menu-item" aria-pressed={theme === 'dark'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            <span>{theme === 'dark' ? 'Sidebar mode terang' : 'Sidebar mode gelap'}</span>
          </button>
          <SessionControls session={session} />
          {process.env.APP_VERSION && <p className="console-menu-foot">KKISI TB2 · Versi {process.env.APP_VERSION}</p>}
        </SidebarFloating>
      )}
    </div>
  );
}
