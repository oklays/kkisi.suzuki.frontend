import assert from 'node:assert/strict';
import test from 'node:test';
import {handleLogin} from '../src/infrastructure/auth/handlers/login.ts';
import {makeWorld,makeRequest,bodyOf,cookieOf} from './helpers/auth-fakes.mjs';
const mod=await import('../src/infrastructure/pos/handlers/register-open.ts');
test('opening validates integer rupiah and uses authenticated ownership after CSRF checks',async()=>{
 assert.ok(mod?.handleRegisterOpen,'register opening implemented');
 const w=makeWorld();w.addUser({id:4,username:'synthetic'});
 const login=await handleLogin(w.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'synthetic',password:'Pw-Synthetic-1'}}));
 const cookie=cookieOf(login),token=(await bodyOf(login)).csrfToken;let calls=0;
 const repo={async open(ctx,input){calls++;assert.equal(ctx.companyId,1);assert.equal(ctx.userId,4);assert.deepEqual(input,{idKasir:1,saldoAwal:0});return {id:1,noref:'KRS-202610020001'};}};
 const post=(body={idKasir:1,saldoAwal:0},over={})=>mod.handleRegisterOpen(w.services,makeRequest('/api/pos/register/open',{method:'POST',cookie,token,body,...over}),()=>repo);
 assert.equal((await post(undefined,{cookie:undefined})).status,401);
 for(const over of [{token:null},{origin:null},{origin:'http://evil.test'},{contentType:'text/plain'}])assert.equal((await post(undefined,over)).status,403);
 for(const saldoAwal of [-1,0.5,1000000000,'0',null])assert.equal((await post({idKasir:1,saldoAwal})).status,400);
 assert.equal(calls,0);assert.equal((await post({idKasir:1,saldoAwal:0,companyId:99,userId:99})).status,200);assert.equal(calls,1);
 w.data.users.get(4).roleId=9;assert.equal((await post()).status,403);assert.equal(calls,1);
});
const closer=await import('../src/infrastructure/pos/handlers/register-close.ts');
test('close requires CSRF and authenticated session ownership with validated register ID',async()=>{
 const w=makeWorld();w.addUser({id:4,username:'synthetic'});const login=await handleLogin(w.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'synthetic',password:'Pw-Synthetic-1'}}));const cookie=cookieOf(login),token=(await bodyOf(login)).csrfToken;let calls=0;
 const repo={async close(ctx,id){calls++;assert.equal(ctx.userId,4);assert.equal(ctx.companyId,1);assert.equal(id,12);return{id};}};
 const post=(body={registerId:12},over={})=>closer.handleRegisterClose(w.services,makeRequest('/api/pos/register/close',{method:'POST',cookie,token,body,...over}),()=>repo);
 assert.equal((await post(undefined,{cookie:undefined})).status,401);assert.equal((await post(undefined,{token:null})).status,403);assert.equal((await post({registerId:0})).status,400);assert.equal(calls,0);assert.equal((await post({registerId:12,userId:99,companyId:99})).status,200);assert.equal(calls,1);
});
