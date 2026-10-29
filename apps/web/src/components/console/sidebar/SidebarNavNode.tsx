'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { defaultExpanded, linkPrefetch, type SidebarNode } from '@/features/console/sidebar-model';
import { SidebarNavIcon } from './SidebarNavIcon';
import type { NavContext } from './types';

/**
 * One row at any depth: icon + label (+ chevron). A module parent is a button that expands; an entry is a link, and an entry with children
 * (e.g. Laporan) is a link plus its own expand button. `flat` is the flyout: everything open, no toggles.
 */
export function SidebarNavNode({ node, depth, ctx, flat = false }: { node: SidebarNode; depth: number; ctx: NavContext; flat?: boolean }) {
  const hasChildren = node.children.length > 0;
  const expanded = flat || (ctx.toggled[node.id] ?? defaultExpanded(node, ctx.trail));
  const inTrail = ctx.trail.has(node.id);
  const submenu = `nav-sub-${node.id}`;
  const toggle = () => ctx.onToggle(node.id, !expanded);
  return (
    <>
      <div className="console-nav-row" data-depth={depth}>
        {node.href === undefined ? (
          <button type="button" className="console-nav-link console-nav-section" data-trail={inTrail} aria-expanded={expanded} aria-controls={submenu} onClick={toggle}>
            <SidebarNavIcon name={node.icon} />
            <span className="console-nav-text console-nav-label" id={`nav-${node.id}`}>{node.label}</span>
            <ChevronDown size={14} className="console-nav-chevron" aria-hidden="true" />
          </button>
        ) : (
          <>
            <Link
              href={node.href}
              prefetch={linkPrefetch(node.href)}
              className="console-nav-link"
              data-trail={inTrail}
              aria-current={ctx.currentId === node.id ? 'page' : undefined}
            >
              <SidebarNavIcon name={node.icon} />
              <span className="console-nav-text">{node.label}</span>
            </Link>
            {hasChildren && !flat && (
              <button type="button" className="console-nav-toggle" aria-expanded={expanded} aria-controls={submenu} aria-label={`Submenu ${node.label}`} onClick={toggle}>
                <ChevronDown size={14} className="console-nav-chevron" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
      {hasChildren && (
        <div className="console-nav-collapse" data-open={expanded}>
          <ul id={submenu} className="console-nav-sub" data-depth={depth + 1} aria-label={`Submenu ${node.label}`}>
            {node.children.map((child) => (
              <li key={child.id}>
                <SidebarNavNode node={child} depth={depth + 1} ctx={ctx} flat={flat} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
