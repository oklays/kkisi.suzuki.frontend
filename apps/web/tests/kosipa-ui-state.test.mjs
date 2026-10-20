import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const reactPath=new URL('../node_modules/react/index.js',import.meta.url).href;
registerHooks({
 resolve(specifier,context,next){
  const stubs={
   'next/link':`import React from '${reactPath}';export default function Link({prefetch,children,...p}){return React.createElement('a',p,children)}`,
   'next/navigation':'export function notFound(){throw new Error("NOT_FOUND")}',
   '@/infrastructure/auth/page-guard':'export async function requireConsoleSession(){return {kind:"ok",ctx:{userId:1},kosipa:"linked",capabilities:new Set(["kosipa.loan.view"])}}',
   '@/infrastructure/console/flags':'export function consoleEnabled(){return true}',
   '@/infrastructure/console/services':'export function kosipaServices(){return {now:()=>new Date()}}',
   '@koperasi/application/kosipa/reports':'export async function readDataQuality(){return globalThis.__kosipaQualityFixture}',
  };
  if(specifier in stubs)return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
  if(specifier.startsWith('@/'))specifier=new URL('../src/'+specifier.slice(2),import.meta.url).href;
  if(specifier.startsWith('file:')||specifier.startsWith('.')){const u=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(u.pathname))for(const ext of ['.tsx','.ts'])if(existsSync(fileURLToPath(u)+ext))return next(u.href+ext,context);}
  return next(specifier,context);
 },
 load(url,context,next){if(url.endsWith('.tsx'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2017,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText};return next(url,context);}
});
const {FinancialTable,ContextNotice,ReportYearFilter}=await import('../src/components/console/kosipa/KosipaUI.tsx');
const {default:DataQualityPage}=await import('../src/app/console/kosipa/laporan/kualitas-data/page.tsx');
test('financial column metadata aligns header and count cells and preserves exact source text',()=>{
 const html=renderToStaticMarkup(React.createElement(FinancialTable,{label:'Mutasi tercatat',columns:[{label:'Jenis'},{label:'Jumlah',numeric:true}]},React.createElement('tbody',null,React.createElement('tr',null,React.createElement('th',{scope:'row'},'Sukarela'),React.createElement('td',null,'Rp 50.000,6666')))));
 assert.match(html,/<th scope="col" class="num"[^>]*>Jumlah/);assert.match(html,/<td class="num">Rp 50\.000,6666/);assert.match(html,/role="region" aria-label="Mutasi tercatat" tabindex="0"/);assert.match(html,/scope="row">Sukarela/);
});
test('failed and truncated scans render unavailable without a count or detected/zero-success claim',async()=>{
 for(const reason of ['READ_FAILED','SOURCE_TRUNCATED']){
  const unavailable={state:'unavailable',reason};globalThis.__kosipaQualityFixture={branchMapping:{state:'UNVERIFIED'},loans:{duplicateRefs:unavailable,statusConflicts:unavailable,loanDates:unavailable,installmentDates:unavailable,orphans:unavailable},payroll:'restricted'};
  const html=renderToStaticMarkup(await DataQualityPage());assert.match(html,/Scan tidak tersedia/);assert.doesNotMatch(html,/>Terdeteksi</);assert.doesNotMatch(html,/>0 masalah</);assert.doesNotMatch(html,/<tbody/);assert.doesNotMatch(html,/Total header berbeda/);
 }
});
test('review notice stays labelled, accessible and expandable',()=>{
 const html=renderToStaticMarkup(React.createElement(ContextNotice,{title:'Untuk tinjauan',tone:'warning',expandable:true},'A−B bukan kesalahan final'));
 assert.match(html,/data-tone="warning" role="note"/);assert.match(html,/<summary>/);assert.match(html,/A−B bukan kesalahan final/);
});

test('a valid selected year without records remains visible instead of selecting a different source year',()=>{
 const html=renderToStaticMarkup(React.createElement(ReportYearFilter,{path:'/console/kosipa/laporan/pinjaman',year:2027,years:[2026]}));
 assert.match(html,/<option value="2027" selected="">2027/);
});
