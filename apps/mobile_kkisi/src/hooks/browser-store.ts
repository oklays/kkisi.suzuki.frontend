'use client';
import { useSyncExternalStore } from 'react';

// Small external stores for browser-only state (Web Storage, feature detection) read through useSyncExternalStore: the server
// snapshot is the safe default, so markup matches during hydration, and the browser value takes over without effect cascades.

const noopSubscribe = () => () => {};
/** true only in the browser after hydration. */
export const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false);
/** A browser-only fact that does not change while the page is open (e.g. API support). */
export const useBrowserFact = (read: () => boolean) => useSyncExternalStore(noopSubscribe, read, () => false);

export function useOnline(): boolean {
  return useSyncExternalStore((cb) => {
    window.addEventListener('online', cb); window.addEventListener('offline', cb);
    return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); };
  }, () => navigator.onLine, () => true);
}

/** A JSON value in localStorage/sessionStorage with listeners; snapshots are cached by raw string so they stay referentially stable. */
export function storageStore<T>(area: 'local' | 'session', key: string, parse: (raw: unknown) => T, fallback: T) {
  const listeners = new Set<() => void>();
  let lastRaw: string | null | undefined;
  let lastValue = fallback;
  const storage = () => { try { return area === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; } };
  const get = (): T => {
    let raw: string | null = null;
    try { raw = storage()?.getItem(key) ?? null; } catch { raw = null; }
    if (raw === lastRaw) return lastValue;
    lastRaw = raw;
    try { lastValue = raw === null ? fallback : parse(JSON.parse(raw)); } catch { lastValue = fallback; }
    return lastValue;
  };
  const set = (value: T | null) => {
    try { if (value === null) storage()?.removeItem(key); else storage()?.setItem(key, JSON.stringify(value)); } catch { /* blocked or full: keep in memory */ lastRaw = undefined; lastValue = value ?? fallback; }
    listeners.forEach((l) => l());
  };
  const subscribe = (cb: () => void) => {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => { if (e.key === key) cb(); };
    window.addEventListener('storage', onStorage);
    return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
  };
  return { get, set, subscribe, server: () => fallback };
}

export function useStore<T>(store: ReturnType<typeof storageStore<T>>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.server);
}
