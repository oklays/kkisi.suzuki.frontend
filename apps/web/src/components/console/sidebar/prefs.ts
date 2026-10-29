import type { SidebarTheme } from './types';

export const SIDEBAR_COOKIE = 'console-sidebar';
export const SIDEBAR_THEME_COOKIE = 'console-sidebar-theme';
export type SidebarPrefs = { collapsed: boolean; theme: SidebarTheme };

/** Preferences live in cookies, not localStorage, so the server layout renders the saved state on the first paint (no hydration mismatch, no layout shift). */
export function parseSidebarPrefs(collapsed: string | undefined, theme: string | undefined): SidebarPrefs {
  return { collapsed: collapsed === 'collapsed', theme: theme === 'dark' ? 'dark' : 'light' };
}

/** UI-only, non-sensitive: scoped to /console, a year long, never read for any authorisation decision. */
export function writeSidebarCookie(name: typeof SIDEBAR_COOKIE | typeof SIDEBAR_THEME_COOKIE, value: string): void {
  document.cookie = `${name}=${value}; path=/console; max-age=31536000; samesite=lax`;
}
