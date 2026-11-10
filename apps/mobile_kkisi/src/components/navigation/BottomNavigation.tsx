'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../ui/Icon';
import { NAV_ITEMS, activeNav } from '../../lib/navigation/routes';

export function BottomNavigation() {
  const pathname = usePathname();
  const active = activeNav(pathname);
  return (
    <nav className="bottom-nav" aria-label="Navigasi utama">
      {NAV_ITEMS.map((item) => {
        const current = item.href === active;
        // On its own tab root the link is still a link (re-selecting scrolls to top, like the mockup).
        return (
          <Link key={item.href} href={item.href} className="nav-item" aria-current={pathname === item.href ? 'page' : undefined}
            data-active={current || undefined} onClick={() => { if (pathname === item.href) window.scrollTo({ top: 0 }); }}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
