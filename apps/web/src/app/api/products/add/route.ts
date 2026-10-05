import {withServices} from '@/infrastructure/auth/route-helpers';
import {handleProductAdd} from '@/infrastructure/products/add-handler';
export const dynamic='force-dynamic';
export async function GET(request:Request){return withServices(services=>handleProductAdd(services,request));}
export async function POST(request:Request){return withServices(services=>handleProductAdd(services,request));}
