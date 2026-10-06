'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Sidebar link whose current state follows the path, for areas (Sales) whose shared layout cannot know the page. */
export function ShellNavLink({ href, activePrefix, excludePrefix, children }: { href: string; activePrefix: string | null; excludePrefix?: string; children: React.ReactNode }) {
  const path = usePathname() ?? '';
  const within = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const current = activePrefix !== null && within(activePrefix) && !(excludePrefix && within(excludePrefix));
  return <Link href={href} aria-current={current ? 'page' : undefined}>{children}</Link>;
}
