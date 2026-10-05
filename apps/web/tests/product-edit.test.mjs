import assert from 'node:assert/strict';
import test from 'node:test';
import {handleLogin} from '../src/infrastructure/auth/handlers/login.ts';
import {makeWorld,makeRequest,bodyOf,cookieOf} from './helpers/auth-fakes.mjs';
const domain=await import('@koperasi/domain/inventory');
const http=await import('../src/infrastructure/products/edit-handler.ts').catch(()=>null);
const config=await import('../src/infrastructure/db/prisma-product-write.ts').catch(()=>null);
const revision='a'.repeat(64);
const product={id:7,revision,code:'BRG-7',sku:'SKU-7',name:'Sabun',barcode:'123456',packBarcode:'',description:'',categoryId:1,brandId:null,unitId:1,packQuantity:1,sellingPrice:'4000.10',purchasePrice:'3000.00',discount:'0.00',alertQty:4,active:true};

test('product edit validates a strict allowlist and exact amounts before persistence',()=>{
 assert.ok(domain.parseProductEdit,'edit parser exists');
 const parsed=domain.parseProductEdit({...product,name:' Sabun baru '});assert.equal(parsed.name,'Sabun baru');
 for(const change of [{name:''},{companyId:999},{stock:90},{categoryId:-1},{active:'1'},{sellingPrice:'1e5'},{discount:'4001'},{sku:'x'.repeat(101)},{revision:''},{packQuantity:0},{purchasePrice:'1.234'}]) assert.throws(()=>domain.parseProductEdit({...product,...change}),{code:'INVALID_INPUT'});
 assert.equal(domain.parseProductEdit({...product,purchasePrice:'3'}).purchasePrice,'3.00');
});
test('stock adjustment uses integer final stock and known ledger reasons',()=>{
 assert.ok(domain.parseProductAdjustment,'adjustment parser exists');
 assert.deepEqual(domain.parseProductAdjustment({id:7,revision,quantity:0,reason:'Rusak'}),{id:7,revision,quantity:0,reason:'Rusak'});
 for(const change of [{quantity:-1},{quantity:1.5},{reason:'free note'},{reason:'Stok Awal'},{quantity:2147483648},{stock:50}]) assert.throws(()=>domain.parseProductAdjustment({id:7,revision,quantity:5,reason:'Penyesuaian',...change}),{code:'INVALID_INPUT'});
});
test('local product writer rejects production, disabled and reused identities',()=>{
 assert.ok(config?.validateProductWriteConfig,'writer guard exists');
 const env={PRODUCTS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL:'mysql://reader:p@127.0.0.1:3307/kkisi_staging',DATABASE_URL_PRODUCT_WRITE:'mysql://product:p@127.0.0.1:3307/kkisi_staging',DATABASE_URL_AUTH:'mysql://auth:p@127.0.0.1:3307/kkisi_auth_staging'};
 assert.match(config.validateProductWriteConfig(env),/product/);
 for(const change of [{PRODUCTS_WRITES_ENABLED:'0'},{DATABASE_URL_PRODUCT_WRITE:undefined},{DATABASE_URL_PRODUCT_WRITE:'mysql://root:p@127.0.0.1:3307/kkisi_staging'},{DATABASE_URL_PRODUCT_WRITE:'mysql://reader:p@127.0.0.1:3307/kkisi_staging'},{DATABASE_URL_PRODUCT_WRITE:'mysql://product:p@remote.test:3307/kkisi_staging'},{DATABASE_URL_PRODUCT_WRITE:'mysql://product:p@127.0.0.1:3310/kkisi_staging'},{DATABASE_URL_PRODUCT_WRITE:'mysql://product:p@127.0.0.1:3307/production'},{DATABASE_URL_WRITE:env.DATABASE_URL_PRODUCT_WRITE},{DATABASE_URL_REGISTER_WRITE:env.DATABASE_URL_PRODUCT_WRITE},{DATABASE_URL_INVENTORY_WRITE:env.DATABASE_URL_PRODUCT_WRITE},{DATABASE_URL_PRODUCT_WRITE:'mysql://auth:p@127.0.0.1:3307/kkisi_staging'}])assert.throws(()=>config.validateProductWriteConfig({...env,...change}),{code:'WRITE_NOT_CONFIGURED'});
});
test('product mutation guards permission/origin/CSRF and never trusts body company/actor',async()=>{
 assert.ok(http?.handleProductEdit,'edit HTTP handler exists');
 const w=makeWorld();w.addUser({id:4,username:'synthetic',roleId:4});const r=await handleLogin(w.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'synthetic',password:'Pw-Synthetic-1'}}));assert.equal(r.status,200);
 const cookie=cookieOf(r),token=(await bodyOf(r)).csrfToken;let calls=0;
 const factory=write=>{calls++;assert.equal(write,true);return{async save(ctx,input){assert.equal(ctx.companyId,1);assert.equal(ctx.userId,4);return{id:input.id};}};};
 const post=(extra={})=>http.handleProductEdit(w.services,makeRequest('/api/products/edit',{method:'POST',cookie,token,body:{action:'save',...product},...extra}),factory);
 assert.equal((await post()).status,403);assert.equal(calls,0);w.data.permissions.add('4:items_edit');
 for(const extra of [{cookie:undefined},{token:null},{origin:'http://evil.test'},{contentType:'text/plain'}])assert.ok([401,403].includes((await post(extra)).status));assert.equal(calls,0);
 const ok=await post();assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');
 assert.equal((await post({body:{action:'save',...product,companyId:999,userId:999}})).status,400);
 const unavailable=await http.handleProductEdit(w.services,makeRequest('/api/products/edit',{method:'POST',cookie,token,body:{action:'save',...product}}),()=>({async save(){throw new Error('mysql://secret SQL');}}));assert.equal(unavailable.status,503);assert.deepEqual(await bodyOf(unavailable),{error:'PRODUCTS_UNAVAILABLE'});assert.doesNotMatch(JSON.stringify(w.logs),/secret|SQL/);
});
