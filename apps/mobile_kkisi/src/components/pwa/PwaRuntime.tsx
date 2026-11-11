'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { InstallToast } from './InstallPrompt';

let updateRequested = false;

/**
 * Registers the service worker, announces a waiting update (the member chooses when to reload, so a half-filled form is never
 * lost), provides the shared notification region for install/update toasts, and shows a connection banner when offline.
 */
export function PwaRuntime() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');

  const handleAnnounce = useCallback((msg: string) => {
    setLiveMessage(msg);
  }, []);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let registration: ServiceWorkerRegistration | undefined;
    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaiting(installing);
        });
      });
    };
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((reg) => { registration = reg; watch(reg); }).catch(() => { /* PWA features off; the app still works online */ });
    // Reload only after the member pressed "Muat ulang". The first install also fires controllerchange (clients.claim), and
    // reloading then would wipe whatever the member is typing.
    let reloading = false;
    const onController = () => { if (updateRequested && !reloading) { reloading = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    // Look for a new version when the app comes back to the foreground and hourly while open.
    const check = () => { if (document.visibilityState === 'visible') registration?.update().catch(() => {}); };
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, 60 * 60 * 1000);
    return () => { navigator.serviceWorker.removeEventListener('controllerchange', onController); document.removeEventListener('visibilitychange', check); window.clearInterval(timer); };
  }, []);

  return (
    <>
      {offline ? (
        <div className="connection-banner" role="status">
          <Icon name="offline" />
          <span>Kamu sedang offline. Data anggota memerlukan koneksi; angka di layar bisa tidak terbaru.</span>
        </div>
      ) : null}
      <div className="toast-region" role="region" aria-label="Notifikasi aplikasi">
        {liveMessage ? <p className="sr-only">Pengumuman aplikasi</p> : null}
        <div className="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</div>
        {waiting ? (
          <div className="toast" role="status">
            <p>Versi baru aplikasi tersedia.</p>
            <button type="button" onClick={() => { updateRequested = true; waiting.postMessage({ type: 'SKIP_WAITING' }); }}>Muat ulang</button>
            <button type="button" className="toast-dismiss" aria-label="Nanti saja" onClick={() => setWaiting(null)}>×</button>
          </div>
        ) : null}
        <InstallToast stacked={waiting !== null} onAnnounce={handleAnnounce} />
      </div>
    </>
  );
}
