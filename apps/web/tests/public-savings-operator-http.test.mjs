import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function fixture({denied=false,mode='LOCAL_SYNTHETIC'}={}) {
 const calls=[],actor={actorRef:'console:19',userId:19,roleId:4,branch:'7',roles:['STAFF_OPERATOR'],branches:['7']};
 const service=new Proxy({},{get:(_,name)=>name==='then'?undefined:(...args)=>{calls.push({name,args});return name==='operatorPdf'?new Uint8Array([1]):{ok:true};}});
 class ServiceError extends Error {constructor(code){super(code);this.code=code;}}
 const mock=path=>path==='./service.ts'?{createPublicSavingsService:()=>service,PublicSavingsServiceError:ServiceError}:path==='./security.ts'?{loadStagingConfig:async()=>({mode,hashKey:'test',operatorKey:'key'}),keyedDigest:(_key,_purpose,value)=>value,secretMatches:(a,b)=>a===b}:path==='./operator-authorization.ts'?{loadPublicSavingsOperatorPolicy:async()=>({}),authorizePublicSavingsOperator:async(_r,action,target)=>{calls.push({name:'authorize',action,target});return denied?{response:Response.json({error:{code:'FORBIDDEN'}},{status:403})}:{actor};}}:require(path);
 const source=readFileSync(new URL('../src/infrastructure/public-savings/http.ts',import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const compiled={exports:{}};new Function('require','exports',js)(mock,compiled.exports);
 return {handle:compiled.exports.handlePublicSavingsRequest,calls,actor};
}
async function consoleMode(run){const previous=process.env.PSS_OPERATOR_AUTH;process.env.PSS_OPERATOR_AUTH='CONSOLE';try{await run();}finally{if(previous===undefined)delete process.env.PSS_OPERATOR_AUTH;else process.env.PSS_OPERATOR_AUTH=previous;}}
const req=(body)=>new Request('http://127.0.0.1:3489/api/kosipa/test',{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
test('console operator routes pass session branch and actor to every scoped service method',async()=>consoleMode(async()=>{
 for(const [operation,name,args,body,recordId,action,tail=[]] of [
  ['members','listMembers',[''],undefined,undefined,'ISSUE_LINK'],['links-list','listLinks',[],undefined,undefined,'VIEW_SUBMISSIONS',[{page:1,pageSize:10}]],
  ['links-create','issueLink',['member-1'],{memberRef:'member-1'},undefined,'ISSUE_LINK'],['links-revoke','revokeLink',['link-1','Member request'],{reason:'Member request'},'link-1','REVOKE_LINK'],
  ['applications','listApplications',[],undefined,undefined,'VIEW_SUBMISSIONS',[{page:1,pageSize:10}]],['application-pdf','operatorPdf',['app-1'],undefined,'app-1','VIEW_SUBMISSIONS'],
 ]) {
  const f=fixture();assert.equal((await f.handle(req(body),operation,recordId)).status,200);
  assert.equal(f.calls[0].name,'authorize');assert.equal(f.calls[0].action,action);
  const service=f.calls.find(call=>call.name===name);assert.deepEqual(service.args,[...args,{...f.actor,action},...tail]);
  if(operation==='links-revoke')assert.equal(f.calls[0].target.reason,'Member request');
 }
}));
test('refused session authorization calls no data service and local key cannot bypass it',async()=>consoleMode(async()=>{
 const f=fixture({denied:true});const request=req();request.headers.set('x-pss-staging-operator','key');
 assert.equal((await f.handle(request,'links-list')).status,403);assert.deepEqual(f.calls.map(c=>c.name),['authorize']);
}));
test('local operator key is accepted only for explicitly synthetic configuration',async()=>{
 const previous=process.env.PSS_OPERATOR_AUTH;delete process.env.PSS_OPERATOR_AUTH;
 try{for(const mode of ['LOCAL_SYNTHETIC','PRODUCTION']){const f=fixture({mode}),request=req();request.headers.set('x-pss-staging-operator','key');assert.equal((await f.handle(request,'links-list')).status,mode==='LOCAL_SYNTHETIC'?200:403);}}finally{if(previous!==undefined)process.env.PSS_OPERATOR_AUTH=previous;}
});
