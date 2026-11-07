import { notFound } from 'next/navigation';
import { isProductMasterType } from '@koperasi/domain/kosipa/product-master';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { ProductMasterFormPage } from '../../../product-pages';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ubah Master KOSIPA · KKISI TB2' };

/** Edit + status of one product-master row (FA-03B T06; FD-32 reason for financial edits). */
export default async function EditProductMasterPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!consoleEnabled() || !isProductMasterType(type)) notFound();
  const auth = await requireConsoleSession({ next: `/console/kosipa/master/${type}/${id}/ubah` });
  if (auth.kind !== 'ok') return null;
  return <ProductMasterFormPage type={type} rawId={id} />;
}
