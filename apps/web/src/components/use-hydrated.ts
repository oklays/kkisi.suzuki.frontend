'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * false in the server render and until React has hydrated this component, true afterwards. Forms that submit through JavaScript must keep their
 * submit control disabled while this is false: a click (or Enter) on the server-rendered HTML before hydration would otherwise perform a NATIVE
 * form submission — a GET to the current URL carrying every named field (the login form would put the password into the URL). Checkpoint 12.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
