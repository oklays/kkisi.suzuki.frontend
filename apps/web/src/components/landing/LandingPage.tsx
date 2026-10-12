import { AccessCards } from "./AccessCards";
import { FeatureHighlights } from "./FeatureHighlights";
import { HeroContent } from "./HeroContent";
import { HeroVisualization } from "./HeroVisualization";
import { LandingHeader } from "./LandingHeader";
import { landingFont } from "./fonts";
import "./landing.css";

/**
 * Public landing page. Server-rendered and static: no client JavaScript, no data access.
 * DOM order is the mobile reading order (brand, heading, both entry cards, illustration, highlights); on desktop the
 * illustration is lifted out of the flow to the right-hand side.
 */
export function LandingPage() {
  return (
    <div className={`lp ${landingFont.variable}`}>
      <LandingHeader />
      <main className="lp-main">
        <div className="lp-content">
          <HeroContent />
          <AccessCards />
        </div>
        <HeroVisualization />
        <FeatureHighlights />
      </main>
    </div>
  );
}
