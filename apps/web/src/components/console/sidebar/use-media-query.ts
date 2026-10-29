'use client';

import { useSyncExternalStore } from 'react';

/** false in the server render and during hydration, then the live match; re-renders when the viewport crosses the query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
