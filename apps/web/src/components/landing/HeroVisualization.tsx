import Image from "next/image";
import { ConsolePreview } from "./ConsolePreview";
import { MemberPwaPreview } from "./MemberPwaPreview";

/**
 * Right-side composition: dealership backdrop (the project's own Suzuki branch illustration), blue ribbons, the
 * console monitor and the member phone. One labelled image for assistive technologies; every part is decorative.
 * All parts are positioned in % of a fixed-aspect stage so the composition scales as one piece.
 */
export function HeroVisualization() {
  return (
    <div className="lp-visual" role="img" aria-label="Pratinjau Console Management dan konsep Aplikasi Anggota di depan kantor dealer Suzuki">
      <div className="lp-stage" aria-hidden="true">
        <div className="lp-backdrop">
          <Image
            className="lp-backdrop-img"
            src="/illustrations/brand-background-mobile.png"
            width={941}
            height={1672}
            alt=""
            priority
            sizes="(min-width: 1024px) 60vw, 100vw"
          />
        </div>
        <svg className="lp-ribbons" viewBox="0 500 890 400" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="lp-ribbon-light" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#dce8ff" stopOpacity="0" />
              <stop offset=".45" stopColor="#c9dcff" stopOpacity=".85" />
              <stop offset="1" stopColor="#a9c6ff" />
            </linearGradient>
            <linearGradient id="lp-ribbon-main" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#0a3fc9" />
              <stop offset=".55" stopColor="#1f5ee8" />
              <stop offset="1" stopColor="#3b7bf6" />
            </linearGradient>
            <linearGradient id="lp-ribbon-shine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset=".6" stopColor="#ffffff" stopOpacity=".55" />
              <stop offset="1" stopColor="#ffffff" stopOpacity=".2" />
            </linearGradient>
          </defs>
          <path d="M-40 900 C 240 850 520 724 890 560 L 890 900 Z" fill="url(#lp-ribbon-light)" />
          <path d="M40 900 C 320 860 590 744 890 640 L 890 900 Z" fill="url(#lp-ribbon-main)" />
          <path d="M170 900 C 420 852 650 756 890 678" fill="none" stroke="url(#lp-ribbon-shine)" strokeWidth="5" />
        </svg>
        <ConsolePreview />
        <MemberPwaPreview />
      </div>
    </div>
  );
}
