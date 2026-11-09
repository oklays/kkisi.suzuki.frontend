'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Sheet } from '@/components/overlay/Sheet';
import { InstallMenuRow } from '@/components/pwa/InstallPrompt';
import { postJson, commonMessage } from '@/lib/api/client';
import { clearStoredCart } from '@/providers/CartProvider';

export type MenuSheet = { key: string; label: string; icon: IconName; tone?: 'gold' | 'slate'; title: string; subtitle: string; body: ReactNode };

function Row({ item, onOpen }: { item: MenuSheet; onOpen: () => void }) {
  return (
    <button type="button" className="menu-row" aria-haspopup="dialog" onClick={onOpen}>
      <span className={`menu-icon ${item.tone ?? ''}`}><Icon name={item.icon} /></span><span className="menu-label">{item.label}</span><span className="menu-arrow"><Icon name="chevronRight" /></span>
    </button>
  );
}

/** Lainnya menus. Sheet bodies are rendered on the server and passed in; `initial` opens one directly (e.g. /lainnya?buka=qr). */
export function AccountMenu({ sections, initial }: { sections: { title: string; items: MenuSheet[] }[]; initial: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(initial);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = sections.flatMap((s) => s.items);
  const current = all.find((i) => i.key === open);

  async function logout() {
    setBusy(true); setError(null);
    const r = await postJson('/api/auth/logout', {});
    setBusy(false);
    if (!r.ok && r.status !== 401) { setError(commonMessage(r.code)); return; }
    clearStoredCart();
    router.replace('/masuk?reason=logged-out');
    router.refresh();
  }

  return (
    <>
      {sections.map((s, i) => (
        <section key={s.title} className="menu-section" aria-label={s.title}>
          <h2>{s.title}</h2>
          <div className="menu-list">
            {s.items.map((item) => <Row key={item.key} item={item} onOpen={() => setOpen(item.key)} />)}
            {i === sections.length - 1 ? <InstallMenuRow /> : null}
          </div>
        </section>
      ))}
      <button type="button" className="logout-row" aria-haspopup="dialog" onClick={() => setConfirm(true)}><Icon name="logout" />Keluar</button>
      <Sheet open={!!current} onClose={() => setOpen(null)} title={current?.title ?? ''} subtitle={current?.subtitle}>
        {current?.body}
        <button type="button" className="primary" onClick={() => setOpen(null)}>Kembali</button>
      </Sheet>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Keluar" subtitle="Akhiri sesi di perangkat ini">
        <p className="detail-copy">Kamu perlu memasukkan password dan PIN lagi untuk masuk kembali.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="button-row">
          <button type="button" className="secondary" onClick={() => setConfirm(false)}>Batal</button>
          <button type="button" className="primary" disabled={busy} onClick={logout}>{busy ? 'Keluar…' : 'Keluar'}</button>
        </div>
      </Sheet>
    </>
  );
}
