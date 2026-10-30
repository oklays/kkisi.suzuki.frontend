/**
 * Legacy fence SQL generator (kosipa-full-access TASK-113; REQ-103, REQ-140, MIG-104, MIG-105, BR-117). PRINTS reviewed SQL only — it
 * never connects to a database. The operator runs the output on production after review (OD-4); FA-01 rehearses it only on the
 * isolated synthetic stack (tests/kosipa-legacy-fence-db.test.mjs).
 *
 * Why ref_menu.status fences a legacy controller (evidence: fa-01/FD-03-legacy-fence-verification.md): every gated KOSIPA controller
 * calls user_m::cekstatushakakses('<module>/<Class>', id_user) in its constructor, for EVERY method (pages and ajax_*), on every
 * request (no session cache), and redirect() exits. The query requires `upper(a.url) = upper('<module>/<Class>') AND a.status = 1`,
 * so status 0 on every matching row refuses all users, existing sessions included, on their next request.
 *
 *   node --experimental-strip-types scripts/kosipa-legacy-fence.mjs <feature> [--database <name>]   e.g. master.lokasi --database smart_kopkar
 */
import { KOSIPA_WRITE_FEATURES } from '../src/infrastructure/console/kosipa-ownership.ts';

const FEATURES = Object.fromEntries(Object.entries(KOSIPA_WRITE_FEATURES).map(([name, f]) => [name, f.legacyControllers]));

const [feature, ...rest] = process.argv.slice(2);
const db = rest[rest.indexOf('--database') + 1] && rest.includes('--database') ? rest[rest.indexOf('--database') + 1] : '__PRODUCTION_DB__';
if (!FEATURES[feature]) { console.error(`unknown feature; known: ${Object.keys(FEATURES).join(', ')}`); process.exit(1); }
if (!/^[A-Za-z0-9_]{1,64}$/.test(db)) { console.error('invalid database name'); process.exit(1); }
const urls = FEATURES[feature].map((u) => `UPPER('${u}')`).join(', ');
const match = `UPPER(url) IN (${urls})`;
const stamp = new Date().toISOString().slice(0, 10);

console.log(`-- KOSIPA legacy fence for feature "${feature}" — generated ${stamp} by apps/web/scripts/kosipa-legacy-fence.mjs. REVIEW BEFORE RUNNING.
-- Order (11 §3): 1 verify no pending legacy work  2 FENCE (this)  3 verify  4 enable Next.js (flag + KOSIPA_WRITE_OWNERSHIP)  5 smoke test.
-- Rollback = Next.js flag off first, then the ROLLBACK block. The legacy menu admin (admin/adm_menu_c) can flip ref_menu back:
-- re-run the VERIFY block after every legacy admin session until legacy retirement.

-- 0. PRE-STATE (record the output in the cutover log)
SELECT id, url, status FROM \`${db}\`.ref_menu WHERE ${match} ORDER BY id;

-- 1. FENCE (one transaction; every row whose URL matches case-insensitively, exactly as the legacy gate compares)
START TRANSACTION;
UPDATE \`${db}\`.ref_menu SET status = 0 WHERE ${match} AND status = 1;
SELECT COUNT(*) AS still_open FROM \`${db}\`.ref_menu WHERE ${match} AND status = 1;   -- must be 0, else ROLLBACK
COMMIT;

-- 2. VERIFY (expected: no row with status = 1)
SELECT COUNT(*) AS rows_matching, SUM(status = 1) AS rows_open FROM \`${db}\`.ref_menu WHERE ${match};

-- 3. ROLLBACK (only after the Next.js flag for "${feature}" is off). Restores the rows recorded in step 0 to status 1.
-- UPDATE \`${db}\`.ref_menu SET status = 1 WHERE id IN (<ids recorded in step 0 that had status 1>);`);
