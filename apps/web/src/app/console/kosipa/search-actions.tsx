'use server';

import { notFound } from 'next/navigation';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { privateSearchTarget } from '@/components/console/kosipa/presentation';
import MemberSearchPage from './anggota/page';
import SavingsSearchPage from './simpanan/page';
import LoanListPage from './pinjaman/daftar/page';
import LoanProductPage from './pinjaman/produk/[produk]/page';
import LoanSettlementsPage from './pinjaman/pelunasan/page';
import LoanRolloversPage from './pinjaman/roll-over/page';
import PayrollBatchPage from './payroll/[docNo]/page';
import PayrollReconciliationPage from './payroll/[docNo]/rekonsiliasi/page';

/** Presentation-only POST. Every destination re-runs its existing capability, parser, audit and bounded reader. */
export async function searchKosipa(path: string, form: FormData) {
  if (!consoleEnabled()) notFound();
  const target = privateSearchTarget(path);
  if (!target) return <KosipaNotice state="no-capability" />;
  const auth = await requireConsoleSession({ next: path });
  if (auth.kind !== 'ok') return <KosipaNotice state="unavailable" />;
  const params: Record<string, string> = {};
  if (!form.has('_reset')) {
    for (const key of ['q', 'status', 'cair', 'bayar', 'periode', 'produk', 'segmen', 'keterangan', 'grup', 'karyawan', 'size', 'page', 'after', 'all']) {
      const value = form.get(key);
      if (typeof value === 'string') params[key] = value.slice(0, key === 'after' ? 512 : 50);
    }
  }
  const searchParams = Promise.resolve(params);
  if (target.kind === 'members') return MemberSearchPage({ searchParams });
  if (target.kind === 'savings') return SavingsSearchPage({ searchParams });
  if (target.kind === 'loans') return LoanListPage({ searchParams });
  if (target.kind === 'loanProduct') return LoanProductPage({ params: Promise.resolve({ produk: target.product! }), searchParams });
  if (target.kind === 'settlements') return LoanSettlementsPage({ searchParams });
  if (target.kind === 'rollovers') return LoanRolloversPage({ searchParams });
  const pageParams = Promise.resolve({ docNo: target.docNo! });
  if (target.kind === 'reconciliation') return PayrollReconciliationPage({ params: pageParams, searchParams });
  return PayrollBatchPage({ params: pageParams, searchParams });
}
