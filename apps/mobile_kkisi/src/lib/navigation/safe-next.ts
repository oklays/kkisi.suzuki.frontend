/** Same-site path only; anything else falls back to /beranda (no open redirect, no loop back into the auth pages). */
export function safeNextPath(value: string | null | undefined): string {
  const fallback = '/beranda';
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  if (/^\/(api|masuk|pin|_next)(?:[/?#]|$)/.test(value)) return fallback;
  return value;
}
