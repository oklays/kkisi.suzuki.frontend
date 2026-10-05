// Explicit local only (PRODUCT_ADD_DB_TEST=1). Every insert runs inside a writer transaction that is rolled back.
import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaProductAddRepository} from '../src/infrastructure/repositories/prisma-product-add.repository.ts';
import {productWritePrisma} from '../src/infrastructure/db/prisma-product-write.ts';
import {prisma} from '../src/infrastructure/db/prisma.ts';
const enabled=process.env.PRODUCT_ADD_DB_TEST==='1';
test('local product add inserts a legacy-compatible item and opening stock ledger, then rolls back',{skip:!enabled},async()=>{
 const writer=productWritePrisma(),repo=new PrismaProductAddRepository(prisma,writer),now=new Date('2026-10-05T03:00:00Z');
 const [actor]=await prisma.$queryRaw`SELECT u.id AS userId,u.company_id AS companyId,u.username FROM db_users u JOIN db_company c ON c.id=u.company_id AND c.status=1
  JOIN db_roles r ON r.id=u.role_id AND r.status=1 JOIN db_permissions p ON p.role_id=u.role_id AND p.permissions='items_add' WHERE u.status=1 AND u.role_id>2 ORDER BY u.id LIMIT 1`;
 assert.ok(actor,'an active branch user with items_add exists');
 const ctx={userId:Number(actor.userId),companyId:Number(actor.companyId)};
 const options=await repo.options(ctx);
 assert.ok(options.categories.length&&options.units.length&&options.taxes.length);assert.ok(options.codePrefix);
 const tax=options.taxes.find(t=>t.rate==='11.00')??options.taxes[0];
 const barcode=`NXTADD${Date.now()}`,[existing]=await prisma.$queryRaw`SELECT custom_barcode AS barcode FROM db_items WHERE company_id=${ctx.companyId} AND custom_barcode<>'' ORDER BY id LIMIT 1`;
 const input={code:'',sku:'',name:'NXT PRODUCT ADD TEST',barcode,packBarcode:`${barcode}P`,description:'Rollback-only test',type:'Produk Jadi',categoryId:options.categories[0].id,brandId:null,unitId:options.units[0].id,packQuantity:12,consignment:false,basePrice:'3000.00',taxId:tax.id,taxType:'Exclusive',sellingPrice:'4000.00',discount:'200.00',openingStock:5,alertQty:2,expiryDate:'2027-01-31',active:true};
 const [{next}]=await prisma.$queryRaw`SELECT COALESCE(MAX(id),0)+1 AS next FROM db_items WHERE company_id=${ctx.companyId}`;
 const baseline=await prisma.$queryRaw`SELECT (SELECT COUNT(*) FROM db_items) AS items,(SELECT COUNT(*) FROM db_stockentry) AS ledger`;
 try{
  await assert.rejects(writer.$transaction(async tx=>{
   const nested=new PrismaProductAddRepository(tx,{$transaction:run=>run(tx)});
   const added=await nested.add(ctx,input,{now,ip:'127.0.0.1'});
   assert.equal(added.stock,5);assert.equal(added.name,input.name);
   assert.ok(added.code.startsWith(options.codePrefix));assert.ok(Number(added.code.slice(options.codePrefix.length))>=Number(next));
   const [row]=await tx.$queryRaw`SELECT item_code,custom_barcode,custom_barcode_pack,company_id,type,stock,status,status_so,created_by,DATE_FORMAT(created_date,'%Y-%m-%d') AS day,DATE_FORMAT(expire_date,'%Y-%m-%d') AS expiry,tax_id,tax_type,
    CAST(price AS CHAR) AS price,CAST(purchase_price AS CHAR) AS purchase,CAST(sales_price AS CHAR) AS sales,CAST(profit_margin AS CHAR) AS margin,CAST(discount AS CHAR) AS discount,CAST(discount_persen AS CHAR) AS discountPercent,unit_perpack,alert_qty,brand_id,item_image,system_ip FROM db_items WHERE id=${added.id}`;
   assert.equal(row.item_code,added.code);assert.equal(row.custom_barcode,barcode);assert.equal(row.company_id,ctx.companyId);assert.equal(row.type,'Produk Jadi');
   assert.equal(row.stock,5);assert.equal(row.status,1);assert.equal(row.status_so,0);assert.equal(row.created_by,actor.username);assert.equal(row.day,'2026-10-05');assert.equal(row.expiry,'2027-01-31');
   assert.equal(row.tax_id,tax.id);assert.equal(row.tax_type,'Exclusive');assert.equal(row.price,'3000.00');assert.equal(row.sales,'4000.00');assert.equal(row.discount,'200.00');assert.equal(row.discountPercent,'5.00');
   const expectedPurchase=(3000+Math.round(3000*Number(tax.rate))/100).toFixed(2);assert.equal(row.purchase,expectedPurchase);
   assert.equal(row.unit_perpack,12);assert.equal(row.alert_qty,2);assert.equal(row.brand_id,null);assert.equal(row.item_image,'');assert.equal(row.system_ip,'127.0.0.1');
   const ledger=await tx.$queryRaw`SELECT qty,note,company_id,status,DATE_FORMAT(expire_date,'%Y-%m-%d') AS expiry FROM db_stockentry WHERE item_id=${added.id}`;
   assert.deepEqual(ledger.map(e=>({...e})),[{qty:5,note:'Stok Awal',company_id:ctx.companyId,status:1,expiry:'2027-01-31'}]);
   // Duplicates across unit/pack barcode columns, existing catalog codes, SKU and item code are rejected in the branch.
   for(const change of [{barcode},{barcode:`${barcode}P`,packBarcode:''},{barcode:`${barcode}X`,packBarcode:barcode},{barcode:existing.barcode},{barcode:`${barcode}Y`,packBarcode:'',code:added.code}])
    await assert.rejects(nested.add(ctx,{...input,...change},{now,ip:''}),{code:'IDENTIFIER_EXISTS'},JSON.stringify(change));
   const plain=await nested.add(ctx,{...input,barcode:`${barcode}Z`,packBarcode:'',sku:`${barcode}SKU`,code:`${barcode}CODE`,openingStock:0,brandId:null,taxType:'Inclusive'},{now,ip:''});
   assert.equal(plain.code,`${barcode}CODE`);assert.equal((await tx.$queryRaw`SELECT COUNT(*) AS n FROM db_stockentry WHERE item_id=${plain.id}`)[0].n,0n);
   await assert.rejects(nested.add(ctx,{...input,barcode:`${barcode}W`,packBarcode:'',sku:`${barcode}SKU`},{now,ip:''}),{code:'IDENTIFIER_EXISTS'});
   for(const change of [{categoryId:2147483647},{unitId:2147483647},{brandId:2147483647},{taxId:2147483647}])
    await assert.rejects(nested.add(ctx,{...input,barcode:`${barcode}V`,packBarcode:'',...change},{now,ip:''}),{code:'INVALID_INPUT'},JSON.stringify(change));
   throw new Error('ROLLBACK_TEST_COMPLETE');
  },{timeout:20000}),/ROLLBACK_TEST_COMPLETE/);
  await assert.rejects(repo.add({...ctx,userId:2147483647},{...input,barcode:`${barcode}F`},{now,ip:''}),{code:'FORBIDDEN'});
  assert.deepEqual(await prisma.$queryRaw`SELECT (SELECT COUNT(*) FROM db_items) AS items,(SELECT COUNT(*) FROM db_stockentry) AS ledger`,baseline);
  assert.equal((await prisma.$queryRaw`SELECT COUNT(*) AS n FROM db_items WHERE custom_barcode LIKE ${barcode+'%'}`)[0].n,0n);
 }finally{await writer.$disconnect();await prisma.$disconnect();}
});
