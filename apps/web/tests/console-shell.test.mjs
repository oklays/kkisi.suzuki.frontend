import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CONSOLE_NAVIGATION } from '../src/features/console/navigation.ts';
import { TOKO_CAPABILITIES } from '@koperasi/domain/console/capabilities';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('every available navigation entry points at an existing page and needs a declared capability', () => {
  for (const entry of CONSOLE_NAVIGATION.filter((e) => e.readiness === 'available')) {
    const page = join(ROOT, 'src/app', entry.href === '/' ? '' : entry.href, 'page.tsx');
    assert.ok(existsSync(page), `${entry.id} -> ${entry.href} has no page`);
    if (entry.id !== 'dashboard') assert.ok(entry.anyOf.length > 0, `${entry.id} must require a capability`);
    for (const cap of entry.anyOf) assert.ok(TOKO_CAPABILITIES.includes(cap), `${entry.id}: unknown capability ${cap}`);
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
