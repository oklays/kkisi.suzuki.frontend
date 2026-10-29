/** Local synthetic recovery drill. Credentials travel through stdin, never arguments/output. */
import { spawn } from 'node:child_process';
import { createHash,randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { mkdir,readFile,writeFile,readdir,lstat,chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname,resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import {loadConfig,connect} from './staging.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),local=resolve(root,'.local/public-savings');
const container='kkisi-public-savings-integration',target='kkisi_public_savings_recovery';
const mysql=createRequire(resolve(root,'apps/web/package.json'))('mysql2/promise');
const hash=x=>createHash('sha256').update(x).digest('hex');
export function validateRecoveryTarget(value){if(value!==target)throw Error('RECOVERY_TARGET_REFUSED');return value;}
function docker(args,input=''){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});const out=[];p.stdout.on('data',x=>out.push(x));p.stderr.resume();p.on('error',()=>reject(Error('LOCAL_RECOVERY_DATABASE_COMMAND_FAILED')));p.on('close',code=>code===0?resolve(Buffer.concat(out)):reject(Error('LOCAL_RECOVERY_DATABASE_COMMAND_FAILED')));p.stdin.on('error',()=>{});p.stdin.end(input);});}
async function fingerprint(db){const [tables]=await db.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");const result={};for(const {name}of tables){if(!/^[a-z0-9_]+$/i.test(name))throw Error('LOCAL_RECOVERY_TABLE_REFUSED');const [rows]=await db.query('SELECT * FROM `'+name+'`');const canonical=rows.map(row=>JSON.stringify(row)).sort();result[name]={rows:rows.length,digest:hash(JSON.stringify(canonical))};}return result;}
async function guards(db){const [routines]=await db.query('SELECT ROUTINE_NAME,ROUTINE_TYPE,ROUTINE_DEFINITION FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() ORDER BY ROUTINE_NAME');const [triggers]=await db.query('SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_STATEMENT FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() ORDER BY TRIGGER_NAME');return {routines,triggers};}
async function artifacts(){const path=resolve(local,'artifacts');let names;try{names=await readdir(path);}catch(e){if(e.code==='ENOENT')return [];throw e;}const values=[];for(const name of names.sort()){if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('LOCAL_RECOVERY_ARTIFACT_REFUSED');const file=resolve(path,name),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('LOCAL_RECOVERY_ARTIFACT_REFUSED');values.push({name,bytes:(await readFile(file)).toString('base64')});}return values;}
export async function runRecovery({database=target}={}){
 validateRecoveryTarget(database);const config=await loadConfig(),admin=JSON.parse(await readFile(resolve(local,'admin.json'),'utf8'));
 const verified=await connect('admin');let recovery;const cnf='/tmp/pss-recovery-'+randomBytes(12).toString('hex')+'.cnf';
 const destination=resolve(local,'recovery',new Date().toISOString().replaceAll(':','-')+'-'+randomBytes(4).toString('hex'));
 await mkdir(destination,{recursive:true,mode:0o700});await chmod(destination,0o700);
 try{
  // Existing recovery schemas must carry this installation's sentinel before any restore.
  const [existing]=await verified.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[database]);
  if(existing.length){const [sentinel]=await verified.query('SELECT id,mode FROM `'+database+'`.pss_installation');if(sentinel.length!==1||sentinel[0].id!==config.installationId||sentinel[0].mode!=='LOCAL_SYNTHETIC')throw Error('LOCAL_RECOVERY_SENTINEL_MISMATCH');}
  else{await verified.query('CREATE DATABASE `'+database+'` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');await verified.query('CREATE TABLE `'+database+'`.pss_installation LIKE pss_installation');await verified.query('INSERT INTO `'+database+'`.pss_installation SELECT * FROM pss_installation');}
  await docker(['exec','-i',container,'sh','-c','umask 077; cat > "$1"','sh',cnf],`[client]\nuser=root\npassword=${admin.password}\n`);
  let rows,files,dump,sourceGuards;
  await verified.query('FLUSH TABLES WITH READ LOCK');
  try{rows=await fingerprint(verified);sourceGuards=await guards(verified);files=await artifacts();dump=await docker(['exec',container,'mariadb-dump','--defaults-extra-file='+cnf,'--single-transaction','--skip-lock-tables','--routines','--triggers','--hex-blob',config.database]);}
  finally{await verified.query('UNLOCK TABLES');}
  const keys={encryptionKeyHex:config.encryptionKeyHex,hashKey:config.hashKey},key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const payload=Buffer.from(JSON.stringify({sql:dump.toString('base64'),files,keys,rows,installationId:config.installationId}));
  const encrypted=Buffer.concat([iv,cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
  await writeFile(resolve(destination,'backup.aes256gcm'),encrypted,{mode:0o600});await writeFile(resolve(destination,'backup-key.bin'),key,{mode:0o600});
  // Read both durable files back before attempting recovery; this catches broken custody.
  const saved=await readFile(resolve(destination,'backup.aes256gcm')),savedKey=await readFile(resolve(destination,'backup-key.bin'));
  const decipher=createDecipheriv('aes-256-gcm',savedKey,saved.subarray(0,12));decipher.setAuthTag(saved.subarray(-16));
  const restored=JSON.parse(Buffer.concat([decipher.update(saved.subarray(12,-16)),decipher.final()]).toString());
  if(restored.installationId!==config.installationId)throw Error('LOCAL_RECOVERY_BACKUP_SENTINEL_MISMATCH');
  await docker(['exec','-i',container,'mariadb','--defaults-extra-file='+cnf,'--default-character-set=utf8mb4',database],Buffer.from(restored.sql,'base64'));
  recovery=await mysql.createConnection({host:config.host,port:config.port,database,...admin,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true,charset:'UTF8MB4'});
  const after=await fingerprint(recovery);if(JSON.stringify(rows)!==JSON.stringify(after))throw Error('LOCAL_RECOVERY_ROW_INTEGRITY_MISMATCH');
  const restoredGuards=await guards(recovery);if(JSON.stringify(sourceGuards)!==JSON.stringify(restoredGuards))throw Error('LOCAL_RECOVERY_GUARD_INTEGRITY_MISMATCH');
  const recovered=resolve(destination,'restored-artifacts');await mkdir(recovered,{mode:0o700});
  for(const file of restored.files){const bytes=Buffer.from(file.bytes,'base64');await writeFile(resolve(recovered,file.name),bytes,{mode:0o600});if(hash(await readFile(resolve(recovered,file.name)))!==hash(bytes))throw Error('LOCAL_RECOVERY_ARTIFACT_INTEGRITY_MISMATCH');}
  await writeFile(resolve(destination,'restored-evidence-keys.json'),JSON.stringify(restored.keys),{mode:0o600});
  let readableArtifacts=0,quarantinedArtifacts=0;
  const decodeArtifact=(bytes,storageRef,keyHex)=>{const decoder=createDecipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),bytes.subarray(8,20));decoder.setAAD(Buffer.from('KKISI-PSS-ARTIFACT/v1:'+storageRef));decoder.setAuthTag(bytes.subarray(20,36));return Buffer.concat([decoder.update(bytes.subarray(36)),decoder.final()]);};
  for(const file of restored.files){const bytes=await readFile(resolve(recovered,file.name));let sourcePlain;try{sourcePlain=decodeArtifact(Buffer.from(file.bytes,'base64'),file.name,config.encryptionKeyHex);}catch{quarantinedArtifacts++;continue;}const recoveredPlain=decodeArtifact(bytes,file.name,restored.keys.encryptionKeyHex);if(hash(sourcePlain)!==hash(recoveredPlain))throw Error('LOCAL_RECOVERY_ARTIFACT_KEY_MISMATCH');readableArtifacts++;}
  if(hash(restored.keys.encryptionKeyHex)!==hash(config.encryptionKeyHex))throw Error('LOCAL_RECOVERY_KEY_MISMATCH');
  const result={mode:'LOCAL_SYNTHETIC',sourceDatabase:config.database,recoveryDatabase:database,tableCount:Object.keys(rows).length,totalRows:Object.values(rows).reduce((sum,x)=>sum+x.rows,0),artifactCount:files.length,readableArtifacts,quarantinedArtifacts,routineCount:sourceGuards.routines.length,triggerCount:sourceGuards.triggers.length,guardsVerified:true,rowsVerified:true,artifactsVerified:true,keyRelationshipVerified:true,backupDigest:hash(encrypted),evidenceKeyFingerprint:hash(config.encryptionKeyHex),productionRestorationVerified:false};
  await writeFile(resolve(destination,'manifest.json'),JSON.stringify({...result,format:'AES-256-GCM',backupFile:'backup.aes256gcm',custodyKeyFile:'backup-key.bin',restoredEvidenceKeyFile:'restored-evidence-keys.json',rowIntegrity:rows,artifactIntegrity:files.map(f=>({storageRef:f.name,encryptedDigest:hash(Buffer.from(f.bytes,'base64'))}))},null,2),{mode:0o600});
  return result;
 }finally{await docker(['exec',container,'rm','-f',cnf]).catch(()=>{});await recovery?.end();await verified.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{console.log(JSON.stringify(await runRecovery(),null,2));}catch(e){console.error(e.message?.startsWith('LOCAL_RECOVERY_')||e.message==='RECOVERY_TARGET_REFUSED'?e.message:'LOCAL_RECOVERY_FAILED');process.exitCode=1;}}
