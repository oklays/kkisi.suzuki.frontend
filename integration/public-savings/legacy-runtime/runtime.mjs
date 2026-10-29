import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {connect,loadConfig} from '../staging.mjs';
import {connectActual,loadActualConfig} from '../actual-schema-stage.mjs';
const exec=promisify(execFile);
async function connectAs(config,credentials){const {createRequire}=await import('node:module');const mysql=createRequire(resolve('apps/web/package.json'))('mysql2/promise');const db=await mysql.createConnection({host:config.host,port:config.port,database:config.database,...credentials});await db.query("SET SESSION sql_mode='NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'");return db;}
const directory=resolve('integration/public-savings/legacy-runtime');
const privateRoot=resolve('.local/public-savings/legacy-source');
const expected={
 'ci2/application/modules/mobile/controllers/pengajuan_mobile_c.php':'162ba711bf78aed1228e89ff60318a916f9b5fda4eeb8a2a6fc1cae488564398',
 'ci2/application/modules/mobile/models/pengajuan_mobile_m.php':'b705a0b16dc77062f4388f9de8dfc10aaa7af3a616af80f408413808821cc078',
 'ci2/application/modules/simpanan/models/pengajuan_mobile_m.php':'2417487b3254af0f24075fd575e9180893d6865789e5b28f5063f7d7da5d6b1c',
 'ci2/application/modules/simpanan/controllers/pengajuan_mobile_c.php':'330a5ceeb984510e89eeb8dccec06722df840d980c7155bf4bddc592f08b502e',
 'ci2/application/modules/simpanan/controllers/simpanan_c.php':'d7de26300ec548563a1d8c0e2860a63a17753b90fa4a308fe4d2538111930305',
 'ci2/application/modules/simpanan/views/print_pengajuan_simpanan_pdf.php':'b331cbed97457de0a7ba17b7a6e1a13895705b18f4f167d05117c1d0191d2293'
};
const docker=async args=>(await exec('docker',args,{maxBuffer:4*1024*1024,timeout:120000})).stdout;
export async function prepareRuntime(){
 if(process.env.PSS_LEGACY_RUNTIME!=='1')throw new Error('LOCAL_RUNTIME_DISABLED');
 const actual=process.env.PSS_LEGACY_ACTUAL_SCHEMA==='1';
 const config=await (actual?loadActualConfig():loadConfig());const admin=await (actual?connectActual('admin'):connect('admin'));
 const container=actual?'kkisi-public-savings-actual-schema':'kkisi-public-savings-integration';
 const inventory=JSON.parse(await readFile(resolve(privateRoot,'manifest.json'),'utf8'));
 for(const [path,hash] of Object.entries(expected)){
  if(inventory.find(x=>x.path===path)?.sha256!==hash||createHash('sha256').update(await readFile(resolve(privateRoot,path))).digest('hex')!==hash)throw new Error('SOURCE_HASH_MISMATCH');
 }
 const suffix=randomBytes(6).toString('hex'),database=`pss_runtime_${suffix}`,user=`pssr_${suffix}`,password=randomBytes(24).toString('hex');
 // Mirrors the deployed legacy grant (broad DML on the application schema), not the restricted staging principal.
 const broadUser=`pssb_${suffix}`,broadPassword=randomBytes(24).toString('hex');
 const network=`pss-runtime-${suffix}`,privateDirectory=resolve('.local/public-savings',`runtime-${suffix}`);
 const schema=JSON.parse(await readFile('.local/public-savings/cp2/actual-schema.json','utf8'));
 let attached=false,created=false;
 async function close(){
  if(attached)await docker(['network','disconnect',network,container]).catch(()=>{});
  await docker(['network','rm',network]).catch(()=>{});
  await admin.query(`DROP DATABASE IF EXISTS ${database}`);await admin.query(`DROP USER IF EXISTS '${user}'@'%'`);await admin.query(`DROP USER IF EXISTS '${broadUser}'@'%'`);await admin.end();await rm(privateDirectory,{recursive:true,force:true});
 }
 try{
  await admin.query(`CREATE DATABASE ${database} CHARACTER SET latin1`);created=true;
  for(const table of ['m_anggota','m_simpanan_aktif','trans_simpanan_pengajuan','trans_simpanan_dtl']){
   if(!schema.tables[table])throw new Error(`ACTUAL_SCHEMA_REQUIRED:${table}`);
   const entry=schema.tables[table];if(createHash('sha256').update(entry.ddl).digest('hex')!==entry.sha256)throw new Error('SCHEMA_HASH_MISMATCH');
   await admin.query(`USE ${database}`);await admin.query(entry.ddl);
  }
  await admin.query(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE,TRIGGER ON ${database}.* TO '${user}'@'%'`);
  await admin.query(`CREATE USER '${broadUser}'@'%' IDENTIFIED BY '${broadPassword}'`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE,DELETE,EXECUTE ON ${config.database}.* TO '${broadUser}'@'%'`);
  await docker(['network','create','--internal','--label','kkisi.pss=isolated-characterization',network]);
  const networkState=JSON.parse(await docker(['network','inspect',network]))[0];if(!networkState.Internal)throw new Error('EXTERNAL_NETWORK_FORBIDDEN');
  await docker(['network','connect','--alias','synthetic-db',network,container]);attached=true;
  await mkdir(privateDirectory,{mode:0o700});
  await writeFile(resolve(privateDirectory,'runtime.json'),JSON.stringify({baseline:{host:'synthetic-db',database,user,password},sqlMode:schema.runtime.sql_mode,guarded:{host:'synthetic-db',database:config.database,...config.legacy},installed:{host:'synthetic-db',database:config.database,user:broadUser,password:broadPassword}}),{mode:0o600});
  return {
   async run(value){
    let trigger;
    if(value.scenario.startsWith('installed-')){
     await admin.query(`USE ${config.database}`);
     const memberId=1_000_000_000+Number.parseInt(randomBytes(3).toString('hex'),16),nik=`B${String(memberId).slice(-9)}`,pub=value.scenario.includes('-public-')||value.scenario.includes('-hook-');
     const reference=pub?`PSS${randomBytes(16).toString('hex')}00000`:`SIMMOB${Date.now()}${randomBytes(2).toString('hex')}`;
     await admin.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,'SYNTH PHP MEMBER','1','php@example.invalid','AKTIVE','AKTIVE',100000,'SYNTH')",[memberId,nik]);
     await admin.execute('INSERT INTO pss_member_control VALUES(?,NULL)',[memberId]);
     if(!value.scenario.endsWith('-new'))await admin.execute("INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES('SYNTH-OLD','SIMPANAN SUKARELA',?,'SYNTH PHP MEMBER','SYNTH',100000,100000,1,0)",[nik]);
     if(pub){
      await admin.execute('UPDATE pss_member_control SET active_reference=? WHERE member_id=?',[reference,memberId]);
      await admin.execute('INSERT INTO pss_application(reference,member_id,link_id,idempotency_key,request_hash,payload_hash,snapshot_cipher,snapshot_hash,created_ms,verified_ms) VALUES(?,?,?,?,?,?,?,?,?,?)',[reference,memberId,randomBytes(16).toString('hex'),randomBytes(16).toString('hex'),'a'.repeat(64),'b'.repeat(64),'synthetic-php-cipher','c'.repeat(64),Date.now(),Date.now()-1000]);
      await admin.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,cd_usr,status_notif,is_mobile,ttd) VALUES(?,CURRENT_DATE(),'OPEN','SIMPANAN SUKARELA',?,'SYNTH PHP MEMBER','SYNTH DEPARTMENT',100000,150000,'11','2026','public-savings',0,0,'pss-signature-synthetic')",[reference,nik]);
      if(value.scenario.includes('-hook-'))await admin.execute("UPDATE pss_application SET pdf_ref=?,pdf_digest=?,proof_status='READY' WHERE reference=?",[`pss-pdf-${randomBytes(16).toString('hex')}`,'d'.repeat(64),reference]);
     }else{
      // Laravel pengajuan_simpanan_mobile column set, written by an unenrolled legacy writer (no command guard).
      const legacy=await connectAs(config,{user:broadUser,password:broadPassword});
      try{await legacy.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,remarks,created_at,cd_usr,status_notif,ttd,is_mobile) VALUES(?,CURRENT_DATE(),'OPEN','SIMPANAN SUKARELA',?,'SYNTH PHP MEMBER','SYNTH DEPARTMENT',100000,150000,'11','2026','SYNTH',NOW(),?,0,'synthetic-ttd.png',1)",[reference,nik,nik]);}finally{await legacy.end();}
     }
     value={...value,reference,nik,memberId};
    }
    if(value.scenario.startsWith('guarded-')){
     await admin.query(`USE ${config.database}`);
     const memberId=1_000_000_000+Number.parseInt(randomBytes(3).toString('hex'),16),nik=`R${String(memberId).slice(-9)}`,reference=`PSS${randomBytes(16).toString('hex')}00000`;
     await admin.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,'SYNTH PHP MEMBER','1','php@example.invalid','AKTIVE','AKTIVE',100000,'SYNTH')",[memberId,nik]);
     await admin.execute('INSERT INTO pss_member_control VALUES(?,?)',[memberId,reference]);
     await admin.execute('INSERT INTO pss_application(reference,member_id,link_id,idempotency_key,request_hash,payload_hash,snapshot_cipher,snapshot_hash,created_ms,verified_ms) VALUES(?,?,?,?,?,?,?,?,?,?)',[reference,memberId,randomBytes(16).toString('hex'),randomBytes(16).toString('hex'),'a'.repeat(64),'b'.repeat(64),'synthetic-php-cipher','c'.repeat(64),Date.now(),Date.now()-1000]);
     await admin.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,cd_usr,status_notif,is_mobile,ttd) VALUES(?,CURRENT_DATE(),'OPEN','SIMPANAN SUKARELA',?,'SYNTH PHP MEMBER','SYNTH DEPARTMENT',100000,150000,'11','2026','public-savings',0,0,'pss-signature-synthetic')",[reference,nik]);
     if(value.scenario!=='guarded-proof-missing')await admin.execute("UPDATE pss_application SET pdf_ref=?,pdf_digest=?,proof_status='READY' WHERE reference=?",[`pss-pdf-${randomBytes(16).toString('hex')}`,'d'.repeat(64),reference]);
     if(value.scenario==='guarded-late-failure'){
      trigger=`pss_php_fail_${randomBytes(5).toString('hex')}`;
      await admin.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON trans_simpanan_pengajuan FOR EACH ROW BEGIN IF OLD.doc_no='${reference}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_PHP_LATE_FAILURE'; END IF; END`);
     }
     value={...value,reference,nik};
    }
    try{
    const stdout=await docker(['run','--rm','--platform','linux/amd64','--network',network,'--cap-drop','ALL','--security-opt','no-new-privileges','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--mount',`type=bind,src=${directory},dst=/harness,readonly`,'--mount',`type=bind,src=${privateRoot},dst=/source,readonly`,'--mount',`type=bind,src=${privateDirectory},dst=/private,readonly`,'kkisi-pss-php56-characterization',JSON.stringify(value)]);
    let result;try{result=JSON.parse(stdout);}catch{throw new Error('PHP_RUNTIME_RESULT_INVALID');}
    if(value.memberId){const [rows]=await admin.execute('SELECT active_reference FROM pss_member_control WHERE member_id=?',[value.memberId]);result.reservation=rows[0]?.active_reference??null;}
    return result;
    }finally{if(trigger)await admin.query(`DROP TRIGGER IF EXISTS ${trigger}`);}
   },close
  };
 }catch(error){if(created)await close();else await admin.end();throw error;}
}
