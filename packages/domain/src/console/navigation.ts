import type { Capability, CapabilitySet } from './capabilities.ts';

export const NAV_SECTIONS = ['dashboard', 'kosipa', 'toko', 'warehouse', 'reports', 'settings'] as const;
export type NavSection = (typeof NAV_SECTIONS)[number];

/** available: working route; planned: roadmap only, never rendered as a link (spec REQ-012). */
export type Readiness = 'available' | 'planned';

export type NavEntry = {
  id: string;
  section: NavSection;
  label: string;
  href: string;
  order: number;
  /** Visible when the user holds at least one of these. Empty = any authenticated console user. */
  anyOf: readonly Capability[];
  readiness: Readiness;
  /** Pathname prefix that marks the entry current (defaults to href). */
  matchPrefix?: string;
  /** Pathname prefix that must NOT mark it current (e.g. /sales vs /sales/returns). */
  excludePrefix?: string;
  /** Id of the entry this one is nested under in the sidebar. Presentation only: visibility is always decided per entry by `anyOf`. */
  parent?: string;
};

export type NavGroup<T extends NavEntry> = { section: NavSection; items: T[] };

/** Entries the user may open, grouped by section in fixed section order; empty sections are dropped. */
export function visibleNavigation<T extends NavEntry>(entries: readonly T[], capabilities: CapabilitySet): NavGroup<T>[] {
  const allowed = entries.filter((e) => e.readiness === 'available' && (e.anyOf.length === 0 || e.anyOf.some((cap) => capabilities.has(cap))));
  return NAV_SECTIONS
    .map((section) => ({ section, items: allowed.filter((e) => e.section === section).sort((a, b) => a.order - b.order) }))
    .filter((group) => group.items.length > 0);
}

/** The single entry that is current for a pathname: the longest matching prefix wins, exclusions respected. */
export function currentEntryId(entries: readonly NavEntry[], pathname: string): string | null {
  const within = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  let best: { id: string; length: number } | null = null;
  for (const e of entries) {
    const prefix = e.matchPrefix ?? e.href.split('?')[0];
    if (!within(prefix) || (e.excludePrefix && within(e.excludePrefix))) continue;
    if (!best || prefix.length > best.length) best = { id: e.id, length: prefix.length };
  }
  return best?.id ?? null;
}

export type NavNode<T extends NavEntry> = { entry: T; children: T[] };

/**
 * Nests the visible entries of one section under their parent. A child whose parent the user cannot see is promoted to the top level
 * (so an authorised destination is never hidden), and nesting is one level deep.
 */
export function nestNavigation<T extends NavEntry>(items: readonly T[]): NavNode<T>[] {
  const ids = new Set(items.map((i) => i.id));
  const isChild = (i: T) => i.parent !== undefined && i.parent !== i.id && ids.has(i.parent) && !items.find((p) => p.id === i.parent)?.parent;
  return items.filter((i) => !isChild(i)).map((entry) => ({ entry, children: items.filter((c) => isChild(c) && c.parent === entry.id) }));
}
