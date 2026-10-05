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
    // Only dedicated local-staging DB clients may read legacy write DSNs.
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/scripts/**/*.ts", "packages/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/infrastructure/db/prisma-pos-write.ts", "apps/web/src/infrastructure/db/prisma-register-write.ts", "apps/web/src/infrastructure/db/prisma-inventory-write.ts", "apps/web/src/infrastructure/db/prisma-product-write.ts"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "MemberExpression[property.name=/^DATABASE_URL(_REGISTER|_INVENTORY|_PRODUCT)?_WRITE$/]", message: "Legacy write DSNs are private to their dedicated infrastructure/db clients." },
        { selector: "Literal[value=/^DATABASE_URL(_REGISTER|_INVENTORY|_PRODUCT)?_WRITE$/]", message: "Legacy write DSNs are private to their dedicated infrastructure/db clients." }],
    },
  },
  {
    basePath: root,
    files: ["apps/web/src/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/infrastructure/db/**", "apps/web/src/infrastructure/pos/**", "apps/web/src/infrastructure/inventory/**", "apps/web/src/infrastructure/auth/**", "apps/web/src/infrastructure/repositories/prisma-register.repository.ts", "apps/web/src/infrastructure/repositories/prisma-product-edit.repository.ts", "apps/web/src/infrastructure/repositories/prisma-product-add.repository.ts", "apps/web/src/infrastructure/products/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/db/prisma-pos-write", "**/db/prisma-pos-write.ts", "**/db/prisma-register-write", "**/db/prisma-register-write.ts", "**/db/prisma-inventory-write", "**/db/prisma-inventory-write.ts", "**/db/prisma-product-write", "**/db/prisma-product-write.ts"], message: "Write clients are private to their owning infrastructure." }, { group: ["**/db/prisma-auth", "**/db/prisma-auth.ts"], message: "The auth-store client is private to infrastructure/auth." }] }],
    },
  },
  {
    basePath: root,
    files: ["apps/web/src/infrastructure/auth/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/db/prisma-pos-write", "**/db/prisma-pos-write.ts", "**/db/prisma-register-write", "**/db/prisma-register-write.ts", "**/db/prisma-inventory-write", "**/db/prisma-inventory-write.ts", "**/db/prisma-product-write", "**/db/prisma-product-write.ts"], message: "Write clients are private to their owning infrastructure." }] }],
    },
  },
]);
