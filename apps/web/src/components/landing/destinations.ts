/**
 * Landing page destinations. The two experiences stay separate: management users enter through the existing Console
 * login (unchanged authentication, proxy and session handling); members get their own entry point.
 */
export const CONSOLE_HREF = "/login";

/**
 * Member PWA entry. It does not exist yet, so the card opens the "Segera Hadir" page. When the PWA ships, point this at
 * its route (or absolute URL) and set MEMBER_APP_AVAILABLE to true; nothing else on the landing page needs to change.
 */
export const MEMBER_APP_HREF = "/anggota";
export const MEMBER_APP_AVAILABLE = false;
