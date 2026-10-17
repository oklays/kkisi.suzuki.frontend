import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { listShipmentsView } from '@koperasi/application/warehouse';
import type { ShipmentStatus } from '@koperasi/domain/warehouse';
import { PreviewBanner } from '@/components/console/warehouse/PreviewBanner';
import { BRANCH, OUTCOME, SHIPMENT_STATUS } from '@/components/console/warehouse/warehouse-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { previewWorld } from '@/infrastructure/warehouse/synthetic-world';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dokumen Distribusi · Warehouse · KKISI TB2' };

export default async function ShipmentListPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/warehouse/distribusi' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('warehouse.preview.view')) notFound();
  const sp = await searchParams; const status = Array.isArray(sp.status) ? sp.status[0] : sp.status; const cabang = Array.isArray(sp.cabang) ? sp.cabang[0] : sp.cabang;
  const statusFilter = status && status in SHIPMENT_STATUS ? (status as ShipmentStatus) : null; const dest = cabang && /^\d{1,6}$/.test(cabang) ? Number(cabang) : null;
  const world = await previewWorld();
  const view = await listShipmentsView(world.read, world.viewer, { status: statusFilter, destinationStoreCompanyId: dest });

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/warehouse"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pratinjau</Link>
      <header className="console-page-head"><h1>Dokumen distribusi</h1><p>Dokumen Gudang ke cabang beserta status dan hasil rekonsiliasi kuantitas.</p></header>
      <PreviewBanner />
      <form className="console-search console-search-wide" action="/console/warehouse/distribusi" method="get" role="search" aria-label="Filter distribusi">
        <div className="console-filter-row">
          <label>Cabang tujuan<select name="cabang" defaultValue={cabang ?? ''}><option value="">Semua</option><option value="1">Cabang sintetis 1</option><option value="2">Cabang sintetis 2</option></select></label>
          <label>Status<select name="status" defaultValue={statusFilter ?? ''}><option value="">Semua</option>{Object.entries(SHIPMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <span />
          <button type="submit">Terapkan</button>
        </div>
      </form>
      {view.items.length === 0 ? <section className="console-panel" role="status"><h2>Tidak ada dokumen</h2><p>Tidak ada dokumen distribusi yang cocok dengan filter ini.</p></section> : (
        <div className="console-scroll"><table className="console-table">
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Cabang tujuan</th><th scope="col">Status</th><th scope="col">Baris</th><th scope="col">Dikirim</th><th scope="col">Diterima</th><th scope="col">Masih ditunggu</th><th scope="col">Hasil penerimaan</th></tr></thead>
          <tbody>{view.items.map((s) => (
            <tr key={`${s.destinationStoreCompanyId}|${s.sourceRef}`}>
              <td><Link href={`/console/warehouse/distribusi/${encodeURIComponent(s.sourceRef)}?cabang=${s.destinationStoreCompanyId}`}>{s.sourceRef}</Link></td><td>{BRANCH(s.destinationStoreCompanyId)}</td><td>{SHIPMENT_STATUS[s.status]}</td><td className="num">{s.lines}</td>
              <td className="num">{s.totals.expected}</td><td className="num">{s.totals.accepted}</td><td className="num">{s.totals.outstanding}</td><td>{OUTCOME[s.outcome]}{s.hasOpenDiscrepancy && <span className="console-badge" data-state="partial"> selisih terbuka</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {view.truncated && <p className="console-notice">Hanya 50 dokumen terbaru yang ditampilkan.</p>}
    </div>
  );
}
