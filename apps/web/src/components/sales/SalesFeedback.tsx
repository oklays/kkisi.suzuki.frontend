'use client';

import Link from './SalesLink';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

export function SalesFeedback({ title, text, retry = false }: { title: string; text: string; retry?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="sales-feedback" role="alert"><AlertCircle size={28} aria-hidden="true" /><h2>{title}</h2><p>{text}</p><div>
    {retry && <button className="sales-primary" disabled={pending} onClick={() => startTransition(() => router.refresh())}><RotateCcw size={15} aria-hidden="true" />{pending ? 'Memuat kembali…' : 'Coba lagi'}</button>}
    <Link className="sales-secondary" href="/sales">Kembali ke riwayat</Link>
    <Link className="sales-text-link" href="/">Menu utama</Link>
  </div></section>;
}
