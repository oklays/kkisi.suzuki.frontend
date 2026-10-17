import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { listShipmentsView } from '@koperasi/application/warehouse';
import { PreviewBanner } from '@/components/console/warehouse/PreviewBanner';
import { BRANCH, OUTCOME, SHIPMENT_STATUS } from '@/components/console/warehouse/warehouse-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { previewWorld } from '@/infrastructure/warehouse/synthetic-world';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Penerimaan dan Selisih · Warehouse · KKISI TB2' };

export default async function ReceivingPreviewPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/warehouse/penerimaan' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('warehouse.preview.view')) notFound();
  const world = await previewWorld();
  const view = await listShipmentsView(world.read, world.viewer, { status: 'DISPATCHED', onlyOpenDiscrepancy: true });

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/warehouse"><ArrowLeft size={16} aria-hidden="true" />Kembali ke pratinjau</Link>
      <header className="console-page-head"><h1>Penerimaan dan selisih</h1><p>Dokumen yang sudah dikirim dan masih menunggu penerimaan, atau memiliki kekurangan/penolakan yang belum ditangani.</p></header>
      <PreviewBanner />
      {view.items.length === 0 ? <section className="console-panel" role="status"><h2>Tidak ada selisih terbuka</h2><p>Semua dokumen yang dikirim telah diterima penuh atau selisihnya telah ditangani.</p></section> : (
        <div className="console-scroll"><table className="console-table">
          <thead><tr><th scope="col">Dokumen</th><th scope="col">Cabang tujuan</th><th scope="col">Status</th><th scope="col">Dikirim</th><th scope="col">Diterima</th><th scope="col">Ditolak (belum ditangani)</th><th scope="col">Masih ditunggu</th><th scope="col">Hasil</th></tr></thead>
          <tbody>{view.items.map((s) => (
            <tr key={`${s.destinationStoreCompanyId}|${s.sourceRef}`}>
              <td><Link href={`/console/warehouse/distribusi/${encodeURIComponent(s.sourceRef)}?cabang=${s.destinationStoreCompanyId}`}>{s.sourceRef}</Link></td><td>{BRANCH(s.destinationStoreCompanyId)}</td><td>{SHIPMENT_STATUS[s.status]}</td>
              <td className="num">{s.totals.expected}</td><td className="num">{s.totals.accepted}</td><td className="num">{s.totals.unresolvedRejected}</td><td className="num">{s.totals.outstanding}</td><td>{OUTCOME[s.outcome]}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <p className="console-notice">Rekonsiliasi: dikirim = diterima + ditolak + ditutup + ditunggu. Tidak ada koreksi otomatis dan tidak ada posting stok.</p>
    </div>
  );
}
