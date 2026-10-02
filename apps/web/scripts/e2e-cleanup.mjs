// E3a: delete ONLY synthetic rows, after checking the target schema, the marker table, the account and the id ranges, inside
// transactions that are rolled back on any surprise. It never drops anything (E3b is not approved) and never writes kkisi_staging.
//   node --env-file=.env.local --env-file=.env.e2e scripts/e2e-cleanup.mjs
import { PrismaClient, Prisma } from '@prisma/client';
import { assertE2eTarget, num, RANGES, SYNTH, THROTTLE_USERNAMES } from './e2e-guards.mjs';
import { buildKeys } from '../src/infrastructure/auth/keys.ts';
import { loadAuthConfig } from '../src/infrastructure/auth/config.ts';

for (const k of ['E2E_SEED_URL', 'DATABASE_URL', 'DATABASE_URL_AUTH', 'AUTH_SECRETS']) if (!process.env[k]) throw new Error(`${k} is required`);
class Abort extends Error {}
const seed = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
const auth = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_AUTH });
const real = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });   // kkisi_read on the REAL legacy: only used for the id-collision check
const [uLo, uHi] = SYNTH.users;
try {
  // ---- 0. checks that must pass BEFORE anything is deleted anywhere
  await assertE2eTarget(seed);
  const realMax = num((await real.$queryRawUnsafe('SELECT COALESCE(MAX(id), 0) AS m FROM db_users'))[0].m);
  if (realMax >= 900000) throw new Abort(`the REAL legacy schema has a user id >= 900000 (${realMax}): the synthetic range is not safe, nothing was deleted`);
  const report = { legacy: {}, auth: {} };
  // ---- 1. legacy stand-in: synthetic rows only
  await seed.$transaction(async (tx) => {
    for (const [table, [col, lo, hi]] of Object.entries(RANGES)) {
      const outside = num((await tx.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`kkisi_e2e_legacy\`.\`${table}\` WHERE \`${col}\` NOT BETWEEN ? AND ?`, lo, hi))[0].n);
      if (outside > 0) throw new Abort(`${table}: ${outside} row(s) outside the synthetic range ${lo}-${hi}: nothing was deleted`);
    }
    for (const [table, [col, lo, hi]] of Object.entries(RANGES)) report.legacy[table] = num(await tx.$executeRawUnsafe(`DELETE FROM \`kkisi_e2e_legacy\`.\`${table}\` WHERE \`${col}\` BETWEEN ? AND ?`, lo, hi));
    for (const table of Object.keys(RANGES)) {
      const left = num((await tx.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`kkisi_e2e_legacy\`.\`${table}\``))[0].n);
      if (left !== 0) throw new Abort(`${table}: ${left} row(s) remained after delete: rolled back`);
    }
  });
  // ---- 2. auth store: sessions of the synthetic user ids and the throttle keys of the synthetic usernames
  const keys = buildKeys(loadAuthConfig({ ...process.env, APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://127.0.0.1:3100' }).secrets);
  const throttleHashes = THROTTLE_USERNAMES.map((u) => keys.keyFor('user', u).keyHash);
  await auth.$transaction(async (tx) => {
    const cnt = async (sql) => num((await tx.$queryRaw(sql))[0].n);
    const outsideS = () => cnt(Prisma.sql`SELECT COUNT(*) AS n FROM kkisi_auth_staging.auth_session WHERE user_id NOT BETWEEN ${uLo} AND ${uHi}`);
    const outsideT = () => cnt(Prisma.sql`SELECT COUNT(*) AS n FROM kkisi_auth_staging.auth_throttle WHERE key_hash NOT IN (${Prisma.join(throttleHashes)})`);
    const [oS, oT] = [await outsideS(), await outsideT()];
    report.auth.sessions = num(await tx.$executeRaw`DELETE FROM kkisi_auth_staging.auth_session WHERE user_id BETWEEN ${uLo} AND ${uHi}`);
    report.auth.throttle = num(await tx.$executeRaw(Prisma.sql`DELETE FROM kkisi_auth_staging.auth_throttle WHERE key_hash IN (${Prisma.join(throttleHashes)})`));
    if ((await outsideS()) !== oS || (await outsideT()) !== oT) throw new Abort('rows outside the synthetic set changed: rolled back');
    report.auth.foreignRowsLeft = { sessions: oS, throttle: oT };
  });
  console.log('E3a done:', JSON.stringify(report));
} catch (e) {
  console.error(e instanceof Abort ? `E3a ABORTED (nothing changed): ${e.message}` : `E3a FAILED (nothing changed): ${String(e.message).split('\n')[0].slice(0, 160)}`);
  process.exitCode = 1;
} finally { await Promise.all([seed.$disconnect(), auth.$disconnect(), real.$disconnect()]); }
