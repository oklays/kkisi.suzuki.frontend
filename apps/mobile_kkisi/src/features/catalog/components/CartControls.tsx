'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/overlay/Sheet';
import { useCart, type CartItem } from '@/providers/CartProvider';
import { rupiahSen, senOf } from '@/lib/utils/money';

type Product = Omit<CartItem, 'quantity'>;

export function Stepper({ product }: { product: Product }) {
  const { items, setQuantity } = useCart();
  const q = items.find((i) => i.id === product.id)?.quantity ?? 0;
  return (
    <div className="stepper">
      <button type="button" aria-label={`Kurangi ${product.name}`} onClick={() => setQuantity(product, q - 1)}>−</button>
      <output aria-label={`Jumlah ${product.name}`} aria-live="polite">{q}</output>
      <button type="button" aria-label={`Tambah ${product.name}`} disabled={q >= 99} onClick={() => setQuantity(product, q + 1)}>+</button>
    </div>
  );
}

/** "Tambah" until the product is in the cart, then a quantity stepper (mockup behaviour). Price-less products cannot be added. */
export function AddToCart({ product }: { product: Product }) {
  const { items, setQuantity } = useCart();
  const priced = senOf(product.price) > 0;
  if (items.some((i) => i.id === product.id)) return <Stepper product={product} />;
  return <button type="button" className="add" disabled={!priced} aria-label={`Tambah ${product.name}`} onClick={() => setQuantity(product, 1)}>{priced ? 'Tambah' : 'Harga belum tersedia'}</button>;
}

export const cartSubtotalSen = (items: CartItem[]) => items.reduce((s, i) => s + senOf(i.price) * i.quantity, 0);

export function CatalogFooter() {
  const router = useRouter();
  const { items, ready } = useCart();
  const [open, setOpen] = useState(false);
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = rupiahSen(cartSubtotalSen(items));
  const checkout = () => { setOpen(false); router.push('/belanja/checkout'); };
  return (
    <>
      <footer className="catalog-footer">
        <button type="button" className="cart-overview" aria-label="Lihat keranjang" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <small>{ready ? `${count} barang di keranjang` : 'Memuat keranjang…'}</small><strong>{subtotal}</strong>
        </button>
        <button type="button" className="primary" disabled={!count} onClick={checkout}>Checkout</button>
      </footer>
      <Sheet open={open} onClose={() => setOpen(false)} title="Keranjang belanja" subtitle="Produk dari katalog Toko S-MART">
        {items.length === 0 ? <p className="empty-text">Keranjang masih kosong. Tambahkan produk dari katalog.</p> : (
          <ul className="cart-lines">
            {items.map((i) => (
              <li key={i.id} className="cart-line"><h3>{i.name}</h3><p>{i.category}{i.unit ? ` · ${i.unit}` : ''}</p>
                <div className="cart-line-bottom"><strong>{rupiahSen(senOf(i.price) * i.quantity)}</strong><Stepper product={i} /></div></li>
            ))}
          </ul>
        )}
        <p className="cart-total"><span>Subtotal</span><strong>{subtotal}</strong></p>
        <p className="catalog-note">Harga diperiksa ulang saat checkout. Stok belum diverifikasi.</p>
        <button type="button" className="primary" disabled={!count} onClick={checkout}>Lanjut checkout</button>
      </Sheet>
    </>
  );
}
