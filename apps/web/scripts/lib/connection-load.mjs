// Local load generator for the connection-capacity measurement (checkpoint 12). Signs in synthetic users over HTTP and issues a fixed mix of server-rendered
// pages and API calls with N concurrent workers for S seconds against a LOCAL app (127.0.0.1 only). Prints request counts and status classes as JSON.
//   node scripts/lib/connection-load.mjs <base> <concurrency> <seconds> <mode: pages|api|mixed>
import { readFileSync } from 'node:fs';
const [base, conc = '8', secs = '20', mode = 'mixed'] = process.argv.slice(2);
if (new URL(base).hostname !== '127.0.0.1') throw new Error('local only');
const pw = JSON.parse(readFileSync(process.env.POS_FIXTURE, 'utf8'));
async function login(user) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ username: `synth_${user}`, password: pw[user] }) });
  if (r.status !== 200) throw new Error(`login ${user}: ${r.status}`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
const PAGES = ['/sales', '/products', '/console', '/sales/returns', '/inventory'];
// /api/products is left out: the synthetic e2e schema has no db_brands table, so that endpoint cannot run there (fixture gap, not a product defect).
const APIS = ['/api/sales', '/api/auth/session', '/api/sales/returns', '/api/pos/products?q=SYN'];
const targets = mode === 'pages' ? PAGES : mode === 'api' ? APIS : [...PAGES, ...APIS];
const cookies = [await login('admin'), await login('admin')];   // two independent sessions of the synthetic administrator
const stats = { requests: 0, byClass: {}, byPath: {} }; const lat = [];
const end = Date.now() + Number(secs) * 1000;
await Promise.all(Array.from({ length: Number(conc) }, async (_, w) => {
  let i = w;
  while (Date.now() < end) {
    const path = targets[i++ % targets.length];
    const t0 = performance.now();
    const r = await fetch(`${base}${path}`, { headers: { cookie: cookies[w % cookies.length], origin: base } }).catch(() => ({ status: 0, arrayBuffer: async () => null }));
    await r.arrayBuffer(); lat.push(performance.now() - t0); stats.requests++; const k = `${Math.floor(r.status / 100)}xx`; stats.byClass[k] = (stats.byClass[k] ?? 0) + 1;
    stats.byPath[path] ??= {}; stats.byPath[path][r.status] = (stats.byPath[path][r.status] ?? 0) + 1;
  }
}));
lat.sort((a, b) => a - b); const q = (x) => Math.round(lat[Math.min(lat.length - 1, Math.floor(x * lat.length))] ?? 0);
process.stdout.write(JSON.stringify({ mode, concurrency: Number(conc), seconds: Number(secs), ...stats, latencyMs: { p50: q(0.5), p95: q(0.95), max: Math.round(lat.at(-1) ?? 0) } }) + '\n');
