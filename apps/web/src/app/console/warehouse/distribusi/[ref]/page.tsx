import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { readShipment } from '@koperasi/application/warehouse';
import { WarehouseError, stockIntents } from '@koperasi/domain/warehouse';
import { PreviewBanner } from '@/components/console/warehouse/PreviewBanner';
import { BRANCH, OUTCOME, REJECTION, RESOLUTION, SHIPMENT_STATUS, TREATMENT } from '@/components/console/warehouse/warehouse-format';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { previewWorld } from '@/infrastructure/warehouse/synthetic-world';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Detail Distribusi · Warehouse · KKISI TB2' };

export default async function ShipmentDetailPreviewPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const { ref } = await params;
  const sourceRef = decodeURIComponent(ref);
  const auth = await requireConsoleSession({ next: `/console/warehouse/distribusi/${encodeURIComponent(sourceRef)}` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('warehouse.preview.view')) notFound();
  const sp = await searchParams; const cabang = Array.isArray(sp.cabang) ? sp.cabang[0] : sp.cabang;
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(sourceRef) || !cabang || !/^\d{1,6}$/.test(cabang)) notFound();
  const world = await previewWorld();
  let view;
  try { view = await readShipment(world.deps, world.viewer, { sourceRef, destinationStoreCompanyId: Number(cabang) }); }
  catch (error) { if (error instanceof WarehouseError) notFound(); throw error; }
  const { shipment: s, reconciliation: r } = view; const intents = stockIntents(s);
  const line = (n: number) => r.lines.find((l) => l.lineNo === n);

  return (
    <div className="console-page">
      <Link className="console-back" href="/console/warehouse/distribusi"><ArrowLeft size={16} aria-hidden="true" />Kembali ke dokumen distribusi</Link>
      <header className="console-page-head"><h1>Distribusi {s.sourceRef}</h1><p>{BRANCH(s.destinationStoreCompanyId)} · {SHIPMENT_STATUS[s.status]} · {OUTCOME[r.outcome]}</p></header>
      <PreviewBanner />
      <section className="console-card" aria-labelledby="sec-ringkas">
        <h2 id="sec-ringkas">Ringkasan kuantitas (satuan TOKO)</h2>
        <dl className="console-dl"><div><dt>Dikirim</dt><dd>{r.totals.expected}</dd></div><div><dt>Diterima</dt><dd>{r.totals.accepted}</dd></div><div><dt>Ditolak</dt><dd>{r.totals.rejected}</dd></div><div><dt>Kekurangan ditutup</dt><dd>{r.totals.shortClosed}</dd></div><div><dt>Masih ditunggu</dt><dd>{r.totals.outstanding}</dd></div><div><dt>Ditolak, belum ditangani</dt><dd>{r.totals.unresolvedRejected}</dd></div>
          <div><dt>Kebijakan penerimaan</dt><dd>{s.receivingPolicy.allowMultipleReceipts ? 'Boleh beberapa kali' : 'Sekali (sisa menjadi selisih)'}</dd></div><div><dt>Perlakuan akuntansi</dt><dd>{TREATMENT[view.treatment]}</dd></div></dl>
        {r.outcome !== 'FULLY_RECEIVED' && <p className="console-notice">Dokumen belum diterima penuh: selisih dan kekurangan ditampilkan apa adanya, tidak dibulatkan.</p>}
      </section>
      <section className="console-card" aria-labelledby="sec-baris">
        <h2 id="sec-baris">Baris dokumen</h2>
        <table className="console-table">
          <thead><tr><th scope="col">Baris</th><th scope="col">Barang Gudang</th><th scope="col">Barang TOKO</th><th scope="col">Pemetaan</th><th scope="col">Jumlah Gudang</th><th scope="col">Dikirim (TOKO)</th><th scope="col">Diterima</th><th scope="col">Ditolak</th><th scope="col">Ditutup</th><th scope="col">Ditunggu</th></tr></thead>
          <tbody>{s.lines.map((l) => { const x = line(l.lineNo)!; return (
            <tr key={l.lineNo}><td>{l.lineNo}</td><td>{l.gudangItemId}</td><td>{l.storeItemId}</td><td>{l.mappingRef}</td><td className="num">{l.gudangQuantity} {l.gudangUnit}</td><td className="num">{l.expectedQuantity} {l.storeUnit}</td><td className="num">{x.acceptedQuantity}</td><td className="num">{x.rejectedQuantity}</td><td className="num">{x.shortClosedQuantity}</td><td className="num">{x.outstandingQuantity}</td></tr>
          ); })}</tbody>
        </table>
      </section>
      <section className="console-card" aria-labelledby="sec-event">
        <h2 id="sec-event">Peristiwa penerimaan dan penanganan selisih</h2>
        {s.receipts.length === 0 && s.resolutions.length === 0 ? <p>Belum ada penerimaan.</p> : (
          <table className="console-table">
            <thead><tr><th scope="col">Waktu</th><th scope="col">Jenis</th><th scope="col">Kunci</th><th scope="col">Rincian</th></tr></thead>
            <tbody>
              {s.receipts.map((e) => <tr key={e.eventKey}><td>{e.at}</td><td>Penerimaan</td><td>{e.eventKey}</td><td>{e.lines.map((l) => `baris ${l.lineNo}: diterima ${l.acceptedQuantity}${l.rejectedQuantity ? `, ditolak ${l.rejectedQuantity} (${l.rejectedReason ? REJECTION[l.rejectedReason] : '—'})` : ''}`).join('; ')}</td></tr>)}
              {s.resolutions.map((e) => <tr key={e.resolutionKey}><td>{e.at}</td><td>Penanganan selisih</td><td>{e.resolutionKey}</td><td>baris {e.lineNo}: {RESOLUTION[e.kind]} {e.quantity} · {e.reason}</td></tr>)}
            </tbody>
          </table>
        )}
      </section>
      <section className="console-card" aria-labelledby="sec-intent">
        <h2 id="sec-intent">Maksud posting stok (hanya pratinjau, tidak diposting)</h2>
        <p className="console-notice"><span>Hanya kuantitas yang <strong>diterima</strong> yang dapat menjadi stok, satu maksud per peristiwa dan baris dengan kunci tetap. Tidak ada stok TOKO yang diubah di sini, dan tanpa perlakuan akuntansi yang ditentukan penyalur stok akan menolak.</span></p>
        {intents.length === 0 ? <p>Belum ada maksud posting.</p> : (
          <table className="console-table"><thead><tr><th scope="col">Kunci</th><th scope="col">Barang TOKO</th><th scope="col">Jumlah</th></tr></thead><tbody>{intents.map((i) => <tr key={i.intentKey}><td>{i.intentKey}</td><td>{i.storeItemId}</td><td className="num">{i.quantity}</td></tr>)}</tbody></table>
        )}
      </section>
      <section className="console-card" aria-labelledby="sec-riwayat">
        <h2 id="sec-riwayat">Riwayat dokumen</h2>
        <table className="console-table"><thead><tr><th scope="col">#</th><th scope="col">Peristiwa</th><th scope="col">Waktu</th><th scope="col">Pelaku (id)</th></tr></thead><tbody>{s.history.map((h) => <tr key={h.seq}><td>{h.seq}</td><td>{h.type}</td><td>{h.at}</td><td>{h.actorUserId}</td></tr>)}</tbody></table>
      </section>
    </div>
  );
}
