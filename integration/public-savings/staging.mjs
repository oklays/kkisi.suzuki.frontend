/** Disposable loopback-only MariaDB11.4 fixture. Never reads repository .env or production accounts. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run=promisify(execFile);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const local=resolve(root,'.local/public-savings');
const configPath=resolve(local,'config.json');
const adminPath=resolve(local,'admin.json');
const container='kkisi-public-savings-integration';
const database='kkisi_public_savings';
const require=createRequire(resolve(root,'apps/web/package.json'));
const mysql=require('mysql2/promise');
const random=()=>randomBytes(32).toString('hex');
const quote=(value)=>"'"+String(value).replaceAll("'","''")+"'";
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const safeError=(message)=>{throw new Error(message);};
export async function loadConfig(){
 const config=JSON.parse(await readFile(configPath,'utf8'));
 if(config.mode!=='LOCAL_SYNTHETIC'||config.host!=='127.0.0.1'||config.port!==3318||config.database!==database||!/^[a-f0-9]{32}$/.test(config.installationId))safeError('INVALID_LOCAL_STAGING_CONFIG');
 return config;
}
export async function connect(role='app'){
 const config=await loadConfig();
 const credentials=role==='admin'?JSON.parse(await readFile(adminPath,'utf8')):config[role];
 if(!credentials||!['app','legacy','admin'].includes(role))safeError('INVALID_LOCAL_STAGING_ROLE');
 const db=await mysql.createConnection({host:config.host,port:config.port,database:config.database,...credentials,supportBigNumbers:true,bigNumberStrings:true,decimalNumbers:false,dateStrings:true,charset:'UTF8MB4',multipleStatements:false});
 try{const [rows]=await db.execute('SELECT id,mode FROM pss_installation');if(rows.length!==1||rows[0].id!==config.installationId||rows[0].mode!=='LOCAL_SYNTHETIC')safeError('LOCAL_STAGING_SENTINEL_MISMATCH');}catch(error){await db.end();throw error;}
 return db;
}
async function adminSql(sql){
 const {password}=JSON.parse(await readFile(adminPath,'utf8'));
 // SQL is piped; credentials are passed only to the child and are never logged.
 const child=await import('node:child_process').then(({spawn})=>spawn('docker',['exec','-i','-e',`MYSQL_PWD=${password}`,container,'mariadb','-uroot','--default-character-set=utf8mb4'],{stdio:['pipe','pipe','pipe']}));
 let error='';child.stderr.on('data',chunk=>{error+=chunk;});child.stdout.resume();
 child.stdin.end(sql);
 await new Promise((resolve,reject)=>{child.on('error',()=>reject(new Error('LOCAL_DATABASE_COMMAND_FAILED')));child.on('close',code=>code===0?resolve():reject(new Error(`LOCAL_DATABASE_COMMAND_FAILED (${error.match(/ERROR [0-9]+/)?.[0]??'SQL error'})`)));});
}
async function ignoreConfig(){
 const {stdout}=await run('git',['rev-parse','--git-path','info/exclude'],{cwd:root});
 const path=resolve(root,stdout.trim());
 let text='';try{text=await readFile(path,'utf8');}catch{}
 if(!text.includes('.local/public-savings/'))await writeFile(path,text+'\n.local/public-savings/\n');
}
async function applySchema(){
 const config=await loadConfig();
 const schema=await readFile(resolve(root,'integration/public-savings/schema.sql'),'utf8');
 await adminSql(`DROP DATABASE IF EXISTS ${database};CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;USE ${database};\n${schema}\nINSERT INTO pss_installation VALUES(${quote(config.installationId)},'LOCAL_SYNTHETIC');`);
 const tables=['pss_link','pss_challenge','pss_proof','pss_application','pss_outbox','pss_audit','pss_member_control'];
 const grants=[`CREATE USER IF NOT EXISTS ${quote(config.app.user)}@'%' IDENTIFIED BY ${quote(config.app.password)}`,`ALTER USER ${quote(config.app.user)}@'%' IDENTIFIED BY ${quote(config.app.password)}`,`CREATE USER IF NOT EXISTS ${quote(config.legacy.user)}@'%' IDENTIFIED BY ${quote(config.legacy.password)}`,`ALTER USER ${quote(config.legacy.user)}@'%' IDENTIFIED BY ${quote(config.legacy.password)}`,`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${quote(config.app.user)}@'%'`,`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${quote(config.legacy.user)}@'%'`];
 for(const table of ['pss_installation','m_bagian','m_simpanan_mobile','m_anggota','trans_simpanan_pengajuan','m_simpanan_aktif','pss_member_evidence','pss_notification_recipient','pss_calendar',...tables])grants.push(`GRANT SELECT ON ${database}.${table} TO ${quote(config.app.user)}@'%'`);
 for(const table of tables)grants.push(`GRANT INSERT ON ${database}.${table} TO ${quote(config.app.user)}@'%'`);
 for(const table of ['pss_link','pss_challenge','pss_proof','pss_outbox','pss_member_control'])grants.push(`GRANT UPDATE ON ${database}.${table} TO ${quote(config.app.user)}@'%'`);
 grants.push(`GRANT UPDATE(pdf_ref,pdf_digest,proof_status) ON ${database}.pss_application TO ${quote(config.app.user)}@'%'`,`GRANT INSERT ON ${database}.trans_simpanan_pengajuan TO ${quote(config.app.user)}@'%'`);
 for(const table of ['pss_installation','m_bagian','m_simpanan_mobile','m_anggota','trans_simpanan_pengajuan','m_simpanan_aktif','pss_application','pss_audit','pss_member_control'])grants.push(`GRANT SELECT ON ${database}.${table} TO ${quote(config.legacy.user)}@'%'`);
 for(const command of ['pss_legacy_transition','pss_mobile_create','pss_mobile_mutate'])grants.push(`GRANT EXECUTE ON PROCEDURE ${database}.${command} TO ${quote(config.legacy.user)}@'%'`);
 await adminSql(grants.join(';')+';');
 await seed();
}
export async function seed(){
 const db=await connect('admin');
 try{
  const now=Date.now();
  await db.execute("INSERT IGNORE INTO pss_notification_recipient VALUES('SYNTHETIC BRANCH','OPERATIONS','operations@example.invalid',1),('SYNTHETIC BRANCH','SUPERVISOR','operations-backup@example.invalid',1)");
  await db.execute("INSERT IGNORE INTO m_simpanan_mobile(id,jenis_simpanan,jasa,status_pengajuan,status_penarikan) VALUES(1,'SIMPANAN SUKARELA',0,1,1)");
  await db.execute("INSERT IGNORE INTO m_bagian VALUES(1,'SYNTHETIC DEPARTMENT',1,1)");
  for(let id=1;id<=3;id++){
   await db.execute("INSERT IGNORE INTO m_anggota(id,nik_kar,nama_kar,bagian,no_telp,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,?,1,NULL,?,'AKTIVE','AKTIVE',100000,'SYNTH')",[id,`SYN000000${id}`,`SYNTHETIC MEMBER ${id}`,`synthetic${id}@example.invalid`]);
   await db.execute('INSERT IGNORE INTO pss_member_control(member_id,active_reference) VALUES(?,NULL)',[id]);
   await db.execute("INSERT IGNORE INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES(?,'SIMPANAN SUKARELA',?,?,'SYNTH',100000,100000,1,0)",[`SYNTHBASE${id}`,`SYN000000${id}`,`SYNTHETIC MEMBER ${id}`]);
   await db.execute("INSERT IGNORE INTO pss_member_evidence(member_id,contact_version,contact_verified_ms,eligible,payroll_active,branch) VALUES(?,'synthetic-contact-v1',?,1,1,'SYNTHETIC BRANCH')",[id,now-86400000]);
  }
  const today=new Date(now+7*3600000);
  for(let offset=0;offset<=2;offset++){const date=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth()+offset,1));await db.execute("INSERT IGNORE INTO pss_calendar VALUES(?,?,'OPEN',0)",[date.getUTCFullYear(),date.getUTCMonth()+1]);}
 }finally{await db.end();}
}
export async function refreshCommands(){
 const config=await loadConfig();
 const schema=await readFile(resolve(root,'integration/public-savings/schema.sql'),'utf8');
 const commands=['pss_legacy_transition','pss_mobile_create','pss_mobile_mutate'];
 await adminSql(`USE ${database};${commands.map(name=>`DROP PROCEDURE IF EXISTS ${name};`).join('')}\nDELIMITER $$\n${schema.slice(schema.indexOf('CREATE OR REPLACE PROCEDURE'),schema.lastIndexOf('DELIMITER ;'))}\nDELIMITER ;\n${commands.map(name=>`GRANT EXECUTE ON PROCEDURE ${database}.${name} TO ${quote(config.legacy.user)}@'%';`).join('')}`);
}
export async function reset(){
 const config=await loadConfig();
 const db=await connect('admin');
 try{const [rows]=await db.execute('SELECT id,mode FROM pss_installation');if(rows.length!==1||rows[0].id!==config.installationId||rows[0].mode!=='LOCAL_SYNTHETIC')safeError('LOCAL_STAGING_SENTINEL_MISMATCH');}finally{await db.end();}
 await applySchema();
}
export async function setup(){
 await mkdir(local,{recursive:true,mode:0o700});await chmod(local,0o700);await ignoreConfig();
 let config;
 try{config=await loadConfig();}catch(error){if(error.code!=='ENOENT')throw error;config={mode:'LOCAL_SYNTHETIC',host:'127.0.0.1',port:3318,database,installationId:randomBytes(16).toString('hex'),app:{user:'pss_public',password:random()},legacy:{user:'pss_legacy',password:random()},encryptionKeyHex:random(),operatorKey:random(),hashKey:random()};await writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600});await writeFile(adminPath,JSON.stringify({user:'root',password:random()}),{mode:0o600});}
 await chmod(configPath,0o600);await chmod(adminPath,0o600);
 const {password}=JSON.parse(await readFile(adminPath,'utf8'));
 let exists=false;try{await run('docker',['inspect',container]);exists=true;}catch{}
 if(!exists)await run('docker',['run','--name',container,'--label','kkisi.mode=LOCAL_SYNTHETIC','--label',`kkisi.installation=${config.installationId}`,'-e',`MARIADB_ROOT_PASSWORD=${password}`,'-e','MARIADB_ROOT_HOST=%','-p','127.0.0.1:3318:3306','-d','mariadb:11.4'],{maxBuffer:1024*1024,timeout:300000});
 else{
  const {stdout}=await run('docker',['inspect','--format','{{ index .Config.Labels "kkisi.installation" }}',container]);if(stdout.trim()!==config.installationId)safeError('LOCAL_CONTAINER_SENTINEL_MISMATCH');
  await run('docker',['start',container]);
 }
 let ready=false;
 for(let attempt=0;attempt<90;attempt++){try{const c=await mysql.createConnection({host:'127.0.0.1',port:3318,user:'root',password,connectTimeout:1000});await c.end();ready=true;break;}catch{}await sleep(1000);}
 if(!ready)safeError('LOCAL_DATABASE_NOT_READY');
 const probe=await mysql.createConnection({host:'127.0.0.1',port:3318,user:'root',password});
 let existsDatabase=false;try{const [rows]=await probe.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[database]);existsDatabase=rows.length===1;}finally{await probe.end();}
 if(existsDatabase){const verified=await connect('admin');await verified.end();}else await applySchema();
 return{mode:config.mode,host:config.host,port:config.port,database:config.database,installationId:config.installationId};
}
export async function stop(){
 const config=await loadConfig();
 const {stdout}=await run('docker',['inspect','--format','{{ index .Config.Labels "kkisi.installation" }}',container]);
 if(stdout.trim()!==config.installationId)safeError('LOCAL_CONTAINER_SENTINEL_MISMATCH');
 await run('docker',['stop',container]);return {mode:'LOCAL_SYNTHETIC',stopped:true,dataPreserved:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const command=process.argv[2]??'status';if(command==='stop')console.log(JSON.stringify(await stop()));else if(command==='setup')console.log(JSON.stringify(await setup()));else if(command==='reset'){await reset();console.log('LOCAL_SYNTHETIC reset complete');}else if(command==='seed'){await seed();console.log('LOCAL_SYNTHETIC seed complete');}else if(command==='status'){const config=await loadConfig();const db=await connect();try{const [rows]=await db.query('SELECT id,mode FROM pss_installation');console.log(JSON.stringify({mode:config.mode,host:config.host,port:config.port,installed:rows.length===1&&rows[0].id===config.installationId}));}finally{await db.end();}}else safeError('UNKNOWN_STAGING_COMMAND');}
 catch(error){console.error(error.message?.startsWith('LOCAL_')||error.message?.startsWith('INVALID_')?error.message:'LOCAL_STAGING_COMMAND_FAILED');process.exitCode=1;}
}
