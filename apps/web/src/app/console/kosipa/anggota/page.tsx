import { notFound } from 'next/navigation';
import { listMemberDirectory, readMemberCounts, type MemberCounts, type MemberDirectory } from '@koperasi/application/kosipa/member-360';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { MembershipPageHeader, MembershipStats, MembershipWorkspace } from '@/components/console/kosipa/MembershipUI';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keanggotaan · KOSIPA · KKISI TB2' };

/**
 * Member directory. Search text and filters arrive through the private POST (PrivateWorkspace -> searchKosipa) and stay out of the URL;
 * a plain GET shows the default list (status AKTIVE, 10 per page). Every capability and parser check is unchanged.
 */
export default async function MemberDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/anggota' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaServices();
  if (!services) return <KosipaNotice state="unavailable" />;

  const params = await searchParams;
  const canCreate = auth.capabilities.has('kosipa.member.create');
  const canUpdate = auth.capabilities.has('kosipa.member.update');
  const canWrite = canCreate || canUpdate || auth.capabilities.has('kosipa.member.status');

  // The summary counts and the list fail independently: a slow count never hides the table, and vice versa.
  const [list, summary] = await Promise.allSettled([
    listMemberDirectory(services.members, auth.capabilities, params),
    readMemberCounts(services.members, auth.capabilities),
  ]);
  const directory: MemberDirectory | null = list.status === 'fulfilled' ? list.value : null;
  const counts: MemberCounts | null = summary.status === 'fulfilled' ? summary.value : null;

  return (
    <div className="console-page membership-page">
      <MembershipPageHeader readOnly={!canWrite} />
      <MembershipStats counts={counts} canCreate={canCreate} />
      <MembershipWorkspace directory={directory} canUpdate={canUpdate} failed={list.status === 'rejected'} />
    </div>
  );
}
