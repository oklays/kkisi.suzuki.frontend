'use client';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

// Bottom sheet on the native <dialog> (focus trap, Esc and top-layer for free), as in the mockup. Closing returns focus to the
// opener. Content may be server-rendered and passed in as children.
const SheetCtx = createContext<{ close: () => void } | null>(null);

export function Sheet({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
      {open ? (
        <SheetCtx.Provider value={{ close: onClose }}>
          <div className="sheet-handle" />
          <div className="sheet-header">
            <div><h2 id={titleId}>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
            <button type="button" className="sheet-close" aria-label={`Tutup ${title}`} onClick={onClose}>×</button>
          </div>
          <div className="sheet-body">{children}</div>
        </SheetCtx.Provider>
      ) : null}
    </dialog>
  );
}

/** Button that opens a sheet with the given content. */
export function SheetTrigger({ className, label, title, subtitle, children, content, haspopup = true }: {
  className?: string; label?: string; title: string; subtitle?: string; children: ReactNode; content: ReactNode; haspopup?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={className} aria-label={label} aria-haspopup={haspopup ? 'dialog' : undefined} onClick={() => setOpen(true)}>{children}</button>
      <Sheet open={open} onClose={close} title={title} subtitle={subtitle}>{content}</Sheet>
    </>
  );
}

export function SheetClose({ className = 'primary', children }: { className?: string; children: ReactNode }) {
  const ctx = useContext(SheetCtx);
  return <button type="button" className={className} onClick={() => ctx?.close()}>{children}</button>;
}
