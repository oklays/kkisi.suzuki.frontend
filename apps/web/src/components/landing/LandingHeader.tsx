import Image from "next/image";
import Link from "next/link";

/** Landscape brand logo (left) and tagline with blue accent line (right). No navigation items, as in the reference. */
export function LandingHeader({ linkHome = false }: { linkHome?: boolean }) {
  const logo = (
    <Image
      className="lp-logo"
      src="/illustrations/kopkar-landscape-logo.png"
      width={1671}
      height={299}
      sizes="(min-width: 1280px) 291px, (min-width: 768px) 246px, 201px"
      alt="Koperasi Smart Suzuki"
      priority
    />
  );
  return (
    <header className="lp-header">
      {linkHome
        ? <Link href="/" className="lp-brand" aria-label="Koperasi Smart Suzuki, kembali ke beranda">{logo}</Link>
        : <div className="lp-brand">{logo}</div>}
      <p className="lp-header-tagline">Bersama<br />Membangun Kesejahteraan</p>
    </header>
  );
}
