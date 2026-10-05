// Explicit local activation. No table DDL and no product data mutation.
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateProductWriteConfig} from '../src/infrastructure/db/prisma-product-write.ts';
const dir=fileURLToPath(new URL('../',import.meta.url));
process.loadEnvFile(`${dir}.env.staging`);process.loadEnvFile(`${dir}.env.local`);
function docker(args,input){const result=spawnSync('docker',args,{input,encoding:'utf8',env:{...process.env,MYSQL_PWD:process.env.MARIADB_ROOT_PASSWORD}});if(result.status!==0)throw new Error('Local Docker operation failed; credentials are not logged');return result.stdout.trim();}
const ports=docker(['port','kkisi-staging','3306/tcp']);
if(ports!=='127.0.0.1:3307')throw new Error('Only kkisi-staging on 127.0.0.1:3307 is authorized');
if(!process.env.MARIADB_ROOT_PASSWORD)throw new Error('Local staging root credential missing');
const read=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(read.hostname)||read.port!=='3307'||read.pathname!=='/kkisi_staging')throw new Error('Reader must target the replicated local staging database');
const user='kkisi_product_write';
let password;
if(process.env.DATABASE_URL_PRODUCT_WRITE){const existing=new URL(process.env.DATABASE_URL_PRODUCT_WRITE);if(existing.username!==user)throw new Error('A different product writer already exists; inspect configuration first');password=decodeURIComponent(existing.password);if(!/^[a-f0-9]{48}$/.test(password))throw new Error('Existing product password does not match managed format');}
else password=randomBytes(24).toString('hex');
const target=new URL(read);target.username=user;target.password=password;
const env={...process.env,PRODUCTS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL_PRODUCT_WRITE:target.href};validateProductWriteConfig(env);
if(!process.argv.includes('--apply')){console.log('Ready: local kkisi-staging only, dedicated product writer; use --apply to grant access and update ignored .env.local');process.exit(0);}
const columns='item_code,sku,item_name,custom_barcode,custom_barcode_pack,description,category_id,brand_id,unit_id,unit_perpack,sales_price,purchase_price,discount,alert_qty,status,created_by,created_date,created_time,stock';
const sql=`CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${password}';
GRANT SELECT ON kkisi_staging.db_items TO '${user}'@'%';
GRANT UPDATE (${columns}) ON kkisi_staging.db_items TO '${user}'@'%';
GRANT SELECT,INSERT ON kkisi_staging.db_stockentry TO '${user}'@'%';
${['db_company','db_users','db_roles','db_permissions','db_category','db_brands','db_units','db_inventory_so','db_inventory_so_dtl'].map(table=>`GRANT SELECT ON kkisi_staging.${table} TO '${user}'@'%';`).join('\n')}`;
docker(['exec','-i','-e','MYSQL_PWD','kkisi-staging','mariadb','-uroot'],sql);
const path=`${dir}.env.local`,original=await readFile(path,'utf8');
let content=original;
for(const [key,value]of Object.entries({PRODUCTS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL_PRODUCT_WRITE:target.href})){
 content=content.split('\n').filter(line=>!line.startsWith(`${key}=`)).join('\n').replace(/\n*$/,'')+`\n${key}=${JSON.stringify(value)}\n`;
}
await writeFile(`${path}.product-backup`,original,{mode:0o600});await chmod(`${path}.product-backup`,0o600);
const temp=`${path}.product-tmp`;await writeFile(temp,content,{mode:0o600});await rename(temp,path);await chmod(path,0o600);
console.log('Activated local product writer with SELECT, column-level product UPDATE and ledger INSERT only; no product/table changes. Config backup retained locally.');
