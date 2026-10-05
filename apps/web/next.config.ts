import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The app version shown in the sidebar comes from apps/web/package.json; only this string is inlined into the bundle.
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: version,
  },
  turbopack: {
    root: fileURLToPath(new URL("../../", import.meta.url)),
  },
};

export default nextConfig;
