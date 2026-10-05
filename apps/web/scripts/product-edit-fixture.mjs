// Test-owned rows only, in the existing local replica. No table/schema changes.
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PrismaClient} from '@prisma/client';
import {validateProductWriteConfig} from '../src/infrastructure/db/prisma-product-write.ts';
const dir=fileURLToPath(new URL('../',import.meta.url));process.loadEnvFile(`${dir}.env.staging`);process.loadEnvFile(`${dir}.env.local`);validateProductWriteConfig();
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',env:{...process.env,MYSQL_PWD:process.env.MARIADB_ROOT_PASSWORD}});if(r.status!==0)throw new Error('Local fixture operation failed; database error details are not logged');return r.stdout.trim();}
if(docker(['port','kkisi-staging','3306/tcp'])!=='127.0.0.1:3307'||!process.env.MARIADB_ROOT_PASSWORD)throw new Error('Only the local kkisi-staging container is allowed');
const db=new PrismaClient();
const ids=[880501,880502],name='NXT PRODUCT EDIT TEST';
try{
 const fixture=JSON.parse(await readFile(`${dir}.e2e-kasirpos.json`,'utf8'));
 const [user]=await db.$queryRaw`SELECT id,company_id FROM db_users WHERE username=${fixture.username} AND status=1`;
 if(!user)throw new Error('Existing browser fixture user is unavailable');
 const present=await db.$queryRaw`SELECT id,item_code,item_name FROM db_items WHERE id IN (880501,880502)`;
 if(process.argv.includes('--cleanup')){
  if(present.some(p=>!p.item_code.startsWith(`NXT-PROD-${p.id}`)||!p.item_name.startsWith(name)))throw new Error('Refusing to delete a row outside the exact synthetic marker');
  docker(['exec','-i','-e','MYSQL_PWD','kkisi-staging','mariadb','-uroot','kkisi_staging'],`START TRANSACTION; DELETE FROM db_stockentry WHERE item_id IN (880501,880502); DELETE FROM db_items WHERE id IN (880501,880502) AND item_code LIKE 'NXT-PROD-%' AND item_name LIKE '${name}%'; COMMIT;`);
  console.log('Removed only marked synthetic product rows and their ledger entries');
 }else if(process.argv.includes('--seed')){
  if(present.length)throw new Error('Synthetic IDs already exist; inspect and clean up marked test rows before reseeding');
  const [foreign]=await db.$queryRaw`SELECT id FROM db_company WHERE status=1 AND id<>${user.company_id} ORDER BY id LIMIT 1`;
  const [source]=await db.$queryRaw`SELECT id FROM db_items WHERE company_id=${user.company_id} ORDER BY id LIMIT 1`;
  if(!source||!foreign)throw new Error('Fixture requires an existing source product and a foreign company');
  const columns=await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='db_items' ORDER BY ordinal_position`;
  const names=columns.map(c=>c.column_name);if(names.some(n=>!/^[a-z_]+$/.test(n)))throw new Error('Unexpected column name');
  const sql=ids.map((id,index)=>{
   const overrides={id:String(id),company_id:String(index?foreign.id:user.company_id),item_code:`'NXT-PROD-${id}'`,sku:`'NXT-SKU-${id}'`,custom_barcode:`'NXT-BC-${id}'`,custom_barcode_pack:"''",item_name:`'${name} ${index+1}'`,description:"'Synthetic local browser verification'",stock:'10',alert_qty:'3',unit_perpack:'1',sales_price:'4000.10',purchase_price:'3000.00',discount:'0',status:'1',status_so:'0',type:"'Produk Jadi'",created_by:"'product-edit-test'",created_date:'CURRENT_DATE()',created_time:'CURRENT_TIMESTAMP()'};
   return `INSERT INTO db_items (${names.map(n=>'`'+n+'`').join(',')}) SELECT ${names.map(n=>overrides[n]??'`'+n+'`').join(',')} FROM db_items WHERE id=${source.id}; INSERT INTO db_stockentry (entry_date,item_id,qty,company_id,status,note) VALUES (NOW(),${id},10,${index?foreign.id:user.company_id},1,'Stok Awal');`;
  }).join('\n');
  docker(['exec','-i','-e','MYSQL_PWD','kkisi-staging','mariadb','-uroot','kkisi_staging'],`START TRANSACTION;${sql}COMMIT;`);
  await writeFile(`${dir}.e2e-product-edit.json`,JSON.stringify({ids,ctx:{userId:user.id,companyId:user.company_id},foreignCompanyId:foreign.id}),{mode:0o600});await chmod(`${dir}.e2e-product-edit.json`,0o600);
  console.log('Seeded two marked synthetic products only; fixture saved privately');
 }else throw new Error('Specify --seed or --cleanup');
}finally{await db.$disconnect();}
