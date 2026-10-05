// Dependency-free headless browser check against the local product edit page. Writes are restricted to marked synthetic test products. Authentication uses an existing ignored test fixture; No replicated products are edited.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prisma} from '../src/infrastructure/db/prisma.ts';
const base=process.env.POS_URL??'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).port,'3000');
const profile=await mkdtemp(join(tmpdir(),'kkisi-products-browser-'));
const browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=9260',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let socket;let nextId=0;const pending=new Map();let interception;const exceptions=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});
let evaluate;let waitFor;
try{
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:9260/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert.ok(target,'headless browser started');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',async event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);else if(data.method==='Fetch.requestPaused'){try{if(interception)await interception(data.params);else await send('Fetch.continueRequest',{requestId:data.params.requestId});}catch(e){exceptions.push(e.message);}}});
 evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`UI condition timed out: ${expression}`);};
 const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const select=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 const fixture=JSON.parse(await readFile(new URL('../.e2e-kasirpos.json',import.meta.url),'utf8'));
 const products=JSON.parse(await readFile(new URL('../.e2e-product-edit.json',import.meta.url),'utf8'));
 const id=products.ids[0],code=`NXT-PROD-${id}`;
 const baseline=await prisma.$queryRaw`SELECT item_code,item_name,stock FROM db_items WHERE id=${id}`;assert.equal(baseline[0].item_code,code);assert.ok(baseline[0].item_name.startsWith('NXT PRODUCT EDIT TEST'));
 await send('Page.navigate',{url:`${base}/products`});await waitFor("!!document.querySelector('.login-card button')");await sleep(300);
 await set('input[name=username]',fixture.username);await set('input[name=password]',fixture.password);await click('.login-card button');await waitFor("!!document.querySelector('a[href=\"/products\"]')");await click('a[href="/products"]');await waitFor("document.querySelectorAll('.products-name').length>0 && !document.querySelector('.products-skeleton-row')");
 await set('.products-search input',code);await waitFor("document.querySelectorAll('.products-name').length===1 && !document.querySelector('.products-skeleton-row')");
 async function open(){await click('.products-edit-button');await waitFor("document.querySelector('.products-editor')?.open && !!document.querySelector('input[name=sku]') && !document.querySelector('.product-editor-loading')");}
 async function saved(){await waitFor("!document.querySelector('.products-editor') && !document.querySelector('.products-skeleton-row') && !!document.querySelector('.product-editor-success')");}
 await open();
 assert.equal(await evaluate("document.querySelector('.product-editor-form button[type=submit]').disabled"),false,'local writer activated');
 await set('input[name=sku]',`NXT-SKU-${id}-EDITED`);await set('input[name=name]','NXT PRODUCT EDIT TEST updated');await set('input[name=sellingPrice]','4500.25');await set('input[name=alertQty]','4');await select('select[name=active]','0');
 await evaluate("document.querySelector('.product-editor-form').requestSubmit()");await saved();
 const metadata=await prisma.$queryRaw`SELECT sku,item_name,sales_price,alert_qty,status,stock FROM db_items WHERE id=${id}`;assert.equal(metadata[0].sku,`NXT-SKU-${id}-EDITED`);assert.equal(metadata[0].item_name,'NXT PRODUCT EDIT TEST updated');assert.equal(metadata[0].sales_price,4500.25);assert.equal(metadata[0].status,0);assert.equal(metadata[0].stock,10);
 await open();assert.equal(await evaluate("document.querySelector('input[name=sku]').value"),`NXT-SKU-${id}-EDITED`);assert.equal(await evaluate("document.querySelector('select[name=active]').value"),'0');
 // Conflicting metadata edit through a second valid request while the UI holds the old revision.
 assert.equal(await evaluate(`(async()=>{const d=await fetch('/api/products/edit?id=${id}').then(r=>r.json());return (await fetch('/api/products/edit',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':${JSON.stringify('TOKEN_PLACEHOLDER')}},body:JSON.stringify({action:'save',...d.snapshot.product,name:'NXT PRODUCT EDIT TEST concurrent'})})).status;})()`),403,'invalid CSRF is rejected');
 // Real CSRF is captured from the UI's own next paused request, never from browser session storage.
 let paused;
 interception=async event=>{if(!paused)paused=event;else await send('Fetch.continueRequest',{requestId:event.requestId});};await send('Fetch.enable',{patterns:[{urlPattern:'*/api/products/edit',requestStage:'Request'}]});
 await set('input[name=name]','NXT PRODUCT EDIT TEST attempted');await evaluate("document.querySelector('.product-editor-form').requestSubmit()");
 for(let i=0;i<100&&!paused;i++)await sleep(50);assert.ok(paused);
 const mutation=JSON.parse(paused.request.postData),csrf=paused.request.headers['X-CSRF-Token']??paused.request.headers['x-csrf-token'];assert.ok(csrf);
 // Disable interception then submit a competing edit before releasing the paused original.
 const competing=await evaluate(`fetch('/api/products/edit',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':${JSON.stringify(csrf)}},body:JSON.stringify(${JSON.stringify({...mutation,name:'NXT PRODUCT EDIT TEST concurrent'})})}).then(r=>r.status)`);
 // This request is also paused; handle only the already held request, continue subsequent ones.
 assert.equal(competing,200);
 await send('Fetch.continueRequest',{requestId:paused.requestId});await send('Fetch.disable');interception=null;
 await waitFor("document.querySelector('.product-editor-error')?.textContent.includes('berubah sejak form dibuka')");assert.equal(await evaluate("document.querySelector('.product-editor-form button[type=submit]').disabled"),true);
 await click('.product-editor-error button');await waitFor("document.querySelector('input[name=name]')?.value==='NXT PRODUCT EDIT TEST concurrent' && !document.querySelector('.product-editor-loading')");
 // Stock change and one exact signed legacy ledger entry.
 await click('.product-editor-tabs button:nth-child(2)');await set('input[name=quantity]','7');await select('select[name=reason]','Rusak');await evaluate("document.querySelector('.product-editor-stock').requestSubmit()");await waitFor("!!document.querySelector('.product-stock-confirm')");
 const before=await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_stockentry WHERE item_id=${id}`;
 await click('.product-editor-stock .products-primary');await saved();
 const stock=await prisma.$queryRaw`SELECT stock FROM db_items WHERE id=${id}`;assert.equal(stock[0].stock,7);const ledger=await prisma.$queryRaw`SELECT qty,note FROM db_stockentry WHERE item_id=${id} ORDER BY id DESC LIMIT 1`;assert.equal(ledger[0].qty,-3);assert.equal(ledger[0].note,'Rusak');
 // Commit the next stock save, replace only the response with 503, then recover through fresh read.
 await open();await click('.product-editor-tabs button:nth-child(2)');await set('input[name=quantity]','9');await select('select[name=reason]','Penyesuaian');await evaluate("document.querySelector('.product-editor-stock').requestSubmit()");
 interception=async event=>{await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{"error":"PRODUCTS_UNAVAILABLE"}').toString('base64')});};
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/products/edit',requestStage:'Response'}]});await click('.product-editor-stock .products-primary');await waitFor("document.querySelector('.product-editor-warning')?.textContent.includes('Simpan dinonaktifkan')");
 const uncertain=await prisma.$queryRaw`SELECT stock FROM db_items WHERE id=${id}`;assert.equal(uncertain[0].stock,9);assert.equal(await evaluate("document.querySelector('.product-editor-stock button[type=submit]').disabled"),true);
 await send('Fetch.disable');interception=null;await click('.product-editor-error button');await waitFor("document.querySelector('input[name=quantity]')?.value==='9' && !document.querySelector('.product-editor-loading')");
 const after=await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_stockentry WHERE item_id=${id}`;assert.equal(Number(after[0].n)-Number(before[0].n),2,'one reduction and one increment; recovery does not duplicate ledger');
 // Foreign branch cannot read/edit the second test item.
 assert.equal(await evaluate(`fetch('/api/products/edit?id=${products.ids[1]}').then(r=>r.status)`),404);
 for(const[width,height]of[[1440,900],[1024,768],[390,844],[320,700]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await click('.product-editor-tabs button:first-child');await sleep(150);
  assert.ok(await evaluate("(()=>{const e=document.querySelector('.products-editor');const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth;})()"),'editor fits viewport');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-product-edit-${width}.png`,Buffer.from(shot.data,'base64'));
  await click('.product-editor-tabs button:nth-child(2)');await sleep(100);const stockShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-product-stock-${width}.png`,Buffer.from(stockShot.data,'base64'));
 }
 await click('button[aria-label="Tutup edit produk"]');await waitFor("!document.querySelector('.products-editor')");assert.ok(await evaluate("document.activeElement.classList.contains('products-edit-button')"));
 assert.deepEqual(exceptions,[]);console.log('PASS: persisted native edits, refetch, CSRF, conflict/reload, atomic signed ledger, lost-response recovery without duplicate adjustment, foreign branch denial, four responsive editors and focus return');
}catch(error){console.error('Edit UI verification failed:',error.message,await evaluate('({path:location.pathname,alerts:Array.from(document.querySelectorAll("[role=alert]")).map(e=>e.textContent),buttons:Array.from(document.querySelectorAll(".login-card button")).map(e=>({text:e.textContent,disabled:e.disabled})),error:document.querySelector(".login-error")?.textContent})')); if(evaluate){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/kkisi-product-edit-failure.png',Buffer.from(shot.data,'base64'));}throw error;}
finally{await prisma.$disconnect();socket?.close();browser.kill('SIGTERM');await new Promise(resolve=>browser.once('exit',resolve));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
