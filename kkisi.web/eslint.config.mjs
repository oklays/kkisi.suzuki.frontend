import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // The auth-store client (kkisi_auth) may only be created/used inside infrastructure/auth (its container).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/infrastructure/auth/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["**/db/prisma-auth", "**/db/prisma-auth.ts"], message: "The auth-store client is private to src/infrastructure/auth." }] }],
    },
  },
  {
    // No code may reach for a legacy write connection: the app only reads legacy through the SELECT-only account.
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error",
        { selector: "MemberExpression[property.name='DATABASE_URL_WRITE']", message: "There is no legacy write connection in this app." },
        { selector: "Literal[value='DATABASE_URL_WRITE']", message: "There is no legacy write connection in this app." }],
    },
  },
]);
