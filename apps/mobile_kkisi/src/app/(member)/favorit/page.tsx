import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, Skeleton, UnavailableState } from '@/components/feedback/States';
import { rupiahDec } from '@/lib/utils/money';
import { titleCase } from '@/lib/utils/dates';
import { getFavorites } from '@/features/account/services/account.server';

export const metadata: Metadata = { title: 'Favorit' };

async function FavoriteList() {
  const r = await getFavorites();
  if (r.state !== 'ok') return <UnavailableState what="Produk favorit" compact={false} />;
  return (
    <>
      <div className="page-intro"><div><h2>Produk tersimpan</h2><p>Pilihanmu di Toko S-MART.</p></div><span className="item-count" aria-live="polite">{r.data.length} produk</span></div>
      {r.data.length === 0 ? (
        <EmptyState icon="heart" title="Belum ada favorit" action={<Link className="secondary" href="/belanja">Lihat katalog S-MART</Link>}>Produk yang kamu simpan sebagai favorit di S-MART akan tampil di sini.</EmptyState>
      ) : (
        <section className="products" aria-label="Daftar produk favorit">
          {r.data.map((f) => (
            <article key={f.id} className="product">
              <div className="thumbnail"><Icon name="box" /><span>Foto produk</span></div>
              <h3>{titleCase(f.name)}</h3>
              <p className="price">{rupiahDec(f.price)}{f.unit ? ` / ${f.unit}` : ''}</p>
              <Link className="secondary" style={{ width: '100%', minHeight: 44, marginTop: 8, fontSize: 11 }} href={`/belanja?q=${encodeURIComponent(f.name.slice(0, 40))}`}>Cari di katalog</Link>
            </article>
          ))}
        </section>
      )}
      <div className="local-note"><Icon name="info" /><span>Daftar favorit diambil dari akun S-MART kamu. Menambah atau menghapus favorit belum tersedia di aplikasi ini.</span></div>
    </>
  );
}

export default function FavoritPage() {
  return (
    <Screen name="favorit" nav>
      <PageHeader title="Favorit" subtitle="Toko S-MART" back="/beranda" symbol="heart" />
      <main id="main" className="content">
        <Suspense fallback={<div className="products" aria-busy="true"><Skeleton height={180} /><Skeleton height={180} /></div>}><FavoriteList /></Suspense>
      </main>
    </Screen>
  );
}
