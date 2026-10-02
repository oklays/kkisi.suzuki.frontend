// Targeted unlock: deletes exactly the throttle rows of ONE username (and optionally one IP / the username+IP pair).
// It never disables throttling and cannot touch other keys. Local staging only (same config guards as the app).
//   pnpm auth:unlock --username <name> [--ip <address>]
import { buildKeys } from '../src/infrastructure/auth/keys.ts';
import { loadAuthConfig } from '../src/infrastructure/auth/config.ts';
import { normalizeUsername } from '../src/application/auth/login.usecase.ts';
import { authPrisma } from '../src/infrastructure/db/prisma-auth.ts';
import { Prisma } from '@prisma/client';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const username = arg('username');
  const ip = arg('ip');
  if (!username || username.length > 100) { console.error('usage: pnpm auth:unlock --username <name> [--ip <address>]'); process.exitCode = 2; return; }
  const config = loadAuthConfig(process.env);
  const keys = buildKeys(config.secrets);
  const name = normalizeUsername(username);
  const targets = [keys.keyFor('user', name)];
  if (ip) { targets.push(keys.keyFor('pair', name, ip)); targets.push(keys.keyFor('ip', ip)); }
  const db = authPrisma();
  const deleted = Number(await db.$executeRaw(Prisma.sql`DELETE FROM kkisi_auth_staging.auth_throttle WHERE key_hash IN (${Prisma.join(targets.map((t) => t.keyHash))})`));
  console.warn(`[auth] unlock u=${keys.shortId(name)} keys=${targets.length} deleted=${deleted}`);
  console.log(JSON.stringify({ deleted }));
  await db.$disconnect();
}

main().catch(() => { console.error('unlock failed (see configuration and database availability)'); process.exitCode = 1; });
