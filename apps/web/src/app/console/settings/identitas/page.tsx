import { notFound } from 'next/navigation';
import { listIdentityLinks } from '@koperasi/application/console/identity-links';
import { IdentityLinkManager, type LinkRow } from '@/components/console/IdentityLinkManager';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { consoleServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tautan Akun KOSIPA · KKISI TB2' };

const jakarta = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });

export default async function IdentityLinksPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/settings/identitas' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('iam.link.manage')) return <KosipaNotice state="no-capability" />;
  const services = consoleServices();
  if (!services) return <section className="console-panel" role="status"><h1>Penyimpanan console belum dikonfigurasi</h1><p>Tautan akun memerlukan database console. Hubungi operator.</p></section>;
  let rows: LinkRow[]; let consoleOptions; let kosipaOptions;
  try {
    const [links, consoleUsers, kosipaUsers] = await Promise.all([listIdentityLinks(services, auth), services.directory.listConsoleUsers(), services.directory.listKosipaUsers()]);
    const cName = new Map(consoleUsers.map((u) => [u.id, `${u.fullName || u.username} (${u.username}, ${u.branch})`]));
    const kName = new Map(kosipaUsers.map((u) => [u.id, `${u.fullName || u.username} (${u.username})${u.active ? '' : ' · nonaktif'}`]));
    rows = links.map((l) => ({ id: l.id, consoleLabel: cName.get(l.consoleUserId) ?? `#${l.consoleUserId} (tidak aktif)`, kosipaLabel: kName.get(l.externalUserId) ?? `#${l.externalUserId}`,
      linkedAt: jakarta.format(l.linkedAt), linkedByLabel: cName.get(l.linkedBy) ?? `#${l.linkedBy}` }));
    consoleOptions = consoleUsers.filter((u) => u.id !== auth.ctx.userId).map((u) => ({ id: u.id, label: cName.get(u.id)! }));
    kosipaOptions = kosipaUsers.filter((u) => u.active).map((u) => ({ id: u.id, label: kName.get(u.id)! }));
  } catch { return <section className="console-panel" role="alert"><h1>Layanan tidak tersedia</h1><p>Data tautan tidak dapat dibaca saat ini. Tidak ada perubahan yang dibuat.</p></section>; }
  return (
    <div className="console-page">
      <header className="console-page-head"><h1>Tautan Akun KOSIPA</h1><p>Hubungkan akun console staf dengan akun KOSIPA yang sudah ada. Setiap perubahan tercatat di audit.</p></header>
      <IdentityLinkManager links={rows} consoleUsers={consoleOptions} kosipaUsers={kosipaOptions} csrfToken={auth.services.keys.csrfToken(auth.ctx.sidHash)} />
    </div>
  );
}
