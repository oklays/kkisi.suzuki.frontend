'use client';
import { useRouter } from 'next/navigation';
import { Icon } from '../ui/Icon';
import { inAppDepth } from './RouteTracker';

/**
 * Back like the device back button: browser history when the member navigated here inside the app, otherwise the screen's
 * logical parent (deep link, refresh, or a freshly launched installed app). Without JavaScript it is a plain link to the parent.
 */
export function BackButton({ fallback, label = 'Kembali ke halaman sebelumnya' }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <a href={fallback} className="icon-btn" aria-label={label}
      onClick={(e) => { e.preventDefault(); if (inAppDepth() > 1) router.back(); else router.replace(fallback); }}>
      <Icon name="back" />
    </a>
  );
}
