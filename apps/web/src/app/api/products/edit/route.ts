import {withServices} from '@/infrastructure/auth/route-helpers';
import {handleProductEdit} from '@/infrastructure/products/edit-handler';
export const dynamic='force-dynamic';
export async function GET(request:Request){return withServices(services=>handleProductEdit(services,request));}
export async function POST(request:Request){return withServices(services=>handleProductEdit(services,request));}
