// Dependency-free headless browser check of native product add against local kkisi-staging. Creates only marked draft test products
// (barcode NXTADDUI…, name NXT PRODUCT ADD UI TEST) and removes exactly those rows and their ledger entries afterwards.
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prisma} from '../src/infrastructure/db/prisma.ts';
const base=process.env.POS_URL??'http://127.0.0.1:3000';
assert.equal(new URL(base).hostname,'127.0.0.1');assert.equal(new URL(base).port,'3000');
const marker=`NXTADDUI${Date.now()}`,testName='NXT PRODUCT ADD UI TEST';
const profile=await mkdtemp(join(tmpdir(),'kkisi-product-add-browser-'));
const browser=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-port=9261',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let socket;let nextId=0;const pending=new Map();let interception;const exceptions=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timed out: ${method}`));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});socket.send(JSON.stringify({id,method,params}));});
let evaluate;let waitFor;
function cleanup(){
 // Exact marker match only; the dedicated writer cannot delete, so local staging root performs the cleanup.
 const dir=fileURLToPath(new URL('../',import.meta.url));process.loadEnvFile(`${dir}.env.staging`);
 const ports=spawnSync('docker',['port','kkisi-staging','3306/tcp'],{encoding:'utf8'}).stdout.trim();if(ports!=='127.0.0.1:3307')throw new Error('Cleanup only runs against local kkisi-staging');
 const sql=`DELETE e FROM db_stockentry e JOIN db_items i ON i.id=e.item_id WHERE i.custom_barcode LIKE '${marker}%' AND i.item_name='${testName}';
DELETE FROM db_items WHERE custom_barcode LIKE '${marker}%' AND item_name='${testName}';`;
 const result=spawnSync('docker',['exec','-i','-e','MYSQL_PWD','kkisi-staging','mariadb','-uroot','kkisi_staging'],{input:sql,encoding:'utf8',env:{...process.env,MYSQL_PWD:process.env.MARIADB_ROOT_PASSWORD}});
 if(result.status!==0)throw new Error('Cleanup failed; inspect marker '+marker);
}
try{
 let target;for(let i=0;i<100;i++){try{target=(await(await fetch('http://127.0.0.1:9261/json/list')).json()).find(t=>t.type==='page');if(target)break;}catch{}await sleep(100);}assert.ok(target,'headless browser started');
 socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',async event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(new Error(data.error.message));else p.resolve(data.result);}}else if(data.method==='Runtime.exceptionThrown')exceptions.push(data.params.exceptionDetails.text);else if(data.method==='Fetch.requestPaused'){try{if(interception)await interception(data.params);else await send('Fetch.continueRequest',{requestId:data.params.requestId});}catch(e){exceptions.push(e.message);}}});
 evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 waitFor=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error(`UI condition timed out: ${expression}`);};
 const set=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input ${selector}');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const click=async selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const choose=async(selector,predicate)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const o=Array.from(e.options).find(o=>o.value&&(${predicate})(o));if(!o)throw Error('No option for ${selector}');e.value=o.value;e.dispatchEvent(new Event('change',{bubbles:true}));return o.value;})()`);
 const value=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).value`);
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 const fixture=JSON.parse(await readFile(new URL('../.e2e-kasirpos.json',import.meta.url),'utf8'));
 await send('Page.navigate',{url:`${base}/products`});await waitFor("!!document.querySelector('.login-card button')");await sleep(300);
 await set('input[name=username]',fixture.username);await set('input[name=password]',fixture.password);await click('.login-card button');await waitFor("!!document.querySelector('a[href=\"/products\"]')");await click('a[href="/products"]');await waitFor("document.querySelectorAll('.products-name').length>0 && !document.querySelector('.products-skeleton-row')");
 const addButton=".products-actions .products-primary";
 assert.equal(await evaluate(`document.querySelector(${JSON.stringify(addButton)}).tagName`),'BUTTON','add is native, not a legacy link');
 async function open(){await click(addButton);await waitFor("document.querySelector('.products-editor')?.open && !!document.querySelector('select[name=categoryId]') && !document.querySelector('.product-editor-loading')");}
 async function fill(barcode,stock){
  await set('input[name=barcode]',barcode);
  // A scanner's Enter in the barcode field must move focus, never submit.
  await evaluate("document.querySelector('input[name=barcode]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
  assert.equal(await evaluate("!!document.querySelector('.product-stock-confirm')"),false);
  await set('input[name=name]',testName);await choose('select[name=categoryId]','o=>true');await choose('select[name=unitId]','o=>true');await set('input[name=packQuantity]','6');
  await set('input[name=basePrice]','3000');await choose('select[name=taxId]',"o=>o.textContent.includes('11%')");await choose('select[name=taxType]',"o=>o.value==='Exclusive'");
  await set('input[name=margin]','20');await set('input[name=discountPercent]','5');await set('input[name=openingStock]',String(stock));await set('input[name=alertQty]','1');
  await choose('select[name=active]',"o=>o.value==='0'");
 }
 async function review(){await evaluate("document.querySelector('.product-editor-form').requestSubmit()");await waitFor("!!document.querySelector('.product-stock-confirm')");await click('.product-editor-footer-actions .products-primary');}
 // 1. Normal save: legacy price formulas, opening stock ledger, newest row shown.
 await open();
 assert.equal(await evaluate("document.activeElement?.name"),'barcode','barcode is focused for scanning');
 await fill(`${marker}A`,4);
 assert.equal(await value('input[name=sellingPrice]'),'3996.00');assert.equal(await value('input[name=discount]'),'199.80');
 assert.ok((await evaluate("document.querySelector('.product-price-strip').textContent")).includes('3.330'),'final purchase price shown');
 await review();
 await waitFor("!document.querySelector('.products-editor') && !!document.querySelector('.product-editor-success') && !document.querySelector('.products-skeleton-row')");
 assert.match(await evaluate("document.querySelector('.product-editor-success').textContent"),/ditambahkan dengan kode .+ dan stok awal 4/);
 assert.equal(await evaluate("document.querySelector('.products-name').textContent"),testName,'new product is the newest row');
 const [row]=await prisma.$queryRaw`SELECT id,item_code,company_id,stock,status,price,purchase_price,sales_price,discount,discount_persen,profit_margin,tax_type,unit_perpack FROM db_items WHERE custom_barcode=${`${marker}A`}`;
 assert.ok(row);assert.equal(row.stock,4);assert.equal(row.status,0);assert.equal(row.price,3000);assert.equal(row.purchase_price,3330);assert.equal(row.sales_price,3996);assert.equal(row.discount,199.8);assert.equal(row.discount_persen,5);assert.equal(row.profit_margin,20);assert.equal(row.tax_type,'Exclusive');assert.equal(row.unit_perpack,6);
 const ledger=await prisma.$queryRaw`SELECT qty,note FROM db_stockentry WHERE item_id=${row.id}`;assert.deepEqual(ledger.map(e=>({...e})),[{qty:4,note:'Stok Awal'}]);
 // 2. Lost response after a committed insert: form locks, offers lookup, and the barcode guard prevents a duplicate retry.
 await open();await fill(`${marker}B`,0);
 interception=async event=>{await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from('{"error":"PRODUCTS_UNAVAILABLE"}').toString('base64')});};
 await send('Fetch.enable',{patterns:[{urlPattern:'*/api/products/add',requestStage:'Response'}]});await review();
 await waitFor("document.querySelector('.product-editor-error')?.textContent.includes('belum terkonfirmasi')");
 await send('Fetch.disable');interception=null;
 assert.equal(await evaluate("document.querySelector('.product-editor-form fieldset').disabled"),true,'uncertain result disables the form');
 assert.equal((await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_items WHERE custom_barcode=${`${marker}B`}`)[0].n,1n);
 await click('.product-editor-error button');
 await waitFor(`!document.querySelector('.products-editor') && document.querySelector('.products-search input').value===${JSON.stringify(`${marker}B`)} && document.querySelectorAll('.products-name').length===1 && !document.querySelector('.products-skeleton-row')`);
 await open();await fill(`${marker}B`,0);await review();
 await waitFor("document.querySelector('.product-editor-error')?.textContent.includes('sudah dipakai')");
 assert.equal((await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_items WHERE custom_barcode=${`${marker}B`}`)[0].n,1n,'retry did not duplicate');
 // 3. Responsive dialog and focus return.
 await click('.product-editor-footer-actions .products-button');await waitFor("!document.querySelector('.products-editor')");await open();
 for(const[width,height]of[[1440,900],[1024,768],[390,844],[320,700]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await sleep(200);
  assert.ok(await evaluate("(()=>{const e=document.querySelector('.products-editor');const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&e.scrollWidth<=e.clientWidth;})()"),`creator fits ${width}px`);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(`/private/tmp/kkisi-product-add-${width}.png`,Buffer.from(shot.data,'base64'));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await fill(`${marker}C`,2);await evaluate("document.querySelector('.products-editor').scrollTop=99999");await sleep(150);
 const filled=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile('/private/tmp/kkisi-product-add-filled.png',Buffer.from(filled.data,'base64'));
 await click('button[aria-label="Tutup tambah produk"]');await waitFor("!document.querySelector('.products-editor')");
 assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(addButton)})`),true,'focus returns to add button');
 assert.equal((await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_items WHERE custom_barcode=${`${marker}C`}`)[0].n,0n,'closing without saving writes nothing');
 assert.deepEqual(exceptions,[]);console.log('PASS: native add with legacy pricing and Stok Awal ledger, newest-row refresh, lost-response lookup without duplicate retry, scanner Enter, four responsive dialogs and focus return');
}catch(error){console.error('Add UI verification failed:',error.message,evaluate?await evaluate('({path:location.pathname,alerts:Array.from(document.querySelectorAll("[role=alert]")).map(e=>e.textContent)})').catch(()=>null):null);if(evaluate){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile('/private/tmp/kkisi-product-add-failure.png',Buffer.from(shot.data,'base64'));}process.exitCode=1;}
finally{
 try{cleanup();const left=await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_items WHERE custom_barcode LIKE ${marker+'%'}`;console.log(`Cleanup: ${left[0].n} marked test rows remain`);}catch(e){console.error(e.message);process.exitCode=1;}
 await prisma.$disconnect();socket?.close();browser.kill('SIGTERM');await new Promise(resolve=>browser.once('exit',resolve));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
}
