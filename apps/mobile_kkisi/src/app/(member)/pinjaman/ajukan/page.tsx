import type { Metadata } from 'next';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, UnavailableState } from '@/components/feedback/States';
import { LoanApplicationForm } from '@/features/loans/components/LoanApplicationForm';
import { getLoanProducts } from '@/features/loans/services/loans.server';

export const metadata: Metadata = { title: 'Ajukan Pinjaman' };

export default async function AjukanPinjamanPage() {
  const products = await getLoanProducts();
  return (
    <Screen name="pengajuan-pinjaman" footerSpace={74} className="formpage">
      <PageHeader title="Ajukan Pinjaman" subtitle="Pinjaman anggota KKISI TB2" back="/pinjaman" symbol="loan" />
      <main id="main" className="content">
        {products.state !== 'ok' ? <UnavailableState what="Master pinjaman" compact={false} />
          : products.data.length === 0 ? <EmptyState icon="loan" title="Belum ada jenis pinjaman untuk aplikasi">Koperasi belum membuka jenis pinjaman untuk pengajuan dari aplikasi anggota.</EmptyState>
            : <LoanApplicationForm products={products.data} />}
      </main>
    </Screen>
  );
}
