import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const APP = join(ROOT, 'src/app');
const rel = (p) => relative(ROOT, p);

// Deliberately public: the login endpoint and page, and logout (it validates the session itself and only clears the cookie
// when there is none), plus the static landing page. Anything NOT listed here must be guarded.
const PUBLIC_ROUTES = new Set(['src/app/api/auth/login/route.ts', 'src/app/api/auth/logout/route.ts']);
const PUBLIC_PAGES = new Set(['src/app/login/page.tsx', 'src/app/page.tsx']);

function handlerSource(routeSource, method) {
  const out = [];
  const methodSource = method ? routeSource.match(new RegExp(`export\\s+async\\s+function\\s+${method}\\b[\\s\\S]*?(?=\\nexport\\s+|$)`))?.[0] : routeSource;
  for (const m of routeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s+["']@\/(infrastructure\/[^"']+)["']/g)) {
    // Mixed GET/POST routes import both adapters; inspect only imports used by this HTTP export.
    if (method && !m[1].split(',').some((name) => new RegExp(`\\b${name.trim().split(/\s+as\s+/).at(-1)}\\b`).test(methodSource ?? ''))) continue;
    const file = join(ROOT, 'src', m[2] + '.ts'); try { out.push(readFileSync(file, 'utf8')); } catch { /* not a file import */ }
  }
  return out.join('\n');
}

test('method-specific scans still detect an aliased mutation adapter wired into GET', () => {
  const source = `import { handleStockOpnames as unsafeRead } from '@/infrastructure/inventory/handlers';
export async function GET(request: Request) { return unsafeRead(services, request); }`;
  assert.match(handlerSource(source, 'GET'), /\.create\(/);
});

test('every API route is guarded (or explicitly public): the handler it delegates to calls guard() or validates the session', () => {
  const routes = walk(join(APP, 'api')).filter((p) => p.endsWith('route.ts'));
  assert.ok(routes.length >= 6, `expected the auth and POS routes, found ${routes.length}`);
  const unguarded = [];
  for (const file of routes) {
    const src = readFileSync(file, 'utf8');
    if (PUBLIC_ROUTES.has(rel(file))) continue;
    const handlers = handlerSource(src);
    if (!/\bguard\(/.test(handlers) && !/\bguard\(/.test(src)) unguarded.push(rel(file));
  }
  assert.deepEqual(unguarded, [], 'routes reachable without a guard');
});

test('every state-changing handler demands CSRF (guard csrf:true or its own origin+token check)', () => {
  const mutating = [];
  for (const file of walk(join(APP, 'api')).filter((p) => p.endsWith('route.ts'))) {
    const src = readFileSync(file, 'utf8');
    if (/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(src)) mutating.push(file);
    if (/export\s+async\s+function\s+GET\b/.test(src)) {
      const h = handlerSource(src, 'GET');
      assert.doesNotMatch(h, /\.(create|revoke|revokeAll|setCompany|purge|recordFailure|clear|touch)\(/, `GET route ${rel(file)} must not write`);
    }
  }
  for (const file of mutating) {
    if (PUBLIC_ROUTES.has(rel(file))) { const h = handlerSource(readFileSync(file, 'utf8')); assert.match(h, /checkOrigin\(/, `${rel(file)} must check the origin`); continue; }
    const src = readFileSync(file, 'utf8');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      if (new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(src)) assert.match(handlerSource(src, method), /csrf:\s*true/, `${rel(file)} ${method} must require the CSRF token`);
    }
  }
});

test('every page other than the login and landing pages calls requirePagePermission() before anything else', () => {
  const pages = walk(APP).filter((p) => p.endsWith('page.tsx'));
  const bad = [];
  for (const file of pages) {
    if (PUBLIC_PAGES.has(rel(file))) continue;
    const src = readFileSync(file, 'utf8');
    const guardAt = src.indexOf('requirePagePermission(');
    const dataAt = src.search(/searchCatalog\(|readRegister\(|listCatalogCategories\(|\.deps\.|findActive\(/);
    if (guardAt < 0 || (dataAt >= 0 && dataAt < guardAt)) bad.push(rel(file));
  }
  assert.deepEqual(bad, []);
});

test('the proxy is only a first gate and covers /pos and /api/pos; handlers do not rely on it', () => {
  const proxy = readFileSync(join(ROOT, 'src/proxy.ts'), 'utf8');
  assert.match(proxy, /matcher:\s*\[[^\]]*"\/pos\/:path\*"[^\]]*"\/api\/pos\/:path\*"/);
  for (const file of walk(join(ROOT, 'src/infrastructure/pos/handlers'))) assert.match(readFileSync(file, 'utf8'), /\bguard\(/, `${rel(file)} guards itself`);
});

test('inventory has an optimistic proxy gate while each page and API validates authorization itself', () => {
  const proxy = readFileSync(join(ROOT, 'src/proxy.ts'), 'utf8');
  assert.match(proxy, /"\/inventory\/:path\*"/);
  assert.match(proxy, /"\/api\/inventory\/:path\*"/);
});

test('no code path reads a company from the client or from POS_COMPANY_ID', () => {
  for (const file of walk(join(ROOT, 'src')).filter((p) => /\.(ts|tsx)$/.test(p))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /POS_COMPANY_ID/, rel(file));
    assert.doesNotMatch(src, /searchParams\.get\(['"](company_?id|companyId)['"]\)/i, rel(file));
    if (!['src/infrastructure/db/prisma-pos-write.ts','src/infrastructure/db/prisma-register-write.ts','src/infrastructure/db/prisma-inventory-write.ts','src/infrastructure/db/prisma-product-write.ts'].includes(rel(file))) assert.doesNotMatch(src, /DATABASE_URL(?:_REGISTER|_INVENTORY|_PRODUCT)?_WRITE/, rel(file));
    if (!rel(file).startsWith('src/infrastructure/db/') && !rel(file).startsWith('src/infrastructure/pos/')) assert.doesNotMatch(src, /prisma-pos-write/, `${rel(file)} cannot import the write client`);
    if (!rel(file).startsWith('src/infrastructure/db/') && !rel(file).startsWith('src/infrastructure/inventory/')) assert.doesNotMatch(src, /prisma-inventory-write/, `${rel(file)} cannot import the inventory write client`);
    if (!rel(file).startsWith('src/infrastructure/db/') && !rel(file).startsWith('src/infrastructure/products/') && rel(file) !== 'src/infrastructure/repositories/prisma-product-edit.repository.ts') assert.doesNotMatch(src, /prisma-product-write/, `${rel(file)} cannot import the product write client`);
  }
});

test('the legacy database is only read: no write verb in any legacy repository query', () => {
  const src = readFileSync(join(ROOT, 'src/infrastructure/auth/prisma-legacy-repositories.ts'), 'utf8');
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\b(INSERT|UPDATE|DELETE|REPLACE|TRUNCATE|DROP|ALTER|CREATE|GRANT)\b/i);
  for (const f of ['prisma-item.repository.ts']) assert.doesNotMatch(readFileSync(join(ROOT, 'src/infrastructure/repositories', f), 'utf8'), /\.(create|update|delete|upsert)(Many)?\(/);
});

test('bind is loopback in both scripts and the auth client is private to infrastructure/auth', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.dev, /-H 127\.0\.0\.1/); assert.match(pkg.scripts.start, /-H 127\.0\.0\.1/);
  for (const file of walk(join(ROOT, 'src')).filter((p) => /\.(ts|tsx)$/.test(p) && !rel(p).startsWith('src/infrastructure/auth/') && !rel(p).endsWith('db/prisma-auth.ts')))
    assert.doesNotMatch(readFileSync(file, 'utf8'), /prisma-auth/, `${rel(file)} must not import the auth-store client`);
});
