import { notFound } from 'next/navigation';
import { isProductMasterType } from '@koperasi/domain/kosipa/product-master';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { ProductMasterFormPage } from '../../product-pages';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tambah Master KOSIPA · KKISI TB2' };

/** New product-master row (FA-03B T06). Reference masters are created inline on their list page, so only product types exist here. */
export default async function NewProductMasterPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!consoleEnabled() || !isProductMasterType(type)) notFound();
  const auth = await requireConsoleSession({ next: `/console/kosipa/master/${type}/baru` });
  if (auth.kind !== 'ok') return null;
  return <ProductMasterFormPage type={type} />;
}
