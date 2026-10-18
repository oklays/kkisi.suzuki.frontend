// DEV LOCAL preflight (checkpoint 14): computes the EFFECTIVE environment exactly as Next.js will see it (profile values override .env.local, which Next
// loads only for keys not already set) and refuses to start unless every database target is an approved isolated local target. Prints no secret.
import { readFileSync } from 'node:fs';
const parse = (f) => Object.fromEntries(readFileSync(f, 'utf8').split('\n').filter((l) => /^[A-Z][A-Z0-9_]*=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, '$1')]; }));
const local = parse('.env.local'); const profile = parse('.env.dev-local');
const eff = { ...local, ...profile };
const ALLOWED = new Set(['kkisi_devlocal_staging', 'kkisi_auth_staging', 'kkisi_console_staging']);
const problems = []; const report = [];
if (eff.APP_ENV && eff.APP_ENV !== 'local') problems.push('APP_ENV must be unset or local');
for (const [k, v] of Object.entries(eff).filter(([k]) => /^DATABASE_URL/.test(k))) {
  if (!v) { report.push(`${k}: (unset)`); continue; }
  let u; try { u = new URL(v); } catch { problems.push(`${k}: not a URL`); continue; }
  const db = u.pathname.slice(1); const user = decodeURIComponent(u.username);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.port !== '3307') problems.push(`${k}: not the local container (127.0.0.1:3307)`);
  if (!ALLOWED.has(db)) problems.push(`${k}: database ${db} is not an approved DEV LOCAL target`);
  if (['root', 'admin'].includes(user)) problems.push(`${k}: forbidden account`);
  report.push(`${k}: ${user}@${u.hostname}:${u.port}/${db}`);
}
// R1 is not approved: the owner-facing server never carries a landing mapping. ONLY the throw-away trial instance (scripts/dev-local.sh r1-trial) may, and only the exact trial mapping.
const trial = process.argv.includes('--r1-trial');
if (trial) { if (process.env.CONSOLE_LANDING_ROLES !== '4:pos,1:console') problems.push('r1-trial accepts only CONSOLE_LANDING_ROLES=4:pos,1:console'); eff.CONSOLE_LANDING_ROLES = process.env.CONSOLE_LANDING_ROLES; }
else if (eff.CONSOLE_LANDING_ROLES) problems.push('CONSOLE_LANDING_ROLES must stay unset in DEV LOCAL (R1 not approved)');
if (eff.POS_WRITE_DATABASE !== 'kkisi_devlocal_staging') problems.push('POS_WRITE_DATABASE must be kkisi_devlocal_staging');
console.log(report.join('\n'));
console.log(`flags: CONSOLE_ENABLED=${eff.CONSOLE_ENABLED} KOSIPA_READ_ENABLED=${eff.KOSIPA_READ_ENABLED} WAREHOUSE_PREVIEW_ENABLED=${eff.WAREHOUSE_PREVIEW_ENABLED} KOSIPA_EXPORT_ENABLED=${eff.KOSIPA_EXPORT_ENABLED} KOSIPA_EXPORT_USER_IDS=${eff.KOSIPA_EXPORT_USER_IDS} CONSOLE_LANDING_ROLES=${eff.CONSOLE_LANDING_ROLES || '(unset)'}`);
if (problems.length) { console.error(`REFUSED:\n- ${problems.join('\n- ')}`); process.exit(1); }
console.log('preflight: every database target is an approved isolated local target');
