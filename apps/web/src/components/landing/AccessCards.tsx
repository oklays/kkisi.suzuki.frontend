import Link from "next/link";
import { ArrowRight, Monitor, Users } from "lucide-react";
import { CONSOLE_HREF, MEMBER_APP_AVAILABLE, MEMBER_APP_HREF } from "./destinations";

/** The two application entry points. Each whole card is one link; hover/focus styles live in landing.css. */
export function AccessCards() {
  return (
    <nav className="lp-access" aria-label="Pilih aplikasi">
      <Link href={CONSOLE_HREF} className="lp-card lp-card-console">
        <span className="lp-card-icon" aria-hidden="true"><Monitor strokeWidth={1.9} /></span>
        <span className="lp-card-body">
          <span className="lp-card-kicker">Masuk ke</span>
          <span className="lp-card-title">Console Management</span>
          <span className="lp-card-desc">Untuk pengelola, kasir, dan operasional</span>
        </span>
        <ArrowRight className="lp-card-arrow" aria-hidden="true" strokeWidth={2.2} />
      </Link>
      <Link href={MEMBER_APP_HREF} className="lp-card lp-card-member">
        <span className="lp-card-icon" aria-hidden="true"><Users strokeWidth={2} /></span>
        <span className="lp-card-body">
          <span className="lp-card-kicker">Masuk ke</span>
          <span className="lp-card-title">Aplikasi Anggota</span>
          <span className="lp-card-desc">Cek saldo, transaksi, simpanan, pinjaman, dan layanan lainnya</span>
        </span>
        <ArrowRight className="lp-card-arrow" aria-hidden="true" strokeWidth={2.2} />
        {!MEMBER_APP_AVAILABLE && <span className="lp-soon">Segera hadir</span>}
      </Link>
    </nav>
  );
}
