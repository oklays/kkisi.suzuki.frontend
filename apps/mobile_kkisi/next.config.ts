import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
// One value per build: it names the service-worker caches, so every deployment retires the previous static cache.
const build = `${version}-${Date.now().toString(36)}`;

// Applied to every response. The CSP allows only same-origin resources (fonts are self-hosted by next/font); Next's inline
// bootstrap scripts need 'unsafe-inline' unless a nonce proxy is added (documented in 06_PWA_STRATEGY.md).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR && /^\.next-[a-z0-9-]{1,40}$/.test(process.env.NEXT_DIST_DIR) ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  poweredByHeader: false,
  env: { APP_VERSION: version, APP_BUILD: build },
  turbopack: { root: fileURLToPath(new URL("../../", import.meta.url)) },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Member data is never stored by browsers or intermediaries. Static assets keep Next's own immutable caching.
      { source: "/((?!_next/static|icons|images|offline.html|sw.js|manifest.webmanifest).*)", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
