import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { currentMember } from '@/lib/auth/session.server';
import { safeNextPath } from '@/lib/navigation/safe-next';
import { ServiceUnavailableError } from '@/lib/errors/service-errors';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Masuk' };

const REASONS: Record<string, string> = {
  'pin-locked': 'PIN salah terlalu sering. Demi keamanan, silakan masuk kembali.',
  expired: 'Sesi berakhir. Silakan masuk kembali.',
  'logged-out': 'Kamu sudah keluar dari aplikasi.',
};

export default async function MasukPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  let signedIn = false;
  try { signedIn = (await currentMember()) !== null; } catch (e) { if (!(e instanceof ServiceUnavailableError)) throw e; }
  if (signedIn) redirect(next);
  const reason = typeof params.reason === 'string' ? REASONS[params.reason] : undefined;
  return (
    <div className="app formpage authpage" data-screen="masuk">
      <header className="topbar">
        <div className="brand"><Image className="landscape-logo" src="/images/logo-landscape.png" width={640} height={222} alt="S-MART KKISI Tambun 2" priority /></div>
      </header>
      <main id="main" className="content">
        <div className="auth-intro">
          <div className="auth-rule" aria-hidden="true" />
          <h1 id="page-title" tabIndex={-1}>Masuk ke S-MART</h1>
          <p>Koperasi Karyawan KKISI TB2 - Bersama Membangun Kesejahteraan</p>
        </div>
        {reason ? <p className="note" role="status" style={{ marginTop: 0, marginBottom: 18 }}>{reason}</p> : null}
        <LoginForm next={next} />
      </main>
    </div>
  );
}
