// Synthetic UI/print verification only. No application database or real printer is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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
const receiptId = bundle(join(root, 'src/app/pos/receipt/[id]/page.tsx'));
const product = { id: '1', companyId: '1', name: 'Synthetic product with a long packaging description', code: 'SYNTH-1', barcode: 'SYNTH-BARCODE', categoryName: 'Synthetic', priceSen: 10000, discountSen: 0, stock: 100 };
const member = { id: 7, name: 'Synthetic Member', nik: '0007', remainingSen: 1000000, limitSen: 1000000 };
const session = { userId: 1, companyId: 1, userName: 'Synthetic Cashier', branchName: 'Synthetic Branch', csrfToken: 'synthetic', checkoutAvailable: true, branches: [], register: { open: { noref: 'SYNTHETIC', stale: false }, multiple: false } };
const receipt = { salesCode: 'SYNTHETIC-RECEIPT', saleDate: '2026-10-16', cashier: 'Synthetic Cashier', customerName: 'Synthetic Member', memberNik: '0007', paymentType: 'Kredit', storeName: 'Synthetic Store', storeAddress: 'Synthetic address with a longer branch description', limitSen: 1000000, usedLimitSen: 10000, remainingLimitSen: 990000, lines: [{ name: product.name, quantity: 1, unitPriceSen: 10000, totalSen: 10000, discountSen: 0 }], subtotalSen: 10000, grandTotalSen: 10000, discountSen: 0, paidSen: 0, changeSen: 0 };
const js = `const process={env:{NODE_ENV:"production"}};const modules=[${modules.join(',')}];const cache={};function load(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(name=>load(deps[name]),m,m.exports);return m.exports;}const React=load(${reactId});const root=load(${domId}).createRoot(document.getElementById('root'));window.__printCount=0;window.print=()=>{window.__printCount++;window.dispatchEvent(new Event('beforeprint'));};window.fixtureReceipt=${JSON.stringify(receipt)};
if(location.pathname.startsWith('/pos/receipt/')){const count=Number(new URLSearchParams(location.search).get('lines')||1);window.fixtureReceipt.lines=Array.from({length:count},()=>window.fixtureReceipt.lines[0]);load(${receiptId}).default({params:Promise.resolve({id:'1'}),searchParams:Promise.resolve({autoprint:new URLSearchParams(location.search).get('autoprint')||'0'})}).then(tree=>root.render(tree));}else root.render(React.createElement(load(${posId}).PosScreen,{products:[${JSON.stringify(product)}],session:${JSON.stringify(session)}}));`;
let checkouts = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(js); return; }
  if (url.pathname.endsWith('.css')) { const names = { '/globals.css': 'src/app/globals.css', '/receipt.css': 'src/app/pos/receipt/[id]/receipt.css', '/pos.css': 'src/components/pos/pos.css', '/member.css': 'src/components/pos/member-kind-picker.css' }; res.setHeader('Content-Type', 'text/css'); res.end(readFileSync(join(root, names[url.pathname]))); return; }
  if (url.pathname.startsWith('/api/pos/')) {
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/products')) res.end(JSON.stringify({ products: [product] }));
    else if (url.pathname.endsWith('/members')) res.end(JSON.stringify({ member }));
    else if (url.pathname.endsWith('/checkout')) { for await (const chunk of req) void chunk; checkouts++; res.end(JSON.stringify({ receipt: { saleId: 1, salesCode: receipt.salesCode, grandTotalSen: 10000, paymentType: 'Kredit' } })); }
    else res.end('{}'); return;
  }
  if (url.pathname.startsWith('/illustrations/')) { res.setHeader('Content-Type', url.pathname.endsWith('.jpeg') ? 'image/jpeg' : 'image/svg+xml'); res.end(readFileSync(join(root, 'public', url.pathname))); return; }
  res.setHeader('Content-Type', 'text/html');
  // Keep the receipt directly under body, just like the application root layout.
  res.end('<!doctype html><html lang="id"><head><meta charset="utf-8"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/pos.css"><link rel="stylesheet" href="/member.css"><link rel="stylesheet" href="/receipt.css"></head><body style="margin:0"><div id="root" style="display:contents"></div><script src="/fixture.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'pos-enhancement-browser-'));
const output = process.env.POS_ENHANCEMENT_OUTPUT ?? '/private/tmp/pos-enhancement-verification';
const { mkdir } = await import('node:fs/promises'); await mkdir(output, { recursive: true });
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
let socket; let id = 0; const pending = new Map(); const exceptions = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(Error(`Timed out: ${method}`)); }, 15000); pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
let evaluate;
try {
  let port; for (let i = 0; i < 100; i++) { try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {} await sleep(100); }
  assert.ok(port, 'headless Chrome starts');
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(tab => tab.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (data.id) { const call = pending.get(data.id); pending.delete(data.id); if (data.error) call?.reject(Error(data.error.message)); else call?.resolve(data.result); } else if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text); });
  evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text); return result.result.value; };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(100); } throw Error(`UI condition: ${expression}`); };
  const set = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${base}/pos` }); await wait("!!document.querySelector('.pos-add')");
  await evaluate("document.querySelector('.pos-add').click()");
  await set('#pos-member', '0007'); await evaluate("document.querySelector('.pos-member-search').requestSubmit()"); await wait("!!document.querySelector('.pos-member-result')");
  const limit = await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.pos-member-result small'));return {font:s.fontSize,color:s.color,text:document.querySelector('.pos-member-result small').textContent};})()");
  assert.equal(limit.font, '13px'); assert.equal(limit.color, 'rgb(18, 59, 136)'); assert.match(limit.text, /Total limit/);
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(100);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), `POS fits ${width}px`);
    await writeFile(join(output, `pos-${width}.png`), Buffer.from((await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })).data, 'base64'));
  }
  await set('.pos-search input', 'BARCODE-LEFTOVER');
  await evaluate("document.querySelector('.pos-checkout').click()"); await wait("!!document.querySelector('.pos-receipt')");
  assert.equal(await evaluate("document.querySelector('.pos-search input').value"), '');
  assert.equal(await evaluate("document.querySelector('#pos-member').value"), '');
  assert.equal(await evaluate("document.querySelectorAll('.pos-member-result').length"), 0);
  await wait("document.querySelector('iframe')?.contentDocument.querySelector('.receipt-paper') && document.querySelector('iframe').contentWindow.__printCount===1");
  await sleep(750); assert.equal(await evaluate("document.querySelector('iframe').contentWindow.__printCount"), 1);
  const iframePage = await evaluate("document.querySelector('iframe').contentDocument.getElementById('receipt-page-size').textContent");
  assert.equal(checkouts, 1);
  console.log('PASS: actual React checkout clears barcode/NIK; blue enlarged limits at desktop/mobile; one automatic print');

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const lines of [1, 40, 80]) {
    await send('Page.navigate', { url: `${base}/pos/receipt/1?lines=${lines}` }); await wait("!!document.getElementById('receipt-page-size')");
    // The synthetic React mount wrapper is display:contents; move the receipt to match the real root DOM for print isolation.
    await evaluate("document.body.appendChild(document.querySelector('.receipt-screen'));void 0");
    const metrics = await evaluate("(()=>{const p=document.querySelector('.receipt-paper');const s=getComputedStyle(p);return {width:p.getBoundingClientRect().width,font:s.fontSize,padding:s.paddingLeft,rule:document.getElementById('receipt-page-size').textContent};})()");
    assert.equal(metrics.font, '13.3333px'); assert.ok(Math.abs(metrics.width - 75 * 96 / 25.4) < 1); assert.ok(parseFloat(metrics.padding) < 6);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.receipt-paper footer')).fontSize"), '13.3333px');
    if (lines === 1) assert.equal(metrics.rule, iframePage, 'narrow checkout iframe and full preview use the same print geometry');
    const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: false, printBackground: false });
    const path = join(output, `receipt-${lines}.pdf`); await writeFile(path, Buffer.from(pdf.data, 'base64'));
    const info = execFileSync('pdfinfo', [path], { encoding: 'utf8' });
    assert.match(info, /Pages:\s+1\b/, `${lines} lines must not create trailing pages`);
    const dimensions = info.match(/Page size:\s+([\d.]+) x ([\d.]+) pts/); assert.ok(Math.abs(Number(dimensions[1]) - 75 * 72 / 25.4) < 1);
    const text = execFileSync('pdftotext', [path, '-'], { encoding: 'utf8' }); assert.match(text, /HARGA SUDAH TERMASUK PPN/); assert.equal((text.match(/SYNTHETIC PRODUCT/g) ?? []).length, lines);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); await writeFile(join(output, `receipt-${lines}.png`), Buffer.from(screenshot.data, 'base64'));
    console.log(`PASS: ${lines}-line receipt PDF is one 75 mm page with footer and all items (${dimensions[2]} pts tall)`);
    if (lines === 1) {
      await evaluate("document.head.insertAdjacentHTML('beforeend','<style id=legacy-page>@page { size:auto; }</style>')");
      const baseline = await send('Page.printToPDF', { preferCSSPageSize: true, displayHeaderFooter: false });
      const baselinePath = join(output, 'receipt-auto-page-baseline.pdf'); await writeFile(baselinePath, Buffer.from(baseline.data, 'base64'));
      const baselineInfo = execFileSync('pdfinfo', [baselinePath], { encoding: 'utf8' });
      assert.match(baselineInfo, /Page size:\s+612 x 792 pts/, 'auto page uses the driver default rather than the receipt length');
      console.log('PASS: reproduced size:auto using a full Letter page after the short receipt; explicit size bounds the job');
      await evaluate("document.getElementById('legacy-page').remove()");
    }
  }
  assert.deepEqual(exceptions, [], 'no browser runtime exceptions');
} catch (error) { if (evaluate) console.error((await evaluate('document.body.innerText').catch(() => '')).slice(0, 1500), exceptions); throw error; }
finally { socket?.close(); const stopped = new Promise(resolve => chrome.once('exit', resolve)); chrome.kill('SIGTERM'); await stopped; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
