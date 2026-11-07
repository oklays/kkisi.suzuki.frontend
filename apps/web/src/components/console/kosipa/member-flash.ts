'use client';

import { useEffect, useState } from 'react';

export type Flash = { kind: 'error' | 'ok'; text: string } | null;
const KEY = (scope: string) => `kosipa-member-flash:${scope}`;

/**
 * Message state that survives the re-keying of a form after a successful save (the server version changed, so the form remounts with fresh values).
 * `remember` stores a success text for the NEXT mount of the same scope in this tab only; it is read once and cleared. Storage can be unavailable
 * (private window, blocked site data): the message is then simply not shown, never an error.
 */
export function useFlash(scope: 'form' | 'status' | 'list'): [Flash, (f: Flash) => void, (text: string) => void] {
  const [message, setMessage] = useState<Flash>(null);
  useEffect(() => {
    try {
      const text = sessionStorage.getItem(KEY(scope));
      // Deferred: browser storage is an external system read after hydration, never during render (and never a synchronous setState in the effect).
      if (text) { sessionStorage.removeItem(KEY(scope)); queueMicrotask(() => setMessage({ kind: 'ok', text })); }
    } catch { /* storage unavailable */ }
  }, [scope]);
  const remember = (text: string) => { try { sessionStorage.setItem(KEY(scope), text); } catch { /* ignored */ } };
  return [message, setMessage, remember];
}

/** Store a success text for the next mount of the given scope (used by row actions whose outcome is announced once, above the list). */
export function rememberFlash(scope: 'form' | 'status' | 'list', text: string): void {
  try { sessionStorage.setItem(`kosipa-member-flash:${scope}`, text); } catch { /* storage unavailable */ }
}
