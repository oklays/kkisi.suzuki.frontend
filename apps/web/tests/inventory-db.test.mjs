import assert from 'node:assert/strict';
import test,{before,beforeEach,after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {InventoryManagement} from '@koperasi/application/inventory';
import {parseCheckout} from '@koperasi/domain/pos/sale';
import {assertInventoryTarget,assertInventoryMarker,resetInventoryFixture,insertInventoryFixture,inventoryNow,inventoryDay} from './helpers/inventory-fixture.mjs';
const enabled=process.env.INVENTORY_DB_TEST==='1';
const target=process.env.POS_TEST_DATABASE_URL;
if(enabled)assertInventoryTarget(target);
const db=enabled?new PrismaClient({datasources:{db:{url:target}}}):null;
const inventoryAdapter=enabled?await import('../src/infrastructure/repositories/prisma-inventory.repository.ts').catch(()=>null):null;
const ctx={companyId:1,userId:1,canSwitchBranch:false};const admin={...ctx,userId:3,canSwitchBranch:true};
const repository=(writer=db)=>new inventoryAdapter.PrismaInventoryRepository(db,writer);
const management=()=>new InventoryManagement(repository());
const createInput=()=>({requestKey:randomUUID(),period:'Synthetic October',startDate:inventoryDay,endDate:inventoryDay,remarks:''});
const create=()=>management().create(ctx,createInput(),inventoryNow);
const count=(id,actualQty=17)=>management().count(ctx,{id,itemId:11,actualQty,note:'Physical count'},inventoryNow);
const item=async()=> (await db.$queryRaw`SELECT stock,status_so FROM db_items WHERE id=11`)[0];
const audits=async()=>await db.$queryRaw`SELECT qty,note,company_id,item_id FROM db_stockentry ORDER BY id`;
const check=(name,fn)=>test(name,{skip:!enabled},fn);
before(async()=>{if(enabled){await assertInventoryMarker(db);assert.ok(inventoryAdapter?.PrismaInventoryRepository,'inventory transactional adapter implemented');}});
beforeEach(async()=>{if(enabled)await resetInventoryFixture(db);});after(async()=>await db?.$disconnect());
check('draft creation replay, original snapshot, explicit zero, approval replay and physical valuation',async()=>{
 const input=createInput();const [first,replay]=await Promise.all([management().create(ctx,input,inventoryNow),management().create(ctx,input,inventoryNow)]);assert.equal(first.id,replay.id);
 await assert.rejects(management().create(ctx,{...input,remarks:'changed'},inventoryNow),{code:'REQUEST_CONFLICT'});
 let detail=await count(first.id,0);assert.equal(detail.lines[0].systemQty,20);assert.equal(detail.lines[0].actualQty,0);assert.equal(detail.lines[0].adjustmentQty,-20);assert.equal(detail.lines[0].subtotal,'0.00');assert.deepEqual(await item(),{stock:20,status_so:1});
 detail=await count(first.id,17);assert.equal(detail.lines[0].systemQty,20);assert.equal(detail.lines[0].subtotal,'68000.00');
 detail=await management().approve(ctx,first.id,inventoryNow);assert.equal(detail.document.status,1);assert.deepEqual(await item(),{stock:17,status_so:0});assert.deepEqual(await audits(),[{qty:-3,note:'Penyesuaian',company_id:1,item_id:11}]);
 await management().approve(ctx,first.id,inventoryNow);assert.equal((await audits()).length,1);await assert.rejects(count(first.id,18),{code:'DOCUMENT_IMMUTABLE'});await assert.rejects(management().cancel(ctx,first.id,inventoryNow),{code:'DOCUMENT_IMMUTABLE'});
});
check('competing documents, foreign IDs, immutable legacy and revoked permission cannot mutate',async()=>{
 const first=await create();await count(first.id);const second=await create();await assert.rejects(count(second.id),{code:'STOCK_LOCKED'});
 await assert.rejects(management().count(ctx,{id:second.id,itemId:12,actualQty:5,note:''},inventoryNow));
 await assert.rejects(management().detail({...ctx,companyId:2,userId:2},first.id),{code:'NOT_FOUND'});
 await db.$executeRaw`UPDATE db_inventory_so SET doc_no='LEGACY-SO' WHERE id=${second.id}`;await assert.rejects(management().approve(ctx,second.id,inventoryNow),{code:'DOCUMENT_IMMUTABLE'});
 await db.$executeRaw`DELETE FROM db_permissions WHERE role_id=4 AND permissions='inventory_so'`;await assert.rejects(management().approve(ctx,first.id,inventoryNow),{code:'FORBIDDEN'});assert.deepEqual(await item(),{stock:20,status_so:1});assert.equal((await audits()).length,0);
});
check('stock drift rejects whole approval and cancellation releases lock without replacing stock',async()=>{
 const document=await create();await count(document.id);await db.$executeRaw`UPDATE db_items SET stock=19 WHERE id=11`;
 await assert.rejects(management().approve(ctx,document.id,inventoryNow),{code:'STOCK_CHANGED'});assert.deepEqual(await item(),{stock:19,status_so:1});assert.equal((await audits()).length,0);
 await management().cancel(ctx,document.id,inventoryNow);assert.deepEqual(await item(),{stock:19,status_so:0});assert.equal((await audits()).length,0);await management().cancel(ctx,document.id,inventoryNow);await assert.rejects(management().detail(ctx,document.id),{code:'NOT_FOUND'});
});
check('global warehouses authorize administrators and serialize duplicate names across branches',async()=>{
 await assert.rejects(management().warehouses(ctx),{code:'FORBIDDEN'});
 const input={name:'Synthetic Main',mobile:'0123',email:'warehouse@example.test',status:1};
 const settled=await Promise.allSettled([management().saveWarehouse(admin,input),management().saveWarehouse({...admin,companyId:2},input)]);assert.equal(settled.filter(value=>value.status==='fulfilled').length,1);assert.equal(settled.find(value=>value.status==='rejected').reason.code,'NAME_EXISTS');
 const warehouse=(await management().warehouses(admin))[0];assert.equal((await management().saveWarehouse(admin,{...input,id:warehouse.id,status:0})).status,0);assert.equal((await management().saveWarehouse(admin,{...input,id:warehouse.id,status:1})).status,1);
 await db.$executeRaw`DELETE FROM db_permissions WHERE role_id=2 AND permissions='inventory_view'`;await assert.rejects(management().saveWarehouse(admin,{...input,name:'Revoked'}),{code:'FORBIDDEN'});
});
check('20 simultaneous approvals append once and two competing drafts acquire only one product',async()=>{
 const first=await create();const second=await create();const attempts=await Promise.allSettled([count(first.id,18),count(second.id,19)]);assert.equal(attempts.filter(value=>value.status==='fulfilled').length,1);assert.equal(attempts.find(value=>value.status==='rejected').reason.code,'STOCK_LOCKED');
 const id=attempts[0].status==='fulfilled'?first.id:second.id;await Promise.all(Array.from({length:20},()=>management().approve(ctx,id,inventoryNow)));assert.equal((await audits()).length,1);assert.equal((await item()).status_so,0);
});
check('count, approval and cancel failures at every write roll back all state',async()=>{
 for(const operation of ['count','approve','cancel']){
  const writes=operation==='count'?2:3;
  for(let at=1;at<=writes+1;at++){
   await resetInventoryFixture(db);const document=await create();if(operation!=='count')await count(document.id,17);
   const beforeItem=await item();const beforeDetail=await management().detail(ctx,document.id);let counter=0;
   const writer={$transaction:(fn,options)=>db.$transaction(async tx=>{
    const injected=new Proxy(tx,{get(object,key){if(key==='$executeRaw')return async(...args)=>{if(++counter===at)throw Error('injected inventory failure');return object.$executeRaw(...args);};const value=object[key];return typeof value==='function'?value.bind(object):value;}});
    const result=await fn(injected);if(at===writes+1)throw Error('injected inventory failure before commit');return result;
   },options)};
   const usecase=new InventoryManagement(repository(writer));
   const call=operation==='count'?usecase.count(ctx,{id:document.id,itemId:11,actualQty:17,note:''},inventoryNow):usecase[operation](ctx,document.id,inventoryNow);
   await assert.rejects(call,/injected inventory failure/);assert.deepEqual(await item(),beforeItem);assert.deepEqual(await management().detail(ctx,document.id),beforeDetail);assert.equal((await audits()).length,0);
  }
 }
});
check('POS and stock opname share mutex: checkout cannot sell a counted item',async()=>{
 const {PrismaPosRepository}=await import('../src/infrastructure/repositories/prisma-pos.repository.ts');
 const document=await create();await count(document.id,20);
 const checkout=parseCheckout({items:[{itemId:11,quantity:1}],paymentType:'Cash',paidAmount:'10000',idempotencyKey:randomUUID()});
 await assert.rejects(new PrismaPosRepository(db,db).checkout(ctx,checkout,inventoryNow),{code:'STOCK_OPNAME'});
 await management().approve(ctx,document.id,inventoryNow);await new PrismaPosRepository(db,db).checkout(ctx,checkout,inventoryNow);assert.equal((await item()).stock,19);
});
check('bounded search includes zero stock and excludes unsupported items, detail duplicate corruption rejects',async()=>{
 await db.$executeRaw`UPDATE db_items SET stock=0 WHERE id=11`;assert.equal((await management().items(ctx,'ITEM1'))[0].stock,0);
 await db.$executeRaw`UPDATE db_items SET custom_barcode='SALDOPPOB' WHERE id=11`;assert.deepEqual(await management().items(ctx,''),[]);
 await db.$executeRaw`UPDATE db_items SET custom_barcode='ITEM1' WHERE id=11`;const document=await create();await count(document.id,0);
 await insertInventoryFixture(db,'db_inventory_so_dtl',{so_id:document.id,item_id:11,barcode:'ITEM1',nama_barang:'Duplicate',qty_system:0,qty_actual:0,qty_adjust:0,purchase_price:4000,sub_total:0,note:'',status:1,konsinyasi:0,item_type:'Produk Jadi'});
 await assert.rejects(management().approve(ctx,document.id,inventoryNow),{code:'INVALID_INPUT'});assert.equal((await audits()).length,0);
});

check('high DOUBLE valuations reject lossy cents before locking and permit exact stored values',async()=>{
 const document=await create();await db.$executeRaw`UPDATE db_items SET stock=0,purchase_price=40000.01 WHERE id=11`;
 await assert.rejects(count(document.id,2147483604),{code:'INVALID_INPUT'});
 assert.deepEqual(await item(),{stock:0,status_so:0});assert.equal((await management().detail(ctx,document.id)).lines.length,0);
 await db.$executeRaw`UPDATE db_items SET purchase_price=40000.00 WHERE id=11`;
 const detail=await count(document.id,2147483604);assert.equal(detail.lines[0].subtotal,'85899344160000.00');
 const stored=await management().detail(ctx,document.id);assert.equal(stored.lines[0].subtotal,detail.lines[0].subtotal);
 await management().approve(ctx,document.id,inventoryNow);assert.equal((await item()).stock,2147483604);assert.equal((await audits())[0].qty,2147483604);
});
