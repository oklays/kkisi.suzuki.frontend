import Image from "next/image";
import Link from "next/link";

/** Landscape brand logo (left) and tagline with blue accent line (right). No navigation items, as in the reference. */
export function LandingHeader({ linkHome = false }: { linkHome?: boolean }) {
  const brand = (
    <>
      <Image
        className="lp-logo"
        src="/illustrations/new-landscape-logo.jpeg"
        width={1024}
        height={355}
        sizes="(min-width: 1440px) 176px, (min-width: 768px) 12vw, 84px"
        alt="SMART KKISI Tambun 2"
        unoptimized
        preload
      />
      <div className="lp-brand-identity">
        <p className="lp-brand-name">Koperasi Karyawan<br />PT Indomobil Suzuki International</p>
        <p className="lp-brand-abbreviation">KKISI TB2</p>
      </div>
    </>
  );
  return (
    <header className="lp-header">
      {linkHome
        ? <Link href="/" className="lp-brand" aria-label="KKISI TB2, kembali ke beranda">{brand}</Link>
        : <div className="lp-brand">{brand}</div>}
      <p className="lp-header-tagline">Bersama<br />Membangun Kesejahteraan</p>
    </header>
  );
}
