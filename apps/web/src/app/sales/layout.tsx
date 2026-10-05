import { PosHeader, PosShell } from '@/components/pos/PosShell';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
import { requirePagePermission } from '@/infrastructure/auth/page-guard';
import { buildSalesSession } from '@/infrastructure/sales/page-session';
import '@/components/pos/pos.css';
import '@/components/sales/sales.css';

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePagePermission('sales_view');
  if (auth.kind !== 'ok') return <main className="sales-access"><SalesFeedback title={auth.kind === 'forbidden' ? 'Akses ditolak' : 'Layanan tidak tersedia'} text={auth.kind === 'forbidden' ? 'Akun Anda tidak memiliki izin melihat riwayat transaksi.' : 'Riwayat transaksi belum dapat dibuka. Coba lagi nanti.'} retry={auth.kind === 'unavailable'} /></main>;
  let session;
  try { session = await buildSalesSession(auth); }
  catch { return <main className="sales-access"><SalesFeedback title="Layanan tidak tersedia" text="Informasi cabang dan navigasi belum dapat dimuat." retry /></main>; }
  return <PosShell branchName={session.branchName} session={session} active="sales">
    <PosHeader session={session} title="Riwayat Transaksi" subtitle="Penjualan dan bukti transaksi cabang aktif" showRegisterControls={false} />
    <div className="sales-scroll" key={`${session.userId}:${session.companyId}`}>{children}</div>
  </PosShell>;
}
