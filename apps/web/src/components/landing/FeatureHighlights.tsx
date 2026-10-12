import { Database, ShieldCheck, ShoppingBag, Users, type LucideIcon } from "lucide-react";

const FEATURES: { icon: LucideIcon; lines: [string, string] }[] = [
  { icon: ShoppingBag, lines: ["Transaksi", "Lebih Cepat"] },
  { icon: Database, lines: ["Data Terintegrasi", "dan Akurat"] },
  { icon: ShieldCheck, lines: ["Aman", "dan Terpercaya"] },
  { icon: Users, lines: ["Layanan", "untuk Anggota"] },
];

/** Four highlights: a row on desktop, a 2 × 2 grid on mobile. */
export function FeatureHighlights() {
  return (
    <ul className="lp-features" aria-label="Keunggulan">
      {FEATURES.map(({ icon: Icon, lines }) => (
        <li key={lines.join(" ")} className="lp-feature">
          <span className="lp-feature-icon" aria-hidden="true"><Icon strokeWidth={2} /></span>
          <span className="lp-feature-label"><span>{lines[0]}</span> <span>{lines[1]}</span></span>
        </li>
      ))}
    </ul>
  );
}
