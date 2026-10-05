// Local read-only Sales acceptance: uses an existing synthetic login, never seeds or writes business data.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=process.env.POS_URL??'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).port,'3000');
const profile=await mkdtemp(join(tmpdir(),'kkisi-sales-browser-'));
const browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=9262',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let socket;let nextId=0;const pending=new Map();let interception;const exceptions=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});
let evaluate;let waitFor;
try{
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:9262/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert.ok(target,'headless browser started');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',async event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);else if(data.method==='Fetch.requestPaused'){try{if(interception)await interception(data.params);else await send('Fetch.continueRequest',{requestId:data.params.requestId});}catch(e){exceptions.push(e.message);}}});
 evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`UI condition timed out: ${expression}`);};
 const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true});});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 const fixture=JSON.parse(await readFile(process.env.SALES_BROWSER_FIXTURE??new URL('../.e2e-kasirpos.json',import.meta.url),'utf8'));
 await send('Page.navigate',{url:`${base}/sales`});await waitFor("!!document.querySelector('.login-card button')");await sleep(400);
 await set('input[name=username]',fixture.username);await set('input[name=password]',fixture.password);await click('.login-card button');
 await waitFor("!!document.querySelector('.pos-shell')");
 const goto=async path=>{await send('Page.navigate',{url:base+path});await waitFor("!!document.querySelector('.sales-workspace') && !document.querySelector('.sales-skeleton')");await sleep(200);};
 await send('Page.navigate',{url:base+'/products'});await waitFor("!!document.querySelector('.products-content')");
 const enabled=await evaluate("Array.from(document.querySelectorAll('.pos-sidebar nav a')).map(a=>a.getAttribute('href')).sort()");
 await goto('/sales');
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.pos-sidebar nav a')).map(a=>a.getAttribute('href')).sort()"),enabled,'sidebar permissions survive Sales navigation');
 assert.equal(await evaluate("getComputedStyle(document.querySelector('.pos-shell')).display"),'flex','direct entry loads shared styling');
 await click('.sales-primary');await waitFor("location.search.includes('from=') && !document.querySelector('.sales-skeleton')");
 assert.equal(await evaluate("!!document.querySelector('.sales-filter-error')"),false,'blank optional register is accepted');
 assert.equal(await evaluate("new URLSearchParams(location.search).has('registerId')"),false);
 await set('input[name=q]','unsaved search');await click('.sales-filter-actions a');await waitFor("document.querySelector('input[name=q]').value===''");
 const before=await evaluate('location.href');await set('input[name=from]','2026-10-06');await set('input[name=to]','2026-10-01');await click('.sales-primary');
 await waitFor("document.querySelector('.sales-filter-error')?.textContent.includes('Tanggal awal')");assert.equal(await evaluate('location.href'),before,'invalid filter stays editable without navigating');
 await waitFor("document.activeElement.className==='sales-filter-error'");
 await goto('/sales?from=2026-10-06&to=2026-10-01');assert.ok(await evaluate("!!document.querySelector('.pos-sidebar') && !!document.querySelector('.sales-filter-error')"));
 assert.equal(await evaluate("document.querySelector('input[name=from]').value"),'2026-10-06','invalid URL preserves input');
 await click('.sales-empty-state a');await waitFor("location.search==='' && !document.querySelector('.sales-skeleton')");
 await evaluate("Array.from(document.querySelectorAll('.sales-presets button')).find(b=>b.textContent==='7 hari terakhir').click()");
 assert.ok(await evaluate("document.querySelector('input[name=from]').value < document.querySelector('input[name=to]').value"));
 await set('input[name=q]','__NO_SUCH_SALE_59829__');await click('.sales-primary');await waitFor("location.search.includes('__NO_SUCH_SALE_59829__') && !document.querySelector('.sales-skeleton')");
 assert.ok(await evaluate("document.querySelector('.sales-empty-state h3')?.textContent.includes('Belum ada transaksi')"));
 await goto('/sales?source=all&salesStatus=all&from=2026-10-01&to=2026-10-05&pageSize=25');
 const baseline=await evaluate("fetch('/api/sales?source=all&salesStatus=all&from=2026-10-01&to=2026-10-05').then(async r=>({status:r.status,...await r.json()})).then(d=>({status:d.status,total:d.pagination?.total,ids:d.items?.map(i=>i.saleId)}))");
 assert.equal(baseline.status,200);assert.ok(baseline.total>0,'existing local synthetic Sales data is required; do not seed');
 assert.ok(await evaluate("!!document.querySelector('.sales-payment-chips .sales-chip')"));
 await goto('/sales?source=all&salesStatus=all&from=2026-10-01&to=2026-10-05&pageSize=1');
 await click('.sales-pagination a');await waitFor("new URLSearchParams(location.search).get('page')==='2' && !document.querySelector('.sales-skeleton')");
 assert.equal(await evaluate("document.querySelector('select[name=pageSize]').value"),'1');
 await evaluate('history.back()');await waitFor("new URLSearchParams(location.search).get('page')==='1' || !new URLSearchParams(location.search).has('page')");
 await waitFor("document.querySelector('.sales-pagination').textContent.includes('Halaman 1')");
 let delayedRequest;interception=e=>{delayedRequest=e.requestId;};
 await send('Fetch.enable',{patterns:[{urlPattern:'*/sales?*',requestStage:'Request'}]});
 await set('input[name=q]','slow-search');await click('.sales-filter-actions button[type=submit]');
 await waitFor("document.querySelector('.sales-filters')?.getAttribute('aria-busy')==='true'");
 assert.ok(await evaluate("!!document.querySelector('.pos-sidebar') && document.querySelector('.sales-filter-actions button').matches(':disabled')"));
 for(let i=0;i<100&&!delayedRequest;i++)await sleep(50);assert.ok(delayedRequest);
 await send('Fetch.continueRequest',{requestId:delayedRequest});await send('Fetch.disable');interception=null;
 await waitFor("location.search.includes('slow-search') && document.querySelector('.sales-filters')?.getAttribute('aria-busy')==='false'");
 await goto('/sales?source=all&salesStatus=all&from=2026-10-01&to=2026-10-05&pageSize=25');
 for(const[width,height]of[[1440,900],[1280,720],[768,1024],[390,844],[375,812]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(200);
  const vertical=await evaluate("({height:innerHeight,document:document.documentElement.scrollHeight,body:document.body.scrollHeight,shell:document.querySelector('.sales-shell').getBoundingClientRect().height,main:document.querySelector('.pos-main').getBoundingClientRect().height})");
  assert.ok(vertical.document<=height+1,`no body vertical overflow at ${width}: ${JSON.stringify(vertical)}`);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),`no body horizontal overflow at ${width}`);
  if(width===375){
   // Layout-only variant of existing admin branch controls. No role grants or branch mutation.
   await evaluate("(()=>{const label=document.createElement('label');label.className='pos-branch-select';label.id='sales-test-branch';label.append('Cabang');const select=document.createElement('select');const option=document.createElement('option');option.textContent='Cabang uji dengan nama sangat panjang';select.append(option);label.append(select);document.querySelector('.pos-session').prepend(label);})()");
   assert.ok(await evaluate("(()=>{const brand=document.querySelector('.pos-brand').getBoundingClientRect();const branch=document.querySelector('#sales-test-branch').getBoundingClientRect();const logout=document.querySelector('.pos-logout').getBoundingClientRect();return branch.left>=brand.right&&logout.right<=innerWidth;})()"),'mobile branch controls do not overlap logo or leave viewport');
   await evaluate("document.querySelector('#sales-test-branch').remove()");
  }
  const before=await evaluate("document.querySelector('.pos-sidebar').getBoundingClientRect().top");
  await evaluate("document.querySelector('.sales-scroll').scrollTop=10000");await sleep(100);
  assert.equal(await evaluate('scrollY'),0,`body does not scroll at ${width}`);
  assert.equal(await evaluate("document.querySelector('.pos-sidebar').getBoundingClientRect().top"),before,`sidebar does not move at ${width}`);
  assert.ok(await evaluate("document.querySelector('.sales-scroll').scrollTop>0"),`content scrolls at ${width}`);
  await evaluate("document.querySelector('.sales-scroll').scrollTop=0");
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-sales-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('.sales-scroll').scrollTop=10000");
 await click('.sales-action');await waitFor("!!document.querySelector('.sales-summary-metrics')");
 assert.ok(await evaluate("document.querySelector('.sales-scroll').scrollTop<5"),'detail starts at top');
 assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.pos-sidebar nav a')).map(a=>a.getAttribute('href')).sort()"),enabled,'detail retains sidebar');
 for(const[width,height]of[[1440,900],[390,844]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(100);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-sales-detail-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate("document.querySelector('.sales-back').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 assert.equal(await evaluate("document.activeElement===document.querySelector('.sales-back')"),false,'keyboard navigation advances');
 const saleId=await evaluate("Number(location.pathname.split('/').pop())");
 assert.ok(await evaluate("!!document.querySelector('.sale-payments-toggle')"),'test identity has payment permission');
 await click('.sale-payments-toggle');await waitFor("!!document.querySelector('.sales-payments-table') || !!document.querySelector('.sale-payments-content .sales-empty-state')");
 await click('.sale-payments-toggle');
 // Delayed read cancelled when panel is collapsed; later response must not overwrite reopened data.
 interception=()=>{};await send('Fetch.enable',{patterns:[{urlPattern:'*/api/sales/*/payments*',requestStage:'Request'}]});
 await goto(`/sales/invoice/${saleId}`);await click('.sale-payments-toggle');await waitFor("!!document.querySelector('.sales-inline-loading')");
 await click('.sale-payments-toggle');assert.equal(await evaluate("document.querySelector('.sale-payments-toggle').getAttribute('aria-expanded')"),'false');
 await send('Fetch.disable');interception=null;
 await click('.sale-payments-toggle');await waitFor("!document.querySelector('.sales-inline-loading') && !!document.querySelector('.sale-payments-content:not([hidden])')");
 // Synthetic intercepted payment read tests retry of failed page 2, without database writes.
 const pageRequests=[];let failPage2=true;
 interception=async e=>{const page=Number(new URL(e.request.url).searchParams.get('page'));pageRequests.push(page);const fail=page===2&&failPage2;if(fail)failPage2=false;const rows=[{paymentId:page,paymentDate:'2026-10-05',paymentType:'QRIS',paymentSen:10005,changeSen:0,note:'Synthetic browser note',createdBy:'Test',status:1,warnings:[]}];await send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:fail?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(fail?{error:'SALES_UNAVAILABLE'}:{rows,pagination:{page,pageSize:50,total:51,hasNext:page===1}})).toString('base64')});};
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/sales/*/payments*',requestStage:'Request'}]});
 await goto(`/sales/invoice/${saleId}`);await click('.sale-payments-toggle');await waitFor("!!document.querySelector('.sales-payments-table')");
 await click('.sale-payments-content .sales-pagination button:last-child');await waitFor("!!document.querySelector('.sale-payments-content [role=alert]')");
 await click('.sale-payments-content [role=alert] button');await waitFor("document.querySelector('.sale-payments-content .sales-pagination')?.textContent.includes('Halaman 2')");assert.deepEqual(pageRequests,[1,2,2],'retry targets the failed page');
 assert.ok(await evaluate("document.querySelector('.sales-payments-table').textContent.includes('100,05')"));
 await send('Fetch.disable');interception=null;
 // Permission/session failures expose recovery without showing cached payment rows.
 for(const status of [403,401]){
  interception=async e=>send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{"error":"FORBIDDEN"}').toString('base64')});
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/sales/*/payments*',requestStage:'Request'}]});
  await goto(`/sales/invoice/${saleId}`);await click('.sale-payments-toggle');await waitFor("!!document.querySelector('.sale-payments-content [role=alert]')");
  assert.equal(await evaluate("!!document.querySelector('.sales-payments-table')"),false);
  assert.ok(await evaluate(status===401 ? "!!document.querySelector('.sale-payments-content a[href=\"/login\"]')" : "document.querySelector('.sale-payments-content [role=alert]').textContent.includes('Izin')"));
  await send('Fetch.disable');interception=null;
 }
 await goto(`/sales/invoice/${saleId}?linePage=1&linePage=2`);assert.ok(await evaluate("document.querySelector('.sales-feedback h2')?.textContent.includes('tidak valid')"));
 await goto('/sales/invoice/2147483647');assert.ok(await evaluate("document.querySelector('.sales-feedback h2')?.textContent.includes('tidak ditemukan')"));
 await goto(`/sales/invoice/${saleId}?returnTo=${encodeURIComponent('/sales?source=all&salesStatus=all&from=2026-10-01&to=2026-10-05')}`);
 const detail=await evaluate(`fetch('/api/sales/${saleId}').then(r=>r.json()).then(d=>({allowed:d.printEligibility?.allowed}))`);
 assert.equal(detail.allowed,true,'ordinary saved checkout fixture must allow historical reprint');
 if(detail.allowed){
  await click('.sales-print');await waitFor("!!document.querySelector('.receipt-paper')");assert.ok(await evaluate("location.search.includes('mode=reprint')"));
  assert.equal(await evaluate("document.querySelector('.receipt-actions a').getAttribute('href')"),'/sales?source=all&salesStatus=all&from=2026-10-01&to=2026-10-05');
  await evaluate('window.__printCount=0;window.print=()=>window.__printCount++');await sleep(500);assert.equal(await evaluate('window.__printCount'),0);
  await click('.receipt-print-button');assert.equal(await evaluate('window.__printCount'),1);
 }else assert.ok(await evaluate("!!document.querySelector('[aria-label=\"Struk tidak dapat dicetak ulang\"]')"));
 assert.deepEqual(exceptions,[],'no browser runtime exceptions');
 console.log('PASS: direct-entry styles, permission parity, optional/invalid/empty filters, presets/reset/pagination/back, pending feedback, five viewports, independent scroll, detail/keyboard, payment cancel/retry/401/403, duplicate query/not-found, receipt eligibility/explicit print');
}finally{socket?.close();browser.kill('SIGTERM');await new Promise(resolve=>browser.once('exit',resolve));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
