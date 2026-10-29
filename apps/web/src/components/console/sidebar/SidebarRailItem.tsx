'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { linkPrefetch, type SidebarNode } from '@/features/console/sidebar-model';
import { SidebarFloating, floatingPosition, type FloatingPos } from './SidebarFloating';
import { SidebarNavIcon } from './SidebarNavIcon';
import { SidebarNavNode } from './SidebarNavNode';
import { useDismiss } from './use-dismiss';
import type { NavContext } from './types';

/**
 * A top level row of the collapsed rail. A plain link shows its label as a tooltip; a module parent opens a flyout listing every child with its
 * own icon. Opens on hover, focus or click, closes on leave, Escape, a press outside, or choosing a destination.
 */
export function SidebarRailItem({ node, ctx }: { node: SidebarNode; ctx: NavContext }) {
  const ref = useRef<HTMLLIElement>(null);
  const [pos, setPos] = useState<FloatingPos | null>(null);
  const close = useCallback(() => setPos(null), []);
  useDismiss(pos !== null, ref, close);
  const show = (anchor: HTMLElement) => setPos(floatingPosition(anchor, 'side'));
  const isGroup = node.href === undefined;
  const inTrail = ctx.trail.has(node.id);
  return (
    <li
      ref={ref}
      className="console-rail-item"
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={close}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close(); }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('a')) close(); }}
    >
      <div className="console-nav-row" data-depth={0}>
        {isGroup ? (
          <button type="button" className="console-nav-link console-nav-section" data-trail={inTrail} aria-haspopup="true" aria-expanded={pos !== null} onClick={(e) => show(e.currentTarget.closest('li') as HTMLElement)}>
            <SidebarNavIcon name={node.icon} />
            <span className="console-nav-text console-nav-label">{node.label}</span>
          </button>
        ) : (
          <Link href={node.href!} prefetch={linkPrefetch(node.href!)} className="console-nav-link" data-trail={inTrail} aria-current={ctx.currentId === node.id ? 'page' : undefined}>
            <SidebarNavIcon name={node.icon} />
            <span className="console-nav-text">{node.label}</span>
          </Link>
        )}
      </div>
      {pos && !isGroup && (
        <SidebarFloating pos={pos} className="console-tooltip" role="tooltip">
          {node.label}
        </SidebarFloating>
      )}
      {pos && isGroup && (
        <SidebarFloating pos={pos} className="console-flyout" role="group" label={node.label}>
          <p className="console-flyout-title">{node.label}</p>
          <ul className="console-flyout-list">
            {node.children.map((child) => (
              <li key={child.id}>
                <SidebarNavNode node={child} depth={0} ctx={ctx} flat />
              </li>
            ))}
          </ul>
        </SidebarFloating>
      )}
    </li>
  );
}
