import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { listMappingsView } from '@koperasi/application/warehouse';
import { PreviewBanner } from '@/components/console/warehouse/PreviewBanner';
import { BRANCH, MAPPING_STATUS, conversionText } from '@/components/console/warehouse/warehouse-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { previewWorld } from '@/infrastructure/warehouse/synthetic-world';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pemetaan Barang · Warehouse · KKISI TB2' };

export default async function MappingPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/warehouse/pemetaan' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('warehouse.preview.view')) notFound();
  const sp = await searchParams; const cabang = Array.isArray(sp.cabang) ? sp.cabang[0] : sp.cabang; const status = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const storeCompanyId = cabang && /^\d{1,6}$/.test(cabang) ? Number(cabang) : null;
  const statusFilter = status === 'PROPOSED' || status === 'CONFIRMED' || status === 'RETIRED' ? status : null;
  const world = await previewWorld();
  const view = await listMappingsView(world.read, world.viewer, { storeCompanyId, status: statusFilter });

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/warehouse"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pratinjau</Link>
      <header className="console-page-head"><h1>Pemetaan barang</h1><p>Hubungan eksplisit barang Gudang ke barang TOKO per cabang. Tidak pernah dicocokkan lewat nama; id tidak dianggap sama antar database.</p></header>
      <PreviewBanner />
      <form className="console-search console-search-wide" action="/console/warehouse/pemetaan" method="get" role="search" aria-label="Filter pemetaan">
        <div className="console-filter-row">
          <label>Cabang<select name="cabang" defaultValue={cabang ?? ''}><option value="">Semua</option><option value="1">Cabang sintetis 1</option><option value="2">Cabang sintetis 2</option></select></label>
          <label>Status<select name="status" defaultValue={statusFilter ?? ''}><option value="">Semua</option>{Object.keys(MAPPING_STATUS).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <span />
          <button type="submit">Terapkan</button>
        </div>
      </form>
      {view.items.length === 0 ? <section className="console-panel" role="status"><h2>Tidak ada pemetaan</h2><p>Tidak ada pemetaan yang cocok dengan filter ini.</p></section> : (
        <div className="console-scroll"><table className="console-table">
          <thead><tr><th scope="col">Referensi</th><th scope="col">Cabang</th><th scope="col">Barang Gudang</th><th scope="col">Barang TOKO</th><th scope="col">Satuan</th><th scope="col">Konversi</th><th scope="col">Dasar</th><th scope="col">Status</th><th scope="col">Dikonfirmasi oleh</th></tr></thead>
          <tbody>{view.items.map((m) => (
            <tr key={m.ref}><td>{m.ref}</td><td>{BRANCH(m.storeCompanyId)}</td><td>{m.gudangItemId}</td><td>{m.storeItemId}</td><td>{m.gudangUnit} → {m.storeUnit}</td><td>{conversionText(m.conversion)}</td><td>{m.basis}</td>
              <td><span className="console-badge" data-state={m.status === 'CONFIRMED' ? 'available' : m.status === 'PROPOSED' ? 'partial' : 'planned'}>{MAPPING_STATUS[m.status]}</span></td><td>{m.confirmedBy ?? '—'}</td></tr>
          ))}</tbody>
        </table></div>
      )}
      {view.truncated && <p className="console-notice">Hanya 50 pemetaan pertama yang ditampilkan.</p>}
    </div>
  );
}
