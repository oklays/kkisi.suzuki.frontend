import test from 'node:test';
import assert from 'node:assert/strict';

const { consumeFragmentToken, validateDraft, freezeSubmission, submissionBody, publicErrorMessage } = await import('../src/components/public-savings/client.ts');
const form = { memberName:'SYNTH MEMBER', maskedIdentifier:'***123', sectionId:'SYNTH-A', sectionName:'SYNTH SECTION', savingsType:'Simpanan Sukarela', originalDeduction:'100000', requestedPeriod:{year:2026,month:11}, consentVersion:'v1',consentText:'Saya setuju.',formVersion:'v1',reviewFingerprint:'a'.repeat(64),policy:{minAmount:'10000',increment:'1000',maxAmount:'5000000'} };

test('token is taken from fragment once and the full fragment is scrubbed before validation', () => {
  const events=[];
  const location={ hash:'#token=opaque%2Bvalue&extra=secret',pathname:'/simpanan-sukarela', search:'' };
  assert.equal(consumeFragmentToken(location, {replaceState(...args){events.push(args);}}), 'opaque+value');
  assert.equal(events[0][2], '/simpanan-sukarela');
  assert.equal(consumeFragmentToken({...location,hash:'#token=one&token=two'}, {replaceState(){}}),'');
  assert.equal(consumeFragmentToken({...location,hash:''}, {replaceState(){}}),'');
});

test('draft rejects malformed, unchanged, out-of-policy amounts and missing authorization', () => {
  for(const amount of ['0','9999','10001','5001000','1e5','100000','-10000','10000.00']) assert.ok(validateDraft(amount,false,false,form).length);
  assert.deepEqual(validateDraft('150000',true,true,form),[]);
  assert.ok(validateDraft('150000',false,true,form).some(x=>x.includes('tanda tangan')));
  assert.ok(validateDraft('150000',true,false,form).some(x=>x.includes('persetujuan')));
});

test('a frozen submission preserves exact body, signature bytes and idempotency key across uncertain retries', async () => {
  const signature = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
  const snapshot=freezeSubmission('150000',form,signature,'stable-key');
  form.requestedPeriod.month=12;
  const first=submissionBody(snapshot), retry=submissionBody(snapshot);
  assert.equal(snapshot.idempotencyKey,'stable-key');
  assert.equal(first.get('startMonth'),'11'); assert.equal(retry.get('startMonth'),'11');
  assert.equal(first.get('consent'),'true'); assert.equal(first.get('amountRupiah'),'150000');
  assert.equal(first.get('signature').type,'image/png');
  assert.deepEqual(await first.get('signature').arrayBuffer(),await retry.get('signature').arrayBuffer());
});

test('public errors give safe actionable text without echoing server or PII values', () => {
  assert.match(publicErrorMessage('RATE_LIMITED',30),/30/);
  assert.match(publicErrorMessage('UNKNOWN_SECRET_MEMBER_IDENTIFIER'),/belum/);
  assert.doesNotMatch(publicErrorMessage('UNKNOWN_SECRET_MEMBER_IDENTIFIER'),/SECRET/);
});

test('public transport omits cookies, referrers, cache and redirects and only exposes safe server errors', async () => {
  const { requestJson, SavingsApiError }=await import('../src/components/public-savings/client.ts');
  const original=globalThis.fetch;
  try {
    let observed;
    globalThis.fetch=async (path,init)=>{observed={path,init};return new Response(JSON.stringify({error:{code:'RATE_LIMITED',message:'PRIVATE MEMBER DATA',retryAfterSeconds:12}}),{status:429});};
    await assert.rejects(requestJson('/api/public/simpanan-sukarela/validate',{method:'POST',headers:{Authorization:'Bearer TOKEN'}}),error=>error instanceof SavingsApiError && error.status===429 && error.retryAfterSeconds===12 && !error.message.includes('PRIVATE'));
    assert.equal(observed.init.cache,'no-store');assert.equal(observed.init.credentials,'omit');
    assert.equal(observed.init.referrerPolicy,'no-referrer');assert.equal(observed.init.redirect,'error');
    assert.equal(observed.init.headers.Authorization,'Bearer TOKEN');assert.equal(observed.init.body,undefined);
  } finally {globalThis.fetch=original;}
});

// Render the real components without a DOM. Network and interactive acceptance are exercised separately in browser checks.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const ts=require('typescript');
function loadComponent(filename) {
  const file=resolve(dirname(fileURLToPath(import.meta.url)),'../src/components/public-savings',filename);
  const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const compiledModule={exports:{}};
  const localRequire=id=>id.startsWith('./')?loadComponent(`${id.slice(2)}${id==='./client'?'.ts':'.tsx'}`):require(id);
  new Function('require','module','exports',output)(localRequire,compiledModule,compiledModule.exports);
  return compiledModule.exports;
}

test('public initial render is accessible and contains no fabricated member or OTP success path', () => {
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const html=renderToStaticMarkup(React.createElement(loadComponent('PublicSavings.tsx').default));
  assert.match(html,/<h1>Pengajuan simpanan sukarela<\/h1>/);
  assert.match(html,/aria-label="Tahapan pengajuan"/);assert.match(html,/role="status"/);
  assert.doesNotMatch(html,/123456|SYNTH MEMBER|DEMO-SS|Gunakan contoh/);
});

test('operator renders a password key field and local staging boundary without approval controls', () => {
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const html=renderToStaticMarkup(React.createElement(loadComponent('OperatorWorkbench.tsx').default));
  assert.match(html,/LOCAL STAGING ONLY/);assert.match(html,/type="password"/);
  assert.match(html,/KOSIPA CI2/);assert.match(html,/pencocokan tepat/);
  assert.doesNotMatch(html,/approve|reject|Setujui pengajuan|Tolak pengajuan/i);
});

test('signature canvas stays within the approved decoded PNG size budget', () => {
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
  const html=renderToStaticMarkup(React.createElement(loadComponent('SignaturePad.tsx').SignaturePad,{canvasRef:React.createRef(),onChange(){},disabled:false}));
  assert.match(html,/width="600" height="180"/);
  assert.ok(600*180*4<=1048576);
});

test('HTTP route wrappers forward the request and await dynamic identifiers', async () => {
  const operations=[
    ['public/simpanan-sukarela/validate','POST','validate'],['public/simpanan-sukarela/verification-challenges','POST','challenge'],
    ['public/simpanan-sukarela/verification-challenges/verify','POST','verify'],['public/simpanan-sukarela/submissions','POST','submit'],
    ['public/simpanan-sukarela/receipt','POST','receipt'],['public/simpanan-sukarela/pdf','GET','pdf'],
    ['kosipa/public-savings-links/members','GET','members'],['kosipa/public-savings-links','GET','links-list'],
    ['kosipa/public-savings-links','POST','links-create'],['kosipa/public-savings-links/[id]/revoke','POST','links-revoke','LINK-ID'],
    ['kosipa/savings-applications','GET','applications'],['kosipa/savings-applications/[id]/pdf','GET','application-pdf','APP-ID'],
  ];
  for(const [path,method,operation,id] of operations){
    const file=resolve(dirname(fileURLToPath(import.meta.url)),'../src/app/api',path,'route.ts');
    const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const calls=[],compiled={exports:{}};
    new Function('require','exports',output)(()=>({handlePublicSavingsRequest(...args){calls.push(args);return new Response('ok');}}),compiled.exports);
    assert.equal(compiled.exports.runtime,'nodejs');
    const request=new Request('http://127.0.0.1/api/test',{method});
    await compiled.exports[method](request,{params:Promise.resolve({id})});
    assert.equal(calls.length,1);assert.equal(calls[0][0],request);assert.equal(calls[0][1],operation);assert.equal(calls[0][2],id);
  }
});

test('legacy decimal scale displays exact rupiah and unchanged whole amounts stay invalid', async () => {
  const {rupiah}=await import('../src/components/public-savings/client.ts');
  assert.equal(rupiah('0.0000'),'Rp0');assert.equal(rupiah('100000.0000'),'Rp100.000');
  assert.equal(rupiah('100000.5000'),'Rp100.000,5');
  assert.ok(validateDraft('100000',true,true,{...form,originalDeduction:'100000.0000'}).some(message=>message.includes('berbeda')));
});
test('positively verified first enrollment is displayed as absent deduction rather than a zero balance', async()=>{
 const {rupiah}=await import('../src/components/public-savings/client.ts');
 assert.equal(rupiah(null),'Belum ada potongan');
 assert.deepEqual(validateDraft('150000',true,true,{...form,originalDeduction:null}),[]);
});
