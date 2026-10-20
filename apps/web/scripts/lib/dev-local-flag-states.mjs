// Feature-flag / dependency state checks against a throw-away DEV LOCAL instance (scripts/dev-local.sh flag-states). Synthetic accounts only; passwords come from the
// ignored accounts file and are never printed. Every state must keep navigation, pages and APIs consistent and fail closed; TOKO must keep working where it can.
//   node scripts/lib/dev-local-flag-states.mjs <base> <kosipa-off|console-off|store-down>
import { readFileSync } from 'node:fs';
const [base, state] = process.argv.slice(2); if (new URL(base).hostname !== '127.0.0.1') throw new Error('local only');
const pw = JSON.parse(readFileSync('.env.dev-local-accounts.json', 'utf8'));
let bad = 0; const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} [${state}] ${text}`); if (!ok) bad++; };
async function session(user) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ username: `synth_${user}`, password: pw[user] }) });
  if (r.status !== 200) throw new Error(`login ${user}: ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return async (path) => { const res = await fetch(`${base}${path}`, { headers: { cookie }, redirect: 'manual' }); return { status: res.status, text: await res.text() }; };
}
const kosipaLinks = (html) => [...html.matchAll(/href="(\/console\/kosipa[^"]*)"/g)].map((m) => m[1]);
const koperasi = await session('koperasi'); const kasir = await session('kasir1');
const dash = await koperasi('/console'); const page = await koperasi('/console/kosipa'); const api = await koperasi('/api/kosipa/loans'); const exp = await koperasi('/api/kosipa/reports/loans/export');
if (state === 'kosipa-off') {
  check(dash.status === 200, 'console still opens (KOSIPA flag off only removes KOSIPA)');
  check(kosipaLinks(dash.text).length === 0, 'no KOSIPA link anywhere on the dashboard or sidebar');
  check(/Belum diaktifkan/.test(dash.text) && !/Segera hadir/.test(dash.text), 'the KOSIPA card says "Belum diaktifkan", not "Segera hadir"');
  check(/belum diaktifkan/i.test(page.text) && !/SYNTH ANGGOTA/.test(page.text), '/console/kosipa explains the module is not enabled and shows no data');
  check(api.status !== 200 && exp.status !== 200, `KOSIPA API and export refused (${api.status}/${exp.status})`);
  check(/href="\/sales"/.test(dash.text), 'TOKO navigation remains');
} else if (state === 'console-off') {
  check(dash.status === 404 && page.status === 404, `/console and /console/kosipa answer 404 (${dash.status}/${page.status})`);
  check((await koperasi('/api/console/capabilities')).status === 404, 'capabilities API answers 404');
  check(api.status !== 200 && exp.status !== 200, `KOSIPA API and export refused (${api.status}/${exp.status})`);
  const pos = await kasir('/pos'); check(pos.status === 200 && /pos-shell|Kasir/i.test(pos.text), 'TOKO POS keeps working for the cashier');
} else if (state === 'store-down') {
  check(dash.status === 200, 'console shell still opens with the console store down');
  check(kosipaLinks(dash.text).length === 0, 'KOSIPA menu hidden (fail closed)');
  check(/Akses KOSIPA sementara tidak dapat diperiksa/.test(dash.text), 'the dashboard states KOSIPA could not be checked');
  check(/tidak tersedia/i.test(page.text) && !/SYNTH ANGGOTA/.test(page.text), '/console/kosipa shows "tidak tersedia" and no data');
  check([401, 403, 503].includes(api.status) && exp.status !== 200, `KOSIPA API fails closed (${api.status}/${exp.status})`);
  const pos = await kasir('/pos'); check(pos.status === 200, 'TOKO POS keeps working for the cashier');
  check(/href="\/sales"/.test(dash.text), 'TOKO navigation remains');
} else throw new Error('unknown state');
process.exit(bad ? 1 : 0);
