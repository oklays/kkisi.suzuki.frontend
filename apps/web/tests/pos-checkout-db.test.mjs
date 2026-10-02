import assert from 'node:assert/strict';
import test,{before,beforeEach,after} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {parseCheckout,businessDates} from '@koperasi/domain/pos/sale';
const enabled=process.env.POS_CHECKOUT_DB_TEST==='1';
const target=process.env.POS_TEST_DATABASE_URL;
if(enabled){const url=new URL(target);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3310');assert.equal(url.pathname,'/kkisi_pos_staging');}
const db=enabled?new PrismaClient({datasources:{db:{url:target}}}):null;
const schema=readFileSync(new URL('./fixtures/pos-schema.sql',import.meta.url),'utf8');
const tables=[...schema.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\)/g)].filter(t=>t[1]!=="_pos_test_marker");
const now=new Date('2026-10-02T06:00:00Z');const day=businessDates(now).day;
let Repository;
if(enabled){Repository=(await import('../src/infrastructure/repositories/prisma-pos.repository.ts').catch(()=>null))?.PrismaPosRepository;}
async function insert(table,over){
 const block=tables.find(t=>t[1]===table)?.[2];assert.ok(block);
 const fields={};
 for(const line of block.split('\n')){const m=/^\s*`([^`]+)` (\w+)(?:\([^)]+\))?(.*)/.exec(line);if(!m)continue;const[,name,kind,rest]=m;
  if(name==='id'||!rest.includes('NOT NULL')||/DEFAULT|AUTO_INCREMENT/.test(rest))continue;
  fields[name]=['date','datetime','timestamp'].includes(kind)?(kind==='date'?day:day+' 12:00:00'):['varchar','text','enum'].includes(kind)?(kind==='enum'?'Inclusive':''):0;
 }
 Object.assign(fields,over);
 const keys=Object.keys(fields);await db.$executeRawUnsafe(`INSERT INTO \`${table}\` (${keys.map(k=>'`'+k+'`').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,...Object.values(fields));
}
async function reset(){
 for(const t of tables)await db.$executeRawUnsafe(`DELETE FROM \`${t[1]}\``);
 for(const id of [1,2]){
  await insert('db_company',{id,company_name:`Synthetic ${id}`,sales_init:`S${id}`,status:1});
  await insert('db_users',{id,username:`synthetic${id}`,fullname:`Synthetic ${id}`,role_id:4,company_id:id,status:1});
  await insert('db_kasir',{id,company_id:id,no_kasir:`K${id}`,status:1});
  await insert('db_buka_kasir',{id,noref:`KRS-SYNTH-${id}`,id_kasir:id,user_id:id,company_id:id,status:1,tgl_buka:day+' 08:00:00'});
  await insert('db_items',{id:id+10,company_id:id,item_code:`SYNTH-${id}`,custom_barcode:`ITEM${id}`,sales_price:10000,purchase_price:4000,discount:500,stock:100,type:'Produk Jadi',status:1,status_so:0});
  await insert('db_sales',{id:id*100,sales_code:`DRAFT${id}`,company_id:id,id_buka_kasir:id,id_kasir:id,created_by:`synthetic${id}`,sales_status:'Quotation',sales_date:day});
  await insert('db_cart',{id,sales_id:id*100,sales_code:`DRAFT${id}`,item_id:id+10,sales_qty:1});
 }
 await insert('db_roles',{id:4,status:1});await insert('db_permissions',{role_id:4,permissions:'sales_add'});
 await insert('m_anggota',{id:7,nik_kar:'NIK-7',id_card:'CARD-7',nama_kar:'Synthetic Member',status_anggota:'AKTIVE',status_karyawan:'TETAP',limit_toko:50000,gaji_minus:0});
}
const repo=()=>new Repository(db,db);
const context=(companyId=1)=>({companyId,userId:companyId});
const body=(over={})=>({items:[{itemId:11,quantity:1}],paymentType:'Cash',paidAmount:'10000',idempotencyKey:randomUUID(),...over});
const pay=(over={},companyId=1,repository=repo())=>repository.checkout(context(companyId),parseCheckout(body(over)),now);
async function countFinal(){return Number((await db.$queryRaw`SELECT COUNT(*) AS n FROM db_sales WHERE sales_status='Final'`)[0].n);}
async function stock(id=11){return (await db.$queryRaw`SELECT stock FROM db_items WHERE id=${id}`)[0].stock;}
before(async()=>{if(enabled){assert.ok(Repository,'atomic POS repository is implemented');assert.equal((await db.$queryRaw`SELECT marker FROM _pos_test_marker WHERE id=1`)[0]?.marker,'kkisi-pos-disposable-synthetic','only an explicitly marked synthetic database may be reset');}});
beforeEach(async()=>{if(enabled)await reset();});after(async()=>{await db?.$disconnect();});
const check=(name,fn)=>test(name,{skip:!enabled},fn);
check('Cash finalization persists legacy rows, exact prices/change, stock and only the owned cart atomically',async()=>{
 const receipt=await pay({items:[{itemId:11,quantity:2}],paidAmount:'20000'});
 assert.equal(receipt.grandTotalSen,1900000);assert.equal(receipt.paidSen,2000000);assert.equal(receipt.changeSen,100000);assert.match(receipt.salesCode,/^S1261002\d{5}$/);
 assert.equal(await stock(),98);assert.equal(await countFinal(),1);
 const [sale]=await db.$queryRaw`SELECT * FROM db_sales WHERE id=${receipt.saleId}`;assert.equal(sale.nik_kar,'0');assert.equal(sale.sales_status,'Final');assert.equal(sale.payment_status,'Paid');assert.equal(Number(sale.subtotal_hpp),8000);assert.equal(sale.company_id,1);assert.equal(sale.id_kasir,1);assert.equal(sale.id_buka_kasir,1);
 const [line]=await db.$queryRaw`SELECT * FROM db_salesitems WHERE sales_id=${receipt.saleId}`;assert.equal(line.sales_qty,2);assert.equal(Number(line.price_per_unit),10000);assert.equal(Number(line.discount_amt),500);assert.equal(Number(line.total_cost),19000);
 const [payment]=await db.$queryRaw`SELECT * FROM db_salespayments WHERE sales_id=${receipt.saleId}`;assert.equal(Number(payment.payment),20000);assert.equal(Number(payment.change_return),1000);
 assert.deepEqual((await db.$queryRaw`SELECT id FROM db_cart ORDER BY id`).map(r=>r.id),[2]);
});
check('stock, opname, PPOB, inactive item, insufficient tender and cross-company products reject without writes',async()=>{
 for(const [change,expected] of [[{stock:0},'INSUFFICIENT_STOCK'],[{status_so:1},'STOCK_OPNAME'],[{type:'PPOB'},'PPOB_UNSUPPORTED'],[{status:0},'ITEM_UNAVAILABLE'],[{custom_barcode:'SALDOPPOB'},'PPOB_UNSUPPORTED']]){
  await reset();for(const [column,value]of Object.entries(change))await db.$executeRawUnsafe(`UPDATE db_items SET \`${column}\`=? WHERE id=11`,value);
  await assert.rejects(pay(),e=>e.code===expected);assert.equal(await countFinal(),0);
 }
 await reset();await assert.rejects(pay({paidAmount:'1'}),e=>e.code==='INSUFFICIENT_PAYMENT');await assert.rejects(pay({items:[{itemId:12,quantity:1}]}),e=>e.code==='ITEM_UNAVAILABLE');assert.equal(await countFinal(),0);
});
check('closed, stale and multiple cashier sessions and revoked permission fail closed',async()=>{
 await db.$executeRaw`UPDATE db_buka_kasir SET status=0 WHERE id=1`;await assert.rejects(pay(),e=>e.code==='REGISTER_CLOSED');
 await reset();await db.$executeRaw`UPDATE db_buka_kasir SET tgl_buka='2026-10-01 10:00:00' WHERE id=1`;await assert.rejects(pay(),e=>e.code==='REGISTER_STALE');
 await reset();await insert('db_buka_kasir',{id:3,noref:'KRS-EXTRA',id_kasir:1,user_id:1,company_id:1,status:1,tgl_buka:day+' 09:00:00'});await assert.rejects(pay(),e=>e.code==='REGISTER_AMBIGUOUS');
 await reset();await db.$executeRaw`DELETE FROM db_permissions`;await assert.rejects(pay(),e=>e.code==='FORBIDDEN');assert.equal(await countFinal(),0);
});
check('faults at each write and before commit roll back sales, items, payment, stock and cart',async()=>{
 for(const marker of ['INSERT INTO db_sales\n','INSERT INTO db_salesitems','INSERT INTO db_salespayments','UPDATE db_items','DELETE cart','before_commit']){
  await reset();
  const write={$transaction:(fn,options)=>db.$transaction(async tx=>{
   const injected=new Proxy(tx,{get(target,key){if(key==='$executeRaw')return async(...args)=>{const sql=args[0]?.strings?.join('')??(Array.isArray(args[0])?args[0].join(''):'');if(sql.includes(marker))throw new Error('injected write failure');return target.$executeRaw(...args);};const v=target[key];return typeof v==='function'?v.bind(target):v;}});
   const value=await fn(injected);if(marker==='before_commit')throw new Error('injected commit failure');return value;
  },options)};
  await assert.rejects(pay({},1,new Repository(db,write)),/injected/);assert.equal(await countFinal(),0);assert.equal(await stock(),100);assert.equal((await db.$queryRaw`SELECT COUNT(*) AS n FROM db_salesitems`)[0].n,0n);assert.equal((await db.$queryRaw`SELECT COUNT(*) AS n FROM db_salespayments`)[0].n,0n);assert.equal((await db.$queryRaw`SELECT COUNT(*) AS n FROM db_cart`)[0].n,2n);
 }
});
check('20 parallel retries return one sale and a changed payload cannot reuse its key',async()=>{
 const idempotencyKey=randomUUID();const receipts=await Promise.all(Array.from({length:20},()=>pay({idempotencyKey})));
 assert.equal(new Set(receipts.map(r=>r.saleId)).size,1);assert.equal(await stock(),99);assert.equal(await countFinal(),1);
 await assert.rejects(pay({idempotencyKey,paidAmount:'11000'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 await db.$executeRaw`UPDATE db_buka_kasir SET status=0 WHERE id=1`;assert.equal((await pay({idempotencyKey})).saleId,receipts[0].saleId);
});
check('50 concurrent checkouts allocate unique invoices and decrement stock exactly once',async()=>{
 const receipts=await Promise.all(Array.from({length:50},()=>pay()));assert.equal(new Set(receipts.map(r=>r.salesCode)).size,50);assert.equal(await stock(),50);assert.equal(await countFinal(),50);
});
check('credit lookup sums Final current-month Kredit across branches, salary override and active contracts',async()=>{
 await insert('db_sales',{sales_code:'OLD-CREDIT',company_id:2,sales_status:'Final',payment_type:'Kredit',nik_kar:'NIK-7',grand_total:20000,sales_date:day});
 assert.equal((await repo().member(context(),'CARD-7',now)).remainingSen,3000000);
 await db.$executeRaw`UPDATE m_anggota SET gaji_minus=40000 WHERE id=7`;assert.equal((await repo().member(context(),'NIK-7',now)).remainingSen,2000000);
 assert.equal((await repo().member(context(),'NIK-7',new Date('2026-11-01T00:00:00Z'))).remainingSen,4000000);
 await db.$executeRaw`UPDATE m_anggota SET status_anggota='PENSIUN' WHERE id=7`;await assert.rejects(repo().member(context(),'NIK-7',now),e=>e.code==='MEMBER_INACTIVE');
 await db.$executeRaw`UPDATE m_anggota SET status_anggota='AKTIVE',status_karyawan='KONTRAK',tgl_keluar=${day} WHERE id=7`;await assert.rejects(pay({memberId:7,paymentType:'Kredit'}),e=>e.code==='MEMBER_EXPIRED');
 assert.equal((await db.$queryRaw`SELECT status_anggota FROM m_anggota WHERE id=7`)[0].status_anggota,'AKTIVE','reads/checkouts never retire the member');
});
check('20 concurrent credit checkouts across two branches cannot exceed a shared member limit',async()=>{
 const results=await Promise.allSettled(Array.from({length:20},(_,i)=>pay({paymentType:'Kredit',memberId:7,items:[{itemId:i%2?12:11,quantity:1}]},i%2?2:1)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,5);
 for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.code,'CREDIT_LIMIT');
 assert.equal(await countFinal(),5);const [sum]=await db.$queryRaw`SELECT SUM(grand_total) AS n FROM db_sales WHERE sales_status='Final' AND payment_type='Kredit'`;assert.equal(Number(sum.n),47500);assert.equal(await stock()+await stock(12),195);
 const [payment]=await db.$queryRaw`SELECT payment_type,paid_amount,grand_total,other_charges_amt FROM db_sales WHERE sales_status='Final' LIMIT 1`;assert.equal(payment.payment_type,'Kredit');assert.equal(Number(payment.paid_amount),payment.grand_total);assert.equal(payment.other_charges_amt,0);
});
check('exact credit boundary passes; duplicate card and guest credit are rejected',async()=>{
 await db.$executeRaw`UPDATE m_anggota SET limit_toko=9500 WHERE id=7`;await pay({paymentType:'Kredit',memberId:7});assert.equal((await repo().member(context(),'NIK-7',now)).remainingSen,0);
 await assert.rejects(pay({paymentType:'Kredit',memberId:7}),e=>e.code==='CREDIT_LIMIT');
 await insert('m_anggota',{id:8,nik_kar:'OTHER',id_card:'CARD-7',status_anggota:'AKTIVE',limit_toko:9500,gaji_minus:0});await assert.rejects(repo().member(context(),'CARD-7',now),e=>e.code==='MEMBER_AMBIGUOUS');
 assert.throws(()=>parseCheckout(body({paymentType:'Kredit',memberId:null})),e=>e.code==='MEMBER_REQUIRED');
});
check('code-only cart rows are cleaned only for a uniquely owned draft, preserving other users and ambiguous codes',async()=>{
 await db.$executeRaw`UPDATE db_cart SET sales_id=NULL WHERE id=1`;await pay();assert.deepEqual((await db.$queryRaw`SELECT id FROM db_cart`).map(r=>r.id),[2]);
 await reset();await db.$executeRaw`UPDATE db_cart SET sales_id=NULL WHERE id=1`;await db.$executeRaw`UPDATE db_sales SET sales_code='DRAFT1' WHERE id=200`;await pay();assert.equal((await db.$queryRaw`SELECT COUNT(*) AS n FROM db_cart`)[0].n,2n);
});
check('transient conflict retries the entire transaction and never leaves partial rows or double decrements',async()=>{
 let attempts=0;
 const write={$transaction:(fn,options)=>db.$transaction(async tx=>{const receipt=await fn(tx);if(++attempts<3)throw Object.assign(new Error('synthetic conflict'),{code:'P2034'});return receipt;},options)};
 const receipt=await pay({},1,new Repository(db,write));assert.equal(attempts,3);assert.equal(await countFinal(),1);assert.equal(await stock(),99);assert.ok(receipt.saleId>0);
});
check('fractional Cash change is exact and fractional Credit is refused before a lossy DECIMAL(10,0) payment write',async()=>{
 await db.$executeRaw`UPDATE db_items SET sales_price=10000.10 WHERE id=11`;
 const receipt=await pay();assert.equal(receipt.grandTotalSen,950010);assert.equal(receipt.changeSen,49990);
 await assert.rejects(pay({paymentType:'Kredit',memberId:7}),e=>e.code==='PAYMENT_PRECISION');assert.equal(await countFinal(),1);
});
