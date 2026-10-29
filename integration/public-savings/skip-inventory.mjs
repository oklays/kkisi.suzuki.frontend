/** Sanitized, individually attributable inventory of the web regression skips (CP2 run when its log exists, CP1 baseline otherwise). */
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),output=resolve(root,'integration/public-savings/skip-inventory.json');
const normalize=value=>value.replaceAll("\\'", "'").replaceAll('\\"','"').replaceAll('\\n','\n').replaceAll('\\t','\t');
const local=name=>resolve(root,'.local/public-savings',name);
const clean=text=>/# fail 0\n# cancelled 0\n# skipped 0/.test(text);
async function optional(path){try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return '';throw e;}}
// Each public-savings gate is resolved only by the log of the run that actually executed it.
const GATED={
 'public-savings-integration.test.mjs':{gate:'PSS_INTEGRATION=1',log:'cp2-integration.log',evidence:'pnpm pss:test:integration'},
 'public-savings-recovery.test.mjs':{gate:'PSS_RECOVERY_TEST=1',log:'cp2-gated.log',evidence:'PSS_RECOVERY_TEST=1 node --test tests/public-savings-recovery.test.mjs'},
 'public-savings-actual-schema.test.mjs':{gate:'PSS_ACTUAL_SCHEMA_TEST=1',log:'cp2-gated.log',evidence:'PSS_ACTUAL_SCHEMA_TEST=1 node --test tests/public-savings-actual-schema.test.mjs'},
};
export async function inventorySkips({logPath}={}){
 const cp2=!logPath&&(await optional(local('cp2-regression.log'))).length>0;logPath??=local(cp2?'cp2-regression.log':'regression.log');
 let log;try{log=await readFile(logPath,'utf8');}catch(e){if(e.code==='ENOENT')return JSON.parse(await readFile(output,'utf8'));throw e;}
 let resolutionLog='';try{resolutionLog=await readFile(resolve(root,'.local/public-savings/cp2-skip-resolution.log'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const resolutionPassed=/# tests 27\n# suites 0\n# pass 27\n# fail 0\n# cancelled 0\n# skipped 0/.test(resolutionLog);
 const names=[...log.matchAll(/^apps\/web test: ok (\d+) - (.+?) # SKIP(?: (.*))?$/gm)];
 const directory=resolve(root,'apps/web/tests'),sources=await Promise.all((await readdir(directory)).filter(x=>x.endsWith('.test.mjs')).map(async file=>({file:'apps/web/tests/'+file,text:await readFile(resolve(directory,file),'utf8')})));
 const tests=await Promise.all(names.map(async (match,index)=>{
  const [,tapNumber,name,skipReason]=match;let candidates=sources.filter(s=>normalize(s.text).includes(name.trim()));
  if(!candidates.length&&name.startsWith('REAL MariaDB session store contract:'))candidates=sources.filter(s=>s.file.endsWith('/auth-store-db.test.mjs'));
  if(!candidates.length&&name.startsWith('database outbox (rehearsal):'))candidates=sources.filter(s=>s.file.endsWith('/warehouse-store-db.test.mjs'));
  if(!candidates.length&&name.startsWith('database applier (rehearsal):'))candidates=sources.filter(s=>s.file.endsWith('/warehouse-store-db.test.mjs'));
  if(candidates.length!==1)throw Error('SKIP_SOURCE_MAPPING_AMBIGUOUS: '+name+' '+candidates.map(c=>c.file).join(','));
  const {file,text}=candidates[0],gates=[...new Set([...text.matchAll(/process\.env\.([A-Z_0-9]+)/g)].map(m=>m[1]))].sort();
  const gated=GATED[file.split('/').pop()],publicSavings=!!gated;
  let resolution='Not executed: separate subsystem fixture outside this public-savings verification';
  if(gated){const text=cp2?await optional(local(gated.log)):'';resolution=cp2?(clean(text)&&text.includes(name.trim())?`RESOLVED: ${gated.evidence} executed with ${gated.gate}; ${text.match(/# pass (\d+)/)[1]} passed, 0 failed, 0 skipped (.local/public-savings/${gated.log})`:'REMEDIATION: gated run log missing, failing or not containing this test'):(resolutionPassed?'RESOLVED: PSS_INTEGRATION=1 real sentinel-verified local MariaDB; 27 passed, 0 skipped, 0 failed':resolution);}
  return {ordinal:index+1,baselineTapNumber:Number(tapNumber),name,file,gates,baselineSkipReason:skipReason??'Boolean opt-in gate disabled',skipDeclarations:[...new Set([...text.matchAll(/\bskip\s*:\s*([^},\n]+)/g)].map(match=>match[1].trim()))],resolution,classification:publicSavings?'environment-dependent':'irrelevant',reason:publicSavings?`Dedicated disposable MariaDB gate ${gated.gate} is disabled in the broad regression command by design. This skip is not acceptance evidence; the separate gated run is.`:'Separate auth/console/POS/KOSIPA/warehouse integration fixture; outside public savings scope. Deliberate opt-in avoids connecting to unrelated databases. Remains required for release of that subsystem.',requiredAction:publicSavings?`Run ${gated.evidence} against the sentinel-verified local fixture.`:'Retain the opt-in gate. Run only with that suite’s own disposable allowlisted database and dedicated credentials; never repoint it at the public-savings database.'};
 }));
 if(!cp2&&tests.length!==103)throw Error('BASELINE_SKIP_COUNT_CHANGED');
 if(tests.length!==Number(log.match(/^apps\/web test: # skipped (\d+)$/m)?.[1]))throw Error('SKIP_COUNT_MISMATCH');
 if(tests.some(x=>x.resolution.startsWith('REMEDIATION')))throw Error('GATED_SKIP_UNRESOLVED');
 return {scope:cp2?'CP2 full web regression (.local/public-savings/cp2-regression.log); public-savings gates resolved by their own executed runs':'CP1 web regression baseline only; subsequent tests and focused reruns are recorded separately',total:tests.length,counts:Object.fromEntries(['intentional','irrelevant','environment-dependent','remediation'].map(key=>[key,tests.filter(x=>x.classification===key).length])),tests};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const inventory=await inventorySkips();await writeFile(output,JSON.stringify(inventory,null,2)+'\n');const escape=x=>String(x).replaceAll('|','\\|').replaceAll('\n',' ');await writeFile(resolve(root,'integration/public-savings/skip-inventory.md'),'# Web skip inventory\n\n'+inventory.scope+'. All '+inventory.total+' skips are listed individually. '+JSON.stringify(inventory.counts)+'. No skipped test is counted as passing. Gates below include all environment dependencies referenced by its source file.\n\n| # | Test | Source | Gates | Classification and action |\n|---|---|---|---|---|\n'+inventory.tests.map(x=>'| '+x.ordinal+' | '+escape(x.name)+' | '+x.file+' | '+x.gates.join(', ')+' | '+x.classification+': '+escape(x.reason)+' '+escape(x.requiredAction)+' '+escape(x.resolution)+' |').join('\n')+'\n');console.log(JSON.stringify({total:inventory.total,counts:inventory.counts}));}
