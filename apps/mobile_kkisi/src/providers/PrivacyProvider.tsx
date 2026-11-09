'use client';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Icon } from '../components/ui/Icon';
import { storageStore, useStore } from '../hooks/browser-store';

// "Sembunyikan saldo": one switch for every amount on screen (mockup privacy eye). The choice is a display preference only, kept
// in localStorage; no amount is ever stored client-side.
const hiddenStore = storageStore<boolean>('local', 'kkisi:hide-amounts', (v) => v === true, false);
const Ctx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const hidden = useStore(hiddenStore);
  const toggle = useCallback(() => hiddenStore.set(!hiddenStore.get()), []);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePrivacy = () => useContext(Ctx);

/** An amount (or any figure) that the privacy switch masks. */
export function Sensitive({ children }: { children: string }) {
  const { hidden } = usePrivacy();
  return <>{hidden ? '••••••' : children}</>;
}

export function PrivacyToggle({ what = 'saldo' }: { what?: string }) {
  const { hidden, toggle } = usePrivacy();
  return (
    <button type="button" className="privacy" aria-pressed={hidden} aria-label={hidden ? `Tampilkan ${what}` : `Sembunyikan ${what}`} onClick={toggle}>
      <Icon name={hidden ? 'eyeOff' : 'eye'} />
    </button>
  );
}
