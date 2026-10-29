'use client';

import type { SidebarNode } from '@/features/console/sidebar-model';
import { SidebarHelp } from './SidebarHelp';
import { SidebarNavigation } from './SidebarNavigation';
import { SidebarUserMenu } from './SidebarUserMenu';
import type { ConsoleViewer, NavContext, SidebarTheme } from './types';

/** Pinned bottom region: supported settings destinations, Help and the user card. Never scrolls away with the navigation body. */
export function SidebarFooter({ nodes, viewer, collapsed, theme, onToggleTheme, ctx }: {
  nodes: readonly SidebarNode[];
  viewer: ConsoleViewer;
  collapsed: boolean;
  theme: SidebarTheme;
  onToggleTheme: () => void;
  ctx: NavContext;
}) {
  return (
    <div className="console-sidebar-footer">
      <SidebarNavigation nodes={nodes} label="Pengaturan" collapsed={collapsed} ctx={ctx} className="console-footer-nav" />
      <SidebarHelp collapsed={collapsed} />
      <SidebarUserMenu viewer={viewer} collapsed={collapsed} theme={theme} onToggleTheme={onToggleTheme} />
    </div>
  );
}
