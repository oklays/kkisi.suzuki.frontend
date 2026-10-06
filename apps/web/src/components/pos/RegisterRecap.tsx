import { ChartColumnIncreasing, Check, Eye, FileText, Info, Printer, QrCode, Users, Wallet, X } from "lucide-react";
import { formatRupiah } from "./preview";
import "./register-recap.css";

export type RegisterRecapData = {
  saldoAwal: string;
  saldoAkhir: string;
  saldoKredit: string;
  saldoQris?: string;
  transactionCount: number;
  discountTotal: string;
  /** Sales returns refunded during the session (Next.js returns): Cash left the drawer, Kredit lowered member bills. */
  refundCash?: string;
  refundKredit?: string;
  returnCount?: number;
};

export function RegisterRecap({ recap, onFinish }: { recap: RegisterRecapData; onFinish: () => void }) {
  const opening = Math.round(Number(recap.saldoAwal) * 100);
  const closing = Math.round(Number(recap.saldoAkhir) * 100);
  const refundCash = Math.round(Number(recap.refundCash ?? "0") * 100);
  const refundKredit = Math.round(Number(recap.refundKredit ?? "0") * 100);
  // saldo_akhir already has the cash refunds taken out: add them back to show the gross Cash sales.
  const cash = closing - opening + refundCash;
  const credit = Math.round(Number(recap.saldoKredit) * 100);
  const qris = Math.round(Number(recap.saldoQris ?? "0") * 100);
  // Cash, credit, and QRIS already sum grand_total (after discount); never subtract discount twice.
  const totalSales = cash + credit + qris - refundCash - refundKredit;
  const cards = [
    { label: "Saldo Awal", value: formatRupiah(opening), icon: Wallet, tone: "blue" },
    { label: "Total Penjualan", value: formatRupiah(totalSales), icon: ChartColumnIncreasing, tone: "green" },
    { label: "Non-Tunai (QRIS)", value: formatRupiah(qris), icon: QrCode, tone: "purple" },
    { label: "Kredit Anggota", value: formatRupiah(credit), icon: Users, tone: "orange" },
    { label: "Jumlah Transaksi", value: `${recap.transactionCount} transaksi`, icon: FileText, tone: "purple" },
  ];
  const rows = [
    ["Penjualan Tunai", formatRupiah(cash)],
    ["Penjualan QRIS", formatRupiah(qris)],
    ["Penjualan Kredit", formatRupiah(credit)],
    ["Diskon / Penyesuaian", formatRupiah(Math.round(Number(recap.discountTotal) * 100))],
    ...(recap.returnCount ? [
      [`Retur Tunai (refund laci)`, `−${formatRupiah(refundCash)}`],
      [`Retur Kredit (potong tagihan)`, `−${formatRupiah(refundKredit)}`],
    ] : []),
    [recap.returnCount ? "Total Sales (bersih retur)" : "Total Sales", formatRupiah(totalSales)],
    ["Setoran Kas", formatRupiah(closing)],
    ["Saldo Akhir Sistem", formatRupiah(closing)],
  ];

  return <>
    <header className="pos-recap-header">
      <span className="pos-recap-emblem" aria-hidden="true"><FileText size={38} strokeWidth={2} /><Eye className="pos-recap-emblem-eye" size={20} strokeWidth={2.5} /></span>
      <div><h2 id="pos-register-title">Rekap Tutup Kasir</h2><p>Ringkasan penutupan shift / toko hari ini.</p></div>
      <button className="pos-recap-close" type="button" aria-label="Tutup rekap" onClick={onFinish} autoFocus><X size={24} /></button>
    </header>
    <div className="pos-recap-cards">
      {cards.map(({ label, value, icon: Icon, tone }) => <div className={`pos-recap-card pos-recap-card-${tone}`} key={label}>
        <span className="pos-recap-card-icon" aria-hidden="true"><Icon size={28} strokeWidth={2} /></span>
        <div><span>{label}</span><strong>{value}</strong></div>
      </div>)}
    </div>
    <section className="pos-recap-finances" aria-labelledby="pos-recap-finances-title">
      <h3 id="pos-recap-finances-title"><FileText size={24} aria-hidden="true" />Rincian Keuangan</h3>
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </section>
    <div className="pos-recap-status" role="status">
      <span aria-hidden="true"><Check size={25} strokeWidth={3} /></span>
      <p>Status Rekap: <strong>Sesuai</strong></p>
    </div>
    <aside className="pos-recap-notes"><Info size={27} aria-hidden="true" /><div><h3>Catatan</h3><p>Rekap kas telah tersimpan. Semua transaksi telah tersimpan.</p></div></aside>
    <footer className="pos-recap-actions">
      <button className="pos-recap-print" type="button" onClick={() => window.print()}><Printer size={23} />Cetak Rekap</button>
      <button className="pos-recap-finish" type="button" onClick={onFinish}><Check size={25} />Selesaikan Tutup Kasir</button>
    </footer>
  </>;
}
