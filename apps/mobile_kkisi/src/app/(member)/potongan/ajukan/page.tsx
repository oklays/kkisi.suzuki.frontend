import type { Metadata } from 'next';
import { Screen } from '@/components/layout/Screen';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState, UnavailableState } from '@/components/feedback/States';
import { DeductionChangeForm } from '@/features/deductions/components/DeductionChangeForm';
import { getActiveDeductions } from '@/features/savings/services/savings.server';
import { getProfile } from '@/features/member/services/member.server';
import { businessMonth, monthLong } from '@/lib/utils/dates';
import { featureFlags } from '@/server/container';

export const metadata: Metadata = { title: 'Pengajuan Potongan' };

export default async function PengajuanPotonganPage() {
  const [profile, deductions] = await Promise.all([getProfile(), getActiveDeductions()]);
  const effective = monthLong(businessMonth(new Date(), 1).key);
  const flags = featureFlags();
  return (
    <Screen name="pengajuan-potongan" footerSpace={74} className="formpage">
      <PageHeader title="Pengajuan Potongan" subtitle="Simpanan" back="/potongan" symbol="document" />
      <main id="main" className="content">
        {deductions.state !== 'ok' ? <UnavailableState what="Potongan simpanan" compact={false} />
          : deductions.data.length === 0 ? <EmptyState icon="receipt" title="Belum ada potongan simpanan">Tidak ada potongan simpanan aktif yang dapat diubah. Hubungi pengurus koperasi.</EmptyState>
            : <DeductionChangeForm section={profile.section ?? '-'} effective={effective} options={deductions.data.map((d) => ({ type: d.type, label: d.label, monthlySen: d.monthlySen }))} enabled={flags.enableDeductionChange} />}
      </main>
    </Screen>
  );
}
