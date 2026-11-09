'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

/** Re-runs the server render of the current screen (manual retry for a failed section). */
export function RetryButton({ label = 'Coba lagi' }: { label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className="secondary" style={{ width: '100%', marginTop: 15 }} disabled={pending} onClick={() => start(() => router.refresh())}>
      {pending ? 'Memuat ulang…' : label}
    </button>
  );
}
