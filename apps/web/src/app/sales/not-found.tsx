import { SalesFeedback } from '@/components/sales/SalesFeedback';
export default function SaleNotFound() {
  return <main className="sales-workspace" id="pos-workspace"><SalesFeedback title="Transaksi tidak ditemukan" text="Transaksi tidak tersedia pada cabang aktif. Kembali ke riwayat untuk memilih transaksi lain." /></main>;
}
