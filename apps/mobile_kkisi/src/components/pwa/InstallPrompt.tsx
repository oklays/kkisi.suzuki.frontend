'use client';
import { useState, useSyncExternalStore } from 'react';
import { storageStore, useIsClient, useStore } from '@/hooks/browser-store';
import { Sheet } from '../overlay/Sheet';
import { Icon } from '../ui/Icon';

// Installation help. Chromium (Android) exposes `beforeinstallprompt`; iOS Safari never does, so iPhone/iPad members get the
// "Bagikan -> Tambah ke Layar Utama" steps instead. Hidden when already running installed, and after a dismissal for 30 days.
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
const DISMISS_KEY = 'kkisi:install-dismissed-at';
const QUIET_MS = 30 * 24 * 60 * 60 * 1000;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; listeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}

export function isStandalone(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}
const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const subscribeInstall = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const dismissedStore = storageStore<number>('local', DISMISS_KEY, (v) => (typeof v === 'number' ? v : 0), 0);

function useInstallState() {
  const mounted = useIsClient();
  useSyncExternalStore(subscribeInstall, () => deferred, () => null);
  if (!mounted || isStandalone()) return { kind: 'none' as const };
  if (deferred) return { kind: 'prompt' as const };
  if (isIos()) return { kind: 'ios' as const };
  return { kind: 'none' as const };
}

function IosSteps() {
  return (
    <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.8, color: 'var(--muted)' }}>
      <li>Buka aplikasi ini di <strong>Safari</strong>.</li>
      <li>Ketuk tombol <strong>Bagikan</strong> (kotak dengan panah ke atas).</li>
      <li>Pilih <strong>Tambah ke Layar Utama</strong>, lalu <strong>Tambah</strong>.</li>
    </ol>
  );
}

/** Dismissible card on Beranda. */
export function InstallCard() {
  const state = useInstallState();
  const dismissedAt = useStore(dismissedStore);
  const [open, setOpen] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);
  // Date.now() is read at render on purpose: the card re-evaluates whenever the dismissal timestamp changes.
  // eslint-disable-next-line react-hooks/purity
  if (state.kind === 'none' || hiddenNow || Date.now() - dismissedAt < QUIET_MS) return null;
  const dismiss = () => { dismissedStore.set(Date.now()); setHiddenNow(true); };
  const install = async () => {
    if (state.kind === 'ios') { setOpen(true); return; }
    const e = deferred; if (!e) return;
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    deferred = null;
    if (choice.outcome === 'dismissed') dismiss(); else setHiddenNow(true);
  };
  return (
    <section className="store" aria-label="Pasang aplikasi" style={{ marginTop: 16 }}>
      <div><strong>Pasang S-MART TB2</strong><p>Buka lebih cepat dari layar utama ponselmu.</p></div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" className="text-button" onClick={dismiss}>Nanti</button>
        <button type="button" className="primary" style={{ width: 'auto', marginTop: 0, paddingInline: 14, minHeight: 44 }} onClick={install}><Icon name="install" />Pasang</button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pasang di iPhone/iPad" subtitle="Tambahkan ke Layar Utama"><IosSteps /></Sheet>
    </section>
  );
}

/** Menu row for Lainnya: always available, explains the state when installation is not offered. */
export function InstallMenuRow() {
  const state = useInstallState();
  const [open, setOpen] = useState(false);
  const run = async () => {
    if (state.kind === 'prompt' && deferred) { await deferred.prompt(); deferred = null; return; }
    setOpen(true);
  };
  return (
    <>
      <button type="button" className="menu-row" aria-haspopup={state.kind === 'prompt' ? undefined : 'dialog'} onClick={run}>
        <span className="menu-icon"><Icon name="install" /></span><span className="menu-label">Pasang aplikasi</span><span className="menu-arrow"><Icon name="chevronRight" /></span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Pasang aplikasi" subtitle="S-MART KKISI TB2">
        {isStandalone() ? <p className="detail-copy">Aplikasi sudah terpasang dan sedang berjalan dari layar utama.</p>
          : state.kind === 'ios' ? <IosSteps />
            : <p className="detail-copy">Browser ini belum menawarkan pemasangan. Di Android, buka dengan Chrome lalu pilih menu ⋮ → <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</p>}
      </Sheet>
    </>
  );
}
