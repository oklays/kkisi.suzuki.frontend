'use client';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { postJson } from '@/lib/api/client';

/** Leaving the PIN step ends the half-finished login (the PIN-stage session is revoked), then returns to Masuk. */
export function PinBackButton() {
  const router = useRouter();
  return (
    <a href="/masuk" className="icon-btn" aria-label="Kembali ke Masuk" onClick={async (e) => { e.preventDefault(); await postJson('/api/auth/logout', {}); router.replace('/masuk'); }}>
      <Icon name="back" />
    </a>
  );
}
