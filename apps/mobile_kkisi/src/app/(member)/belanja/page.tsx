import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, Skeleton, UnavailableState } from '@/components/feedback/States';
import { rupiahDec, senOf } from '@/lib/utils/money';
import { titleCase } from '@/lib/utils/dates';
import { CatalogControls } from '@/features/catalog/components/CatalogControls';
import { AddToCart, CatalogFooter } from '@/features/catalog/components/CartControls';
import { CATALOG_MAX, CATALOG_PAGE, parseCatalogParams, type CatalogParams } from '@/features/catalog/services/catalog';
import { getCatalog, getCategories } from '@/features/catalog/services/catalog.server';

export const metadata: Metadata = { title: 'Belanja' };
type Params = Record<string, string | string[] | undefined>;

async function Products({ p, raw }: { p: CatalogParams; raw: Params }) {
  const r = await getCatalog(p);
  if (r.state !== 'ok') return <UnavailableState what="Katalog" compact={false} />;
  const { items, total } = r.data;
  const more = new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'));
  more.set('n', String(p.shown + CATALOG_PAGE));
  return (
    <>
      <div className="catalog-result"><strong aria-live="polite">{total.toLocaleString('id-ID')} produk</strong><span>{items.length} ditampilkan</span></div>
      {items.length === 0 ? <EmptyState icon="package" title="Produk tidak ditemukan" action={<Link className="secondary" href="/belanja" replace>Hapus pencarian dan filter</Link>}>Coba nama atau SKU lain, atau pilih semua kategori.</EmptyState> : (
        <div className="products">
          {items.map((i) => (
            <article key={i.id} className="product">
              <div className="product-art" aria-hidden="true"><Icon name="package" /></div>
              <p className="product-category">{i.category}</p>
              <h2>{i.name}</h2>
              <p className="product-sku">SKU {i.sku}</p>
              <p className="product-price">{senOf(i.price) > 0 ? rupiahDec(i.price) : 'Belum ada harga'}</p>
              <p className="product-unit">{i.unit ? `per ${i.unit}` : 'Satuan belum tercantum'}</p>
              <div className="product-actions"><AddToCart product={{ id: i.id, name: i.name, category: i.category, unit: i.unit, price: i.price }} /></div>
            </article>
          ))}
        </div>
      )}
      {items.length < total && p.shown < CATALOG_MAX ? <Link className="secondary load-more" href={`/belanja?${more}`} replace scroll={false}>Muat {CATALOG_PAGE} produk lagi</Link> : null}
      {items.length < total && p.shown >= CATALOG_MAX ? <p className="catalog-note">Gunakan pencarian atau kategori untuk mempersempit hasil.</p> : null}
    </>
  );
}

async function Controls() {
  const c = await getCategories();
  return <CatalogControls categories={c.state === 'ok' ? c.data : []} />;
}

export default async function BelanjaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = await searchParams;
  const p = parseCatalogParams(raw);
  return (
    <Screen name="belanja" footerSpace={74} className="formpage">
      <PageHeader title="Belanja" subtitle="Katalog produk S-MART" back="/beranda" symbol="store" />
      <main id="main" className="content">
        <section className="catalog-intro" aria-label="Sumber katalog"><strong>{titleCase('TOKO S-MART TB II')}</strong><p>Harga langsung dari katalog toko. Stok belum diverifikasi.</p></section>
        <Suspense fallback={<Skeleton height={120} />}><Controls /></Suspense>
        <Suspense key={JSON.stringify(p)} fallback={<div className="products" style={{ marginTop: 50 }} aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={230} />)}</div>}><Products p={p} raw={raw} /></Suspense>
        <p className="catalog-note">Pemesanan dan pembayaran dari aplikasi belum tersedia; keranjang membantu kamu menyiapkan belanja dan memeriksa harga terbaru.</p>
      </main>
      <CatalogFooter />
    </Screen>
  );
}
