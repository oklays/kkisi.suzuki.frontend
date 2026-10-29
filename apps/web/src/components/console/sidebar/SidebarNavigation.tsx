'use client';

import type { SidebarNode } from '@/features/console/sidebar-model';
import { SidebarNavNode } from './SidebarNavNode';
import { SidebarRailItem } from './SidebarRailItem';
import type { NavContext } from './types';

/** One navigation list: the full tree when the sidebar is expanded (or a drawer), icon-only rail items when it is collapsed. */
export function SidebarNavigation({ nodes, label, collapsed, ctx, className }: { nodes: readonly SidebarNode[]; label: string; collapsed: boolean; ctx: NavContext; className?: string }) {
  if (nodes.length === 0) return null;
  return (
    <nav aria-label={label} className={className}>
      <ul className="console-nav-list">
        {nodes.map((node) =>
          collapsed ? (
            <SidebarRailItem key={node.id} node={node} ctx={ctx} />
          ) : (
            <li key={node.id}>
              <SidebarNavNode node={node} depth={0} ctx={ctx} />
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
