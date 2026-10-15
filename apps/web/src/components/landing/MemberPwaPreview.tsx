import { ArrowRight, BatteryFull, Bell, ChevronLeft, Ellipsis, HandCoins, HeartHandshake, ReceiptText, ShoppingBag, Signal, TicketPercent, Wallet, Wifi } from "lucide-react";

const SHORTCUTS = [
  { icon: Wallet, label: "Simpanan", tone: "green" },
  { icon: HandCoins, label: "Pinjaman", tone: "blue" },
  { icon: ReceiptText, label: "Transaksi", tone: "orange" },
  { icon: ShoppingBag, label: "Pembelian", tone: "purple" },
  { icon: TicketPercent, label: "Promo", tone: "red" },
  { icon: Ellipsis, label: "Lainnya", tone: "gray" },
];

/** Decorative smartphone with a concept of the future member PWA. Static illustrative values only. */
export function MemberPwaPreview() {
  return (
    <div className="lp-phone">
      <div className="lp-phone-body">
      <div className="lp-phone-screen">
        <div className="lp-pw-head">
          <div className="lp-pw-status"><span>11.06</span><span className="lp-pw-island" /><span><Signal /><Wifi /><BatteryFull /></span></div>
          <div className="lp-pw-nav"><ChevronLeft strokeWidth={2.4} /><Bell strokeWidth={2.2} /></div>
          <p className="lp-pw-hello">Halo,<br /><strong>Anggota KKISI TB2</strong></p>
        </div>
        <div className="lp-pw-balance">
          <span>Saldo Simpanan</span>
          <strong>Rp 2.500.000</strong>
          <ArrowRight strokeWidth={2.4} />
        </div>
        <div className="lp-pw-grid">
          {SHORTCUTS.map(({ icon: Icon, label, tone }) => (
            <span key={label} className="lp-pw-item"><span className={`lp-pw-icon is-${tone}`}><Icon strokeWidth={2.2} /></span>{label}</span>
          ))}
        </div>
        <div className="lp-pw-banner">
          <p>Bersama<br />Membangun<br />Kesejahteraan</p>
          <span className="lp-pw-banner-art"><HeartHandshake strokeWidth={1.8} /></span>
        </div>
        <span className="lp-pw-home" />
      </div>
      </div>
    </div>
  );
}
