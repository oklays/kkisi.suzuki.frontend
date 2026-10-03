"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, LoaderCircle, Minus, Percent, Plus, Search, ShoppingBag, Trash2, TriangleAlert, UserRound, X } from "lucide-react";
import type { PosMember, PosProduct, PosSession, CheckoutResult, PreviewCartLine, PreviewPayment } from "@/features/pos/types";
import { formatRupiah, netPriceSen, previewSubtotal } from "./preview";
import { ProductIllustration } from "./ProductCatalog";
import { checkoutBlockingReasons } from "@/features/pos/checkout-state";
import { MemberKindPicker } from "./MemberKindPicker";

const errors: Record<string, string> = {
  MEMBER_NOT_FOUND: "Anggota tidak ditemukan. Periksa NIK atau ID card.", MEMBER_AMBIGUOUS: "Identitas anggota ganda. Hubungi pengelola.",
  MEMBER_INACTIVE: "Anggota tidak aktif.", MEMBER_EXPIRED: "Masa kontrak anggota sudah berakhir.", MEMBER_REQUIRED: "Pilih anggota aktif untuk pembayaran Kredit.",
  CREDIT_LIMIT: "Sisa limit anggota tidak mencukupi.", INSUFFICIENT_STOCK: "Stok berubah atau tidak mencukupi. Periksa keranjang.",
  STOCK_OPNAME: "Produk sedang stock opname.", PPOB_UNSUPPORTED: "Produk PPOB belum dapat diproses melalui POS ini.", ITEM_UNAVAILABLE: "Produk tidak tersedia di cabang ini.",
  INSUFFICIENT_PAYMENT: "Uang bayar kurang dari total yang dihitung server.", REGISTER_CLOSED: "Buka sesi kasir sebelum membayar.", REGISTER_STALE: "Tutup sesi kasir hari sebelumnya terlebih dahulu.",
  REGISTER_AMBIGUOUS: "Ada lebih dari satu sesi kasir terbuka. Hubungi pengelola.", WRITE_NOT_CONFIGURED: "Pembayaran belum diaktifkan untuk lingkungan ini.",
  QR_NOT_CONFIGURED: "QR terenkripsi belum dikonfigurasi. Gunakan NIK atau ID card.", INVALID_QR: "QR anggota tidak valid.", PAYMENT_PRECISION: "Total Kredit mengandung pecahan rupiah yang belum didukung pencatatan pembayaran.",
  IDEMPOTENCY_CONFLICT: "Kunci pembayaran telah digunakan untuk transaksi berbeda.", CSRF: "Muat ulang halaman untuk memperbarui sesi pembayaran.", FORBIDDEN: "Akses POS ditolak.",
};
const errorText = (code: string) => errors[code] ?? "Permintaan belum dapat diproses. Coba lagi.";
const rupiahInput = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function MemberSearch({ member, onMember, disabled }: { member: PosMember | null; onMember: (value: PosMember | null) => void; disabled: boolean }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("nik");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => { if (disabled) sequence.current++; }, [disabled]);
  async function lookup() {
    if (!query.trim() || disabled) return;
    const requestId = ++sequence.current;
    setBusy(true); setMessage(""); onMember(null);
    try {
      const params = new URLSearchParams({ identifier: query.trim(), kind });
      const response = await fetch(`/api/pos/members?${params}`, { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/login"); return; }
      const data = await response.json();
      if (requestId !== sequence.current) return;
      if (!response.ok) { setMessage(errorText(data.error)); return; }
      onMember(data.member);
    } catch { if (requestId === sequence.current) setMessage("Anggota belum dapat diperiksa. Coba lagi."); }
    finally { setBusy(false); }
  }
  function changeQuery(value: string) { sequence.current++; setQuery(value); onMember(null); setMessage(""); setBusy(false); }
  return (
    <section className="pos-member-section" aria-label="Pencarian anggota">
      <label htmlFor="pos-member">Anggota</label>
      <form className="pos-member-search" onSubmit={(event) => { event.preventDefault(); void lookup(); }}>
        <div><Search size={15} aria-hidden="true" /><input id="pos-member" disabled={disabled} value={query} onChange={(event) => changeQuery(event.target.value)} placeholder={kind === "id" ? "Masukkan ID anggota" : kind === "card" ? "Scan ID card anggota" : kind === "qr" ? "Scan QR anggota" : "Masukkan NIK (termasuk nol di depan)"} autoComplete="off" /></div>
        <button type="submit" disabled={disabled || busy || !query.trim()}><UserRound size={15} />{busy ? "Mencari…" : "Pilih"}</button>
      </form>
      <div className="pos-member-hint"><span>Cari dengan</span><MemberKindPicker value={kind} disabled={disabled || busy} onChange={value => { setKind(value); changeQuery(""); }} /></div>
      {member && <div className="pos-member-result" role="status"><div><strong>{member.name} · {member.nik}</strong><small>Sisa limit {formatRupiah(member.remainingSen)} · Limit {formatRupiah(member.limitSen)}</small></div><button disabled={disabled} className="pos-icon-button" aria-label="Lepas anggota" onClick={() => changeQuery("")}><X size={16} /></button></div>}
      {message && <div className="pos-inline-error" role="status"><TriangleAlert size={15} />{message}</div>}
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
  return <div className="pos-empty-cart"><ShoppingBag size={35} /><strong>Keranjang masih kosong</strong><p>Scan barcode atau pilih produk untuk memulai transaksi.</p></div>;
}

export function PromotionSection() {
  return <div className="pos-promotion"><button disabled><span><Percent size={15} />Diskon / Promo</span><span>Belum tersedia</span></button></div>;
}

export function PriceSummary({ cart }: { cart: PreviewCartLine[] }) {
  const subtotal = previewSubtotal(cart);
  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <div className="pos-price-summary"><div><span>Subtotal ({quantity} item)</span><strong>{formatRupiah(subtotal)}</strong></div><div><span>Pajak / penyesuaian</span><span>Rp 0</span></div><div className="pos-total"><span>Total Pembayaran<small>Harga setelah diskon produk</small></span><strong>{formatRupiah(subtotal)}</strong></div></div>;
}

const payments = [
  { value: "Cash", label: "Cash", Icon: Banknote },
  { value: "Kredit", label: "Kredit Anggota", Icon: UserRound },
] as const;

export function PaymentMethodSelector({ selected, onSelect, disabled = false }: { selected: PreviewPayment; onSelect: (value: PreviewPayment) => void; disabled?: boolean }) {
  return <fieldset className="pos-payment" disabled={disabled}><legend>Metode Pembayaran</legend><div>{payments.map(({ value, label, Icon }) => <button type="button" key={value} aria-pressed={selected === value} disabled={disabled} className={selected === value ? "is-selected" : ""} onClick={() => onSelect(value)}><Icon size={18} /><span>{label}</span></button>)}</div></fieldset>;
}

export function CheckoutButton({ processing, disabled, retry, onClick }: { processing: boolean; disabled: boolean; retry: boolean; onClick: () => void }) {
  return <button className="pos-checkout" onClick={onClick} disabled={disabled} aria-busy={processing}>{processing ? <LoaderCircle className="pos-spinner" size={18} /> : <ShoppingBag size={18} />}<span>{processing ? "Memproses pembayaran…" : retry ? "Periksa / Ulangi Pembayaran" : "Proses Pembayaran"}</span></button>;
}

type PendingCheckout = { items: { itemId: number; quantity: number }[]; memberId: number | null; paymentType: PreviewPayment; paidAmount: string; idempotencyKey: string };

export function TransactionPanel({ cart, session, storageKey, onLockChange, onChange, onRemove, onClear }: { cart: PreviewCartLine[]; session: PosSession; storageKey: string; onLockChange: (locked: boolean) => void; onChange: (product: PosProduct, delta: 1 | -1) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [payment, setPayment] = useState<PreviewPayment>("Cash");
  const [member, setMember] = useState<PosMember | null>(null);
  const [paidAmount, setPaidAmount] = useState("");
  const [processing, setProcessing] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const pending = useRef<PendingCheckout | null>(null);
  const sending = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = previewSubtotal(cart);
  const paidSen = /^\d{1,10}$/.test(paidAmount) ? Number(paidAmount) * 100 : 0;
  const paidDisplay = paidAmount ? rupiahInput.format(Number(paidAmount)) : "";
  const locked = processing || uncertain;
  const blockers = checkoutBlockingReasons({ session, payment, itemCount: cart.length, totalSen: total, paidSen, remainingSen: member?.remainingSen ?? null });
  const ready = blockers.length === 0;
  const pendingKey = `kkisi-payment:${session.userId}:${session.companyId}`;
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = JSON.parse(localStorage.getItem(pendingKey) ?? "null");
        if (saved?.idempotencyKey && Array.isArray(saved.items)) { pending.current = saved; setUncertain(true); onLockChange(true); setMessage("Pembayaran sebelumnya belum terkonfirmasi. Periksa dengan tombol ulangi sebelum membuat transaksi baru."); }
      } catch { /* Empty or unavailable storage. */ }
      setHydrated(true);
    });
    return () => { active = false; };
  }, [pendingKey, onLockChange]);

  async function submit() {
    if (sending.current || (!pending.current && !ready)) return;
    sending.current = true; setProcessing(true); onLockChange(true); setMessage(""); setReceipt(null);
    const body = pending.current ?? { items: cart.map((line) => ({ itemId: Number(line.product.id), quantity: line.quantity })), memberId: member?.id ?? null, paymentType: payment, paidAmount, idempotencyKey: crypto.randomUUID() };
    pending.current = body;
    // Persist BEFORE sending. If storage cannot preserve a retry key, fail before a payment can be committed.
    try { localStorage.setItem(pendingKey, JSON.stringify(body)); }
    catch { pending.current = null; sending.current = false; setProcessing(false); onLockChange(false); setMessage("Penyimpanan browser diperlukan untuk mengamankan percobaan ulang pembayaran."); return; }
    try {
      const response = await fetch("/api/pos/checkout", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: JSON.stringify(body), cache: "no-store" });
      if (response.status >= 500) throw new Error("unknown outcome");
      // Auth/CSRF rejection does not inspect the earlier commit; keep its key until reconciliation.
      if (response.status === 401) { setUncertain(true); onLockChange(true); window.location.assign("/login"); return; }
      const data = await response.json();
      if (response.status === 403) { setUncertain(true); onLockChange(true); setMessage(errorText(data.error)); return; }
      if (!response.ok) {
        localStorage.removeItem(pendingKey); pending.current = null; setUncertain(false); onLockChange(false);
        setMessage(errorText(data.error)); return;
      }
      localStorage.removeItem(pendingKey); localStorage.removeItem(storageKey); pending.current = null;
      setUncertain(false); onLockChange(false); onClear(); setMember(null); setPaidAmount(""); setPayment("Cash"); setReceipt(data.receipt);
    } catch {
      setUncertain(true); onLockChange(true); setMessage("Hasil pembayaran belum terkonfirmasi. Ulangi pemeriksaan dengan kunci yang sama; jangan membuat pembayaran baru.");
    } finally { sending.current = false; setProcessing(false); }
  }
  function closeDialog() { dialog.current?.close(); clearButton.current?.focus(); }
  return (
    <aside className="pos-transaction" aria-label="Keranjang transaksi">
      <header><h2><ShoppingBag size={18} />Keranjang Transaksi <span>{count} item</span></h2><button ref={clearButton} className="pos-clear" disabled={locked || cart.length === 0} onClick={() => dialog.current?.showModal()}><Trash2 size={14} />Hapus Semua</button></header>
      <div className="pos-transaction-scroll">
        <MemberSearch member={member} onMember={(value) => { setMember(value); if (!value) setPayment("Cash"); }} disabled={locked} />
        <fieldset className="pos-cart-lock" disabled={locked}><div className="pos-cart-items" aria-live="polite">{cart.length === 0 ? <EmptyCartState /> : <ul>{cart.map((line) => <CartItem key={line.product.id} line={line} onChange={onChange} onRemove={onRemove} />)}</ul>}</div></fieldset>
        <PromotionSection />
      </div>
      <div className="pos-transaction-bottom">
        <PriceSummary cart={cart} /><PaymentMethodSelector selected={payment} onSelect={setPayment} disabled={locked} />
        {payment === "Cash" && <div className="pos-cash-payment"><label htmlFor="pos-paid">Uang bayar (Rp)</label><input id="pos-paid" inputMode="numeric" pattern="[0-9]*" value={paidDisplay} disabled={locked} onChange={(event) => { const digits = event.target.value.replace(/\D/g, ""); if (/^\d{0,10}$/.test(digits)) setPaidAmount(digits); }} /><span>Kembalian <strong>{formatRupiah(Math.max(0, paidSen - total))}</strong></span></div>}
        {payment === "Kredit" && <p className="pos-checkout-note">{member ? `Sisa setelah belanja: ${formatRupiah(member.remainingSen - total)}` : "Pilih anggota aktif terlebih dahulu."}</p>}
        {!uncertain && blockers.map((reason) => <p className="pos-checkout-note" key={reason}>{reason}</p>)}
        <CheckoutButton processing={processing} disabled={!hydrated || processing || (!uncertain && !ready)} retry={uncertain} onClick={() => void submit()} />
        {message && <p className="pos-inline-error" role="alert">{message}</p>}
        {receipt && <div className="pos-receipt" role="status"><strong>Transaksi tersimpan · {receipt.salesCode}</strong><span>Total {formatRupiah(receipt.grandTotalSen)} · {receipt.paymentType}</span><span>Bayar {formatRupiah(receipt.paidSen)} · Kembalian {formatRupiah(receipt.changeSen)}</span><a href={`/pos/receipt/${receipt.saleId}`} target="_blank" rel="noopener noreferrer">Lihat / Cetak struk</a></div>}
      </div>
      <dialog ref={dialog} className="pos-clear-dialog" aria-labelledby="pos-clear-title" onCancel={() => clearButton.current?.focus()}>
        <h2 id="pos-clear-title"><Trash2 size={21} />Hapus Semua Item?</h2><p>Seluruh item dalam keranjang akan dihapus.</p><div><button autoFocus onClick={closeDialog}>Batal</button><button className="pos-confirm-clear" onClick={() => { if (!locked) onClear(); closeDialog(); }}>Ya, Hapus Semua</button></div>
      </dialog>
    </aside>
  );
}
