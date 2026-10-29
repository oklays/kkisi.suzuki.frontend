import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { makePayrollWorld, hdr, mrow } from '../../../packages/application/tests/helpers/payroll-fakes.mjs';
const reactPath = new URL('../node_modules/react/index.js', import.meta.url).href;

// The REAL payroll pages and the REAL application read path, fed by an in-memory reader with exact legacy decimal strings.
// Only the auth guard and the service wiring are stubbed. Proves what a payroll user reads on screen.
const BIG = '2581645259.9063';
registerHooks({
  resolve(specifier, context, next) {
    const stubs = {
      'next/link': `import React from '${reactPath}';export default function Link({prefetch,children,...p}){return React.createElement('a',p,children)}`,
      'next/navigation': 'export function notFound(){throw new Error("NOT_FOUND")}export function usePathname(){return "/console/kosipa/payroll"}export function useRouter(){return {push(){},replace(){},refresh(){}}}export function useSearchParams(){return new URLSearchParams()}',
      '@/infrastructure/auth/page-guard': 'export async function requireConsoleSession(){return {kind:"ok",ctx:{userId:1},kosipa:"linked",capabilities:new Set(["kosipa.payroll.view","kosipa.store-credit.view"])}}',
      '@/infrastructure/console/flags': 'export function consoleEnabled(){return true}',
      '@/infrastructure/console/services': 'export function kosipaServices(){return globalThis.__payrollServices}',
    };
    if (specifier in stubs) return { url: 'data:text/javascript,' + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    if (specifier.startsWith('@/')) specifier = new URL('../src/' + specifier.slice(2), import.meta.url).href;
    if (specifier.startsWith('file:') || specifier.startsWith('.')) {
      const u = new URL(specifier, context.parentURL);
      if (!/\.[a-z]+$/i.test(u.pathname)) for (const ext of ['.tsx', '.ts']) if (existsSync(fileURLToPath(u) + ext)) return next(u.href + ext, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export {};' };
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { default: PayrollListPage } = await import('../src/app/console/kosipa/payroll/page.tsx');
const { default: PayrollBatchPage } = await import('../src/app/console/kosipa/payroll/[docNo]/page.tsx');

function wire() {
  const world = makePayrollWorld({
    headers: [hdr(5, { docNo: 'POT202608001', headerTotal: BIG }), hdr(6, { docNo: 'POT202608002', headerTotal: '150000.0000' })],
    rows: [
      mrow(101, 'POT202608001', '00100', { TOKO_TAMBUN: BIG, potongan_toko: BIG, total_potongan: BIG }),
      mrow(102, 'POT202608002', '00200', { TOKO_MJ: '0.0063', potongan_toko: '0.0063', total_potongan: '150000.5000' }),
    ],
  });
  globalThis.__payrollServices = { payroll: world.reader, audit: { async append() {} }, now: () => new Date('2026-10-17T05:00:00Z') };
}
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('payroll batch list shows header totals with at most two decimals', async () => {
  wire();
  const html = renderToStaticMarkup(await PayrollListPage({ searchParams: Promise.resolve({}) }));
  assert.match(html, /<td class="num num">Rp2\.581\.645\.259,90<\/td>/);
  assert.match(html, /<td class="num num">Rp150\.000<\/td>/);
  assert.doesNotMatch(html, /,9063|Rp\s|Rp\./);
});

test('payroll batch detail: summary, component totals and member rows use two decimals, right-aligned', async () => {
  wire();
  const html = renderToStaticMarkup(await PayrollBatchPage({ params: Promise.resolve({ docNo: 'POT202608001' }), searchParams: Promise.resolve({}) }));
  const flat = text(html);
  assert.match(flat, /Total header \(tercatat\) Rp2\.581\.645\.259,90/);
  assert.match(flat, /Jumlah seluruh baris \(tercatat\) Rp2\.581\.645\.259,90/);
  assert.match(html, /<td class="num num">Rp2\.581\.645\.259,90<\/td>/);
  assert.ok((html.match(/Rp2\.581\.645\.259,90/g) ?? []).length >= 5, 'every payroll amount cell in the batch uses the two-decimal text');
  assert.doesNotMatch(html, /,9063|Rp\s|Rp\.\s/);
  assert.match(html, /scope="col" class="num"[^>]*>Total potongan/);
});

test('a sub-sen difference is never displayed as zero, and exact values stay in the data layer', async () => {
  wire();
  const html = renderToStaticMarkup(await PayrollBatchPage({ params: Promise.resolve({ docNo: 'POT202608002' }), searchParams: Promise.resolve({}) }));
  assert.match(html, /Rp150\.000,50/);                // 150000.5000 -> two decimals
  assert.match(html, /Rp0,0063/);                     // Toko MJ 0,0063 rupiah must not read as Rp0
  const batch = await (await import('@koperasi/application/kosipa/payroll')).readPayrollBatch({ reader: globalThis.__payrollServices.payroll, audit: globalThis.__payrollServices.audit, now: globalThis.__payrollServices.now }, { userId: 1, capabilities: new Set(['kosipa.payroll.view']), requestId: 'r' }, { docNo: 'POT202608001' });
  assert.equal(batch.header.headerTotal4, 25816452599063, 'the recorded amount4 keeps full precision');
});


test('every payroll and payroll-report page formats amounts only through the payroll display policy', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const roots = ['../src/app/console/kosipa/payroll', '../src/app/console/kosipa/laporan/payroll', '../src/app/console/kosipa/laporan/kualitas-data'];
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.tsx')) files.push(p); } };
  for (const root of roots) walk(fileURLToPath(new URL(root, import.meta.url)));
  assert.ok(files.length >= 5, 'payroll pages found');
  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    assert.doesNotMatch(code, /\bformatRupiah\w*\(|\bformatExactRupiah\(|money\/format|Intl\.NumberFormat|toLocaleString\(['"]id-ID['"]\)[^;]*Rp/, `${file} bypasses the payroll display policy`);
  }
});
