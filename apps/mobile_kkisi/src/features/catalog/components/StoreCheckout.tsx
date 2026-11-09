'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/overlay/Sheet';
import { SubmissionNotice } from '@/components/feedback/SubmissionNotice';
import { useCart } from '@/providers/CartProvider';
import { getJson, commonMessage } from '@/lib/api/client';
import { rupiahSen, senOf } from '@/lib/utils/money';
import { Stepper } from './CartControls';

type Priced = { lines: { id: number; quantity: number; item: { id: number; name: string; category: string; unit: string; price: string } | null }[]; credit: { remainingSen: number } | null };

/** Checkout Toko. Prices are re-read from the server for every cart change; unavailable items are flagged, never priced locally. */
export function StoreCheckout({ address }: { address: string | null }) {
  const { items, ready } = useCart();
  const [data, setData] = useState<Priced | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<'kredit' | 'cod'>('kredit');
  const [addressInfo, setAddressInfo] = useState(false);
  const [notice, setNotice] = useState(false);
  const key = items.map((i) => `${i.id}:${i.quantity}`).join(',');

  useEffect(() => {
    if (!ready || !key) return;
    const ctrl = new AbortController();
    getJson<Priced>(`/api/belanja/harga?items=${encodeURIComponent(key)}`, ctrl.signal).then((r) => {
      if (ctrl.signal.aborted) return;
      if (r.ok) { setData(r.data); setError(null); } else setError(r.status === 401 ? 'Sesi berakhir. Silakan masuk kembali.' : commonMessage(r.code));
    });
    return () => ctrl.abort();
  }, [ready, key]);

  const lines = useMemo(() => (data?.lines ?? []).filter((l) => items.some((i) => i.id === l.id)), [data, items]);
  const missing = lines.filter((l) => !l.item || senOf(l.item.price) <= 0);
  const subtotal = lines.reduce((s, l) => s + (l.item ? senOf(l.item.price) * (items.find((i) => i.id === l.id)?.quantity ?? 0) : 0), 0);
  const changed = lines.filter((l) => l.item && items.find((i) => i.id === l.id)?.price !== l.item.price);
  const creditShort = payment === 'kredit' && data?.credit && subtotal > data.credit.remainingSen;

  if (ready && items.length === 0) {
    return <div className="empty"><span className="empty-icon"><Icon name="package" /></span><h3>Keranjang masih kosong</h3><p>Pilih produk dari katalog Toko S-MART untuk checkout.</p><Link className="primary" href="/belanja">Buka Belanja</Link></div>;
  }
  return (
    <>
      <div className="purchase-stack">
        <section className="purchase-card" aria-labelledby="address-title">
          <div className="address-top"><div className="card-head"><span className="purchase-symbol"><Icon name="location" /></span><h2 id="address-title">Alamat Pengiriman</h2></div>
            <button type="button" className="text-button" aria-haspopup="dialog" onClick={() => setAddressInfo(true)}>Ubah</button></div>
          <p className="address-copy">{address ?? 'Alamat belum tercatat di data anggota.'}</p>
        </section>
        <section className="purchase-card" aria-label="Produk pesanan">
          <h2 style={{ fontSize: 15, marginBottom: 6 }}>Keranjang</h2>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!data && !error ? <p className="empty-text" role="status">Memeriksa harga terbaru…</p> : null}
          {items.map((i) => {
            const l = lines.find((x) => x.id === i.id);
            return (
              <div key={i.id} className="cart-row">
                <div className="cart-row-top"><strong>{l?.item?.name ?? i.name}</strong><b>{l?.item ? rupiahSen(senOf(l.item.price) * i.quantity) : '—'}</b></div>
                <div className="cart-row-bottom"><span>{l?.item ? `${rupiahSen(senOf(l.item.price))} / ${l.item.unit || 'item'}` : data ? 'Tidak tersedia lagi di katalog' : ''}</span><Stepper product={i} /></div>
              </div>
            );
          })}
        </section>
        {changed.length ? <p className="note" role="status">Harga {changed.length} produk berubah sejak ditambahkan; total memakai harga terbaru.</p> : null}
        {missing.length ? <p className="form-error" role="alert">{missing.length} produk tidak tersedia lagi. Hapus dari keranjang untuk melanjutkan.</p> : null}
        <section className="purchase-card" aria-label="Rincian pembayaran">
          <dl className="bill">
            <div><dt>Subtotal</dt><dd>{data ? rupiahSen(subtotal) : '—'}</dd></div>
            <div><dt>Ongkir &amp; diskon</dt><dd>Belum tersedia</dd></div>
            <div className="bill-total"><dt>Total</dt><dd>{data ? rupiahSen(subtotal) : '—'}</dd></div>
          </dl>
        </section>
        <fieldset>
          <legend>Pembayaran</legend>
          <div className="payment-options">
            <label><input type="radio" name="payment" value="kredit" checked={payment === 'kredit'} onChange={() => setPayment('kredit')} />
              <span className="pay-copy"><strong>Saldo Kredit</strong><small>{data?.credit ? `sisa ${rupiahSen(data.credit.remainingSen)}` : 'kredit toko tidak tersedia'}</small></span></label>
            <label><input type="radio" name="payment" value="cod" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
              <span className="pay-copy"><strong>Bayar di tempat (COD)</strong></span></label>
          </div>
          {creditShort ? <p className="form-error" role="alert">Sisa kredit toko tidak mencukupi untuk total ini.</p> : null}
        </fieldset>
      </div>
      <footer className="form-footer stacked">
        <div className="footer-total"><span>Total</span><b>{data ? rupiahSen(subtotal) : '—'}</b></div>
        <button type="button" className="primary" style={{ marginTop: 0 }} disabled={!data || missing.length > 0 || !!creditShort || (payment === 'kredit' && !data.credit)} onClick={() => setNotice(true)}>Bayar dengan PIN</button>
        <p className="footer-caption">Pemesanan online belum aktif · tidak ada pembayaran yang diproses</p>
      </footer>
      <Sheet open={addressInfo} onClose={() => setAddressInfo(false)} title="Alamat Pengiriman" subtitle="Alamat tercatat">
        <p className="detail-copy">Perubahan alamat dilakukan melalui pengurus koperasi. Alamat di atas berasal dari data anggota.</p>
        <button type="button" className="primary" onClick={() => setAddressInfo(false)}>Kembali</button>
      </Sheet>
      <SubmissionNotice open={notice} onClose={() => setNotice(false)} title="Ringkasan pesanan" channel="Pemesanan Toko S-MART"
        rows={[['Produk', `${items.reduce((n, i) => n + i.quantity, 0)} barang`], ['Total', rupiahSen(subtotal)], ['Pembayaran', payment === 'kredit' ? 'Saldo Kredit' : 'Bayar di tempat (COD)']]} />
    </>
  );
}
