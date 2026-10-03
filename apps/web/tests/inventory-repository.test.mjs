import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma} from '@prisma/client';
const mod=await import('../src/infrastructure/repositories/prisma-inventory.repository.ts').catch(()=>null);
const ctx={userId:4,companyId:1,canSwitchBranch:false},now=new Date('2026-10-03T01:00:00Z');
const doc={id:1,doc_no:'NXT-SO-12345678-1234-4123-8123-123456789012',periode:'2026-10',start_date:'2026-10-01',end_date:'2026-10-31',doc_status:0,doc_remarks:'',created_by:'synthetic'};
const line={id:2,item_id:7,nama_barang:'Soap',barcode:'SOAP',qty_system:3,qty_actual:0,qty_adjust:-3,purchase_price:new Prisma.Decimal('1.10'),sub_total:new Prisma.Decimal('0.00'),note:''};
const item={id:7,item_name:'Soap',custom_barcode:'SOAP',stock:3,status:1,status_so:1,type:'Produk Jadi',purchase_price:new Prisma.Decimal('1.10'),konsinyasi:0,expire_date:null};
function fake({document=doc,lines=[line],items=[item],conflicts=[],user=true}={}){
 const queries=[],writes=[];const tx={$queryRaw:async(s,...v)=>{const sql=Array.isArray(s)?s.join('?'):s.sql;queries.push(sql);if(sql.includes('FROM db_company'))return[{id:1}];if(sql.includes('FROM db_users'))return user?[{username:'synthetic'}]:[];if(sql.includes('FROM db_inventory_so_dtl d JOIN db_inventory_so'))return conflicts;if(sql.includes('FROM db_inventory_so_dtl'))return lines.map(l=>({...l}));if(sql.includes('FROM db_inventory_so'))return document?[{...document}]:[];if(sql.includes('FROM db_items'))return items;if(sql.includes('LAST_INSERT_ID'))return[{id:1n}];throw Error(sql+v);},$executeRaw:async(s,...v)=>{writes.push({sql:Array.isArray(s)?s.join('?'):s.sql,values:Array.isArray(s)?v:s.values});return 1;}};
 return{queries,writes,db:{$queryRaw:tx.$queryRaw,$transaction:async(fn,options)=>{assert.equal(options.isolationLevel,'ReadCommitted');return fn(tx);}}};
}
test('approval locks company before auth, replaces physical stock and appends signed audit',async()=>{
 assert.ok(mod?.PrismaInventoryRepository,'inventory repository exists');const f=fake();const r=await new mod.PrismaInventoryRepository(f.db,f.db).approve(ctx,1,now);assert.equal(r.document.status,1);assert.match(f.queries[0],/db_company.*FOR UPDATE/);assert.match(f.queries[1],/db_users/);assert.match(f.queries[2],/db_inventory_so.*FOR UPDATE/);
 assert.equal(f.writes.length,3);assert.match(f.writes[0].sql,/stock = \?.*status_so = 0/);assert.equal(f.writes[0].values[0],0);assert.match(f.writes[1].sql,/db_stockentry/);assert.ok(f.writes[1].values.includes(-3));assert.ok(f.writes[1].values.includes('2026-10-03 08:00:00'));assert.match(f.writes[2].sql,/doc_status = 1/);
});
test('replayed approvals, stock drift, duplicate/foreign rows, legacy and revocation cannot mutate',async()=>{
 assert.ok(mod?.PrismaInventoryRepository);
 for(const [options,code]of [[{document:{...doc,doc_status:1}},null],[{items:[{...item,stock:4}]},'STOCK_CHANGED'],[{lines:[line,line]},'INVALID_INPUT'],[{items:[]},'NOT_FOUND'],[{document:{...doc,doc_no:'LEGACY'}},'DOCUMENT_IMMUTABLE'],[{user:false},'FORBIDDEN'],[{lines:[]},'EMPTY_DOCUMENT']]){
  const f=fake(options);const call=new mod.PrismaInventoryRepository(f.db,f.db).approve(ctx,1,now);if(code)await assert.rejects(call,{code});else assert.equal((await call).document.status,1);assert.equal(f.writes.length,0);
 }
});
test('cancel rejects conflicting ownership and removes draft with no stock replacement',async()=>{
 assert.ok(mod?.PrismaInventoryRepository);
 const conflict=fake({conflicts:[{so_id:8}]});await assert.rejects(()=>new mod.PrismaInventoryRepository(conflict.db,conflict.db).cancel(ctx,1,now),{code:'STOCK_LOCKED'});assert.equal(conflict.writes.length,0);
 const f=fake();await new mod.PrismaInventoryRepository(f.db,f.db).cancel(ctx,1,now);assert.equal(f.writes.length,3);assert.match(f.writes[0].sql,/status_so = 0/);assert.doesNotMatch(f.writes[0].sql,/SET stock/);assert.match(f.writes[1].sql,/DELETE FROM db_inventory_so_dtl/);assert.match(f.writes[2].sql,/DELETE FROM db_inventory_so/);
 const missing=fake({document:null});await new mod.PrismaInventoryRepository(missing.db,missing.db).cancel(ctx,1,now);assert.equal(missing.writes.length,0);
});
test('count snapshots only once, detects legacy competing draft and enforces 500 rows',async()=>{
 assert.ok(mod?.PrismaInventoryRepository);
 const f=fake({lines:[],items:[{...item,status_so:0}]});await new mod.PrismaInventoryRepository(f.db,f.db).count(ctx,{id:1,itemId:7,actualQty:0,note:''},now);assert.equal(f.writes.length,2);assert.match(f.writes[0].sql,/INSERT INTO db_inventory_so_dtl/);assert.ok(f.writes[0].values.includes('0.00'));assert.match(f.writes[1].sql,/status_so = 1/);
 for(const options of [{lines:[],items:[{...item,status_so:0}],conflicts:[{so_id:8}]},{lines:Array.from({length:501},(_,i)=>({...line,id:i,item_id:i+1}))}]){const f=fake(options);await assert.rejects(()=>new mod.PrismaInventoryRepository(f.db,f.db).count(ctx,{id:1,itemId:7,actualQty:0,note:''},now));assert.equal(f.writes.length,0);}
 const edit=fake();await new mod.PrismaInventoryRepository(edit.db,edit.db).count(ctx,{id:1,itemId:7,actualQty:2,note:'new'},now);assert.match(edit.writes[0].sql,/UPDATE db_inventory_so_dtl/);assert.doesNotMatch(edit.writes[0].sql,/SET qty_system/);assert.ok(edit.writes[0].values.includes('2.20'));
});
test('same create UUID requires actor and matching metadata; retries restart transaction',async()=>{
 assert.ok(mod?.PrismaInventoryRepository);const input={requestKey:doc.doc_no.slice(7),period:'2026-10',startDate:'2026-10-01',endDate:'2026-10-31',remarks:''};
 const f=fake();assert.equal((await new mod.PrismaInventoryRepository(f.db,f.db).create(ctx,input,now)).id,1);assert.equal(f.writes.length,0);await assert.rejects(()=>new mod.PrismaInventoryRepository(f.db,f.db).create(ctx,{...input,remarks:'changed'},now),{code:'REQUEST_CONFLICT'});
 const retry=fake({document:null});let attempts=0;const tx=retry.db.$transaction;retry.db.$transaction=async(...args)=>{if(++attempts<3)throw{code:'P2010',meta:{code:'1213'}};return tx(...args);};await new mod.PrismaInventoryRepository(retry.db,retry.db).create(ctx,input,now);assert.equal(attempts,3);assert.equal(retry.writes.length,1);
});
test('count refuses a draft containing an item from a different company',async()=>{
 const f=fake({lines:[{...line,item_id:99}],items:[{...item,status_so:0}]});
 await assert.rejects(()=>new mod.PrismaInventoryRepository(f.db,f.db).count(ctx,{id:1,itemId:7,actualQty:0,note:''},now),{code:'NOT_FOUND'});assert.equal(f.writes.length,0);
});
test('repository read limits expose zero/negative and locked inventory without sellable-only filters',async()=>{
 const calls=[];const db={$queryRaw:async(s)=>{calls.push(s.sql??s.join('?'));return[];}};const repo=new mod.PrismaInventoryRepository(db);
 assert.deepEqual(await repo.list(ctx),[]);assert.match(calls.at(-1),/company_id = \?.*LIMIT 50/);
 assert.deepEqual(await repo.items(ctx,'%_'),[]);const sql=calls.at(-1);assert.match(sql,/company_id = \?.*status = 1.*Produk Jadi.*SALDOPPOB/);assert.match(sql,/LIMIT 25/);assert.doesNotMatch(sql,/stock >|status_so = 0/);
 await assert.rejects(()=>repo.warehouses(ctx),{code:'FORBIDDEN'});assert.deepEqual(await repo.warehouses({...ctx,canSwitchBranch:true}),[]);assert.doesNotMatch(calls.at(-1),/company_id/);
 await assert.rejects(()=>repo.create(ctx,{requestKey:'key'},now),{code:'WRITE_NOT_CONFIGURED'});
});
test('warehouse writes lock the global mutex first and revalidate role/permission',async()=>{
 const queries=[],writes=[];const tx={$queryRaw:async(s,...v)=>{const sql=s.sql??s.join('?');queries.push(sql);if(sql.includes('FROM db_company'))return[{id:1}];if(sql.includes('FROM db_users')){assert.match(sql,/u.role_id <= 2/);assert.ok((s.values??v).includes('inventory_view'));return[{username:'synthetic'}];}if(sql.includes('FROM db_warehouse'))return[];if(sql.includes('LAST_INSERT_ID'))return[{id:5n}];throw Error(sql);},$executeRaw:async(s)=>{writes.push(s.sql??s.join('?'));return 1;}};
 const repo=new mod.PrismaInventoryRepository({},{$transaction:async(fn)=>fn(tx)});const input={name:'Main',mobile:'',email:'',status:1};
 assert.deepEqual(await repo.saveWarehouse({...ctx,canSwitchBranch:true},input),{id:5,...input});assert.match(queries[0],/status = 1 ORDER BY id LIMIT 1 FOR UPDATE/);assert.match(queries[1],/id = \? AND status = 1 FOR UPDATE/);assert.match(queries[2],/db_users/);assert.equal(writes.length,1);assert.doesNotMatch(writes[0],/company_id|address/);
});
test('bounded deadlock retries stop after three complete attempts',async()=>{
 let attempts=0;const repo=new mod.PrismaInventoryRepository({},{$transaction:async()=>{attempts++;throw{code:'P2034'};}});
 await assert.rejects(()=>repo.cancel(ctx,1,now),e=>e.code==='P2034');assert.equal(attempts,3);
});
test('count rejects physical valuations that DOUBLE would round before persisting the detail or lock',async()=>{
 const f=fake({lines:[],items:[{...item,stock:0,status_so:0,purchase_price:new Prisma.Decimal('40000.01')}]});
 await assert.rejects(()=>new mod.PrismaInventoryRepository(f.db,f.db).count(ctx,{id:1,itemId:7,actualQty:2147483604,note:''},now),{code:'INVALID_INPUT'});
 assert.equal(f.writes.length,0);
});
