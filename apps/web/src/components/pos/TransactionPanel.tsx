"use client";

import { useRef, useState } from "react";
import { ArrowLeftRight, Banknote, CreditCard, FileText, LoaderCircle, Minus, Percent, Plus, QrCode, Search, ShoppingBag, Trash2, TriangleAlert, UserRound, Wallet, X } from "lucide-react";
import type { PosMember, PosProduct, PreviewCartLine, PreviewPayment } from "@/application/pos/contracts";
import { formatRupiah, netPriceSen, previewSubtotal } from "./preview";
import { ProductIllustration } from "./ProductCatalog";

export function MemberSearch({ members }: { members: readonly PosMember[] }) {
  const [query, setQuery] = useState("");
  const [member, setMember] = useState<PosMember | null>(null);
  const [notFound, setNotFound] = useState(false);
  function lookup() {
    const identifier = query.trim();
    if (!identifier) return;
    const found = members.find((candidate) => [candidate.nik, candidate.idCard, candidate.qrCode].includes(identifier)) ?? null;
    setMember(found); setNotFound(found === null);
  }
  return (
    <section className="pos-member-section" aria-label="Pencarian anggota contoh">
      <label htmlFor="pos-member">Member <span>· Pratinjau</span></label>
      <form className="pos-member-search" onSubmit={(event) => { event.preventDefault(); lookup(); }}>
        <div><Search size={15} aria-hidden="true" /><input id="pos-member" value={query} onChange={(event) => { setQuery(event.target.value); setMember(null); setNotFound(false); }} placeholder="Scan NIK / ID card / QR anggota" autoComplete="off" /></div>
        <button type="submit" disabled={!query.trim()}><UserRound size={15} />Pilih</button>
      </form>
      <p className="pos-member-hint">Data contoh: DEMO-12345. Limit anggota belum terhubung.</p>
      {member && <div className="pos-member-result" role="status"><div><strong>{member.name} · {member.nik}</strong><small>{member.department} · {member.status}</small></div><button className="pos-icon-button" aria-label="Lepas anggota" onClick={() => { setMember(null); setQuery(""); }}><X size={16} /></button></div>}
      {notFound && <div className="pos-inline-error" role="status"><TriangleAlert size={15} />Member tidak ditemukan dalam data contoh. Periksa NIK / ID card / QR.</div>}
    </section>
  );
}

export function QuantityControl({ line, onChange }: { line: PreviewCartLine; onChange: (product: PosProduct, delta: 1 | -1) => void }) {
  return <div className="pos-quantity"><button aria-label={`Kurangi ${line.product.name}`} onClick={() => onChange(line.product, -1)}><Minus size={14} /></button><span aria-label="Jumlah">{line.quantity}</span><button disabled={line.quantity >= line.product.stock} aria-label={`Tambah jumlah ${line.product.name}`} onClick={() => onChange(line.product, 1)}><Plus size={14} /></button></div>;
}

export function CartItem({ line, onChange, onRemove }: { line: PreviewCartLine; onChange: (product: PosProduct, delta: 1 | -1) => void; onRemove: (id: string) => void }) {
  const { product, quantity } = line;
  return (
    <li className="pos-cart-item">
      <div className="pos-cart-line"><div className="pos-cart-image"><ProductIllustration product={product} /></div><div className="pos-cart-name"><strong>{product.name}</strong><small>{formatRupiah(netPriceSen(product))} / pcs</small></div><button className="pos-icon-button pos-remove" aria-label={`Hapus ${product.name}`} onClick={() => onRemove(product.id)}><Trash2 size={16} /></button></div>
      <div className="pos-cart-line pos-cart-adjust"><QuantityControl line={line} onChange={onChange} /><strong>{formatRupiah(netPriceSen(product) * quantity)}</strong></div>
      {quantity >= product.stock && <p className="pos-stock-warning"><TriangleAlert size={13} />Stok tidak mencukupi untuk menambah jumlah.</p>}
    </li>
  );
}

export function EmptyCartState() {
  return <div className="pos-empty-cart"><ShoppingBag size={35} /><strong>Keranjang masih kosong</strong><p>Scan barcode atau pilih produk untuk memulai pratinjau transaksi.</p></div>;
}

export function PromotionSection() {
  return <div className="pos-promotion"><button disabled><span><Percent size={15} />Diskon / Promo</span><span>Belum tersedia</span></button></div>;
}

export function PriceSummary({ cart }: { cart: PreviewCartLine[] }) {
  const subtotal = previewSubtotal(cart);
  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <div className="pos-price-summary"><div><span>Subtotal ({quantity} item)</span><strong>{formatRupiah(subtotal)}</strong></div><div><span>Pajak / penyesuaian</span><span>Belum dihitung</span></div><div className="pos-total"><span>Total Pembayaran<small>Pratinjau sebelum pajak</small></span><strong>{formatRupiah(subtotal)}</strong></div></div>;
}

const payments = [
  { value: "Cash", label: "Cash", Icon: Banknote, available: true },
  { value: "QRIS", label: "QRIS", Icon: QrCode, available: false },
  { value: "Card", label: "Debit / Credit", Icon: CreditCard, available: false },
  { value: "Wallet", label: "Wallet / Point", Icon: Wallet, available: false },
  { value: "Payroll", label: "Payroll", Icon: FileText, available: false },
  { value: "Combination", label: "Kombinasi", Icon: ArrowLeftRight, available: false },
  { value: "Kredit", label: "Kredit Anggota", Icon: UserRound, available: true },
] as const;

export function PaymentMethodSelector({ selected, onSelect }: { selected: PreviewPayment; onSelect: (value: PreviewPayment) => void }) {
  return <fieldset className="pos-payment"><legend>Metode Pembayaran <span>· Pratinjau</span></legend><div>{payments.map(({ value, label, Icon, available }) => <button type="button" key={value} aria-pressed={selected === value} disabled={!available} className={selected === value ? "is-selected" : ""} onClick={() => { if (value === "Cash" || value === "Kredit") onSelect(value); }}><Icon size={18} /><span>{label}</span>{!available && <small>Belum tersedia</small>}</button>)}</div><p>{selected === "Kredit" ? "Kredit anggota memerlukan validasi anggota dan limit sebelum digunakan." : "Pilihan contoh. Pembayaran belum dapat diproses."}</p></fieldset>;
}

export function CheckoutButton({ processing = false }: { processing?: boolean }) {
  return <><button className="pos-checkout" disabled aria-busy={processing}>{processing ? <LoaderCircle className="pos-spinner" size={18} /> : <ShoppingBag size={18} />}<span>{processing ? "Memproses pembayaran…" : "Proses Pembayaran"}</span></button><p className="pos-checkout-note">Checkout belum tersedia. Transaksi dilakukan melalui aplikasi kasir yang aktif.</p></>;
}

export function TransactionPanel({ cart, members, onChange, onRemove, onClear }: { cart: PreviewCartLine[]; members: readonly PosMember[]; onChange: (product: PosProduct, delta: 1 | -1) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [payment, setPayment] = useState<PreviewPayment>("Cash");
  const dialog = useRef<HTMLDialogElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  function closeDialog() { dialog.current?.close(); clearButton.current?.focus(); }
  return (
    <aside className="pos-transaction" aria-label="Keranjang transaksi">
      <header><h2><ShoppingBag size={18} />Keranjang Transaksi <span>{count} item</span></h2><button ref={clearButton} className="pos-clear" disabled={cart.length === 0} onClick={() => dialog.current?.showModal()}><Trash2 size={14} />Hapus Semua</button></header>
      <div className="pos-transaction-scroll">
        <MemberSearch members={members} />
        <div className="pos-cart-items" aria-live="polite">{cart.length === 0 ? <EmptyCartState /> : <ul>{cart.map((line) => <CartItem key={line.product.id} line={line} onChange={onChange} onRemove={onRemove} />)}</ul>}</div>
        <PromotionSection />
      </div>
      <div className="pos-transaction-bottom"><PriceSummary cart={cart} /><PaymentMethodSelector selected={payment} onSelect={setPayment} /><CheckoutButton /></div>
      <dialog ref={dialog} className="pos-clear-dialog" aria-labelledby="pos-clear-title" onCancel={() => clearButton.current?.focus()}>
        <h2 id="pos-clear-title"><Trash2 size={21} />Hapus Semua Item?</h2><p>Seluruh item dalam keranjang pratinjau akan dihapus.</p><div><button autoFocus onClick={closeDialog}>Batal</button><button className="pos-confirm-clear" onClick={() => { onClear(); closeDialog(); }}>Ya, Hapus Semua</button></div>
      </dialog>
    </aside>
  );
}
