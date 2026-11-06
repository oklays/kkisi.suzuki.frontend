import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { KosipaError } from '@koperasi/domain/kosipa';
import { MASTER_DEFINITIONS } from '@koperasi/domain/kosipa/master';
import { getMemberForEdit, type MemberEditView } from '@koperasi/application/kosipa/commands/member';
import { KosipaPageHeader } from '@/components/console/kosipa/KosipaUI';
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
  return (
    <div className="console-page">
      <Link prefetch={false} className="console-back" href={`/console/kosipa/anggota/${view.id}`}><ArrowLeft size={16} aria-hidden="true" />Kembali ke profil anggota</Link>
      <KosipaPageHeader editable title={<> Ubah anggota </>}>
        <p>{view.fields.nama_kar || 'Anggota'} · NIK {view.fields.nik_kar || '—'} · No. anggota {view.fields.no_anggota || '—'} · {view.fields.doc_no || '—'}</p>
      </KosipaPageHeader>
      {!view.writable && <p className="console-notice" role="note">Perubahan anggota native belum aktif di lingkungan ini (belum dimiliki aplikasi baru, atau menu anggota KOSIPA lama masih aktif). Halaman ini hanya menampilkan data.</p>}
      {view.canChangeStatus && <MemberStatusPanel key={`s-${view.version}`} memberId={view.id} currentStatus={view.fields.status_anggota ?? ''} version={view.version} csrfToken={csrfToken} canSubmit={view.writable} />}
      {view.canUpdate
        ? <section className="console-card" aria-labelledby="member-profile-title"><h2 id="member-profile-title">Profil, kepegawaian, gaji dan rekening</h2>
            <MemberForm key={view.version} mode="edit" memberId={view.id} initial={view.fields} version={view.version} bagian={bagian} lokasi={lokasi} csrfToken={csrfToken} canSubmit={view.writable} /></section>
        : <p className="console-notice" role="note">Anda berwenang mengubah status, tetapi tidak mengubah profil anggota.</p>}
    </div>
  );
}
