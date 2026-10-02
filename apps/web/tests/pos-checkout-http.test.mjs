import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import {makeWorld,makeRequest,bodyOf,cookieOf} from './helpers/auth-fakes.mjs';
const handlers=await import('../src/infrastructure/pos/handlers/checkout.ts').catch(()=>null);
const memberHandlers=await import('../src/infrastructure/pos/handlers/members.ts').catch(()=>null);
const input={items:[{itemId:7,quantity:1}],paymentType:'Cash',paidAmount:'20000',idempotencyKey:'12345678-1234-4123-8123-123456789012'};
async function loggedIn(){const w=makeWorld();w.addUser({id:4,username:'synthetic'});const login=await handleLogin(w.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'synthetic',password:'Pw-Synthetic-1'}}));assert.equal(login.status,200);return{w,cookie:cookieOf(login),token:(await bodyOf(login)).csrfToken};}
test('checkout rejects unauthenticated, CSRF and RBAC failures before invoking a writer and ignores forged branch/cashier IDs',async()=>{
 assert.ok(handlers?.handleCheckout,'checkout handler is implemented');
 const {w,cookie,token}=await loggedIn();let calls=0;
 const repo={async checkout(ctx,parsed){calls++;assert.equal(ctx.companyId,1);assert.equal(ctx.userId,4);assert.equal(parsed.items[0].itemId,7);return{salesCode:'TEST'};}};
 const post=(over={})=>handlers.handleCheckout(w.services,makeRequest('/api/pos/checkout',{method:'POST',cookie,token,body:{...input,companyId:999,userId:999,items:[{itemId:7,quantity:1,price:1}]},...over}),()=>repo);
 assert.equal((await post({cookie:undefined})).status,401);
 for(const over of [{token:null},{origin:null},{origin:'http://evil.test'},{contentType:'text/plain'}])assert.equal((await post(over)).status,403);
 assert.equal(calls,0);assert.equal((await post()).status,200);assert.equal(calls,1);
 w.data.users.get(4).roleId=9;assert.equal((await post()).status,403);assert.equal(calls,1);
});
test('members are private exact lookups in the session branch with no database writes',async()=>{
 assert.ok(memberHandlers?.handleMembers,'member handler is implemented');
 const {w,cookie}=await loggedIn();let calls=0;
 const repo={async member(ctx,identifier){calls++;assert.equal(ctx.companyId,1);assert.equal(identifier,'NIK-1');return{id:7,name:'Synthetic',remainingSen:100};}};
 assert.equal((await memberHandlers.handleMembers(w.services,makeRequest('/api/pos/members?identifier=NIK-1'),repo)).status,401);
 const response=await memberHandlers.handleMembers(w.services,makeRequest('/api/pos/members?identifier=NIK-1&companyId=99',{cookie}),repo);
 assert.equal(response.status,200);assert.equal((await bodyOf(response)).member.id,7);assert.equal(calls,1);assert.equal(response.headers.get('cache-control'),'no-store');
});
