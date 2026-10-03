// Seeds ONLY the marked disposable POS/inventory database; never an existing staging copy.
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {assertInventoryTarget,resetInventoryFixture,insertInventoryFixture} from './helpers/inventory-fixture.mjs';
assertInventoryTarget(process.env.POS_TEST_DATABASE_URL);
const db=new PrismaClient({datasources:{db:{url:process.env.POS_TEST_DATABASE_URL}}});
try{
 await resetInventoryFixture(db);
 const hash=bcrypt.hashSync('Synthetic-Pos-1',4).replace(/^\$2b\$/,'$2y$');
 await db.$executeRaw`UPDATE db_users SET password=${hash} WHERE username IN ('synthetic1','synthetic2','syntheticadmin')`;
 for(let id=30;id<60;id++)await insertInventoryFixture(db,'db_items',{id,company_id:1,item_name:`ZZ SYNTHETIC ${id}`,item_code:`ZZ-${id}`,custom_barcode:`ZZ${id}`,sales_price:10000,purchase_price:1000,stock:10,type:'Produk Jadi',status:1,status_so:0});
 console.log('Synthetic browser identities and 31 branch products ready; no source records used.');
}finally{await db.$disconnect();}
