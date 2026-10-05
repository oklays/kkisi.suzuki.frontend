// Dependency-free headless browser check against the local product read page. Authentication uses an existing ignored test fixture; no product writes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=process.env.POS_URL??'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).port,'3000');
const profile=await mkdtemp(join(tmpdir(),'kkisi-products-browser-'));
const browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=9258',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let socket;let nextId=0;const pending=new Map();let interception;const exceptions=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});
let evaluate;let waitFor;
try{
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:9258/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert.ok(target,'headless browser started');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',async event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);else if(data.method==='Fetch.requestPaused'){try{if(interception)await interception(data.params);else await send('Fetch.continueRequest',{requestId:data.params.requestId});}catch(e){exceptions.push(e.message);}}});
 evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`UI condition timed out: ${expression}`);};
 const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const select=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 const fixture=JSON.parse(await readFile(process.env.PRODUCTS_BROWSER_FIXTURE??new URL('../.e2e-kasirpos.json',import.meta.url),'utf8'));
 await send('Page.navigate',{url:`${base}/products`});await waitFor("!!document.querySelector('.login-card button')");await sleep(300);
 await set('input[name=username]',fixture.username);await set('input[name=password]',fixture.password);await click('.login-card button');
 await waitFor("!!document.querySelector('a[href=\"/products\"]')");await click('a[href="/products"]');
 await waitFor("document.querySelectorAll('.products-name').length>0 && !document.querySelector('.products-skeleton-row')");
 assert.equal(await evaluate("document.querySelector('a[href=\"/products\"]').getAttribute('aria-current')"),'page');
 assert.equal(await evaluate("document.querySelectorAll('.products-name').length"),25);
 const baseline=await evaluate("fetch('/api/products').then(r=>r.json()).then(d=>({total:d.total,barcode:d.items.find(i=>i.barcode)?.barcode}))");assert.ok(baseline.total>25);
 const counts=await evaluate("Promise.all(['all','inactive'].map(status=>fetch('/api/products?status='+status).then(r=>r.json()).then(d=>d.total)))");assert.ok(counts[0]>=counts[1]);
 const foreign=await evaluate("fetch('/api/products?companyId=999999').then(r=>r.json()).then(d=>d.total)");assert.equal(foreign,baseline.total);
 await click('button[aria-label="Halaman berikutnya"]');await waitFor("document.querySelector('.products-pagination').textContent.includes('Halaman 2 /') && !document.querySelector('.products-skeleton-row')");
 await click('.products-row-actions .products-detail-button:not(.products-edit-button)');await waitFor("document.querySelector('.products-dialog').open");
 assert.ok(await evaluate("document.querySelector('.products-dialog').textContent.includes('Barcode kemasan')"));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});
 await waitFor("!document.querySelector('.products-dialog').open");assert.equal(await evaluate("document.activeElement.className"),'products-detail-button');
 await set('.products-search input',baseline.barcode);await waitFor("document.querySelectorAll('.products-name').length>0 && !document.querySelector('.products-skeleton-row') && document.querySelector('.products-pagination').textContent.includes('Halaman 1 /')");
 await set('.products-search input','__NO_SUCH_PRODUCT_82716__');await waitFor("document.querySelector('.products-empty strong')?.textContent==='Produk tidak ditemukan'");assert.equal(await evaluate("document.querySelector('.products-actions button:nth-child(2)').disabled"),true);
 await click('.products-empty button');await waitFor("document.querySelectorAll('.products-name').length===25");
 await evaluate("Array.from(document.querySelectorAll('.products-stock-tabs button')).find(b=>b.textContent==='Stok habis').click()");await waitFor("document.querySelectorAll('.products-name').length>0 && !document.querySelector('.products-skeleton-row')");
 assert.ok(await evaluate("Array.from(document.querySelectorAll('.products-stock-number')).every(e=>Number(e.textContent.replace(/[^0-9-]/g,''))<=0)"));
 await click('.products-reset');await waitFor("document.querySelectorAll('.products-name').length===25");
 await select('.products-filters label:first-of-type select',await evaluate("document.querySelector('.products-filters label:first-of-type select option:nth-child(2)').value"));await waitFor("!!document.querySelector('.products-reset') && !document.querySelector('.products-skeleton-row')");
 assert.ok(await evaluate("new Set(Array.from(document.querySelectorAll('.products-table tbody tr td:nth-child(3)>span')).map(e=>e.textContent)).size<=1"));
 await click('.products-reset');await waitFor("document.querySelectorAll('.products-name').length===25");
 // Capture the actual generated download without navigating away or opening the remote forms.
 await evaluate("window.__productCsv=null;window.__productDownload=null;const native=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__productDownload=this.download;fetch(this.href).then(r=>r.text()).then(t=>window.__productCsv=t);}else{native.call(this);}};");
 await click('.products-actions button:nth-child(2)');await waitFor("!!window.__productCsv");assert.equal(await evaluate("window.__productCsv.split('\\r\\n').length"),26);assert.match(await evaluate("window.__productDownload"),/halaman-1\.csv$/);
 assert.equal(await evaluate("!!document.querySelector('.products-actions a') || document.querySelector('.products-actions .products-primary')?.textContent"),'Tambah produk','add is native, no legacy link');
 // Error state and retry use real rendered UI with one deliberately failed read.
 interception=async e=>send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{"error":"PRODUCTS_UNAVAILABLE"}').toString('base64')});
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/products*',requestStage:'Request'}]});await click('.products-actions button:first-child');await waitFor("document.querySelector('.products-empty strong')?.textContent==='Produk belum dapat ditampilkan'");
 assert.equal(await evaluate("document.querySelector('.products-actions button:nth-child(2)').disabled"),true);
 await send('Fetch.disable');interception=null;await click('.products-empty button');await waitFor("document.querySelectorAll('.products-name').length===25");
 for(const[width,height]of[[1440,900],[1280,720],[1024,768],[768,1024],[390,844],[320,700]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(200);
  const dimensions=await evaluate("({width:document.documentElement.scrollWidth,view:innerWidth,content:document.querySelector('.products-content').getBoundingClientRect().width})");assert.ok(dimensions.width<=width,`page overflow at ${width}: ${JSON.stringify(dimensions)}`);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-products-${width}.png`,Buffer.from(shot.data,'base64'));
  await click('.products-row-actions .products-detail-button:not(.products-edit-button)');await waitFor("document.querySelector('.products-dialog').open");
  assert.ok(await evaluate("(()=>{const r=document.querySelector('.products-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'detail dialog fits viewport');
  if(width===390){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('/private/tmp/kkisi-products-detail-390.png',Buffer.from(shot.data,'base64'));}
  await click('button[aria-label="Tutup detail produk"]');
 }
 assert.deepEqual(exceptions,[],'no browser runtime errors');
 console.log('PASS: live catalog, session company isolation, pagination, detail/Escape/focus, barcode search, category/empty-stock filters, empty reset, CSV, error/retry, six responsive viewports');
}catch(error){if(evaluate)console.error('UI verification failed:',error.message,await evaluate('({focus:document.hasFocus(),active:document.activeElement?.className,dialog:document.querySelector(".products-dialog")?.open})')); throw error;}
finally{socket?.close();browser.kill('SIGTERM');await new Promise(resolve=>browser.once('exit',resolve));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
