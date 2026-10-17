/** Post-login redirect target: only a same-site absolute path. Everything else becomes /pos (no open redirect). */
export function safeNextPath(value: string | null | undefined, fallback = '/pos'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (value.startsWith('/api/') || /^\/login(?:[/?#]|$)/.test(value)) return fallback;   // any /login form would land back on the login page (loop)
  return value;
}
