import assert from 'node:assert/strict';
import test from 'node:test';
import {handleLogin} from '../src/infrastructure/auth/handlers/login.ts';
import {makeWorld,makeRequest,bodyOf,cookieOf} from './helpers/auth-fakes.mjs';
const domain=await import('@koperasi/domain/inventory');
const http=await import('../src/infrastructure/products/add-handler.ts');
const product={code:'',sku:'',name:'Sabun Mandi 90g',barcode:'8990000000017',packBarcode:'',description:'',type:'Produk Jadi',categoryId:1,brandId:null,unitId:1,packQuantity:1,consignment:false,basePrice:'3000',taxId:8,taxType:'Exclusive',sellingPrice:'4000',discount:'0',openingStock:12,alertQty:3,expiryDate:null,active:true};

test('product add parser keeps a strict allowlist, exact amounts and legacy invariants',()=>{
 const parsed=domain.parseProductCreate({...product,name:' Sabun Mandi 90g ',expiryDate:'2027-02-28'});
 assert.equal(parsed.name,'Sabun Mandi 90g');assert.equal(parsed.basePrice,'3000.00');assert.equal(parsed.expiryDate,'2027-02-28');
 for(const change of [{name:''},{barcode:''},{barcode:'saldoppob'},{packBarcode:'8990000000017'},{companyId:2},{stock:5},{id:9},{categoryId:null},{unitId:0},{brandId:-1},{type:'Jasa'},{taxType:'None'},{active:1},{consignment:'0'},{sellingPrice:'1e5'},{basePrice:'1.234'},{discount:'4000.01'},{openingStock:-1},{openingStock:1.5},{alertQty:2147483648},{expiryDate:'2027-02-30'},{expiryDate:'27-02-2027'},{type:'PPOB',openingStock:1},{sku:'x'.repeat(101)},{name:'a\u0001b'}])
  assert.throws(()=>domain.parseProductCreate({...product,...change}),{code:'INVALID_INPUT'},JSON.stringify(change));
 assert.equal(domain.parseProductCreate({...product,type:'PPOB',openingStock:0}).type,'PPOB');
});
test('legacy price formulas are computed exactly on the server',()=>{
 assert.equal(domain.purchasePriceFor('3000.00','11.00','Exclusive'),'3330.00');
 assert.equal(domain.purchasePriceFor('3000.00','11.00','Inclusive'),'3000.00');
 assert.equal(domain.purchasePriceFor('5990.99','11.00','Exclusive'),'6650.00');
 assert.deepEqual(domain.productPricing({basePrice:'3000.00',taxType:'Exclusive',sellingPrice:'4000.00',discount:'200.00'},'11.00'),{purchasePrice:'3330.00',profitMargin:'20.12',discountPercent:'5.00'});
 assert.deepEqual(domain.productPricing({basePrice:'9000.00',taxType:'Inclusive',sellingPrice:'8000.00',discount:'0.00'},'0.00'),{purchasePrice:'9000.00',profitMargin:'-11.11',discountPercent:'0.00'});
 assert.deepEqual(domain.productPricing({basePrice:'0.00',taxType:'Inclusive',sellingPrice:'0.00',discount:'0.00'},'0.00'),{purchasePrice:'0.00',profitMargin:'0.00',discountPercent:'0.00'});
});
test('product add HTTP guards items_add, origin/CSRF and derives branch/actor from the session',async()=>{
 const w=makeWorld();w.addUser({id:4,username:'synthetic',roleId:4});const r=await handleLogin(w.services,makeRequest('/api/auth/login',{method:'POST',body:{username:'synthetic',password:'Pw-Synthetic-1'}}));assert.equal(r.status,200);
 const cookie=cookieOf(r),token=(await bodyOf(r)).csrfToken;const writes=[];
 const factory=write=>({async options(ctx){assert.equal(write,false);assert.equal(ctx.companyId,1);return{categories:[],brands:[],units:[],taxes:[],codePrefix:'BRG-'};},async add(ctx,input,meta){writes.push(write);assert.equal(ctx.companyId,1);assert.equal(ctx.userId,4);assert.ok(meta.now instanceof Date);return{id:99,code:'BRG-0099',name:input.name,stock:input.openingStock};}});
 const post=(extra={})=>http.handleProductAdd(w.services,makeRequest('/api/products/add',{method:'POST',cookie,token,body:product,...extra}),factory);
 const get=()=>http.handleProductAdd(w.services,makeRequest('/api/products/add',{cookie}),factory);
 assert.equal((await post()).status,403);assert.equal((await get()).status,403);assert.deepEqual(writes,[]);
 w.data.permissions.add('4:items_add');
 for(const extra of [{cookie:undefined},{token:null},{origin:'http://evil.test'},{contentType:'text/plain'}])assert.ok([401,403].includes((await post(extra)).status));assert.deepEqual(writes,[]);
 const options=await get();assert.equal(options.status,200);assert.equal((await bodyOf(options)).options.codePrefix,'BRG-');
 const ok=await post();assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'no-store');assert.deepEqual(await bodyOf(ok),{id:99,code:'BRG-0099',name:'Sabun Mandi 90g',stock:12});assert.deepEqual(writes,[true]);
 assert.equal((await post({body:{...product,companyId:999}})).status,400);assert.equal((await post({body:[product]})).status,400);
 const conflict=await http.handleProductAdd(w.services,makeRequest('/api/products/add',{method:'POST',cookie,token,body:product}),()=>({async add(){throw new domain.ProductEditError('IDENTIFIER_EXISTS');}}));assert.equal(conflict.status,409);
 const unavailable=await http.handleProductAdd(w.services,makeRequest('/api/products/add',{method:'POST',cookie,token,body:product}),()=>({async add(){throw new Error('mysql://secret SQL');}}));assert.equal(unavailable.status,503);assert.deepEqual(await bodyOf(unavailable),{error:'PRODUCTS_UNAVAILABLE'});assert.doesNotMatch(JSON.stringify(w.logs),/secret|SQL/);
});
