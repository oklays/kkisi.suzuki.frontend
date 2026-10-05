import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ProductEditError, type ProductEditInput, type ProductAdjustmentInput, type ProductEditSnapshot, type ProductEditOption } from '@koperasi/domain/inventory';
import type { ProductActor, ProductEditRepository } from '@koperasi/application/inventory';
import { prisma } from '../db/prisma.ts';
import { productWritePrisma } from '../db/prisma-product-write.ts';

type Db = PrismaClient | Prisma.TransactionClient;
type Row = Omit<ProductEditInput,'revision'|'active'|'sellingPrice'|'purchasePrice'|'discount'> & { sellingPrice: Prisma.Decimal; purchasePrice: Prisma.Decimal; discount: Prisma.Decimal; status: number; statusSo: number; stock: number; type: string; expiryDate: string | null; stamp: string };
const fields = Prisma.sql`id,item_code AS code,sku,item_name AS name,custom_barcode AS barcode,custom_barcode_pack AS packBarcode,description,
 category_id AS categoryId,brand_id AS brandId,unit_id AS unitId,unit_perpack AS packQuantity,
 CAST(sales_price AS DECIMAL(18,2)) AS sellingPrice,CAST(purchase_price AS DECIMAL(18,2)) AS purchasePrice,CAST(discount AS DECIMAL(18,2)) AS discount,
 alert_qty AS alertQty,status,status_so AS statusSo,stock,type,DATE_FORMAT(expire_date,'%Y-%m-%d') AS expiryDate,DATE_FORMAT(created_time,'%Y-%m-%d %H:%i:%s') AS stamp`;
function editable(r: Row): ProductEditInput {
  return { id:r.id,revision:createHash('sha256').update(JSON.stringify(r)).digest('hex'),code:r.code,sku:r.sku,name:r.name,barcode:r.barcode,packBarcode:r.packBarcode,description:r.description,
    categoryId:r.categoryId,brandId:r.brandId,unitId:r.unitId,packQuantity:r.packQuantity,sellingPrice:r.sellingPrice.toFixed(2),purchasePrice:r.purchasePrice.toFixed(2),discount:r.discount.toFixed(2),alertQty:r.alertQty,active:r.status===1 };
}
async function row(db: Db, ctx: ProductActor, id: number, lock=false): Promise<Row> {
  const [result] = await db.$queryRaw<Row[]>(Prisma.sql`SELECT ${fields} FROM db_items WHERE company_id=${ctx.companyId} AND id=${id} ${lock?Prisma.sql`FOR UPDATE`:Prisma.empty}`);
  if (!result) throw new ProductEditError('NOT_FOUND');
  return result;
}
async function locked(db: Db, ctx: ProductActor, r: Row): Promise<boolean> {
  if (r.statusSo !== 0) return true;
  const drafts = await db.$queryRaw<{id:number}[]>`SELECT s.id FROM db_inventory_so s JOIN db_inventory_so_dtl d ON d.so_id=s.id WHERE s.company_id=${ctx.companyId} AND s.doc_status=0 AND d.item_id=${r.id} LIMIT 1`;
  return drafts.length>0;
}
const times = (now: Date) => { const time=new Date(now.getTime()+7*3600000).toISOString().slice(0,19).replace('T',' ');return{time,day:time.slice(0,10)}; };

export class PrismaProductEditRepository implements ProductEditRepository {
  private readonly read: PrismaClient;
  private readonly write?: PrismaClient;
  constructor(read: PrismaClient=prisma,write?:PrismaClient) { this.read=read;this.write=write; }
  async snapshot(ctx: ProductActor,id:number):Promise<ProductEditSnapshot> {
    const r=await row(this.read,ctx,id);
    const [categories,brands,units,isLocked]=await Promise.all([
      this.read.$queryRaw<ProductEditOption[]>`SELECT id,category_name AS name,status AS active FROM db_category WHERE status=1 OR id=${r.categoryId??0} ORDER BY category_name,id`,
      this.read.$queryRaw<ProductEditOption[]>`SELECT id,brand_name AS name,status AS active FROM db_brands WHERE status=1 OR id=${r.brandId??0} ORDER BY brand_name,id`,
      this.read.$queryRaw<ProductEditOption[]>`SELECT id,unit_name AS name,status AS active FROM db_units WHERE status=1 OR id=${r.unitId??0} ORDER BY unit_name,id`,locked(this.read,ctx,r),
    ]);
    const normalize=(values:ProductEditOption[])=>values.map(v=>({...v,active:!!v.active}));
    return{product:editable(r),stock:r.stock,locked:isLocked,stockEditable:r.type!=='PPOB'&&r.barcode!=='SALDOPPOB',options:{categories:normalize(categories),brands:normalize(brands),units:normalize(units)}};
  }
  private async transaction<T>(ctx:ProductActor,operation:(tx:Prisma.TransactionClient,username:string)=>Promise<T>):Promise<T> {
    if(!this.write)throw new ProductEditError('WRITE_NOT_CONFIGURED');
    return this.write.$transaction(async tx=>{
      const [company]=await tx.$queryRaw<{id:number}[]>`SELECT id FROM db_company WHERE id=${ctx.companyId} AND status=1 FOR UPDATE`;
      if(!company)throw new ProductEditError('FORBIDDEN');
      const [user]=await tx.$queryRaw<{username:string}[]>`SELECT u.username FROM db_users u JOIN db_roles r ON r.id=u.role_id AND r.status=1
        WHERE u.id=${ctx.userId} AND u.status=1 AND (u.role_id<=2 OR u.company_id=${ctx.companyId})
        AND EXISTS(SELECT 1 FROM db_permissions p WHERE p.role_id=u.role_id AND p.permissions='items_edit') FOR UPDATE`;
      if(!user)throw new ProductEditError('FORBIDDEN');
      return operation(tx,user.username);
    },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:15000,timeout:15000});
  }
  async save(ctx:ProductActor,input:ProductEditInput,now:Date):Promise<{id:number}> {
    return this.transaction(ctx,async(tx,username)=>{
      const r=await row(tx,ctx,input.id,true),before=editable(r);
      if(await locked(tx,ctx,r))throw new ProductEditError('STOCK_LOCKED');
      if(before.revision!==input.revision)throw new ProductEditError('PRODUCT_CHANGED');
      if(JSON.stringify({...before,revision:''})===JSON.stringify({...input,revision:''}))return{id:r.id};
      for(const [value,previous,table] of [[input.categoryId,r.categoryId,'db_category'],[input.brandId,r.brandId,'db_brands'],[input.unitId,r.unitId,'db_units']] as const){
        if(value===previous)continue;
        if(value===null){if(table!=='db_brands')throw new ProductEditError('INVALID_INPUT');continue;}
        const found=await tx.$queryRaw<{id:number}[]>(Prisma.sql`SELECT id FROM ${Prisma.raw(table)} WHERE id=${value} AND status=1 LIMIT 1`);
        if(!found.length)throw new ProductEditError('INVALID_INPUT');
      }
      // Preserve legacy duplicates if unchanged; changed scanner identifiers must not introduce ambiguity across unit/pack codes.
      if(input.code!==r.code){const same=await tx.$queryRaw<{id:number}[]>`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND id<>${r.id} AND item_code=${input.code} LIMIT 1`;if(same.length)throw new ProductEditError('IDENTIFIER_EXISTS');}
      for(const [field,value,previous] of [['sku',input.sku,r.sku],['barcode',input.barcode,r.barcode],['packBarcode',input.packBarcode,r.packBarcode]]){
        if(!value||value===previous)continue;
        const same=await tx.$queryRaw<{id:number}[]>(field==='sku'?Prisma.sql`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND id<>${r.id} AND sku=${value} LIMIT 1`:Prisma.sql`SELECT id FROM db_items WHERE company_id=${ctx.companyId} AND id<>${r.id} AND (custom_barcode=${value} OR custom_barcode_pack=${value}) LIMIT 1`);
        if(same.length)throw new ProductEditError('IDENTIFIER_EXISTS');
      }
      if(r.barcode!=='SALDOPPOB'&&input.barcode==='SALDOPPOB')throw new ProductEditError('INVALID_INPUT');
      if(r.type==='PPOB'||r.barcode==='SALDOPPOB'){
        if(input.barcode!==r.barcode||input.packBarcode!==r.packBarcode)throw new ProductEditError('INVALID_INPUT');
      }
      const {day,time}=times(now);
      await tx.$executeRaw`UPDATE db_items SET item_code=${input.code},sku=${input.sku},item_name=${input.name},custom_barcode=${input.barcode},custom_barcode_pack=${input.packBarcode},description=${input.description},category_id=${input.categoryId},brand_id=${input.brandId},unit_id=${input.unitId},unit_perpack=${input.packQuantity},sales_price=${input.sellingPrice},purchase_price=${input.purchasePrice},discount=${input.discount},alert_qty=${input.alertQty},status=${input.active?1:0},created_by=${username},created_date=${day},created_time=${time} WHERE id=${r.id} AND company_id=${ctx.companyId}`;
      return{id:r.id};
    });
  }
  async adjust(ctx:ProductActor,input:ProductAdjustmentInput,now:Date):Promise<{id:number;stock:number;delta:number}> {
    return this.transaction(ctx,async tx=>{
      const r=await row(tx,ctx,input.id,true);
      if(await locked(tx,ctx,r))throw new ProductEditError('STOCK_LOCKED');
      if(r.type==='PPOB'||r.barcode==='SALDOPPOB')throw new ProductEditError('INVALID_INPUT');
      if(editable(r).revision!==input.revision)throw new ProductEditError('PRODUCT_CHANGED');
      const delta=input.quantity-r.stock;
      if(!Number.isInteger(delta)||Math.abs(delta)>2147483647||(delta>0&&input.reason!=='Penyesuaian'))throw new ProductEditError('INVALID_INPUT');
      if(!delta)return{id:r.id,stock:r.stock,delta:0};
      const {time}=times(now);
      const expiry=r.expiryDate==='0000-00-00'?null:r.expiryDate;
      await tx.$executeRaw`INSERT INTO db_stockentry (entry_date,item_id,qty,expire_date,company_id,status,note) VALUES (${time},${r.id},${delta},${expiry},${ctx.companyId},1,${input.reason})`;
      const changed=await tx.$executeRaw`UPDATE db_items SET stock=${input.quantity} WHERE id=${r.id} AND company_id=${ctx.companyId} AND stock=${r.stock} AND status_so=0`;
      if(changed!==1)throw new ProductEditError('PRODUCT_CHANGED');
      return{id:r.id,stock:input.quantity,delta};
    });
  }
}
export function productEditRepository(write=false):PrismaProductEditRepository{return new PrismaProductEditRepository(prisma,write?productWritePrisma():undefined);}
