import assert from 'node:assert/strict';
import test from 'node:test';
import {handleLogin} from '../src/infrastructure/auth/handlers/login.ts';
import {makeWorld,makeRequest,bodyOf,cookieOf} from './helpers/auth-fakes.mjs';
const h=await import('../src/infrastructure/inventory/handlers.ts').catch(()=>null);
const reads=await import('../src/infrastructure/inventory/read-handlers.ts').catch(()=>null);
async function login(roleId=4){const w=makeWorld();w.addUser({id:4,username:'synthetic',roleId});w.data.permissions.add(`${roleId}:inventory_so`);w.data.permissions.add(`${roleId}:inventory_view`);const r=await handleLogin(w.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'synthetic',password:'Pw-Synthetic-1'}}));assert.equal(r.status,200);return{w,cookie:cookieOf(r),token:(await bodyOf(r)).csrfToken};}
test('inventory rejects missing session, CSRF and permission before creating a writer',async()=>{
 assert.ok(h?.handleStockOpnames,'inventory HTTP adapters exist');const {w,cookie,token}=await login();let calls=0;
 const repo={async count(ctx,input){assert.equal(ctx.companyId,1);assert.equal(ctx.userId,4);assert.deepEqual(input,{id:1,itemId:2,actualQty:0,note:''});return{document:{id:1},lines:[]};}};
 const post=(extra={})=>h.handleStockOpnames(w.services,makeRequest('/api/inventory/stock-opnames',{method:'POST',cookie,token,body:{action:'count',id:1,itemId:2,actualQty:0,note:'',companyId:999,userId:999,purchasePrice:'0.01'},...extra}),write=>{assert.equal(write,true);calls++;return repo;});
 assert.equal((await post({cookie:undefined})).status,401);for(const e of [{token:null},{origin:null},{origin:'http://evil.test'},{contentType:'text/plain'}])assert.equal((await post(e)).status,403);assert.equal(calls,0);
 const response=await post();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(calls,1);assert.equal(w.logs.at(-1).event,'inventory_count');assert.equal(w.logs.at(-1).companyId,1);
 w.data.permissions.delete('4:inventory_so');assert.equal((await post()).status,403);assert.equal(calls,1);
});
test('inventory GET uses selected company and safe code-only errors',async()=>{
 assert.ok(reads?.handleInventoryItems);const {w,cookie}=await login();let calls=0;
 const factory=write=>{assert.equal(write,false);return{async items(ctx,q){calls++;assert.equal(ctx.companyId,1);assert.equal(q,'soap');return[{id:1,stock:-2,locked:true}];},async list(){throw new Error('mysql://secret SQL INSERT');}};};
 const r=await reads.handleInventoryItems(w.services,makeRequest('/api/inventory/items?q=soap&companyId=999',{cookie}),factory);assert.equal(r.status,200);assert.equal((await bodyOf(r)).items[0].stock,-2);assert.equal(calls,1);
 const error=await reads.handleReadStockOpnames(w.services,makeRequest('/api/inventory/stock-opnames',{cookie}),factory);assert.equal(error.status,503);assert.deepEqual(await bodyOf(error),{error:'INVENTORY_UNAVAILABLE'});assert.doesNotMatch(JSON.stringify(w.logs),/secret|INSERT/);
});
test('warehouse global privilege blocks branch reads and writes before composition',async()=>{
 assert.ok(h?.handleWarehouses);const {w,cookie,token}=await login();let calls=0;const factory=()=>{calls++;return{async warehouses(){return[];}};};
 for(const method of ['GET','POST'])assert.equal((await h.handleWarehouses(w.services,makeRequest('/api/inventory/warehouses',{method,cookie,token}),factory)).status,403);assert.equal(calls,0);
 w.data.users.get(4).roleId=1;w.data.permissions.add('1:inventory_view');assert.equal((await h.handleWarehouses(w.services,makeRequest('/api/inventory/warehouses',{cookie}),factory)).status,200);assert.equal(calls,1);
});
test('legacy charset rejection is safe invalid input while unknown database failures remain unavailable',async()=>{
 const {w,cookie,token}=await login();
 const post=code=>h.handleStockOpnames(w.services,makeRequest('/api/inventory/stock-opnames',{method:'POST',cookie,token,body:{action:'count',id:1,itemId:2,actualQty:0,note:'Emoji 😀'}}),()=>({async count(){throw{code:'P2010',meta:{code},message:'Incorrect string value secret SQL mysql://credential'};}}));
 const invalid=await post('1366');assert.equal(invalid.status,400);assert.deepEqual(await bodyOf(invalid),{error:'INVALID_INPUT'});assert.equal(invalid.headers.get('cache-control'),'no-store');
 const unavailable=await post('9999');assert.equal(unavailable.status,503);assert.deepEqual(await bodyOf(unavailable),{error:'INVENTORY_UNAVAILABLE'});
 assert.doesNotMatch(JSON.stringify(w.logs),/secret|SQL|credential/);
});
