'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode, type FormEvent } from 'react';
import { usePathname } from 'next/navigation';
import { useHydrated } from '@/components/use-hydrated';
import { searchKosipa } from '@/app/console/kosipa/search-actions';
import { KosipaSkeleton } from './KosipaUI';

/** Search text stays in POST bodies and ephemeral UI, including private cursor pagination. No browser storage. */
export function PrivateWorkspace({ children }: { children: ReactNode }) {
  const path = usePathname();
  return <PrivateContent key={path} path={path} initial={children} />;
}

function PrivateContent({ path, initial }: { path: string; initial: ReactNode }) {
  const [result, setResult] = useState<{ source: ReactNode; node: ReactNode } | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result?.source === initial && !pending) root.current?.querySelector<HTMLElement>('h1, [role="alert"]')?.focus();
  }, [result, pending, initial]);
  // One observer for this page; the financial tables remain server-rendered, without a client boundary per table.
  useEffect(() => {
    const workspace = root.current;
    if (!workspace) return;
    const updateHints = () => workspace.querySelectorAll<HTMLElement>('.kosipa-table-frame').forEach((frame, index) => {
      const region = frame.querySelector<HTMLElement>('.kosipa-table-scroll');
      const hint = frame.querySelector<HTMLElement>('.kosipa-table-hint');
      if (!region || !hint) return;
      const overflow = region.scrollWidth > region.clientWidth + 1;
      hint.hidden = !overflow;
      hint.id = `kosipa-scroll-hint-${index}`;
      if (overflow) region.setAttribute('aria-describedby', hint.id);
      else region.removeAttribute('aria-describedby');
    });
    const observer = new ResizeObserver(updateHints);
    const observeTables = () => {
      observer.disconnect();
      workspace.querySelectorAll('.kosipa-table-scroll').forEach((region) => {
        observer.observe(region);
        if (region.firstElementChild) observer.observe(region.firstElementChild);
      });
      updateHints();
    };
    // Server children can stream in after this layout hydrates; watch additions as well as resizing.
    const additions = new MutationObserver(observeTables);
    additions.observe(workspace, { childList: true, subtree: true });
    observeTables();
    return () => { observer.disconnect(); additions.disconnect(); };
  }, [initial, result, pending]);

  function submit(event: FormEvent<HTMLDivElement>) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-kosipa-private')) return;
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(form, submitter);
    const destination = new URL(form.action).pathname;
    startTransition(async () => {
      try { setResult({ source: initial, node: await searchKosipa(destination || path, data) }); }
      catch { setResult({ source: initial, node: <section className="console-panel kosipa-action-error" role="alert" tabIndex={-1}><h1>Pencarian belum berhasil</h1><p>Layanan tidak dapat dihubungi. Muat ulang untuk memeriksa sesi dan mencoba kembali.</p><a href={path}>Muat ulang halaman</a></section> }); }
    });
  }
  return <div ref={root} onSubmitCapture={submit} aria-busy={pending}>
    <fieldset className="kosipa-workspace-fields" disabled={!hydrated || pending}>
      {pending ? <KosipaSkeleton /> : result && result.source === initial ? result.node : initial}
    </fieldset>
  </div>;
}

export function PrivatePagination({ path, params, children }: { path: string; params: Record<string, string>; children: ReactNode }) {
  return <form action={path} method="post" data-kosipa-private className="kosipa-pagination">
    {Object.entries(params).map(([name, value]) => value ? <input type="hidden" key={name} name={name} value={value} /> : null)}
    <button type="submit" className="kosipa-button-secondary">{children}</button>
  </form>;
}
