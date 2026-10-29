import { notFound } from 'next/navigation';
import OperatorWorkbench from '@/components/public-savings/OperatorWorkbench';
import '@/components/public-savings/public-savings.css';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { createPublicSavingsOperatorAuthorizer, loadPublicSavingsOperatorPolicy } from '@/infrastructure/public-savings/operator-authorization';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pengajuan simpanan sukarela · KOSIPA · KKISI TB2', robots: { index: false, follow: false } };

export default async function PublicSavingsManagementPage() {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa/simpanan-sukarela' });
  if (auth.kind !== 'ok') return <p role="alert">Layanan otorisasi belum tersedia.</p>;
  // Registered in navigation; operational access stays behind the explicit deployment flag and policy file.
  if (process.env.PSS_OPERATOR_AUTH !== 'CONSOLE') return <p role="status">Pengajuan simpanan sukarela belum diaktifkan untuk konsol ini.</p>;
  let allowed = false;
  let unavailable = false;
  let csrfToken = '';
  try {
    const policy = await loadPublicSavingsOperatorPolicy();
    // Page guard already validated the real session and resolved these capabilities on the server.
    const authorize = createPublicSavingsOperatorAuthorizer({ policy, guard: async () => ({ ok: true, ctx: auth.ctx }), capabilities: async () => auth.capabilities });
    const result = await authorize(new Request('http://localhost/console/kosipa/simpanan-sukarela'), 'VIEW_SUBMISSIONS');
    allowed = 'actor' in result;
    if (allowed) csrfToken = auth.services.keys.csrfToken(auth.ctx.sidHash);
  } catch { unavailable = true; }
  if (unavailable) return <p role="alert">Konfigurasi akses pengajuan simpanan sukarela belum tersedia.</p>;
  if (!allowed) return <p role="alert">Akses pengajuan simpanan sukarela tidak tersedia untuk akun ini.</p>;
  return <OperatorWorkbench authMode="CONSOLE" csrfToken={csrfToken} />;
}
