// Explicit local only. Mutations are rolled back; browser checks use these test-owned IDs separately.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PrismaProductEditRepository} from '../src/infrastructure/repositories/prisma-product-edit.repository.ts';
import {productWritePrisma} from '../src/infrastructure/db/prisma-product-write.ts';
import {prisma} from '../src/infrastructure/db/prisma.ts';
const enabled=process.env.PRODUCT_EDIT_DB_TEST==='1';
test('local product edit transactions preserve audit, scope, locks and rollback', {skip:!enabled},async()=>{
 const fixture=JSON.parse(await readFile(new URL('../.e2e-product-edit.json',import.meta.url),'utf8'));
 const id=fixture.ids[0],ctx=fixture.ctx,writer=productWritePrisma(),repo=new PrismaProductEditRepository(prisma,writer);
 const original=await repo.snapshot(ctx,id),now=new Date();
 assert.ok(original.product.code.startsWith('NXT-PROD-'));assert.equal(original.stock,10);
 const baseline=await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_stockentry WHERE item_id=${id}`;
 try{
  await assert.rejects(writer.$transaction(async tx=>{
   const nested=new PrismaProductEditRepository(tx,{$transaction:run=>run(tx)});
   await nested.save(ctx,{...original.product,sku:'NXT-SKU-EDIT',name:'NXT PRODUCT EDIT TEST changed',sellingPrice:'4500.25',alertQty:2},now);
   const updated=await nested.snapshot(ctx,id);assert.equal(updated.product.sku,'NXT-SKU-EDIT');assert.equal(updated.product.sellingPrice,'4500.25');
   assert.equal(updated.stock,10);assert.equal(updated.product.name,'NXT PRODUCT EDIT TEST changed');
   await assert.rejects(nested.save(ctx,original.product,now),{code:'PRODUCT_CHANGED'});
   const adjusted=await nested.adjust(ctx,{id,revision:updated.product.revision,quantity:7,reason:'Rusak'},now);assert.deepEqual(adjusted,{id,stock:7,delta:-3});
   const entries=await tx.$queryRaw`SELECT qty,note FROM db_stockentry WHERE item_id=${id} ORDER BY id DESC LIMIT 1`;assert.equal(entries[0].qty,-3);assert.equal(entries[0].note,'Rusak');
   await assert.rejects(nested.adjust(ctx,{id,revision:updated.product.revision,quantity:7,reason:'Rusak'},now),{code:'PRODUCT_CHANGED'});
   const fresh=await nested.snapshot(ctx,id);const unchanged=await nested.adjust(ctx,{id,revision:fresh.product.revision,quantity:7,reason:'Penyesuaian'},now);assert.equal(unchanged.delta,0);
   await assert.rejects(nested.adjust(ctx,{id,revision:fresh.product.revision,quantity:9,reason:'Hilang'},now),{code:'INVALID_INPUT'});
   await assert.rejects(nested.save(ctx,{...fresh.product,code:'NXT-PROD-EDIT',categoryId:2147483647},now),{code:'INVALID_INPUT'});
   await assert.rejects(nested.snapshot(ctx,fixture.ids[1]),{code:'NOT_FOUND'});
   throw new Error('ROLLBACK_TEST_COMPLETE');
  },{timeout:15000}),/ROLLBACK_TEST_COMPLETE/);
  assert.deepEqual(await repo.snapshot(ctx,id),original);assert.deepEqual(await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_stockentry WHERE item_id=${id}`,baseline);
  // Force the item update to fail after the real ledger insert: the writer transaction must undo both.
  const failingWriter={$transaction:run=>writer.$transaction(async tx=>run(new Proxy(tx,{get(target,key){if(key==='$executeRaw')return async(strings,...values)=>{if(strings.join('').includes('UPDATE db_items SET stock'))return 0;return tx.$executeRaw(strings,...values);};return Reflect.get(target,key);}})))};
  await assert.rejects(new PrismaProductEditRepository(prisma,failingWriter).adjust(ctx,{id,revision:original.product.revision,quantity:8,reason:'Penyesuaian'},now),{code:'PRODUCT_CHANGED'});
  assert.deepEqual(await repo.snapshot(ctx,id),original);assert.deepEqual(await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_stockentry WHERE item_id=${id}`,baseline);
  // Re-read permissions and SO lock inside mutation, even if the outer auth guard was previously valid.
  const lockedWriter={$transaction:run=>writer.$transaction(async tx=>run(new Proxy(tx,{get(target,key){if(key==='$queryRaw')return async(strings,...values)=>{const rows=await tx.$queryRaw(strings,...values);return (Array.isArray(strings)?strings.join(''):strings.sql).includes('FROM db_items WHERE')?rows.map(r=>({...r,statusSo:1})):rows;};return Reflect.get(target,key);}})))};
  await assert.rejects(new PrismaProductEditRepository(prisma,lockedWriter).save(ctx,original.product,now),{code:'STOCK_LOCKED'});
  await assert.rejects(repo.save({...ctx,userId:2147483647},original.product,now),{code:'FORBIDDEN'});
 }finally{await writer.$disconnect();await prisma.$disconnect();}
});
