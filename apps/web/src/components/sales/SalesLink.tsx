'use client';
import NextLink, { useLinkStatus } from 'next/link';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

function NavigationHint() {
  const { pending } = useLinkStatus();
  return <span className="sales-link-hint" data-pending={pending || undefined} role="status">{pending && <><LoaderCircle size={12} className="sales-spin" aria-hidden="true" /><span className="pos-sr-only">Memuat halaman…</span></>}</span>;
}
export default function SalesLink({ children, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props}>{children}<NavigationHint /></NextLink>;
}
