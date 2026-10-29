/** Read-only default. Apply/retry/recovery exercises only an allowlisted disposable sibling schema. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {connect,loadConfig} from './staging.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const scratch='kkisi_public_savings_migration_check';
const digest=value=>createHash('sha256').update(value).digest('hex');
const required={
 m_simpanan_mobile:{id:['int'],jenis_simpanan:50,status_pengajuan:['int'],status_penarikan:['int']},
 m_bagian:{id:['int','bigint'],name_bagian:255,status:['int']},
 m_anggota:{id:['int','bigint'],nik_kar:50,nama_kar:50,bagian:100,kd_group:100,sim_sukarela:['double','decimal']},
 trans_simpanan_pengajuan:{id:['int','bigint'],doc_no:50,doc_date:['date'],doc_status:50,jenis_simpanan:50,nik_kar:50,nama:50,phone:50,bank:50,norek:50,bagian:100,lokasi:100,potongan_old:['double','decimal'],potongan:['double','decimal'],awal_potong_bulan:50,awal_potong_tahun:50,remarks:50,posting_date:['datetime'],created_at:['datetime'],cd_usr:50,updated_at:['datetime'],ud_usr:50,status_notif:['int'],ttd:100,is_mobile:['int']},
 m_simpanan_aktif:{id:['int','bigint'],doc_no:50,jenis_simpanan:255,nik_kar:10,nama_kar:255,kd_group:50,potongan_old:['double','decimal'],potongan_payroll:['double','decimal'],status:['int'],cd:['datetime'],ud:['datetime'],usr_cd:255,usr_ud:255,periode_start:['date'],periode_end:['date'],is_mobile:['int']},
};
export function sqlStatements(source){
 let delimiter=';',buffer='';const result=[];
 for(const line of source.split('\n')){
  if(/^\s*--/.test(line)||!line.trim())continue;
  const change=line.match(/^DELIMITER\s+(\S+)\s*$/i);
  if(change){if(buffer.trim())throw new Error('MIGRATION_PARSE_BOUNDARY');delimiter=change[1];continue;}
  buffer+=line+'\n';
  if(buffer.trimEnd().endsWith(delimiter)){result.push(buffer.trimEnd().slice(0,-delimiter.length).trim());buffer='';}
 }
 if(buffer.trim())throw new Error('MIGRATION_PARSE_UNTERMINATED');return result;
}
export async function inspectLegacy(db){
 const [tables]=await db.query('SELECT TABLE_NAME,ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME');
 const [columns]=await db.query('SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,CHARACTER_MAXIMUM_LENGTH,CHARACTER_SET_NAME,NUMERIC_PRECISION,NUMERIC_SCALE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
 const [indexes]=await db.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
 const problems=[];
 for(const [table,fields]of Object.entries(required)){
  const actual=tables.find(row=>row.TABLE_NAME===table);
  if(!actual||actual.ENGINE!=='InnoDB')problems.push(`${table}:ENGINE`);
  for(const [field,rule]of Object.entries(fields)){
   const c=columns.find(row=>row.TABLE_NAME===table&&row.COLUMN_NAME===field);
   if(!c){problems.push(`${table}.${field}:MISSING`);continue;}
   if(typeof rule==='number'){
    if(c.DATA_TYPE!=='varchar'||Number(c.CHARACTER_MAXIMUM_LENGTH)!==rule||c.CHARACTER_SET_NAME!=='latin1')problems.push(`${table}.${field}:TEXT_SIGNATURE`);
   }else if(!rule.includes(c.DATA_TYPE))problems.push(`${table}.${field}:TYPE`);
   if(['potongan_old','potongan','potongan_payroll','sim_sukarela'].includes(field)&&(Number(c.NUMERIC_PRECISION)!==18||Number(c.NUMERIC_SCALE)!==2))problems.push(`${table}.${field}:PRECISION`);
  }
  if(!indexes.some(row=>row.TABLE_NAME===table&&row.INDEX_NAME==='PRIMARY'&&row.COLUMN_NAME==='id'))problems.push(`${table}:PRIMARY_KEY`);
 }
 for(const [table,field]of [['trans_simpanan_pengajuan','status_notif'],['m_simpanan_aktif','potongan_old'],['m_simpanan_aktif','is_mobile']])if(columns.find(row=>row.TABLE_NAME===table&&row.COLUMN_NAME===field)?.IS_NULLABLE!=='NO')problems.push(`${table}.${field}:NOT_NULL`);
 // Counts only: no member rows, identifiers, contacts or monetary values leave this inspection.
 if(problems.length===0){
  const checks=[['m_anggota','nik_kar'],['trans_simpanan_pengajuan','doc_no']];
  for(const [table,key]of checks){const [rows]=await db.query(`SELECT COUNT(*) n FROM (SELECT ${key} FROM ${table} WHERE ${key} IS NOT NULL GROUP BY BINARY ${key} HAVING COUNT(*)>1) duplicate_keys`);if(Number(rows[0].n)>0)problems.push(`${table}:DUPLICATE_BUSINESS_KEY`);}
  const [rows]=await db.query('SELECT COUNT(*) n FROM (SELECT nik_kar,jenis_simpanan FROM m_simpanan_aktif GROUP BY BINARY nik_kar,BINARY jenis_simpanan HAVING COUNT(*)>1) duplicate_master');if(Number(rows[0].n)>0)problems.push('m_simpanan_aktif:DUPLICATE_MASTER');
 }
 const names=Object.keys(required),metadata={tables:tables.filter(row=>names.includes(row.TABLE_NAME)),columns:columns.filter(row=>names.includes(row.TABLE_NAME)),indexes:indexes.filter(row=>names.includes(row.TABLE_NAME))};
 return{ok:problems.length===0,mode:'LOCAL_SYNTHETIC',legacySignature:digest(JSON.stringify(metadata)),problems,indexes:metadata.indexes};
}
export async function preflight(){const db=await connect('admin');try{return await inspectLegacy(db);}finally{await db.end();}}

/** Only scratch fixture is mutable: no application or actual legacy schema can be passed to this function. */
export async function validateMigration(){
 const config=await loadConfig(),db=await connect('admin');
 const source=await readFile(resolve(root,'integration/public-savings/migrations/001_public_savings.sql'),'utf8');
 const statements=sqlStatements(source),checksum=digest(source);
 if(statements.some(sql=>/^(?:CREATE|DROP|ALTER|TRUNCATE)\s+(?:TABLE\s+)?(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:m_|trans_)/i.test(sql)))throw new Error('MIGRATION_TOUCHES_LEGACY_TABLES');
 try{
  const [existing]=await db.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[scratch]);
  if(existing.length){await db.query(`USE ${scratch}`);const [sentinel]=await db.query('SELECT id,mode FROM pss_installation');if(sentinel.length!==1||sentinel[0].id!==config.installationId||sentinel[0].mode!=='LOCAL_SYNTHETIC')throw new Error('MIGRATION_SCRATCH_SENTINEL_MISMATCH');await db.query(`USE ${config.database}`);await db.query(`DROP DATABASE ${scratch}`);}
  await db.query(`CREATE DATABASE ${scratch} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);await db.query(`USE ${scratch}`);
  const representative=await readFile(resolve(root,'integration/public-savings/schema.sql'),'utf8');
  for(const statement of sqlStatements(representative).filter(sql=>/^CREATE TABLE (m_|trans_)/.test(sql)))await db.query(statement);
  const before=await inspectLegacy(db);if(!before.ok)throw new Error('MIGRATION_PREFLIGHT_FAILED');
  // Simulate interrupted DDL by applying only the first half. Recover by rerunning exact version.
  for(const statement of statements.slice(0,Math.floor(statements.length/2)))await db.query(statement);
  for(const statement of statements)await db.query(statement);
  await db.execute("INSERT INTO pss_installation VALUES(?,'LOCAL_SYNTHETIC') ON DUPLICATE KEY UPDATE mode=VALUES(mode)",[config.installationId]);
  await db.execute("INSERT INTO pss_schema_migration VALUES('001_public_savings',?,UTC_TIMESTAMP())",[checksum]);
  const [signature]=await db.query("SELECT checksum FROM pss_schema_migration WHERE version='001_public_savings'");if(signature[0].checksum!==checksum)throw new Error('MIGRATION_CHECKSUM_MISMATCH');
  for(const statement of statements)await db.query(statement);
  const after=await inspectLegacy(db);if(!after.ok||after.legacySignature!==before.legacySignature)throw new Error('MIGRATION_LEGACY_SIGNATURE_CHANGED');
  const [routines]=await db.query("SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() AND ROUTINE_NAME IN ('pss_legacy_transition','pss_mobile_create','pss_mobile_mutate')");if(routines.length!==3)throw new Error('MIGRATION_COMMAND_MISSING');
  return{ok:true,mode:'LOCAL_SYNTHETIC',target:scratch,checksum,legacySignature:after.legacySignature,interruptedRecovery:true,rerun:true,legacyTablesUnchanged:true,commands:3};
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const result=process.argv[2]==='validate-migration'?await validateMigration():await preflight();console.log(JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;}catch(error){console.error(/^(?:MIGRATION_|LOCAL_)/.test(error.message)?error.message:'LOCAL_PREFLIGHT_FAILED');process.exitCode=1;}}
