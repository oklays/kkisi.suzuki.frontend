import assert from 'node:assert/strict';
import test, {before,after} from 'node:test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {request} from 'node:http';
import {startPrototypeServer} from '../scripts/public-savings-prototype.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const axeSource=process.env.AXE_PATH ? await readFile(process.env.AXE_PATH,'utf8') : null;
assert.ok(axeSource,'Provide AXE_PATH for the required accessibility check');
const output=process.env.PROTOTYPE_OUT || '/private/tmp/kkisi-public-savings-prototype';
await mkdir(output,{recursive:true});
let preview,browser,context,page;
const requests=[],pageErrors=[],checks=[],screens=[];
before(async()=>{
  preview=await startPrototypeServer({port:0});
  browser=await chromium.launch({headless:true,channel:'chrome'});
  context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce'});
  page=await context.newPage();
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
  await page.goto(preview.url);
});
after(async()=>{
  const forbidden=requests.filter(r=>new URL(r.url).origin!==preview.url || !['GET','HEAD'].includes(r.method));
  await writeFile(output+'/results.json',JSON.stringify({checks,screens,pageErrors,forbiddenRequests:forbidden,requestCount:requests.length},null,2));
  await context?.close();await browser?.close();await preview?.close();
});
async function scenario(value) {
  await page.getByLabel('Skenario simulasi',{exact:true}).selectOption(value);
  await page.getByRole('heading',{level:1}).waitFor();
}
async function filled() {
  await page.getByLabel('Nominal potongan baru',{exact:false}).fill('150000');
  await page.getByRole('button',{name:'Gunakan contoh tanda tangan',exact:true}).click();
  await page.getByLabel('Saya telah memeriksa contoh nominal').check();
}
async function axe(label) {
  await page.evaluate(axeSource);
  const violations=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));});
  checks.push({check:'axe',label,violations});assert.deepEqual(violations,[],JSON.stringify(violations));
}
async function shot(name) {await page.screenshot({path:output+'/'+name+'.png',fullPage:true});screens.push(name+'.png');}

test('loopback preview rejects mutations, alternate hosts/origins and arbitrary file paths',async()=>{
  assert.equal(preview.server.address().address,'127.0.0.1');
  for(const [path,options,status] of [['/',{method:'POST'},405],['/.env',{},404],['/api/public/simpanan-sukarela/submissions',{},404],['/',{headers:{origin:'https://evil.test'}},403]]) {
    const result=await fetch(preview.url+path,options);assert.equal(result.status,status,path);
  }
  // Node fetch rewrites Host; use the raw HTTP client to exercise the actual rebinding guard.
  const wrongHostStatus=await new Promise((resolve,reject)=>{const req=request(preview.url,{headers:{host:'evil.test'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
  assert.equal(wrongHostStatus,403);
  const result=await fetch(preview.url);assert.match(result.headers.get('content-security-policy'),/connect-src 'none'/);
  checks.push({check:'preview boundary',status:'PASS'});
});
test('mock verification withholds identity and rejects wrong fixture code before opening the form',async()=>{
  await scenario('verification');
  assert.equal(await page.getByText('Anggota contoh',{exact:true}).count(),0);
  await axe('verification');
  await page.getByLabel('Kode verifikasi simulasi',{exact:true}).fill('000000');
  await page.getByRole('button',{name:'Verifikasi simulasi',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Kode contoh belum cocok'}).waitFor();
  await page.getByLabel('Kode verifikasi simulasi',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'Verifikasi simulasi',exact:true}).click();
  await page.getByText('Anggota contoh',{exact:true}).waitFor();
});
test('form errors are associated and focus goes to the keyboard-readable error summary',async()=>{
  await scenario('ready');
  await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('alert').evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.getByRole('alert').locator('li').count(),3);
  assert.equal(await page.getByLabel('Nominal potongan baru',{exact:false}).getAttribute('aria-invalid'),'true');
  await axe('validation errors');
});
test('draw, clear, review and edit retain the actual signature and consent draft',async()=>{
  await scenario('verification');await scenario('ready');
  const pad=page.locator('.ps-signature-pad');await pad.scrollIntoViewIfNeeded();const box=await pad.boundingBox();
  await page.mouse.move(box.x+40,box.y+50);await page.mouse.down();await page.mouse.move(box.x+100,box.y+90,{steps:5});await page.mouse.up();
  assert.ok(await pad.locator('polyline').count()>0);
  await page.getByRole('button',{name:'Hapus tanda tangan',exact:true}).click();assert.equal(await pad.locator('polyline').count(),0);
  await filled();
  const original=await pad.locator('polyline').getAttribute('points');
  await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  await page.getByRole('heading',{name:'Tinjau persetujuan contoh',exact:true}).waitFor();
  assert.equal(await page.locator('.ps-signature-preview polyline').count(),1,'review must display the actual signature being reviewed');
  assert.equal(await page.locator('.ps-signature-preview polyline').getAttribute('points'),original);
  await axe('review');
  await shot('review');
  await page.getByRole('button',{name:'Ubah isian',exact:true}).click();
  assert.equal(await page.getByLabel('Nominal potongan baru',{exact:false}).inputValue(),'150000');
  assert.equal(await page.getByLabel('Saya telah memeriksa contoh nominal').isChecked(),true);
  assert.equal(await pad.locator('polyline').count(),1,'return from review must retain signature strokes');
  assert.equal(await pad.locator('polyline').getAttribute('points'),original);
});
test('mock submit failure retries the same draft and success explicitly denotes a simulation',async()=>{
  await scenario('submit-error');await filled();
  await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  await page.getByRole('button',{name:'Kirim simulasi',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Simulasi pengiriman belum berhasil'}).waitFor();
  await axe('submit failure');await shot('submit-error');
  await page.getByRole('button',{name:'Coba kirim simulasi lagi',exact:true}).click();
  await page.getByRole('heading',{name:'Pengajuan contoh berhasil ditinjau'}).waitFor();
  assert.match(await page.locator('main').innerText(),/Tidak ada potongan payroll/);
  await axe('simulation success');await shot('success');
});
test('all terminal/loading states expose a labelled safe outcome without a submission form',async()=>{
  for(const state of ['loading','invalid','expired','revoked','consumed','unavailable']) {
    await scenario(state);
    assert.equal(await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).count(),0);
    assert.match(await page.locator('.ps-demo-banner').innerText(),/SIMULASI/);
    await axe(state);
  }
  await page.getByRole('button',{name:'Coba lagi',exact:true}).click();await page.getByLabel('Kode verifikasi simulasi',{exact:true}).waitFor();
});
test('responsive layouts, long amount, 200% zoom and keyboard focus have no clipped page',async()=>{
  await scenario('ready');
  assert.match(await page.locator('.ps-prototype').evaluate(el=>getComputedStyle(el).fontFamily),/system-ui|Segoe UI|sans-serif/,'standalone preview must resolve the existing sans-serif fallback without console font variables');
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:1050});
    await page.getByLabel('Nominal potongan baru',{exact:false}).fill('9000000000000000');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`page overflow at ${width}`);
    assert.ok(await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).isVisible());
    await axe(`ready ${width}`);
    await page.getByLabel('Nominal potongan baru',{exact:false}).fill('150000');
    if([390,1440].includes(width))await shot(`form-${width}`);
  }
  await page.setViewportSize({width:1280,height:1100});await page.evaluate(()=>{document.body.style.zoom='2';});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'200% zoom overflow');
  await page.getByLabel('Nominal potongan baru',{exact:false}).focus();await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button',{name:'Gunakan contoh tanda tangan',exact:true}).evaluate(el=>document.activeElement===el),true);
  const outline=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);assert.notEqual(outline,'none');
  await shot('zoom-200');await page.evaluate(()=>{document.body.style.zoom='';});
  checks.push({check:'responsive/zoom/keyboard',widths:[320,390,768,1440],zoom:'200%',status:'PASS'});
});
test('the browser made no outbound/submission requests and no persistent data was stored',async()=>{
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(requests.filter(r=>new URL(r.url).origin!==preview.url || !['GET','HEAD'].includes(r.method)),[]);
  assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length,cookie:document.cookie})),{local:0,session:0,cookie:''});
  checks.push({check:'network/storage/runtime isolation',status:'PASS'});
});
