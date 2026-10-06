'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Minus, Plus, Undo2 } from 'lucide-react';
import { priceReturn } from '@koperasi/domain/sales/return';
import type { ReturnContext } from '@koperasi/application/sales/returns';
import { formatSalesMoney as idr } from './SalesChips';
import { refundLabel, returnMessage } from './return-messages';

const PRESETS = ['Barang rusak', 'Kedaluwarsa', 'Salah barang', 'Pelanggan batal beli'];

export function SalesReturnForm({ context, csrfToken }: { context: ReturnContext; csrfToken: string }) {
  const router = useRouter();
  const key = useRef<string>(crypto.randomUUID());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const method = context.eligibility.refundMethod;

  const items = context.lines.map((line) => ({ itemId: line.itemId, quantity: quantities[line.itemId] ?? 0 })).filter((item) => item.quantity > 0);
  let preview: ReturnType<typeof priceReturn> | null = null;
  try { preview = items.length ? priceReturn(context.lines, items) : null; } catch { preview = null; }
  const reasonValid = reason.trim().length >= 3;

  function setQuantity(itemId: number, value: number, max: number) {
    const next = Math.max(0, Math.min(max, Number.isFinite(value) ? Math.trunc(value) : 0));
    // A different set of items is a different request: never replay an earlier key for it.
    key.current = crypto.randomUUID();
    setConfirming(false); setError('');
    setQuantities((current) => ({ ...current, [itemId]: next }));
  }

  async function submit() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/sales/${context.sale.saleId}/returns`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ items, reason, idempotencyKey: key.current }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; return?: { returnId: number } };
      if (!response.ok || !body.return) {
        setError(returnMessage(body.error ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'POS_UNAVAILABLE')));
        setConfirming(false);
        return;
      }
      router.push(`/sales/returns/${body.return.returnId}?created=1`);
    } catch {
      // The outcome is unknown: the same key makes a retry safe (a committed return is answered, not repeated).
      setError('Koneksi terputus. Tekan proses lagi; retur yang sudah tersimpan tidak akan tercatat dua kali.');
      setConfirming(false);
    } finally { setBusy(false); }
  }

  return <form className="sales-return-form" onSubmit={(event) => { event.preventDefault(); if (preview && reasonValid) setConfirming(true); }}>
    <section className="sales-detail-card">
      <h3>Pilih barang yang diretur <small>· jumlah maksimal mengikuti sisa yang belum diretur</small></h3>
      <div className="sales-table-wrap" tabIndex={0} role="region" aria-label="Barang yang dapat diretur"><table className="sales-table sales-return-table">
        <thead><tr><th scope="col">Item / barcode</th><th scope="col">Terjual</th><th scope="col">Sudah diretur</th><th scope="col" className="sales-money">Harga satuan</th><th scope="col">Jumlah retur</th><th scope="col" className="sales-money">Nilai retur</th></tr></thead>
        <tbody>{context.lines.map((line) => {
          const remaining = line.soldQty - line.returnedQty; const value = quantities[line.itemId] ?? 0;
          let amount: number | null = null;
          if (value > 0) { try { amount = priceReturn([line], [{ itemId: line.itemId, quantity: value }]).totalSen; } catch { amount = null; } }
          return <tr key={line.itemId}>
            <td><strong>{line.label}</strong><small>{line.barcode || 'Barcode tidak tersimpan'}</small></td>
            <td data-label="Terjual">{line.soldQty}</td><td data-label="Sudah diretur">{line.returnedQty}</td>
            <td data-label="Harga satuan" className="sales-money">{idr(line.unitPriceSen)}{line.unitDiscountSen > 0 && <small>Diskon {idr(line.unitDiscountSen)}/item</small>}</td>
            <td className="sales-return-qty-cell">{remaining > 0 ? <div className="sales-qty" role="group" aria-label={`Jumlah retur ${line.label}`}>
              <button type="button" aria-label="Kurangi" disabled={busy || value <= 0} onClick={() => setQuantity(line.itemId, value - 1, remaining)}><Minus size={14} aria-hidden="true" /></button>
              <input inputMode="numeric" aria-label={`Jumlah retur ${line.label}, maksimal ${remaining}`} value={value} disabled={busy}
                onChange={(event) => setQuantity(line.itemId, Number(event.target.value.replace(/\D/g, '') || 0), remaining)} />
              <button type="button" aria-label="Tambah" disabled={busy || value >= remaining} onClick={() => setQuantity(line.itemId, value + 1, remaining)}><Plus size={14} aria-hidden="true" /></button>
              <small>maks. {remaining}</small>
            </div> : <span className="sales-chip sales-chip--neutral">Sudah diretur semua</span>}</td>
            <td data-label="Nilai retur" className="sales-money">{amount === null ? '—' : <strong>{idr(amount)}</strong>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    <section className="sales-detail-card">
      <h3>Alasan retur</h3>
      <div className="sales-return-presets">{PRESETS.map((preset) => <button type="button" key={preset} disabled={busy} aria-pressed={reason === preset} onClick={() => { setReason(preset); setConfirming(false); }}>{preset}</button>)}</div>
      <label className="sales-return-reason">Catatan alasan (wajib, maks. 200 karakter)
        <input value={reason} maxLength={200} disabled={busy} placeholder="Contoh: kemasan bocor" onChange={(event) => { setReason(event.target.value.replace(/[^\x20-\x7e]/g, '')); setConfirming(false); }} />
      </label>
    </section>
    <section className="sales-return-summary" aria-live="polite">
      <div><span>Total retur</span><strong>{preview ? idr(preview.totalSen) : idr(0)}</strong><small>{refundLabel(method)}</small></div>
      {error && <p className="sales-filter-error" role="alert">{error}</p>}
      {!confirming ? <button className="sales-primary" type="submit" disabled={busy || !preview || !reasonValid}><Undo2 size={16} aria-hidden="true" />Tinjau retur</button>
        : <div className="sales-return-confirm" role="group" aria-label="Konfirmasi retur">
          <p>{method === 'Cash' ? <>Serahkan <strong>{idr(preview?.totalSen ?? 0)}</strong> tunai dari laci kasir kepada pelanggan.</> : <>Tagihan kredit anggota berkurang <strong>{idr(preview?.totalSen ?? 0)}</strong>.</>} Stok barang akan bertambah. Retur tidak dapat dibatalkan dari aplikasi ini.</p>
          <div><button type="button" className="sales-secondary" disabled={busy} onClick={() => setConfirming(false)}>Ubah</button>
            <button type="button" className="sales-primary" disabled={busy} onClick={() => void submit()}>{busy ? <><LoaderCircle size={15} className="sales-spin" aria-hidden="true" />Memproses…</> : 'Konfirmasi & proses retur'}</button></div>
        </div>}
    </section>
  </form>;
}
