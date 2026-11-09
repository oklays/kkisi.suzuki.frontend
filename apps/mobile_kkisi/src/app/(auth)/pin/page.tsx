import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { PinPad } from '@/features/auth/components/PinPad';
import { PinBackButton } from '@/features/auth/components/PinBackButton';
import { currentMember, currentPinSession } from '@/lib/auth/session.server';
import { safeNextPath } from '@/lib/navigation/safe-next';
import { PIN_LENGTH } from '@/server/auth/policy';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Masukkan PIN' };

export default async function PinPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  if (await currentMember()) redirect(next);
  if (!(await currentPinSession())) redirect(`/masuk?reason=expired&next=${encodeURIComponent(next)}`);
  return (
    <div className="app formpage authpage pinpage" data-screen="pin">
      <header className="topbar">
        <PinBackButton />
        <div className="brand"><Image className="landscape-logo" src="/images/logo-landscape.png" width={640} height={222} alt="S-MART KKISI Tambun 2" priority /></div>
      </header>
      <main id="main" className="content">
        <div className="auth-intro">
          <div className="auth-rule" aria-hidden="true" />
          <h1 id="page-title" tabIndex={-1}>Masukkan PIN</h1>
          <p>Verifikasi PIN untuk masuk ke aplikasi</p>
        </div>
        <PinPad length={PIN_LENGTH} next={next} />
      </main>
    </div>
  );
}
