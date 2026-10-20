import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONSOLE_NAVIGATION } from '../src/features/console/navigation.ts';
import { ALL_CAPABILITIES } from '@koperasi/domain/console/capabilities';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('every available navigation entry points at an existing page and needs a declared capability', () => {
  for (const entry of CONSOLE_NAVIGATION.filter((e) => e.readiness === 'available')) {
    const page = join(ROOT, 'src/app', entry.href === '/' ? '' : entry.href, 'page.tsx');
    assert.ok(existsSync(page), `${entry.id} -> ${entry.href} has no page`);
    if (entry.id !== 'dashboard') assert.ok(entry.anyOf.length > 0, `${entry.id} must require a capability`);
    for (const cap of entry.anyOf) assert.ok(ALL_CAPABILITIES.includes(cap), `${entry.id}: unknown capability ${cap}`);
  }
});

test('planned (roadmap) entries never resolve to a page that could be mistaken for a working module', () => {
  for (const entry of CONSOLE_NAVIGATION.filter((e) => e.readiness === 'planned')) {
    assert.ok(!existsSync(join(ROOT, 'src/app', entry.href, 'page.tsx')), `${entry.href} exists but is still marked planned`);
  }
  assert.ok(CONSOLE_NAVIGATION.some((e) => e.section === 'kosipa'), 'KOSIPA roadmap entries are registered');
});

test('navigation ids and hrefs are unique', () => {
  const ids = CONSOLE_NAVIGATION.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  const hrefs = CONSOLE_NAVIGATION.map((e) => e.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test('every console layout and page checks the release flag and the console guard before reading data', () => {
  const files = walk(join(ROOT, 'src/app/console')).filter((p) => /\/(page|layout)\.tsx$/.test(p));
  assert.ok(files.length >= 2);
  for (const file of files) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const flagAt = src.indexOf('consoleEnabled()');
    const guardAt = src.indexOf('requireConsoleSession(');
    const dataAt = src.search(/\.deps\.|findActive\(|listActive\(/);
    assert.ok(flagAt >= 0 && guardAt > flagAt, `${file}: flag then guard`);
    if (dataAt >= 0) assert.ok(dataAt > guardAt, `${file}: data read before guard`);
  }
});

test('POS keeps its focused screen: no console chrome is rendered on /pos', () => {
  for (const file of walk(join(ROOT, 'src/app/pos'))) assert.doesNotMatch(readFileSync(file, 'utf8'), /ConsoleFrame|console\.css/, file);
  assert.doesNotMatch(read('src/components/pos/PosScreen.tsx'), /ConsoleFrame/);
});

test('console styles are scoped and cannot restyle TOKO pages', () => {
  const css = read('src/app/console/console.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)) {
    if (rule.startsWith('@') || /^(from|to)$/.test(rule)) continue;
    for (const selector of rule.split(',')) assert.match(selector.trim(), /^\.console-/, `unscoped selector: ${selector.trim()}`);
  }
});

test('the TOKO shell only links to /console when the console is enabled; otherwise the old placeholder stays', () => {
  const shell = read('src/components/pos/PosShell.tsx');
  assert.match(shell, /session\.consoleAvailable \? <Link href="\/console">/);
  assert.match(shell, /<button disabled><LayoutDashboard size=\{18\} \/>Dashboard Supervisor<\/button>/);
  for (const file of ['src/app/pos/page.tsx', 'src/app/products/page.tsx', 'src/app/inventory/page.tsx', 'src/infrastructure/sales/page-session.ts']) {
    assert.match(read(file), /consoleAvailable: consoleEnabled\(\)/, file);
  }
});

test('login keeps /pos as the fallback when the console is off and never trusts an unvalidated next', () => {
  const page = read('src/app/login/page.tsx');
  assert.match(page, /fallback=\{consoleEnabled\(\) \? "\/console\?entry=login" : "\/pos"\}/);
  assert.match(page, /dynamic = "force-dynamic"/, 'flag read at request time, not baked in at build');
  assert.match(read('src/app/login/LoginForm.tsx'), /safeNextPath\(new URLSearchParams\(window\.location\.search\)\.get\("next"\), fallback\)/);
});

test('the proxy gates /console and keeps only the console path as next', () => {
  const proxy = read('src/proxy.ts');
  assert.match(proxy, /"\/console\/:path\*", "\/api\/console\/:path\*"/);
  assert.match(proxy, /startsWith\("\/console"\) \? request\.nextUrl\.pathname : null/);
});

test('the console-store client is private to console/db infrastructure; KOSIPA code never reaches a writer client', () => {
  const src = walk(join(ROOT, 'src')).filter((p) => /\.(ts|tsx)$/.test(p));
  for (const file of src) {
    const rel = file.slice(ROOT.length);
    const text = readFileSync(file, 'utf8');
    if (!rel.startsWith('src/infrastructure/console/') && !rel.startsWith('src/infrastructure/db/')) assert.doesNotMatch(text, /prisma-console/, `${rel} must not import the console-store client`);
    if (rel.startsWith('src/infrastructure/console/') || rel.includes('kosipa')) assert.doesNotMatch(text, /prisma-(pos|register|inventory|product|return)-write|DATABASE_URL_\w*WRITE/, `${rel} must not reach a business writer`);
  }
});

test('KOSIPA reads are SELECT-only and time-capped; no member mutation exists at this checkpoint', () => {
  for (const file of ['src/infrastructure/repositories/kosipa-member.repository.ts', 'src/infrastructure/console/kosipa-directory.ts']) {
    const text = read(file).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, /\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP)\b/, `${file} must not write`);
    const queries = text.match(/\$queryRaw[^`]*`[^`]*/g) ?? [];
    assert.ok(queries.length > 0);
    for (const q of queries) if (!/kreditReturnedSen/.test(q)) assert.match(q, /SET STATEMENT max_statement_time=5 FOR/, `${file}: un-capped statement`);
    assert.doesNotMatch(text, /trans_pinjaman_dtl|trans_potongan_matrix/, 'large unindexed tables stay unread until indexes exist');
  }
});

// ---- KOSIPA navigation integration (owner-reported "KOSIPA menu not visible") -----------------------------------------------------------
const kosipaPages = () => walk(join(ROOT, 'src/app/console/kosipa')).filter((p) => p.endsWith('/page.tsx')).map((p) => p.slice(join(ROOT, 'src/app').length, -'/page.tsx'.length));

test('route-to-navigation matrix: every static KOSIPA page is a registered, available entry; dynamic pages are reached from a registered parent page', () => {
  const registered = new Map(CONSOLE_NAVIGATION.map((e) => [e.href, e]));
  const reachedFrom = { '/console/kosipa/anggota/[id]': '/console/kosipa/anggota', '/console/kosipa/simpanan/[id]': '/console/kosipa/simpanan', '/console/kosipa/pinjaman/[docNo]': '/console/kosipa/pinjaman',
    '/console/kosipa/payroll/[docNo]': '/console/kosipa/payroll', '/console/kosipa/payroll/[docNo]/rekonsiliasi': '/console/kosipa/payroll', '/console/kosipa/payroll/[docNo]/anggota/[nik]': '/console/kosipa/payroll' };
  for (const route of kosipaPages()) {
    if (route.includes('[')) { assert.ok(route in reachedFrom, `${route}: dynamic page with no declared parent`); assert.equal(registered.get(reachedFrom[route])?.readiness, 'available', `${route}: parent ${reachedFrom[route]} is not an available entry`); continue; }
    const entry = registered.get(route);
    assert.ok(entry, `${route} exists as a page but is not in the navigation registry (the owner would never find it)`);
    assert.equal(entry.readiness, 'available', `${route} is implemented but still marked ${entry.readiness}`);
    assert.equal(entry.section, 'kosipa', `${route} must live in the KOSIPA section`);
  }
});

test('the only planned KOSIPA entry is one without a page; nothing implemented is hidden behind "Segera hadir"', () => {
  const planned = CONSOLE_NAVIGATION.filter((e) => e.section === 'kosipa' && e.readiness === 'planned');
  assert.deepEqual(planned.map((e) => e.id), ['kosipa-installments']);
  assert.ok(!kosipaPages().includes(planned[0].href));
});

test('nested entries: the parent exists in the same section, is itself top level, lives above the child path and is visible whenever the child is', () => {
  const byId = new Map(CONSOLE_NAVIGATION.map((e) => [e.id, e]));
  for (const e of CONSOLE_NAVIGATION.filter((x) => x.parent)) {
    const parent = byId.get(e.parent);
    assert.ok(parent, `${e.id}: unknown parent ${e.parent}`); assert.equal(parent.section, e.section); assert.equal(parent.parent, undefined, `${e.id}: nesting is one level deep`);
    assert.ok(e.href.startsWith(`${parent.href}/`), `${e.id}: a child lives under its parent's path`);
    assert.ok(e.anyOf.every((c) => parent.anyOf.includes(c)), `${e.id}: parent must be visible whenever the child is`);
  }
});

test('the dashboard explains KOSIPA access states instead of "Segera hadir", and the KOSIPA overview reads no KOSIPA data', () => {
  const dash = read('src/app/console/page.tsx');
  assert.match(dash, /unlinked: 'Akun belum ditautkan'/); assert.match(dash, /auth\.kosipa === 'linked' \? 'restricted' : auth\.kosipa/);
  const overview = read('src/app/console/kosipa/page.tsx');
  assert.doesNotMatch(overview.replace(/\/\*[\s\S]*?\*\//g, ''), /searchMembers|\.deps\.|Rp\s?\d|prisma|\$queryRaw/);
  assert.match(overview, /requireConsoleSession\(\{ next: '\/console\/kosipa' \}\)/);
});

test('a console administrator is not given KOSIPA access by the dev-local seed, which links only the two KOSIPA personas', () => {
  const links = read('scripts/lib/dev-local-links.mjs');
  assert.doesNotMatch(links, /900001/, 'synth_admin (900001) must never be linked by the seed');
  assert.match(links, /\[900002, 9001,/); assert.match(links, /\[900005, 9004,/);
  assert.doesNotMatch(read('scripts/setup-dev-local.sh'), /synth_ksp_uat/);
});
