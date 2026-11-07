import { PageBreadcrumbs } from '@/components/console/PageBreadcrumbs';
import { notFound } from 'next/navigation';
import { hasWriteCapability } from '@koperasi/application/kosipa/commands/pipeline';
import { MasterDataDirectory } from '@/components/console/kosipa/MasterDataDirectory';
import { MASTER_DIRECTORY, RETIRED_MASTERS } from '@/components/console/kosipa/master-data-catalog';
import styles from '@/components/console/kosipa/master-data.module.css';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Master Data KOSIPA · KKISI TB2' };

export default async function KosipaMasterIndexPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/master' });
  if (auth.kind !== 'ok') return null;
  if (auth.kosipa !== 'linked' && auth.kosipa !== 'role') return <KosipaNotice state={auth.kosipa} />;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state="no-capability" />;
  return (
    <div className={`console-page ${styles.page}`}>
      <PageBreadcrumbs />
      <MasterDataDirectory entries={MASTER_DIRECTORY} retired={RETIRED_MASTERS} canManage={hasWriteCapability(auth, 'kosipa.master.manage')} />
    </div>
  );
}
