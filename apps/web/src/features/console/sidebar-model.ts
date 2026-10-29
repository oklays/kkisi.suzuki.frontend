import { nestNavigation } from '@koperasi/domain/console/navigation';
import type { NavSection } from '@koperasi/domain/console/navigation';
import { SECTION_ICONS, type ConsoleIcon, type ConsoleNavEntry } from './navigation.ts';

export type SidebarGroupInput = { section: NavSection; label: string; items: ConsoleNavEntry[] };

/** One sidebar row. `href` is absent on module parents (a section is a heading you expand, not a route). Every node carries an icon key. */
export type SidebarNode = {
  id: string;
  label: string;
  icon: ConsoleIcon;
  href?: string;
  /** Module parents start expanded unless this is set; an entry with children starts expanded only while it holds the current page. */
  collapsedByDefault?: boolean;
  children: SidebarNode[];
};

export type SidebarTree = { main: SidebarNode[]; footer: SidebarNode[] };

/** Sections rendered above the user card (next to Help) instead of in the scrolling body. */
const FOOTER_SECTIONS: readonly NavSection[] = ['settings'];

export const sectionNodeId = (section: NavSection) => `section-${section}`;

const entryNode = (entry: ConsoleNavEntry, children: ConsoleNavEntry[] = []): SidebarNode =>
  ({ id: entry.id, label: entry.label, icon: entry.icon, href: entry.href, children: children.map((c) => entryNode(c)) });

/**
 * Sidebar hierarchy from the already authorised, section-grouped registry entries: Dashboard stays a top level link, every other section
 * becomes a module parent whose entries (and nested report entries) are its children. Visibility is decided upstream; empty sections never arrive.
 */
export function buildSidebarTree(groups: readonly SidebarGroupInput[]): SidebarTree {
  const tree: SidebarTree = { main: [], footer: [] };
  for (const group of groups) {
    const nodes = nestNavigation(group.items).map(({ entry, children }) => entryNode(entry, children));
    if (group.section === 'dashboard') { tree.main.push(...nodes); continue; }
    if (nodes.length === 0) continue;
    const parent: SidebarNode = { id: sectionNodeId(group.section), label: group.label, icon: SECTION_ICONS[group.section], children: nodes,
      ...(FOOTER_SECTIONS.includes(group.section) ? { collapsedByDefault: true } : {}) };
    (FOOTER_SECTIONS.includes(group.section) ? tree.footer : tree.main).push(parent);
  }
  return tree;
}

/** Ids from the top level down to the entry (inclusive); empty when the entry is not in the nodes. Drives auto-expansion and the parent highlight. */
export function trailTo(nodes: readonly SidebarNode[], entryId: string | null): string[] {
  if (entryId === null) return [];
  for (const node of nodes) {
    if (node.id === entryId) return [node.id];
    const inner = trailTo(node.children, entryId);
    if (inner.length > 0) return [node.id, ...inner];
  }
  return [];
}

/** Every node, parents first. */
export function walkNodes(nodes: readonly SidebarNode[]): SidebarNode[] {
  return nodes.flatMap((n) => [n, ...walkNodes(n.children)]);
}

/** Nodes whose icon key has no drawable icon in `registry`; the sidebar must never render a row without one. */
export function nodesWithoutIcon(nodes: readonly SidebarNode[], registry: Readonly<Record<string, unknown>>): string[] {
  return walkNodes(nodes).filter((n) => !(n.icon in registry) || !registry[n.icon]).map((n) => n.id);
}

/** Initial open state of a parent before the user toggles it. */
export function defaultExpanded(node: SidebarNode, trail: ReadonlySet<string>): boolean {
  if (trail.has(node.id)) return true;
  return node.href === undefined && !node.collapsedByDefault;
}

/** Prefetching a KOSIPA page fires its data reads, so those links only load on navigation. */
export const linkPrefetch = (href: string): false | undefined => (href.startsWith('/console/kosipa') ? false : undefined);
