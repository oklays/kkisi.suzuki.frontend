import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Web owns the installed lint dependencies; share their configuration without adding another toolchain.
const require = createRequire(new URL("./apps/web/package.json", import.meta.url));
const { defineConfig, globalIgnores } = require("eslint/config");
const nextVitals = require("eslint-config-next/core-web-vitals");
const nextTs = require("eslint-config-next/typescript");
const root = fileURLToPath(new URL(".", import.meta.url));
const web = fileURLToPath(new URL("./apps/web/", import.meta.url));

export default defineConfig([
  {
    basePath: root,
    extends: [globalIgnores([
      "**/*",
      "!apps/", "!apps/web/", "!apps/web/**",
      "!packages/", "!packages/**",
      "**/node_modules/**", "**/.next/**", "**/out/**", "**/build/**", "**/next-env.d.ts",
    ])],
  },
  {
    basePath: web,
    extends: [...nextVitals, ...nextTs],
    settings: { next: { rootDir: web } },
  },
  {
    basePath: root,
    files: ["packages/**/*.{ts,tsx,mjs}"],
    extends: nextTs,
  },
  {
    basePath: web,
    // The auth-store client may only be used inside infrastructure/auth.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/infrastructure/auth/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/db/prisma-auth", "**/db/prisma-auth.ts"], message: "The auth-store client is private to src/infrastructure/auth." }] }],
    },
  },
  {
    basePath: root,
    // Legacy remains SELECT-only, including future workspace packages.
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/scripts/**/*.ts", "packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "MemberExpression[property.name='DATABASE_URL_WRITE']", message: "There is no legacy write connection in this app." },
        { selector: "Literal[value='DATABASE_URL_WRITE']", message: "There is no legacy write connection in this app." }],
    },
  },
]);
