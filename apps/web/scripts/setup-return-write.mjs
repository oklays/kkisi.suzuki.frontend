// Explicit local activation of the sales return writer. No table DDL and no business data mutation.
// Usage: node --experimental-strip-types scripts/setup-return-write.mjs [--apply]
import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateReturnWriteConfig} from '../src/infrastructure/db/prisma-return-write.ts';
const dir=fileURLToPath(new URL('../',import.meta.url));
process.loadEnvFile(`${dir}.env.staging`);process.loadEnvFile(`${dir}.env.local`);
function docker(args,input){const result=spawnSync('docker',args,{input,encoding:'utf8',env:{...process.env,MYSQL_PWD:process.env.MARIADB_ROOT_PASSWORD}});if(result.status!==0)throw new Error('Local Docker operation failed; credentials are not logged');return result.stdout.trim();}
const ports=docker(['port','kkisi-staging','3306/tcp']);
if(ports!=='127.0.0.1:3307')throw new Error('Only kkisi-staging on 127.0.0.1:3307 is authorized');
if(!process.env.MARIADB_ROOT_PASSWORD)throw new Error('Local staging root credential missing');
const read=new URL(process.env.DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(read.hostname)||read.port!=='3307'||read.pathname!=='/kkisi_staging')throw new Error('Reader must target the replicated local staging database');
const user='kkisi_pos_return';
let password;
if(process.env.DATABASE_URL_RETURN_WRITE){const existing=new URL(process.env.DATABASE_URL_RETURN_WRITE);if(existing.username!==user)throw new Error('A different return writer already exists; inspect configuration first');password=decodeURIComponent(existing.password);if(!/^[a-f0-9]{48}$/.test(password))throw new Error('Existing return writer password does not match managed format');}
else password=randomBytes(24).toString('hex');
const target=new URL(read);target.username=user;target.password=password;
const env={...process.env,SALES_RETURN_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL_RETURN_WRITE:target.href};validateReturnWriteConfig(env);
// Exact read/write set of PrismaSalesReturnRepository.persist (see docs/migration/SALES_RETURN_IMPLEMENTATION.md):
// no DELETE anywhere, UPDATE only db_sales.return_bit and db_items.stock, INSERT only into the three return tables.
const grants=[
 ...['db_company','db_users','db_roles','db_permissions','db_kasir','db_buka_kasir','db_salesitems'].map(table=>`GRANT SELECT ON kkisi_staging.${table} TO '${user}'@'%';`),
 `GRANT SELECT, UPDATE (return_bit) ON kkisi_staging.db_sales TO '${user}'@'%';`,
 `GRANT SELECT, UPDATE (stock) ON kkisi_staging.db_items TO '${user}'@'%';`,
 ...['db_salesreturn','db_salesitemsreturn','db_salespaymentsreturn'].map(table=>`GRANT SELECT, INSERT ON kkisi_staging.${table} TO '${user}'@'%';`),
];
if(!process.argv.includes('--apply')){console.log(`Ready: local kkisi-staging only, dedicated return writer ${user}. Grants:\n${grants.join('\n').replaceAll(password,'***')}\nUse --apply to grant access and update ignored .env.local`);process.exit(0);}
docker(['exec','-i','-e','MYSQL_PWD','kkisi-staging','mariadb','-uroot'],`CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${password}';\n${grants.join('\n')}`);
const path=`${dir}.env.local`,original=await readFile(path,'utf8');
let content=original;
for(const [key,value]of Object.entries({SALES_RETURN_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL_RETURN_WRITE:target.href})){
 content=content.split('\n').filter(line=>!line.startsWith(`${key}=`)).join('\n').replace(/\n*$/,'')+`\n${key}=${JSON.stringify(value)}\n`;
}
await writeFile(`${path}.return-backup`,original,{mode:0o600});await chmod(`${path}.return-backup`,0o600);
const temp=`${path}.return-tmp`;await writeFile(temp,content,{mode:0o600});await rename(temp,path);await chmod(path,0o600);
console.log('Activated local sales return writer with table SELECT, return-table INSERT and column-level UPDATE (db_sales.return_bit, db_items.stock) only; no table changes. Config backup retained locally.');
