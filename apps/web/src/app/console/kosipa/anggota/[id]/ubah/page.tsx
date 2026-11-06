import { notFound } from 'next/navigation';
import { KosipaError } from '@koperasi/domain/kosipa';
import { MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/master';
import { getMemberForEdit, type MemberEditView } from '@koperasi/application/kosipa/commands/member';
import { ContextNotice } from '@/components/console/kosipa/KosipaUI';
import { MEMBERS_PATH, MemberFormHeader, MemberIdentityBar } from '@/components/console/kosipa/MemberProfileUI';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { MemberForm } from '@/components/console/kosipa/MemberForm';
import { MemberStatusPanel } from '@/components/console/kosipa/MemberStatusPanel';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { kosipaCommandServices } from '@/infrastructure/console/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ubah Anggota · KOSIPA · KKISI TB2' };

/** Native member profile + status (FA-03B, REQ-109/110). The edit record carries bank/salary, so it needs a member write grant, not just view. */
export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  if (!consoleEnabled()) notFound();
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) notFound();
  const auth = await requireConsoleSession({ next: `/console/kosipa/anggota/${id}/ubah` });
  if (auth.kind !== 'ok') return null;
  if (!auth.capabilities.has('kosipa.member.view')) return <KosipaNotice state={auth.kosipa === 'linked' ? 'linked' : auth.kosipa} />;
  const services = kosipaCommandServices();
  if (!services) return <KosipaNotice state="unavailable" />;
  let view: MemberEditView, bagian: string[], lokasi: string[];
  try {
    view = await getMemberForEdit(services, { capabilities: auth.capabilities, kosipaUserId: auth.kosipaUserId }, id);
    const [b, l] = await Promise.all([services.masters.list(MASTER_DEFINITIONS.bagian), services.masters.list(MASTER_DEFINITIONS.lokasi)]);
    const active = (rows: typeof b) => rows.filter((r) => r.active).map((r) => r.values.name ?? '').filter(Boolean);
    bagian = active(b); lokasi = active(l);
  } catch (error) {
    if (error instanceof KosipaError && error.code === 'FORBIDDEN') return <KosipaNotice state="no-capability" />;
    if (error instanceof KosipaError && error.code === 'MEMBER_NOT_FOUND') notFound();
    return <KosipaNotice state="unavailable" />;
  }
  const csrfToken = auth.services.keys.csrfToken(auth.ctx.sidHash);
  const name = view.fields.nama_kar || 'Anggota';
  return (
    <div className="console-page mform-page">
      <MemberFormHeader tail={[{ label: name, href: `${MEMBERS_PATH}/${view.id}`, icon: 'member' }, { label: 'Ubah', icon: 'edit' }]} title="Ubah anggota" />
      <MemberIdentityBar name={name} chips={[{ label: 'NIK', value: view.fields.nik_kar || null }, { label: 'No. anggota', value: view.fields.no_anggota || null }, { label: 'No. dokumen', value: view.fields.doc_no || null }]} />
      {!view.writable && <ContextNotice title="Perubahan belum aktif" tone="warning">Perubahan anggota native belum aktif di lingkungan ini (belum dimiliki aplikasi baru, atau menu anggota KOSIPA lama masih aktif). Halaman ini hanya menampilkan data.</ContextNotice>}
      {view.canChangeStatus && <MemberStatusPanel key={`s-${view.version}`} memberId={view.id} currentStatus={view.fields.status_anggota ?? ''} version={view.version} csrfToken={csrfToken} canSubmit={view.writable} />}
      {view.canUpdate
        ? <MemberForm key={view.version} mode="edit" memberId={view.id} initial={view.fields} version={view.version} bagian={bagian} lokasi={lokasi} csrfToken={csrfToken} canSubmit={view.writable} />
        : <ContextNotice title="Hanya status yang dapat diubah">Anda berwenang mengubah status, tetapi tidak mengubah profil anggota.</ContextNotice>}
    </div>
  );
}
