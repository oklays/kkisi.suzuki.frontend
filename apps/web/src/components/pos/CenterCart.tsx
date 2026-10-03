"use client";

import { useRef } from "react";
import { ShoppingBag, Trash2 } from "lucide-react";
import type { PosProduct, PreviewCartLine } from "@/features/pos/types";
import { CartItem, EmptyCartState } from "./TransactionPanel";

/** Shared tab action: available while browsing products as well as reviewing the cart. */
export function ClearCartButton({ disabled, onClear }: { disabled: boolean; onClear: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  function close() { dialog.current?.close(); button.current?.focus(); }
  return <>
    <button ref={button} className="pos-clear" disabled={disabled} onClick={() => dialog.current?.showModal()}><Trash2 size={14} />Hapus Semua</button>
    <dialog ref={dialog} className="pos-clear-dialog" aria-labelledby="pos-clear-title" onCancel={() => button.current?.focus()}>
      <h2 id="pos-clear-title"><Trash2 size={21} />Hapus Semua Item?</h2>
      <p>Seluruh item dalam keranjang akan dihapus.</p>
      <div><button autoFocus onClick={close}>Batal</button><button className="pos-confirm-clear" disabled={disabled} onClick={() => { if (!disabled) onClear(); close(); }}>Ya, Hapus Semua</button></div>
    </dialog>
  </>;
}

export function CenterCart({ cart, locked, onChange, onRemove }: { cart: PreviewCartLine[]; locked: boolean; onChange: (product: PosProduct, delta: 1 | -1) => void; onRemove: (id: string) => void }) {
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <section className="pos-center-cart" aria-label="Keranjang belanja">
    <header><h2><ShoppingBag size={19} />Keranjang <span>{count} item</span></h2><p>Periksa produk dan jumlah sebelum pembayaran.</p></header>
    <fieldset className="pos-cart-lock" disabled={locked}>
      <div className="pos-cart-items" aria-live="polite">{cart.length === 0 ? <EmptyCartState /> : <ul>{cart.map(line => <CartItem key={line.product.id} line={line} onChange={onChange} onRemove={onRemove} disabled={locked} />)}</ul>}</div>
    </fieldset>
  </section>;
}
