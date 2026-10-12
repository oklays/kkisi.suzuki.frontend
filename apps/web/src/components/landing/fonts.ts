import { Inter } from "next/font/google";

// Self-hosted at build time by next/font: no request to Google at runtime. Scoped to the landing pages only.
export const landingFont = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--lp-font",
});
