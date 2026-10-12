import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { LandingHeader } from "./LandingHeader";
import { MemberPwaPreview } from "./MemberPwaPreview";
import { landingFont } from "./fonts";
import "./landing.css";

/**
 * Member app entry while the PWA does not exist yet. Intentionally no login form and no link to Console Management:
 * members and management stay on separate paths.
 */
export function MemberComingSoon() {
  return (
    <div className={`lp lp-soon-page ${landingFont.variable}`}>
      <LandingHeader linkHome />
      <main className="lp-soon-main">
        <div className="lp-soon-text">
          <span className="lp-soon-icon" aria-hidden="true"><Users strokeWidth={2} /></span>
          <p className="lp-eyebrow">Aplikasi Anggota</p>
          <h1 className="lp-title"><span className="lp-title-blue">Segera Hadir</span></h1>
          <p className="lp-lead">
            Aplikasi untuk anggota koperasi sedang kami siapkan. Nantinya anggota dapat mengecek saldo, transaksi,
            simpanan, pinjaman, dan layanan lainnya langsung dari ponsel.
          </p>
          <p className="lp-soon-note">Untuk sementara, informasi simpanan dan pinjaman dapat ditanyakan langsung kepada pengurus koperasi.</p>
          <Link href="/" className="lp-soon-back"><ArrowLeft aria-hidden="true" strokeWidth={2.2} />Kembali ke beranda</Link>
        </div>
        <div className="lp-soon-visual" role="img" aria-label="Konsep tampilan Aplikasi Anggota">
          <div aria-hidden="true"><MemberPwaPreview /></div>
        </div>
      </main>
    </div>
  );
}
