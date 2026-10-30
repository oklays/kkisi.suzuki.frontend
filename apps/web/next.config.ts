import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The app version shown in the sidebar comes from apps/web/package.json; only this string is inlined into the bundle.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  // Opt-in separate build directory for isolated test servers (e.g. the KOSIPA FA-01 synthetic stack) so they never overwrite `.next`
  // while another server of this directory is running. Unset -> the default `.next`, unchanged.
  ...(process.env.NEXT_DIST_DIR && /^\.next-[a-z0-9-]{1,40}$/.test(process.env.NEXT_DIST_DIR) ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  env: {
    APP_VERSION: version,
  },
  turbopack: {
    root: fileURLToPath(new URL("../../", import.meta.url)),
  },
};

export default nextConfig;
