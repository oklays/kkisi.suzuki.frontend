import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { PpobServiceForm } from '@/features/ppob/components/PpobServiceForm';
import { ppobService } from '@/features/ppob/services/ppob';
import { requireMember } from '@/lib/auth/session.server';

type Props = { params: Promise<{ layanan: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: ppobService((await params).layanan)?.title ?? 'Layanan' };
}

export default async function LayananPage({ params }: Props) {
  await requireMember();
  const service = ppobService((await params).layanan);
  if (!service) notFound();
  return (
    <Screen name={`layanan-${service.id}`} footerSpace={96} className="formpage">
      <PageHeader title={service.title} subtitle={service.subtitle} back="/beranda" symbol={service.symbol} />
      <main id="main" className="content"><PpobServiceForm serviceId={service.id} /></main>
    </Screen>
  );
}
