'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { storageStore, useIsClient, useStore } from '@/hooks/browser-store';
import { Sheet } from '../overlay/Sheet';
import { Icon } from '../ui/Icon';

// Installation prompt & help. Supports the modern Web Install API (`navigator.install()`), Chromium `beforeinstallprompt`,
// and iOS/iPadOS Safari ("Bagikan -> Tambah ke Layar Utama"). Hidden when already installed, suppressed during modal dialogs
// or mid-flow checkout/PIN screens, and quiet for 7 days after explicit dismissal ("tidak always show").
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type NavigatorWithInstall = Navigator & { install?: () => Promise<void>; standalone?: boolean };
type WindowWithInstall = Window & { __kkisiDeferredInstallPrompt?: BeforeInstallPromptEvent | null };
type DocumentWithAriaNotify = Document & { ariaNotify?: (announcement: string) => void };

const DISMISS_KEY = 'kkisi:install-dismissed-at';
const SESSION_DISMISS_KEY = 'kkisi:install-session-dismissed';
const QUIET_MS = 7 * 24 * 60 * 60 * 1000;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notifyInstall = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  const win = window as WindowWithInstall;
  if (win.__kkisiDeferredInstallPrompt) deferred = win.__kkisiDeferredInstallPrompt;
  const capture = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    win.__kkisiDeferredInstallPrompt = deferred;
    notifyInstall();
  };
  const syncEarlyCapture = () => {
    if (win.__kkisiDeferredInstallPrompt && deferred !== win.__kkisiDeferredInstallPrompt) {
      deferred = win.__kkisiDeferredInstallPrompt;
      notifyInstall();
    }
  };
  window.addEventListener('beforeinstallprompt', capture);
  window.addEventListener('kkisi:installprompt', syncEarlyCapture);
  window.addEventListener('appinstalled', () => {
    deferred = null;
    win.__kkisiDeferredInstallPrompt = null;
    notifyInstall();
  });
  window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', notifyInstall);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as NavigatorWithInstall).standalone === true
  );
}

const isIos = () =>
  (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const supportsWebInstall = () =>
  typeof Navigator !== 'undefined' && typeof (Navigator.prototype as NavigatorWithInstall).install === 'function';

const subscribeInstall = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const dismissedStore = storageStore<number>('local', DISMISS_KEY, (v) => (typeof v === 'number' ? v : 0), 0);
const sessionDismissedStore = storageStore<boolean>('session', SESSION_DISMISS_KEY, (v) => v === true, false);

function subscribeDialogState(cb: () => void) {
  if (typeof document === 'undefined' || !document.body) return () => {};
  const obs = new MutationObserver(cb);
  obs.observe(document.body, { attributes: true, attributeFilter: ['open'], childList: true, subtree: true });
  return () => obs.disconnect();
}

function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    subscribeDialogState,
    () => typeof document !== 'undefined' && document.querySelector('dialog[open]') !== null,
    () => false,
  );
}

function useInstallState() {
  const mounted = useIsClient();
  useSyncExternalStore(subscribeInstall, () => deferred, () => null);
  if (!mounted || isStandalone()) return { kind: 'none' as const };
  if (supportsWebInstall()) return { kind: 'web-install' as const };
  if (deferred) return { kind: 'prompt' as const };
  if (isIos()) return { kind: 'ios' as const };
  return { kind: 'none' as const };
}

function isSuppressedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/pin' || pathname.startsWith('/belanja') || pathname.startsWith('/layanan/') || pathname.endsWith('/ajukan');
}

function hasBottomNav(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname !== '/masuk' && pathname !== '/pin' && !isSuppressedPath(pathname);
}

function IosSteps() {
  return (
    <ol className="ios-install-steps">
      <li>Buka aplikasi ini di <strong>Safari</strong>.</li>
      <li>Ketuk tombol <strong>Bagikan</strong> (kotak dengan panah ke atas).</li>
      <li>Pilih <strong>Tambah ke Layar Utama</strong>, lalu <strong>Tambah</strong>.</li>
    </ol>
  );
}

/** Dismissible bottom toast badge to install the PWA onto the member's device. */
export function InstallToast({ stacked = false, onAnnounce }: { stacked?: boolean; onAnnounce?: (message: string) => void }) {
  const pathname = usePathname();
  const state = useInstallState();
  const modalOpen = useAnyModalOpen();
  const dismissedAt = useStore(dismissedStore);
  const sessionDismissed = useStore(sessionDismissedStore);
  const [iosSheetOpen, setIosSheetOpen] = useState(false);
  const [hiddenNow, setHiddenNow] = useState(false);
  const [installing, setInstalling] = useState(false);
  const toastRef = useRef<HTMLDivElement>(null);
  const announcedRef = useRef(false);

  // Date.now() is read at render intentionally so the cooldown re-evaluates whenever dismissal state updates.
  // eslint-disable-next-line react-hooks/purity
  const withinQuietPeriod = dismissedAt > 0 && Date.now() - dismissedAt < QUIET_MS;
  const visible =
    state.kind !== 'none' &&
    !hiddenNow &&
    !sessionDismissed &&
    !withinQuietPeriod &&
    !isSuppressedPath(pathname) &&
    !modalOpen;

  useEffect(() => {
    const el = toastRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el || !visible) return;
    try { el.showPopover?.(); } catch { /* already open or unsupported */ }
    if (!announcedRef.current) {
      announcedRef.current = true;
      const doc = document as DocumentWithAriaNotify;
      const text = 'S-MART KKISI TB2. Instal ke perangkat Anda. Actions available';
      if (typeof doc.ariaNotify === 'function') doc.ariaNotify(text);
      else onAnnounce?.(text);
    }
  }, [visible, onAnnounce]);

  const restoreFocusIfInside = () => {
    if (typeof document === 'undefined') return;
    if (toastRef.current && toastRef.current.contains(document.activeElement)) {
      const target = document.querySelector<HTMLElement>('#main button, #main input, #main a, main');
      target?.focus?.();
    }
  };

  const dismiss = () => {
    restoreFocusIfInside();
    dismissedStore.set(Date.now());
    sessionDismissedStore.set(true);
    setHiddenNow(true);
  };

  const handleInstall = async () => {
    if (installing) return;
    if (state.kind === 'ios') {
      setIosSheetOpen(true);
      return;
    }
    setInstalling(true);
    try {
      if (state.kind === 'web-install') {
        await (navigator as NavigatorWithInstall).install?.();
        setHiddenNow(true);
      } else if (state.kind === 'prompt' && deferred) {
        // Clear the single-use event reference before awaiting the user's choice.
        const promptEvent = deferred;
        deferred = null;
        (window as WindowWithInstall).__kkisiDeferredInstallPrompt = null;
        notifyInstall();
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
        if (choice.outcome === 'dismissed') dismiss();
        else setHiddenNow(true);
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        dismiss();
      }
    } finally {
      setInstalling(false);
    }
  };

  const aboveNav = hasBottomNav(pathname);

  return (
    <>
      {visible ? (
        <div
          ref={toastRef}
          className={`install-toast${aboveNav ? ' above-nav' : ''}${stacked ? ' stacked' : ''}`}
          {...({ popover: 'manual' } as Record<string, string>)}
        >
          <Image
            className="install-toast-badge"
            src="/icons/smart-icon-192.png"
            width={40}
            height={40}
            alt=""
            unoptimized
          />
          <div className="install-toast-copy">
            <strong>S-MART KKISI TB2</strong>
            <span>Instal ke perangkat Anda</span>
          </div>
          <button
            type="button"
            className="install-toast-cta"
            aria-disabled={installing || undefined}
            onClick={handleInstall}
          >
            Install
          </button>
          <button
            type="button"
            className="install-toast-close"
            aria-label="Tutup ajakan instal aplikasi"
            onClick={dismiss}
          >
            <Icon name="close" />
          </button>
        </div>
      ) : null}
      <Sheet
        open={iosSheetOpen}
        onClose={() => {
          setIosSheetOpen(false);
          sessionDismissedStore.set(true);
        }}
        title="Pasang di iPhone/iPad"
        subtitle="Tambahkan ke Layar Utama"
      >
        <IosSteps />
      </Sheet>
    </>
  );
}

/** Menu row for Lainnya: always available, explains the state when installation is not offered. */
export function InstallMenuRow() {
  const state = useInstallState();
  const [open, setOpen] = useState(false);
  const run = async () => {
    if (state.kind === 'web-install') {
      try { await (navigator as NavigatorWithInstall).install?.(); } catch { /* canceled */ }
      return;
    }
    if (state.kind === 'prompt' && deferred) {
      const promptEvent = deferred;
      deferred = null;
      (window as WindowWithInstall).__kkisiDeferredInstallPrompt = null;
      notifyInstall();
      await promptEvent.prompt();
      return;
    }
    setOpen(true);
  };
  return (
    <>
      <button type="button" className="menu-row" aria-haspopup={state.kind === 'prompt' || state.kind === 'web-install' ? undefined : 'dialog'} onClick={run}>
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
