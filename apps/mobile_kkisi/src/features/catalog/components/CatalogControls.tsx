'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SearchIcon } from '@/components/ui/Icon';

/** Search (debounced), category and sort as URL parameters: the server renders the filtered catalog; refresh and back keep it. */
export function CatalogControls({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete('n');
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <label className="field catalog-search" htmlFor="catalog-search">
        <span className="sr-only">Cari nama atau SKU produk</span>
        <SearchIcon />
        <input id="catalog-search" type="search" placeholder="Cari nama atau SKU produk" autoComplete="off" enterKeyHint="search" maxLength={60} value={q}
          onChange={(e) => { const v = e.target.value; setQ(v); clearTimeout(timer.current); timer.current = setTimeout(() => push({ q: v.trim().length >= 2 ? v.trim() : '' }), 350); }} />
      </label>
      <div className="filters">
        <label><span>Kategori</span>
          <select className="control" value={params.get('kategori') ?? ''} onChange={(e) => push({ kategori: e.target.value })}>
            <option value="">Semua kategori</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label><span>Urutkan</span>
          <select className="control" value={params.get('urut') ?? 'name'} onChange={(e) => push({ urut: e.target.value === 'name' ? '' : e.target.value })}>
            <option value="name">Nama A–Z</option><option value="price-low">Harga terendah</option><option value="price-high">Harga tertinggi</option>
          </select>
        </label>
      </div>
    </>
  );
}
