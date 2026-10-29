'use client';

import type { CSSProperties, ReactNode } from 'react';

export type FloatingPlacement = 'side' | 'above';
export type FloatingPos = { style: CSSProperties; placement: FloatingPlacement };

/**
 * Where a floating panel goes for an anchor. position:fixed escapes the sidebar's own scroll clipping, so flyouts and menus are never cut off
 * by the navigation body or hidden behind the page. 'side' sits beside the sidebar (rail), 'above' sits over the anchor (expanded sidebar, drawer).
 * Panels anchored in the lower half grow upwards so they stay on screen.
 */
export function floatingPosition(anchor: HTMLElement, placement: FloatingPlacement): FloatingPos {
  const rect = anchor.getBoundingClientRect();
  const vh = window.innerHeight;
  if (placement === 'above') return { placement, style: { left: rect.left, width: rect.width, bottom: vh - rect.top + 8, maxHeight: rect.top - 16 } };
  // The panel starts at the anchor and carries a transparent lead-in up to the sidebar edge, so the pointer never crosses a dead gap.
  const edge = anchor.closest('.console-sidebar')?.getBoundingClientRect().right ?? rect.right;
  const lead = Math.max(0, edge - rect.right) + 6;
  const base = { left: rect.right, paddingLeft: lead };
  return rect.top > vh / 2
    ? { placement, style: { ...base, bottom: Math.max(8, vh - rect.bottom), maxHeight: rect.bottom - 8 } }
    : { placement, style: { ...base, top: Math.max(8, rect.top), maxHeight: vh - Math.max(8, rect.top) - 8 } };
}

export function SidebarFloating({ pos, className = '', role, label, children }: { pos: FloatingPos; className?: string; role?: string; label?: string; children: ReactNode }) {
  return (
    <div className={`console-floating ${className}`} data-placement={pos.placement} style={pos.style} role={role} aria-label={label}>
      <div className="console-floating-panel">{children}</div>
    </div>
  );
}
