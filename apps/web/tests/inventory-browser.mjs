// Dependency-free headless browser check against ONLY the disposable synthetic POS environment.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=process.env.POS_URL??'http://127.0.0.1:3126';
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).port,'3126');
const profile=await mkdtemp(join(tmpdir(),'kkisi-inventory-browser-'));
const browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=9255',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let socket;let nextId=0;const pending=new Map();let interception;const exceptions=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});
let evaluate;let waitFor;
try{
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:9255/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert.ok(target,'headless browser started');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',async event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);else if(data.method==='Fetch.requestPaused'){try{if(interception)await interception(data.params);else await send('Fetch.continueRequest',{requestId:data.params.requestId});}catch(e){exceptions.push(e.message);}}});
 evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`UI condition timed out: ${expression}`);};
 const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const clickText=async(selector,text)=>evaluate(`(()=>{const e=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Button missing');e.click();})()`);
 const select=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const submit=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`);
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`${base}/inventory`});await waitFor("!!document.querySelector('.login-card button')");await sleep(400);
 await set('input[name="username"]','syntheticadmin');await set('input[name="password"]','Synthetic-Pos-1');await click('.login-card button');
 await waitFor("document.querySelectorAll('.pos-product-card').length===25");
 assert.equal(await evaluate("document.querySelectorAll('.pos-tabs [role=tab]').length"),2);
 await click('a[href="/inventory"]');await waitFor("!!document.querySelector('.inventory-content') && !document.body.textContent.includes('Memuat dokumen…')");
 assert.equal(await evaluate("document.querySelectorAll('.inventory-tabs [role=tab]').length"),2);
 await evaluate("document.querySelector('#inventory-stock-tab').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));");
 await waitFor("document.activeElement?.id==='inventory-warehouse-tab' && document.querySelector('#inventory-warehouse-tab').getAttribute('aria-selected')==='true'");
 assert.equal(await evaluate("document.querySelector('#inventory-stock-tab').tabIndex"),-1);
 await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));");await waitFor("document.activeElement?.id==='inventory-stock-tab'");
 await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));");await waitFor("document.activeElement?.id==='inventory-warehouse-tab'");
 await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));");await waitFor("document.activeElement?.id==='inventory-stock-tab'");
 assert.equal(await evaluate("document.querySelector('#inventory-stock-panel').tabIndex"),0);
 console.log('PASS: 25 initial products and authorized inventory navigation');
 async function createDraft(period){
  await clickText('.inventory-section-title button','Buat draft');await set('input[name="period"]',period);assert.match(await evaluate("document.querySelector('input[name=startDate]').value"),/^\d{4}-\d{2}-\d{2}$/);
  await submit('.inventory-form');await waitFor(`document.querySelector('.inventory-detail h2')?.textContent===${JSON.stringify(period)} && !document.querySelector('.inventory-form')`);
  await waitFor("document.querySelectorAll('.inventory-item-options button').length>0");
 }
 async function saveCount(count){
  await evaluate("Array.from(document.querySelectorAll('.inventory-item-options button')).find(b=>b.querySelector('strong')?.textContent==='SYNTHETIC ITEM 1').click()");
  await set('input[aria-label="Jumlah fisik"]',String(count));await submit('.inventory-count-form');await waitFor("document.querySelectorAll('.inventory-count-table tbody tr').length===1 && !document.querySelector('.inventory-count-form')");
 }
 await createDraft('Browser physical count');await saveCount(17);
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.inventory-count-table tbody tr td')).slice(1,4).map(e=>e.textContent.trim())"),['20','17','-3']);
 await clickText('.inventory-actions button','Setujui & perbarui stok');await waitFor("document.querySelector('.inventory-confirm')?.open");await clickText('.inventory-confirm button','Ya, setujui');
 await waitFor("document.querySelector('.inventory-detail .inventory-badge')?.textContent==='Disetujui'");assert.equal(await evaluate("document.querySelectorAll('.inventory-count-form').length"),0);
 console.log('PASS: create, physical count, confirm approval and immutable rendered result');
 // Retain requested ID and loading state even when the first detail request fails.
 let detailRequest;
 interception=async event=>{detailRequest=event;};await send('Fetch.enable',{patterns:[{urlPattern:'*/api/inventory/stock-opnames?id=*',requestStage:'Request'}]});
 await evaluate("Array.from(document.querySelectorAll('.inventory-document-list button')).find(b=>b.querySelector('strong')?.textContent==='Browser physical count').click()");
 await waitFor("document.querySelector('.inventory-detail')?.textContent.includes('Memuat detail dokumen…')");
 for(let i=0;i<100&&!detailRequest;i++)await sleep(50);assert.ok(detailRequest);
 const failedDetailUrl=detailRequest.request.url;
 await send('Fetch.fulfillRequest',{requestId:detailRequest.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:'INVENTORY_UNAVAILABLE'})).toString('base64')});
 await waitFor("!!document.querySelector('.inventory-error')");
 let retriedDetailUrl;interception=async event=>{retriedDetailUrl=event.request.url;await send('Fetch.continueRequest',{requestId:event.requestId});};
 await clickText('.inventory-error button','Coba lagi');await waitFor("document.querySelector('.inventory-detail h2')?.textContent==='Browser physical count' && !document.querySelector('.inventory-error')");
 assert.equal(retriedDetailUrl,failedDetailUrl,'retry repeats the failed detail ID without selecting a row again');
 await send('Fetch.disable');interception=null;
 console.log('PASS: failed detail read shows loading and retries the same document');
 await createDraft('Browser cancellation');await saveCount(0);await clickText('.inventory-actions button','Batalkan draft');await waitFor("document.querySelector('.inventory-confirm')?.open");await clickText('.inventory-confirm button','Ya, batalkan');
 await waitFor("document.body.textContent.includes('Draft dibatalkan') && !document.querySelector('.inventory-count-area')");
 assert.equal(await evaluate("document.querySelector('.inventory-document-list')?.textContent.includes('Browser cancellation')"),false);
 console.log('PASS: counted zero and confirmed draft cancellation');
 // Lose the create COMMIT response, leave its form, then recover the exact original request.
 await clickText('.inventory-section-title button','Buat draft');
 const frozen={period:'Browser uncertain original',startDate:'2026-09-02',endDate:'2026-09-21',remarks:'Original frozen create note'};
 for(const[name,value]of Object.entries(frozen))await set(`[name="${name}"]`,value);
 let originalCreate;
 interception=async event=>{if(event.request.method==='POST'){originalCreate=JSON.parse(event.request.postData);await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Aborted'});}else await send('Fetch.continueRequest',{requestId:event.requestId});};
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/inventory/stock-opnames',requestStage:'Response'}]});await submit('.inventory-form');
 await waitFor("document.querySelector('.inventory-form')?.textContent.includes('Hasil belum terkonfirmasi') && !!document.querySelector('.inventory-error')");assert.ok(originalCreate.requestKey);
 await send('Fetch.disable');interception=null;await click('#inventory-warehouse-tab');await waitFor("!!document.querySelector('#inventory-warehouse-panel')");
 await click('#inventory-stock-tab');await waitFor("!!document.querySelector('.inventory-form') && Array.from(document.querySelectorAll('.inventory-document-list button')).some(b=>b.querySelector('strong')?.textContent==='Browser physical count')");
 // Selecting another document and reopening recovery also remounts the form.
 await evaluate("Array.from(document.querySelectorAll('.inventory-document-list button')).find(b=>b.querySelector('strong')?.textContent==='Browser physical count').click()");await waitFor("document.querySelector('.inventory-detail h2')?.textContent==='Browser physical count'");
 await clickText('.inventory-section-title button','Periksa draft sebelumnya');
 for(const[name,value]of Object.entries(frozen))assert.equal(await evaluate(`document.querySelector('[name="${name}"]').value`),value,`frozen ${name} visible after remount`);
 assert.equal(await evaluate("document.querySelector('.inventory-form fieldset').disabled"),true);
 let retriedCreate;interception=async event=>{if(event.request.method==='POST')retriedCreate=JSON.parse(event.request.postData);await send('Fetch.continueRequest',{requestId:event.requestId});};
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/inventory/stock-opnames',requestStage:'Request'}]});await submit('.inventory-form');
 await waitFor("document.querySelector('.inventory-detail h2')?.textContent==='Browser uncertain original' && !document.querySelector('.inventory-form')");
 assert.deepEqual(retriedCreate,originalCreate,'create recovery sends the same request key and visible frozen payload');
 await send('Fetch.disable');interception=null;
 await clickText('.inventory-actions button','Batalkan draft');await clickText('.inventory-confirm button','Ya, batalkan');await waitFor("!document.querySelector('.inventory-count-area')");
 console.log('PASS: uncertain create preserves visible payload across tab/document remount and retries identical request');
 // Leave an admin-owned managed draft so the branch user can inspect its read-only presentation.
 await createDraft('Browser administrator owned draft');
 await click('#inventory-warehouse-tab');await waitFor("!document.body.textContent.includes('Memuat warehouse…')");await clickText('.inventory-section-title button','Tambah warehouse');
 await set('input[name="name"]','Browser Main Warehouse');await set('input[name="mobile"]','012345');await set('input[name="email"]','browser@example.test');await submit('.inventory-warehouse-form');
 await waitFor("document.querySelector('.inventory-count-table')?.textContent.includes('Browser Main Warehouse') && !document.querySelector('.inventory-warehouse-form')");
 await clickText('.inventory-count-table button','Ubah');await select('select[name=status]','0');await submit('.inventory-warehouse-form');await waitFor("document.querySelector('.inventory-count-table')?.textContent.includes('Nonaktif') && !document.querySelector('.inventory-warehouse-form')");
 await clickText('.inventory-count-table button','Ubah');await select('select[name=status]','1');await submit('.inventory-warehouse-form');await waitFor("document.querySelector('.inventory-count-table')?.textContent.includes('Aktif') && !document.querySelector('.inventory-warehouse-form')");
 console.log('PASS: global warehouse create, confirmed deactivate and reactivate');
 // Read failure is visible and retry recovers against the live API.
 interception=event=>send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:'INVENTORY_UNAVAILABLE'})).toString('base64')});
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/inventory/warehouses',requestStage:'Request'}]});await clickText('.inventory-toolbar button','Muat ulang');await waitFor("!!document.querySelector('.inventory-error')");
 await send('Fetch.disable');interception=null;await clickText('.inventory-error button','Coba lagi');await waitFor("!document.querySelector('.inventory-error') && document.querySelector('.inventory-count-table')?.textContent.includes('Browser Main Warehouse')");
 // Branch switching follows server session. Admin has no owned register and can switch.
 await select('.inventory-header .pos-branch-select select','2');await waitFor("document.querySelector('.pos-store strong')?.textContent==='Synthetic 2' && !!document.querySelector('#inventory-stock-panel') && !document.body.textContent.includes('Memuat dokumen…')");
 assert.equal(await evaluate("document.querySelectorAll('.inventory-document-list li').length"),0,'branch2 cannot see branch1 SO');
 await click('#inventory-warehouse-tab');await waitFor("document.querySelector('.inventory-count-table')?.textContent.includes('Browser Main Warehouse')");
 assert.match(await evaluate("document.querySelector('.inventory-count-table').textContent"),/Browser Main Warehouse/,'global warehouse survives branch switch');
 await click('#inventory-stock-tab');await waitFor("!document.body.textContent.includes('Memuat dokumen…')");assert.equal(await evaluate("document.querySelectorAll('.inventory-document-list li').length"),0,'branch2 cannot see branch1 SO');
 console.log('PASS: safe load error/retry and session branch isolation');
 // Sign out administrator, sign in a branch-only inventory user.
 await click('.inventory-header .pos-logout');await waitFor("!!document.querySelector('.login-card button')");await sleep(250);await set('input[name=username]','synthetic1');await set('input[name=password]','Synthetic-Pos-1');await click('.login-card button');await waitFor("document.querySelectorAll('.pos-product-card').length>0");await click('a[href="/inventory"]');await waitFor("!!document.querySelector('.inventory-document-list li')");
 assert.equal(await evaluate("document.querySelectorAll('.inventory-tabs [role=tab]').length"),1);
 assert.equal(await evaluate("fetch('/api/inventory/warehouses',{cache:'no-store'}).then(r=>r.status)"),403);
 await evaluate("Array.from(document.querySelectorAll('.inventory-document-list button')).find(b=>b.querySelector('strong')?.textContent==='Browser administrator owned draft').click()");
 await waitFor("document.querySelector('.inventory-detail h2')?.textContent==='Browser administrator owned draft'");
 assert.equal(await evaluate("document.querySelectorAll('.inventory-count-area').length"),0,'other creators draft is read-only');
 assert.match(await evaluate("document.querySelector('.inventory-detail').textContent"),/hanya dapat diubah oleh pembuatnya/);
 assert.equal(await evaluate("Array.from(document.querySelectorAll('.inventory-detail button')).some(b=>/Batalkan draft|Setujui/.test(b.textContent))"),false);
 await createDraft('Browser responsive worksheet');await saveCount(17);
 for(const[width,height]of[[1440,900],[1440,674],[1024,768],[768,1024],[390,844],[320,700]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(150);
  const metrics=await evaluate("({width:document.documentElement.scrollWidth,viewport:innerWidth,table:document.querySelector('.inventory-table-scroll')?.getBoundingClientRect().width})");assert.ok(metrics.width<=width,`no horizontal page overflow at ${width}: ${JSON.stringify(metrics)}`);
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-inventory-${width}-${height}.png`,Buffer.from(screenshot.data,'base64'));
 }
 assert.deepEqual(exceptions,[],'no browser runtime exceptions');console.log('PASS: role-scoped warehouse denial, six responsive viewports and no runtime exceptions');
}catch(error){if(evaluate)console.error('Visible UI:',(await evaluate('document.body.innerText').catch(()=>'' )).slice(0,2500));throw error;}
finally{socket?.close();browser.kill('SIGTERM');await new Promise(resolve=>browser.once('exit',resolve));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
