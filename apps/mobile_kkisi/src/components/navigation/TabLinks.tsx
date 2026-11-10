import Link from 'next/link';

export type TabItem = { key: string; label: string; href: string };

/**
 * Mockup segmented tabs as real links (`?tab=`): the selected tab survives refresh, deep links and the back button. `replace`
 * keeps switching tabs out of the history stack, like the mockup's in-page tabs.
 */
export function TabLinks({ items, current, label, inContent = false }: { items: TabItem[]; current: string; label: string; inContent?: boolean }) {
  return (
    <nav className={`tabs${inContent ? ' in-content' : ''}`} aria-label={label} style={{ ['--tab-count' as string]: items.length }}>
      {items.map((t) => (
        <Link key={t.key} href={t.href} replace scroll={false} className="tab" aria-current={t.key === current ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
