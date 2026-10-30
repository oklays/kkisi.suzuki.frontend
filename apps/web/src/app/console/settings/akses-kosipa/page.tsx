import { notFound } from 'next/navigation';
import { listKosipaGrants } from '@koperasi/application/console/kosipa-grants';
import { GRANTABLE_KOSIPA_CAPABILITIES } from '@koperasi/domain/console/capabilities';
import { KosipaGrantManager, type GrantRow } from '@/components/console/KosipaGrantManager';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaGrantServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hak Ubah KOSIPA · KKISI TB2' };

const jakarta = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
const CAPABILITY_LABEL: Record<string, string> = { 'kosipa.master.manage': 'Kelola master data KOSIPA' };

export default async function KosipaAccessPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/settings/akses-kosipa' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('iam.kosipa.grant')) return <KosipaNotice state="no-capability" />;
  const services = kosipaGrantServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let rows: GrantRow[]; let users;
  try {
    const [grants, links, consoleUsers] = await Promise.all([listKosipaGrants(services, auth), services.links.listActive(), services.directory.listConsoleUsers()]);
    const name = new Map(consoleUsers.map((u) => [u.id, `${u.fullName || u.username} (${u.username}, ${u.branch})`]));
    const me = auth.ctx.userId;
    rows = grants.filter((g): g is typeof g & { status: 'pending' | 'active' } => g.status === 'pending' || g.status === 'active').map((g) => ({
      id: g.id, status: g.status, userLabel: name.get(g.consoleUserId) ?? `#${g.consoleUserId}`, capabilityLabel: CAPABILITY_LABEL[g.capability] ?? g.capability,
      requestedAt: jakarta.format(g.requestedAt), requestedByLabel: name.get(g.requestedBy) ?? `#${g.requestedBy}`, expiresAt: jakarta.format(g.expiresAt),
      decidedByLabel: g.decidedBy === null ? null : name.get(g.decidedBy) ?? `#${g.decidedBy}`,
      // Presentation only: the server refuses the same cases (SELF_APPROVAL, SELF_GRANT).
      canApprove: g.requestedBy !== me && g.consoleUserId !== me, canReject: g.consoleUserId !== me,
    }));
    const linked = new Set(links.map((l) => l.consoleUserId));
    users = consoleUsers.filter((u) => linked.has(u.id) && u.id !== auth.ctx.userId).map((u) => ({ id: u.id, label: name.get(u.id)! }));
  } catch { return <section className="console-panel" role="alert"><h1>Layanan tidak tersedia</h1><p>Data hak tidak dapat dibaca saat ini. Tidak ada perubahan yang dibuat.</p></section>; }
  return (
    <div className="console-page">
      <header className="console-page-head"><h1>Hak Ubah KOSIPA</h1><p>Ajukan, setujui (oleh administrator kedua), tolak, atau cabut hak ubah KOSIPA untuk akun console yang sudah ditautkan. Setiap langkah tercatat di audit.</p></header>
      <KosipaGrantManager grants={rows} users={users} capabilities={GRANTABLE_KOSIPA_CAPABILITIES.map((c) => ({ id: c, label: CAPABILITY_LABEL[c] ?? c }))} csrfToken={auth.services.keys.csrfToken(auth.ctx.sidHash)} />
    </div>
  );
}
