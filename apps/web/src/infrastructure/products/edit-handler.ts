import { EditProducts, type ProductEditRepository } from '@koperasi/application/inventory';
import { ProductEditError, parseProductEdit, parseProductAdjustment, type ProductEditErrorCode } from '@koperasi/domain/inventory';
import {guard,json,readJson,type AuthServices} from '../auth/http.ts';
import {productEditRepository} from '../repositories/prisma-product-edit.repository.ts';
const statuses:Record<ProductEditErrorCode,number>={INVALID_INPUT:400,NOT_FOUND:404,FORBIDDEN:403,STOCK_LOCKED:409,PRODUCT_CHANGED:409,IDENTIFIER_EXISTS:409,WRITE_NOT_CONFIGURED:503};
export async function handleProductEdit(services:AuthServices,request:Request,factory:(write:boolean)=>ProductEditRepository=productEditRepository):Promise<Response>{
 const g=request.method==='GET'?await guard(services,request,{permission:'items_edit'}):await guard(services,request,{permission:'items_edit',csrf:true});if(!g.ok)return g.response;
 try{
  if(request.method==='GET')return json(200,{snapshot:await new EditProducts(factory(false)).snapshot(g.ctx,Number(new URL(request.url).searchParams.get('id')))});
  const raw=await readJson(request,20000);if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ProductEditError('INVALID_INPUT');
  const {action,...body}=raw as Record<string,unknown>;
  const input=action==='save'?parseProductEdit(body):action==='adjust'?parseProductAdjustment(body):null;
  if(!input)throw new ProductEditError('INVALID_INPUT');
  const usecase=new EditProducts(factory(true));
  const actor={actorId:g.ctx.userId,companyId:g.ctx.companyId,itemId:input.id};
  let result:{id:number};
  if(action==='save'){result=await usecase.save(g.ctx,input,services.deps.clock.now());services.deps.log('product_save',actor);}
  else{const adjustment=await usecase.adjust(g.ctx,input,services.deps.clock.now());result=adjustment;services.deps.log('product_adjust',{...actor,stock:adjustment.stock,delta:adjustment.delta});}
  return json(200,result);
 }catch(error){
  if(error instanceof ProductEditError)return json(statuses[error.code],{error:error.code});
  const e=error as {code?:string;meta?:{code?:string}};
  const invalid=e.code==='P2010'&&['1366','1406'].includes(String(e.meta?.code));
  services.deps.log('product_edit_failed',{code:invalid?'INVALID_INPUT':'PRODUCTS_UNAVAILABLE'});
  return json(invalid?400:503,{error:invalid?'INVALID_INPUT':'PRODUCTS_UNAVAILABLE'});
 }
}
