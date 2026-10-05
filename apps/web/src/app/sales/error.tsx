'use client';
import { SalesFeedback } from '@/components/sales/SalesFeedback';
export default function SalesError({ reset }: { reset: () => void }) {
  return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Riwayat belum dapat ditampilkan" text="Terjadi kendala saat membuka halaman. Coba muat kembali." /><button type="button" className="sales-primary" onClick={reset}>Muat kembali halaman</button></main>;
}
