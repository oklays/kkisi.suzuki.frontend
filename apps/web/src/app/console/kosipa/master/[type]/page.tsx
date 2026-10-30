import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listMaster } from '@koperasi/application/kosipa/commands/master';
import { MASTER_TYPES } from '@koperasi/domain/kosipa/master';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { MasterDataManager } from '@/components/console/kosipa/MasterDataManager';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaCommandServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Master Data KOSIPA · KKISI TB2' };

/** One KOSIPA reference master (F52): Lokasi, Bagian, Jenis Dokumen, Rekening Bank, Periode Angsuran. Reached from /console/kosipa/master. */
export default async function KosipaMasterPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!consoleEnabled() || !(MASTER_TYPES as readonly string[]).includes(type)) notFound();
  const auth = await requireConsoleSession({ next: `/console/kosipa/master/${type}` });
  if (auth.kind !== 'ok') return null;
  if (auth.kosipa !== 'linked') return <KosipaNotice state={auth.kosipa} />;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state="no-capability" />;
  const services = kosipaCommandServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let data;
  try { data = await listMaster(services, { capabilities: auth.capabilities, kosipaUserId: auth.kosipaUserId }, type); }
  catch { return <section className="console-panel" role="alert"><h1>Layanan tidak tersedia</h1><p>Master data tidak dapat dibaca saat ini. Tidak ada perubahan yang dibuat.</p></section>; }
  const def = data.definition;
  return (
    <div className="console-page">
      <header className="kosipa-page-head">
        <p className="kosipa-eyebrow"><Link href="/console/kosipa/master">Master data</Link> <span>/</span> {def.title.replace('Master ', '')}</p>
        <div className="kosipa-title-row"><h1>{def.title}</h1><span className="kosipa-provenance">KOSIPA: {def.legacyController}</span></div>
      </header>
      <MasterDataManager definition={def} rows={data.rows} canManage={data.canManage} writable={data.writable} legacyActive={data.legacy === 'legacy-active'} csrfToken={auth.services.keys.csrfToken(auth.ctx.sidHash)} />
    </div>
  );
}
