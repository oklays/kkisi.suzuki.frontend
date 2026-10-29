import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ts = require('typescript');
registerHooks({ load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export {};' };
  if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText };
  return next(url, context);
}});
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { fixture, provisionalRules, validatePrototypeDraft, createMockService } = await import('../src/prototypes/public-savings/fixture.ts');
const { PublicSavingsPrototype } = await import('../src/prototypes/public-savings/PublicSavingsPrototype.tsx');
const good = {amountRupiah:'100000',hasSignature:true,consent:true};

test('mock context and provisional policy cannot be confused with production rules', () => {
  assert.equal(fixture.provenance,'SYNTHETIC_ONLY');
  assert.equal(provisionalRules.status,'PROVISIONAL_UI_ONLY');
  assert.equal(provisionalRules.maximumRupiah,null);
  assert.match(fixture.name,/contoh/i);
});
test('form rejects malformed rupiah, missing signature and missing affirmative consent', () => {
  for (const amount of ['', '1e5','100.000','1,000','-1','100.5','٠١',' 100','01']) assert.ok(validatePrototypeDraft({...good,amountRupiah:amount},provisionalRules).amountRupiah,amount);
  assert.ok(validatePrototypeDraft({...good,hasSignature:false},provisionalRules).signature);
  assert.ok(validatePrototypeDraft({...good,consent:false},provisionalRules).consent);
  assert.deepEqual(validatePrototypeDraft(good,provisionalRules),{});
});
test('provisional range is explicit and injectable, never an implicit approved business cap', () => {
  assert.ok(validatePrototypeDraft({...good,amountRupiah:'0'},provisionalRules).amountRupiah);
  assert.deepEqual(validatePrototypeDraft({...good,amountRupiah:'0'},{...provisionalRules,minimumRupiah:'0'}),{});
  assert.ok(validatePrototypeDraft(good,{...provisionalRules,maximumRupiah:'50000'}).amountRupiah);
  assert.deepEqual(validatePrototypeDraft({...good,amountRupiah:'9000000000000000'},provisionalRules),{});
});
test('mock verification never issues OTP and submit failure/retry preserves caller draft', async () => {
  const service = createMockService({failFirstSubmit:true,delayMs:0});
  assert.equal(await service.verify('000000'),false);
  assert.equal(await service.verify('123456'),true);
  const draft=Object.freeze({...good});
  await assert.rejects(service.submit(draft),/SIMULATED_UNAVAILABLE/);
  const result=await service.submit(draft);
  assert.equal(result.provenance,'SYNTHETIC_ONLY');
  assert.equal(result.reference,'DEMO-SS-0042');
  assert.deepEqual(draft,good);
});
test('React component withholds member fields before mock verification and labels all terminal states', () => {
  const render=scenario=>renderToStaticMarkup(createElement(PublicSavingsPrototype,{scenario}));
  const verification=render('verification');
  assert.match(verification,/SIMULASI/);
  assert.doesNotMatch(verification,/Anggota contoh|100000|Tim Produksi Contoh/);
  for (const scenario of ['loading','invalid','expired','revoked','consumed','unavailable','success']) {
    const html=render(scenario);
    assert.match(html,/SIMULASI/);
    assert.doesNotMatch(html,/<form/);
    assert.match(html,/<h1/);
  }
  const ready=render('ready');
  assert.match(ready,/Nominal potongan baru/);
  assert.match(ready,/Belum disahkan/);
  assert.match(ready,/aria-describedby=/);
  assert.match(ready,/Tinjau pengajuan/);
});
test('prototype stays outside the route graph and has no infrastructure/network/storage dependency', () => {
  const dir=new URL('../src/prototypes/public-savings/',import.meta.url);
  for (const file of readdirSync(dir).filter(f=>/\.(ts|tsx)$/.test(f))) {
    const source=readFileSync(new URL(file,dir),'utf8');
    assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\b|process\.env|infrastructure\/|@prisma|@koperasi\//,file);
  }
  function inspect(dir) { for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);
    if(entry.isDirectory()) inspect(url);
    else if(/\.[jt]sx?$/.test(entry.name)) assert.doesNotMatch(readFileSync(url,'utf8'),/prototypes\/public-savings/,'prototype imported into production app route');
  }}
  inspect(new URL('../src/app/',import.meta.url));
});
