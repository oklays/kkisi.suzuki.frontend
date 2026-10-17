import Link from 'next/link';
import { notFound } from 'next/navigation';
import { warehouseOverview } from '@koperasi/application/warehouse';
import { PreviewBanner } from '@/components/console/warehouse/PreviewBanner';
import { OUTCOME, SHIPMENT_STATUS } from '@/components/console/warehouse/warehouse-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { previewWorld } from '@/infrastructure/warehouse/synthetic-world';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pratinjau Warehouse · KKISI TB2' };

export default async function WarehouseOverviewPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/warehouse' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('warehouse.preview.view')) notFound();
  const world = await previewWorld();
  const o = await warehouseOverview(world.read, world.viewer);

  return (
    <div className="console-page">
      <header className="console-page-head"><h1>Pratinjau Warehouse</h1><p>Ringkasan pemetaan barang, dokumen distribusi, penerimaan, dan selisih.</p></header>
      <PreviewBanner />
      <section className="console-card" aria-labelledby="sec-peta">
        <h2 id="sec-peta">Pemetaan barang</h2>
        <dl className="console-dl"><div><dt>Dikonfirmasi</dt><dd>{o.mappings.CONFIRMED}</dd></div><div><dt>Diusulkan (belum dipakai)</dt><dd>{o.mappings.PROPOSED}</dd></div><div><dt>Dihentikan</dt><dd>{o.mappings.RETIRED}</dd></div></dl>
        <p><Link className="console-more" href="/console/warehouse/pemetaan">Lihat pemetaan barang</Link></p>
      </section>
      <section className="console-card" aria-labelledby="sec-dok">
        <h2 id="sec-dok">Dokumen distribusi</h2>
        <dl className="console-dl">{(Object.keys(o.shipments) as (keyof typeof o.shipments)[]).map((k) => <div key={k}><dt>{SHIPMENT_STATUS[k]}</dt><dd>{o.shipments[k]}</dd></div>)}</dl>
        <p><Link className="console-more" href="/console/warehouse/distribusi">Lihat dokumen distribusi</Link></p>
      </section>
      <section className="console-card" aria-labelledby="sec-terima">
        <h2 id="sec-terima">Penerimaan dan selisih</h2>
        <dl className="console-dl">
          {(Object.keys(o.outcomes) as (keyof typeof o.outcomes)[]).map((k) => <div key={k}><dt>{OUTCOME[k]}</dt><dd>{o.outcomes[k]}</dd></div>)}
          <div><dt>Dokumen dengan selisih terbuka</dt><dd>{o.openDiscrepancies}</dd></div><div><dt>Unit diterima / masih ditunggu</dt><dd>{o.acceptedUnits} / {o.outstandingUnits}</dd></div>
        </dl>
        {o.treatmentUnspecified > 0 && <p className="console-notice">{o.treatmentUnspecified} dokumen berperlakuan akuntansi <strong>belum ditentukan</strong>: tidak ada posting stok atau nilai yang dapat dibuat (keputusan D7).</p>}
        <p><Link className="console-more" href="/console/warehouse/penerimaan">Lihat penerimaan dan selisih</Link></p>
      </section>
    </div>
  );
}
