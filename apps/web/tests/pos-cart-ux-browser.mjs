// Actual React UI with synthetic HTTP responses only; no database or real sales.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const modules = []; const seen = new Map();
const mocks = {
  'next/navigation': 'exports.useRouter=()=>({replace(){}});exports.usePathname=()=>"/pos";exports.notFound=()=>{throw Error("not found")};',
  'next/link': 'const React=require("react");module.exports=p=>React.createElement("a",p,p.children);',
  'next/image': 'const React=require("react");module.exports=({unoptimized,...p})=>React.createElement("img",p);',
  '@/infrastructure/auth/page-guard': 'exports.requirePagePermission=async()=>({kind:"allowed",ctx:{hasPermission:async()=>true}});',
  '@/infrastructure/repositories/prisma-receipt.repository': 'exports.PrismaReceiptRepository=class {};',
  '@koperasi/application/pos/receipt': 'exports.readReceipt=async()=>window.fixtureReceipt;',
  '@koperasi/domain/pos/sale': 'exports.PosError=class extends Error {};',
};
function bundle(file, mockName) {
  const key = mockName ?? file;
  if (seen.has(key)) return seen.get(key);
  const id = modules.length; seen.set(key, id); modules.push(null);
  let code = mockName ? mocks[mockName] : readFileSync(file, 'utf8');
  if (!mockName && /\.tsx?$/.test(file)) code = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
  const dependencies = {};
  for (const [, name] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (name.endsWith('.css')) { dependencies[name] = bundle(null, 'empty'); continue; }
    if (name in mocks) { dependencies[name] = bundle(null, name); continue; }
    let target = name.startsWith('@/') ? join(root, 'src', name.slice(2)) : name;
    if (target.startsWith('.') || target.startsWith('/')) {
      if (!target.startsWith('/')) target = resolve(dirname(file), target);
      if (!/\.(tsx?|js|json)$/.test(target)) target = [target + '.tsx', target + '.ts', target + '.js'].find(p => { try { readFileSync(p); return true; } catch { return false; } });
    } else target = createRequire(file ?? import.meta.url).resolve(target);
    dependencies[name] = bundle(target);
  }
  modules[id] = `[function(require,module,exports){${code}\n},${JSON.stringify(dependencies)}]`;
  return id;
}
mocks.empty = '';
const reactId = bundle(require.resolve('react'));
const domId = bundle(require.resolve('react-dom/client'));
const posId = bundle(join(root, 'src/components/pos/PosScreen.tsx'));
const products = [
  { id: '1', name: 'SYNTH A', code: 'ITEM-A', barcode: '8990000000001', priceSen: 100000, discountSen: 10000, stock: 1000 },
  { id: '2', name: 'SYNTH B', code: 'ITEM-B', barcode: '8990000000002', priceSen: 50000, discountSen: 0, stock: 20 },
  { id: '3', name: 'SYNTH C', code: 'ITEM-C', barcode: '8990000000003', priceSen: 25000, discountSen: 0, stock: 20000 },
].map(p => ({ ...p, companyId: '1', categoryName: 'Synthetic', imageUrl: null }));
const session = { userId: 1, companyId: 1, userName: 'Synthetic Cashier', branchName: 'Synthetic Branch', csrfToken: 'synthetic', checkoutAvailable: true, companies: [], register: { open: { noref: 'CART-UX-SYNTHETIC', stale: false }, multiple: false } };
const member = { id: 7, name: 'Synthetic Member', nik: '0007', remainingSen: 100000000, limitSen: 100000000 };
const js = `const process={env:{NODE_ENV:'production'}};const modules=[${modules.join(',')}];const cache={};function load(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(name=>load(deps[name]),m,m.exports);return m.exports;}const React=load(${reactId});load(${domId}).createRoot(document.getElementById('root')).render(React.createElement(load(${posId}).PosScreen,{products:${JSON.stringify(products)},session:${JSON.stringify(session)}}));`;
let holdScans = false; const held = []; const checkouts = []; let uncertain = false; let productRequests = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); return; }
  const styles = { '/globals.css': 'src/app/globals.css', '/pos.css': 'src/components/pos/pos.css', '/member.css': 'src/components/pos/member-kind-picker.css' };
  if (url.pathname in styles) { res.setHeader('Content-Type', 'text/css'); res.end(readFileSync(join(root, styles[url.pathname]))); return; }
  if (url.pathname.startsWith('/illustrations/')) { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#dde9fb"/></svg>'); return; }
  if (url.pathname.startsWith('/api/pos/')) {
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/products')) {
      productRequests++;
      const barcode = url.searchParams.get('barcode'); const query = url.searchParams.get('q')?.toLowerCase();
      const found = barcode ? products.filter(p => p.barcode === barcode) : query ? products.filter(p => `${p.name} ${p.code} ${p.barcode}`.toLowerCase().includes(query)) : products;
      const finish = () => res.end(JSON.stringify({ products: found }));
      if (holdScans && barcode) held.push({ barcode, finish }); else finish();
    } else if (url.pathname.endsWith('/members')) res.end(JSON.stringify({ member }));
    else if (url.pathname.endsWith('/checkout')) {
      let body = ''; for await (const part of req) body += part;
      const input = JSON.parse(body); checkouts.push(input);
      if (uncertain) { res.statusCode = 500; res.end('{}'); return; }
      const total = input.items.reduce((sum, line) => { const p = products.find(p => Number(p.id) === line.itemId); return sum + (p.priceSen - p.discountSen) * line.quantity; }, 0);
      res.end(JSON.stringify({ receipt: { saleId: 1, salesCode: 'SYNTHETIC-ONLY', grandTotalSen: total, paidSen: 10000000, changeSen: 10000000 - total, paymentType: input.paymentType } }));
    } else res.end('{}');
    return;
  }
  // Printing is outside this suite; leave its synthetic iframe empty.
  if (url.pathname.startsWith('/pos/receipt/')) { res.end('<!doctype html><title>Synthetic receipt</title>'); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html lang="id"><meta charset="utf-8"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/pos.css"><link rel="stylesheet" href="/member.css"><div id="root"></div><script src="/fixture.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const output = process.env.POS_CART_OUTPUT ?? '/private/tmp/pos-cart-ux-verification';
await mkdir(output, { recursive: true });
const row = id => page.locator('.pos-cart-item').filter({ has: page.getByText(`SYNTH ${id}`, { exact: true }) });
const qty = id => row(id).getByRole('textbox', { name: 'Jumlah', exact: true });
const order = () => page.locator('.pos-cart-name strong').allTextContents();
const scan = async id => { await page.locator('.pos-search input').fill(products.find(p => p.name === `SYNTH ${id}`).barcode); await page.locator('.pos-search input').press('Enter'); };
const waitQuantity = async (id, value) => { await page.waitForFunction(({ name, value }) => [...document.querySelectorAll('.pos-cart-item')].some(r => r.querySelector('.pos-cart-name strong').textContent === name && r.querySelector('input').value === String(value)), { name: `SYNTH ${id}`, value }); };
const waitRows = count => page.waitForFunction(count => document.querySelectorAll('.pos-cart-item').length === count, count);
const until = async condition => { for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(r => setTimeout(r, 25)); } throw Error('synthetic request not received'); };
const clear = async () => { await page.locator('.pos-clear').click(); await page.locator('.pos-confirm-clear').click(); await waitRows(0); };
const total = async () => Number((await page.locator('.pos-total > strong').innerText()).replace(/\D/g, ''));
try {
  await page.goto(`${base}/pos`); await page.locator('.pos-add').first().waitFor();
  await scan('A'); await waitRows(1); assert.deepEqual(await order(), ['SYNTH A']);
  await scan('B'); await waitRows(2); assert.deepEqual(await order(), ['SYNTH B', 'SYNTH A']);
  await scan('C'); await waitRows(3); assert.deepEqual(await order(), ['SYNTH C', 'SYNTH B', 'SYNTH A']);
  await page.evaluate(() => { window.originalQuantityNode = document.querySelectorAll('.pos-cart-item input')[2]; });
  await scan('A'); await waitQuantity('A', 2); assert.deepEqual(await order(), ['SYNTH A', 'SYNTH C', 'SYNTH B']);
  assert.equal(await page.evaluate(() => window.originalQuantityNode === document.querySelector('.pos-cart-item input')), true, 'stable key preserves the actual input node');
  assert.equal(await page.locator('.pos-search input').evaluate(e => e === document.activeElement), true, 'scan retains barcode focus');
  console.log('PASS: newest additions/repeated scans, aggregation, stable DOM identity and scanner focus');

  for (const value of ['10', '100', '1']) { await qty('A').fill(value); await qty('A').press('Enter'); await waitQuantity('A', value); assert.equal(await total(), 900 * Number(value) + 750); }
  await qty('B').fill('10'); await page.locator('.pos-center-cart h2').click(); await waitQuantity('B', 10);
  assert.deepEqual(await order(), ['SYNTH A', 'SYNTH C', 'SYNTH B'], 'manual commits do not reorder');
  await qty('A').fill(''); assert.equal(await qty('A').inputValue(), ''); assert.equal(await total(), 6150, 'draft does not recalculate');
  for (const value of ['', '0', '-1', '1.5', '1e2', 'abc', '10000', '9007199254740992']) {
    await qty('A').fill(value); await qty('A').press('Enter'); await waitQuantity('A', 1);
    assert.equal(await row('A').locator('.pos-quantity-error').isVisible(), true, `invalid ${JSON.stringify(value)} is explained`);
    assert.equal(await total(), 6150);
  }
  await qty('B').fill('21'); await qty('B').press('Tab'); await waitQuantity('B', 10);
  assert.match(await row('B').locator('.pos-quantity-error').innerText(), /Stok hanya 20/);
  await qty('A').fill('10'); await row('A').getByRole('button', { name: 'Tambah jumlah SYNTH A', exact: true }).click(); await waitQuantity('A', 11);
  await row('A').getByRole('button', { name: 'Kurangi SYNTH A', exact: true }).click(); await waitQuantity('A', 10);
  for (let i = 0; i < 5; i++) await row('A').getByRole('button', { name: 'Tambah jumlah SYNTH A', exact: true }).click();
  await waitQuantity('A', 15);
  await qty('A').fill('99'); await qty('A').press('Escape'); await waitQuantity('A', 15);
  await qty('C').fill('9999'); await qty('C').press('Enter'); await waitQuantity('C', 9999);
  assert.equal(await row('C').getByRole('button', { name: 'Tambah jumlah SYNTH C', exact: true }).isDisabled(), true);
  await qty('C').fill('1'); await qty('C').press('Enter'); await waitQuantity('C', 1);
  assert.equal(checkouts.length, 0, 'quantity Enter does not submit checkout');
  console.log('PASS: Enter/blur, 1→10→100→1, temporary empty, invalid formats, stock/max, Escape, rapid +/- and discounted totals');

  // A scanner burst must use lookup, not the focused quantity's numeric draft.
  await qty('A').focus(); await qty('A').press('ControlOrMeta+A'); await page.keyboard.type('100', { delay: 1 }); await page.keyboard.press('Enter'); await waitQuantity('A', 100);
  await qty('A').fill('15'); await qty('A').press('Enter'); await waitQuantity('A', 15);
  await qty('A').focus(); await page.keyboard.type(products[1].barcode, { delay: 1 }); await page.keyboard.press('Enter');
  await waitQuantity('B', 11); await waitQuantity('A', 15);
  assert.deepEqual(await order(), ['SYNTH B', 'SYNTH A', 'SYNTH C']);
  assert.equal(await qty('A').evaluate(e => e === document.activeElement), true, 'reordering does not steal quantity focus');
  console.log('PASS: focused quantity routes an Enter-terminated barcode burst through the existing scan handler');

  // Hold a scan while a quantity draft is active without moving focus to barcode.
  holdScans = true; const prior = held.length;
  await scan('A'); await until(() => held.length > prior);
  await qty('A').fill('100'); held.at(-1).finish(); await waitQuantity('A', 16);
  await qty('A').press('Tab'); await waitQuantity('A', 16); holdScans = false;
  assert.equal(await total(), 900 * 16 + 500 * 11 + 250, 'obsolete draft cannot overwrite scan');
  await page.reload(); await page.locator('#pos-cart-tab').click(); await waitQuantity('A', 16);
  assert.deepEqual(await order(), ['SYNTH A', 'SYNTH B', 'SYNTH C'], 'restoration retains metadata');
  await scan('B'); await waitQuantity('B', 12); assert.deepEqual(await order(), ['SYNTH B', 'SYNTH A', 'SYNTH C'], 'next order exceeds restored metadata');
  await row('C').getByRole('button', { name: 'Hapus SYNTH C', exact: true }).click(); await waitRows(2);
  assert.deepEqual(await order(), ['SYNTH B', 'SYNTH A']);
  console.log('PASS: concurrent draft/scan, removal, restoration, and subsequent scan ordering');

  await qty('B').fill('20'); await qty('B').press('Enter'); await waitQuantity('B', 20);
  holdScans = true; const fullStockScan = held.length;
  await scan('B'); await until(() => held.length > fullStockScan);
  await qty('B').fill('1'); await qty('B').press('Enter'); await waitQuantity('B', 1);
  held.at(-1).finish(); holdScans = false; await waitQuantity('B', 2);
  console.log('PASS: delayed scan checks the latest quantity after a manual stock reduction');

  await clear(); holdScans = true; const start = held.length;
  await scan('A'); await scan('B'); await scan('C'); await scan('A'); await until(() => held.length === start + 4);
  held[start + 3].finish(); await waitQuantity('A', 1);
  held[start + 2].finish(); await waitQuantity('C', 1);
  held[start + 1].finish(); await waitQuantity('B', 1);
  // A newer query must survive the oldest delayed response.
  await page.locator('.pos-search input').fill('NEW-SEARCH');
  held[start].finish(); await waitQuantity('A', 2); holdScans = false;
  assert.deepEqual(await order(), ['SYNTH A', 'SYNTH C', 'SYNTH B']);
  assert.equal(await page.locator('.pos-search input').inputValue(), 'NEW-SEARCH');
  console.log('PASS: four accepted scans resolved in reverse order retain all increments, newest order and newer search text');

  await page.locator('#pos-product-tab').click(); await page.locator('.pos-search input').fill('ITEM-B');
  await page.getByRole('button', { name: 'Tambah SYNTH B', exact: true }).click(); await waitQuantity('B', 2);
  assert.deepEqual(await order(), ['SYNTH B', 'SYNTH A', 'SYNTH C']);
  const beforeRequests = productRequests;
  await qty('A').fill('100'); await qty('A').press('Enter'); await waitQuantity('A', 100);
  await page.waitForTimeout(350); assert.ok(productRequests - beforeRequests <= 1, 'quantity editing sends no per-keystroke requests; at most the already pending catalog refresh');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await qty('A').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no overflow at ${width}px`);
    const bounds = await qty('A').boundingBox(); assert.ok(bounds.width > 35 && bounds.height > 20, 'compact quantity remains usable at POS scale');
    await page.screenshot({ path: join(output, `cart-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log('PASS: product search/add, no quantity network writes, responsive controls at five widths');

  // Exercise unchanged payment flows against the synthetic server, never a real sale.
  await page.locator('#pos-member').fill('0007'); await page.locator('.pos-member-search').evaluate(e => e.requestSubmit()); await page.locator('.pos-member-result').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Kredit Anggota', exact: true }).getAttribute('aria-pressed'), 'true');
  await qty('A').fill('1'); await qty('A').press('Enter'); await waitQuantity('A', 1);
  assert.match(await page.locator('.pos-checkout-note').innerText(), /Sisa setelah belanja/);
  await page.locator('.pos-checkout').click(); await page.locator('.pos-receipt').waitFor(); await waitRows(0);
  assert.equal(checkouts.at(-1).paymentType, 'Kredit');
  assert.deepEqual(checkouts.at(-1).items, [{ itemId: 1, quantity: 1 }, { itemId: 3, quantity: 1 }, { itemId: 2, quantity: 2 }], 'display reorders do not reverse canonical checkout payload');
  await scan('A'); await waitQuantity('A', 1); await page.getByRole('button', { name: 'QRIS', exact: true }).click();
  await page.locator('.pos-checkout').click(); await page.locator('.pos-qris-dialog-confirm').click(); await waitRows(0); assert.equal(checkouts.at(-1).paymentType, 'QRIS');
  await scan('A'); await waitQuantity('A', 1); await page.locator('#pos-paid').fill('100000');
  uncertain = true; await page.locator('.pos-checkout').click(); await page.getByText(/Hasil pembayaran belum terkonfirmasi/).waitFor();
  assert.equal(await qty('A').isDisabled(), true); assert.equal(await row('A').getByRole('button', { name: 'Kurangi SYNTH A', exact: true }).isDisabled(), true);
  const key = checkouts.at(-1).idempotencyKey;
  await page.reload(); await page.getByText(/Pembayaran sebelumnya belum terkonfirmasi/).waitFor(); await page.locator('#pos-cart-tab').click(); assert.equal(await qty('A').isDisabled(), true);
  uncertain = false; await page.locator('.pos-checkout').click(); await waitRows(0); assert.equal(checkouts.at(-1).idempotencyKey, key);
  assert.equal(checkouts.at(-1).paymentType, 'Cash');
  assert.deepEqual(errors, []);
  console.log('PASS: synthetic Kredit/QRIS/Cash checkout, canonical payload, uncertain-payment lock/reload/retry and no browser exceptions');
  await writeFile(join(output, 'result.json'), JSON.stringify({ kind: 'LOCAL_SYNTHETIC', status: 'PASS', browserErrors: errors, checkoutCount: checkouts.length, widths: [1440, 1024, 768, 390, 320] }, null, 2));
} catch (error) {
  await page.screenshot({ path: join(output, 'failure.png'), fullPage: true });
  console.error((await page.locator('body').innerText()).slice(0, 2500), errors); throw error;
} finally {
  held.forEach(item => item.finish());
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
