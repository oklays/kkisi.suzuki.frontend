import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicSavingsOperatorAuthorizer } from '../src/infrastructure/public-savings/operator-authorization.ts';
const context={userId:19,roleId:4,companyId:7,canSwitchBranch:false};
const policy={branchesByCompanyId:{1:'BRANCH ONE',7:'SYNTHETIC BRANCH'},rolesByRoleId:{4:['STAFF_OPERATOR']},capabilitiesByAction:{VIEW_SUBMISSIONS:['kosipa.savings.view'],ISSUE_LINK:['kosipa.savings.view'],REVOKE_LINK:['kosipa.savings.view']}};
const request=(method='GET')=>new Request('http://localhost/api/kosipa/public-savings-links',{method});
function authorizer(overrides={}) { return createPublicSavingsOperatorAuthorizer({policy,guard:async()=>({ok:true,ctx:context}),capabilities:async()=>new Set(['kosipa.savings.view']),...overrides}); }
test('uses authenticated actor and selected session branch only',async()=>{
 const result=await authorizer()(request(),'ISSUE_LINK',{branch:'SYNTHETIC BRANCH'});
 assert.equal(result.actor.actorRef,'console:19');assert.deepEqual(result.actor.branches,['SYNTHETIC BRANCH']);
 assert.equal((await authorizer()(request(),'ISSUE_LINK',{branch:'8'})).response.status,403);
});
test('mutating actions require CSRF even if caller uses GET',async()=>{
 let options;const authorize=authorizer({guard:async(_r,o)=>{options=o;return {ok:false,response:new Response(null,{status:403})};}});
 assert.equal((await authorize(request(),'ISSUE_LINK')).response.status,403);assert.equal(options.csrf,true);
 await authorize(request(),'VIEW_SUBMISSIONS');assert.equal(options.csrf,false);
});
test('unknown capability, missing role mapping, unavailable capability resolver fail closed',async()=>{
 for(const overrides of [{policy:{...policy,rolesByRoleId:{}}},{policy:{...policy,capabilitiesByAction:{ISSUE_LINK:['invented.write']}}},{capabilities:async()=>{throw Error('private db error');}}]) {
  const result=await authorizer(overrides)(request(),'ISSUE_LINK');assert.ok(result.response);assert.ok([403,503].includes(result.response.status));assert.equal((await result.response.text()).includes('private'),false);
 }
});
test('capability possession alone and system admin never imply operator or financial approval',async()=>{
 const authorize=authorizer({policy:{...policy,rolesByRoleId:{4:['SYSTEM_ADMIN']}}});
 assert.equal((await authorize(request(),'ISSUE_LINK')).response.status,403);
 assert.equal((await authorizer()(request(),'APPROVE_DEDUCTION')).response.status,403);
 assert.equal((await authorizer({capabilities:async()=>new Set()})(request(),'ISSUE_LINK')).response.status,403);
});
test('domain reasons and maker checker are enforced with session actor',async()=>{
 assert.equal((await authorizer()(request(),'REVOKE_LINK')).response.status,403);
 assert.ok((await authorizer()(request(),'REVOKE_LINK',{reason:'Member request'})).actor);
 const authorize=authorizer({policy:{branchesByCompanyId:policy.branchesByCompanyId,rolesByRoleId:{4:['MEMBERSHIP_VERIFIER']},capabilitiesByAction:{REBIND_CONTACT_CHECK:['kosipa.savings.view']}}});
 assert.equal((await authorize(request(),'REBIND_CONTACT_CHECK',{makerRef:'console:19'})).response.status,403);
 assert.ok((await authorize(request(),'REBIND_CONTACT_CHECK',{makerRef:'console:20'})).actor);
});
test('unresolved or invalid session branch fails closed even for branch chooser',async()=>{
 for(const companyId of [undefined,0,NaN])assert.equal((await authorizer({guard:async()=>({ok:true,ctx:{...context,companyId,canSwitchBranch:true}})})(request(),'ISSUE_LINK')).response.status,403);
});
test('real session guard revalidates session and enforces CSRF using synthetic stores',async()=>{
 const {guard}=await import('../src/infrastructure/auth/http.ts');
 const {handleLogin}=await import('../src/infrastructure/auth/handlers/login.ts');
 const {makeWorld,makeRequest,legacyStyleHash,cookieOf,bodyOf}=await import('./helpers/auth-fakes.mjs');
 const world=makeWorld();world.addUser({id:19,username:'operator',roleId:4,companyId:1,passwordHash:legacyStyleHash('Synthetic-password')});
 const login=await handleLogin(world.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'operator',password:'Synthetic-password'}}));
 assert.equal(login.status,200);
 const cookie=cookieOf(login), token=(await bodyOf(login)).csrfToken;
 const authorize=authorizer({guard:(req,options)=>guard(world.services,req,options)});
 const req=(overrides={})=>makeRequest('/api/kosipa/public-savings-links',{method:'POST',cookie,token,body:{memberRef:'synthetic'},...overrides});
 assert.equal((await authorize(req(),'ISSUE_LINK')).actor.branch,'BRANCH ONE');
 assert.equal((await authorize(req({token:null}),'ISSUE_LINK')).response.status,403);
 assert.equal((await authorize(req({origin:'http://evil.test'}),'ISSUE_LINK')).response.status,403);
 assert.equal((await authorize(req({cookie:null}),'ISSUE_LINK')).response.status,401);
 [...world.sessions.rows.values()][0].revokedAt=world.clock.now();
 assert.equal((await authorize(req(),'ISSUE_LINK')).response.status,401);
});
test('operator policy loader requires absolute private regular file and strict known mappings',async()=>{
 const {mkdtemp,writeFile,chmod,symlink,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {loadPublicSavingsOperatorPolicy}=await import('../src/infrastructure/public-savings/operator-authorization.ts');
 const dir=await mkdtemp(join(tmpdir(),'pss-policy-')),file=join(dir,'policy.json');
 try {
  await writeFile(file,JSON.stringify(policy),{mode:0o600});assert.deepEqual(await loadPublicSavingsOperatorPolicy(file),policy);
  await assert.rejects(()=>loadPublicSavingsOperatorPolicy('relative.json'));
  await chmod(file,0o644);await assert.rejects(()=>loadPublicSavingsOperatorPolicy(file));await chmod(file,0o600);
  const linked=join(dir,'linked.json');await symlink(file,linked);await assert.rejects(()=>loadPublicSavingsOperatorPolicy(linked));
  for(const bad of [{...policy,extra:1},{...policy,rolesByRoleId:{4:['SUPER_ADMIN']}},{...policy,capabilitiesByAction:{ISSUE_LINK:['invented.write']}},{...policy,capabilitiesByAction:{APPROVE_DEDUCTION:['kosipa.savings.view']}},{...policy,rolesByRoleId:{'04':['STAFF_OPERATOR']}},{...policy,branchesByCompanyId:{'04':'BRANCH'}},{...policy,branchesByCompanyId:{7:''}},{...policy,branchesByCompanyId:{7:' BRANCH'}}]){
   await writeFile(file,JSON.stringify(bad));await assert.rejects(()=>loadPublicSavingsOperatorPolicy(file));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('missing explicit native branch mapping never falls back to numeric session company ID',async()=>{
 const result=await authorizer({policy:{...policy,branchesByCompanyId:{1:'BRANCH ONE'}}})(request(),'ISSUE_LINK');
 assert.equal(result.response.status,503);assert.equal((await result.response.json()).error.code,'OPERATOR_AUTHORIZATION_UNCONFIGURED');
});
