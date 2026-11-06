import { notFound } from 'next/navigation';
import { MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/master';
import { ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { MemberFormHeader } from '@/components/console/kosipa/MemberProfileUI';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { MemberForm } from '@/components/console/kosipa/MemberForm';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaCommandServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Daftarkan Anggota · KOSIPA · KKISI TB2' };

/** Native member registration (FA-03B, REQ-108). Reached from /console/kosipa/anggota. Every rule is enforced again by POST /api/kosipa/members. */
export default async function NewMemberPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/anggota/baru' });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  if (!auth.capabilities.has('kosipa.member.create')) return <KosipaNotice state="no-capability" />;
  const services = kosipaCommandServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let bagian: string[], lokasi: string[], writable: boolean;
  try {
    const [b, l, legacy] = await Promise.all([services.masters.list(MASTER_DEFINITIONS.bagian), services.masters.list(MASTER_DEFINITIONS.lokasi), services.members.fenceState()]);
    const active = (rows: typeof b) => rows.filter((r) => r.active).map((r) => r.values.name ?? '').filter(Boolean);
    bagian = active(b); lokasi = active(l); writable = services.ownership.owns('member') && legacy === 'fenced';
  } catch { return <KosipaNotice state="unavailable" />; }
  return (
    <div className="console-page mform-page">
      <MemberFormHeader title="Daftarkan anggota">
        Isi data anggota baru. Isian bertanda * wajib.
      </MemberFormHeader>
      {!writable && <ContextNotice title="Pendaftaran belum aktif" tone="warning">Pendaftaran anggota native belum aktif di lingkungan ini (belum dimiliki aplikasi baru, atau menu anggota KOSIPA lama masih aktif). Formulir ini tidak dapat dikirim.</ContextNotice>}
      <MemberForm mode="register" bagian={bagian} lokasi={lokasi} csrfToken={auth.services.keys.csrfToken(auth.ctx.sidHash)} canSubmit={writable} />
    </div>
  );
}
