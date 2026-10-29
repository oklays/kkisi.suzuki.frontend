'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { RefObject } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

/** Brand, the desktop collapse control and the drawer close control (CSS shows exactly one of the two controls per viewport). */
export function SidebarHeader({ collapsed, onToggleCollapsed, onCloseDrawer, closeRef }: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onCloseDrawer: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="console-sidebar-top">
      <Link href="/console" className="console-brand" aria-label="KKISI TB2 — Dashboard">
        {collapsed ? (
          <Image className="console-brand-mark" src="/illustrations/kopkar-emblem.png" width={1024} height={1024} unoptimized alt="" />
        ) : (
          <Image className="console-brand-image" src="/illustrations/new-landscape-logo.jpeg" width={1024} height={355} unoptimized alt="SMART KKISI Tambun 2" />
        )}
      </Link>
      <button
        type="button"
        className="console-sidebar-collapse"
        aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
        aria-controls="console-nav"
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>
      <button ref={closeRef} type="button" className="console-icon-button console-drawer-close" aria-label="Tutup menu" onClick={onCloseDrawer}>
        <X size={18} />
      </button>
    </div>
  );
}
