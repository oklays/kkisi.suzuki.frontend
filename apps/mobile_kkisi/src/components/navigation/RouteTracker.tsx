'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Counts client-side screen changes within this document so Back knows whether a previous in-app screen exists. A hard load
// (deep link, refresh, cold start of the installed app) starts again at 1. On every screen change focus moves to the page title
// so screen readers announce the new screen.
let depth = 0;
export const inAppDepth = () => depth;

export function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    depth += 1;
    if (depth > 1) document.getElementById('page-title')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
