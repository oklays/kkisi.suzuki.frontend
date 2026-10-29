import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { connect,loadConfig } from '../staging.mjs';

const enabled=process.env.PSS_INTEGRATION==='1';
let sequence=10000+(process.pid%10000)*100;
const hex=()=>randomBytes(16).toString('hex');
async function member(){const id=++sequence;const nik=`T${String(id).padStart(9,'0')}`;const db=await connect('admin');try{await db.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,'SYNTH CONTROL MEMBER',1,'control@example.invalid','AKTIVE','AKTIVE',100000,'SYNTH')",[id,nik]);await db.execute('INSERT INTO pss_member_control VALUES(?,NULL)',[id]);}finally{await db.end();}return{id,nik};}
async function publicRequest(m,{ready=false}={}){const app=await connect();const reference=`PSS${hex()}00000`;try{await app.beginTransaction();await app.execute("SELECT member_id FROM pss_member_control WHERE member_id=? FOR UPDATE",[m.id]);await app.execute("INSERT INTO pss_application(reference,member_id,link_id,idempotency_key,request_hash,payload_hash,snapshot_cipher,snapshot_hash,created_ms,verified_ms) VALUES(?,?,?,?,?,?,?, ?,?,?)",[reference,m.id,hex(),hex(),'a'.repeat(64),'b'.repeat(64),'synthetic-cipher','c'.repeat(64),Date.now(),Date.now()-1000]);await app.execute('UPDATE pss_member_control SET active_reference=? WHERE member_id=? AND active_reference IS NULL',[reference,m.id]);await app.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,cd_usr,status_notif,is_mobile,ttd) VALUES(?,CURRENT_DATE(),'OPEN','SIMPANAN SUKARELA',?,'SYNTH CONTROL MEMBER','SYNTHETIC DEPARTMENT',100000,150000,'11','2026','public-savings',0,0,'pss-signature-synthetic')",[reference,m.nik]);await app.commit();if(ready)await app.execute("UPDATE pss_application SET pdf_ref=?,pdf_digest=?,proof_status='READY' WHERE reference=?",[`pss-pdf-${hex()}`,'d'.repeat(64),reference]);}catch(error){await app.rollback();throw error;}finally{await app.end();}return reference;}
async function facts(m,reference){const db=await connect('admin');try{const [h]=await db.execute('SELECT doc_status,potongan,cd_usr,ud_usr FROM trans_simpanan_pengajuan WHERE doc_no=?',[reference]);const [a]=await db.execute('SELECT doc_no,potongan_payroll,status FROM m_simpanan_aktif WHERE nik_kar=?',[m.nik]);const [p]=await db.execute('SELECT sim_sukarela FROM m_anggota WHERE id=?',[m.id]);const [r]=await db.execute('SELECT active_reference FROM pss_member_control WHERE member_id=?',[m.id]);return{header:h,active:a,member:p,reservation:r};}finally{await db.end();}}
const integration=(name,fn)=>test(name,{skip:!enabled},fn);

test('fixture config is explicitly synthetic and loopback',async()=>{if(!enabled)return;const c=await loadConfig();assert.equal(c.mode,'LOCAL_SYNTHETIC');assert.equal(c.host,'127.0.0.1');assert.equal(c.port,3318);});

integration('public and legacy accounts cannot bypass writer ownership through direct SQL or session variables',async()=>{const m=await member();const ref=await publicRequest(m);const before=await facts(m,ref);for(const role of ['app','legacy']){const db=await connect(role);try{await db.query("SET @pss_origin='LEGACY',@pss_authorized=1");for(const [sql,args] of [['UPDATE m_anggota SET sim_sukarela=900000 WHERE id=?',[m.id]],['UPDATE m_simpanan_aktif SET potongan_payroll=900000 WHERE nik_kar=?',[m.nik]],["UPDATE trans_simpanan_pengajuan SET doc_status='APPROVED' WHERE doc_no=?",[ref]],['INSERT INTO pss_command_guard VALUES(CONNECTION_ID(),?,?)',[ref,'APPROVE']]])await assert.rejects(db.execute(sql,args));}finally{await db.end();}}assert.deepEqual(await facts(m,ref),before);});

integration('PUBLIC approval requires READY exact proof before the first effect; maker cannot approve',async()=>{const m=await member();const ref=await publicRequest(m);const before=await facts(m,ref);const db=await connect('legacy');try{await assert.rejects(db.execute('CALL pss_legacy_transition(?,?,?)',[ref,'APPROVE','legacy-checker']),/PROOF_NOT_READY/);await assert.rejects(db.execute('CALL pss_legacy_transition(?,?,?)',[ref,'APPROVE','public-savings']),/MAKER_CHECKER_REQUIRED/);}finally{await db.end();}assert.deepEqual(await facts(m,ref),before);});

integration('ready CI2 fixture approval atomically updates configuration and retains B05 reservation',async()=>{const m=await member();const ref=await publicRequest(m,{ready:true});const db=await connect('legacy');try{await db.execute('CALL pss_legacy_transition(?,?,?)',[ref,'APPROVE','legacy-checker']);const result=await facts(m,ref);assert.equal(result.header[0].doc_status,'APPROVED');assert.equal(Number(result.member[0].sim_sukarela),150000);assert.equal(Number(result.active[0].potongan_payroll),150000);assert.equal(result.active[0].doc_no,ref);assert.equal(result.reservation[0].active_reference,ref);await assert.rejects(db.execute('CALL pss_legacy_transition(?,?,?)',[ref,'APPROVE','legacy-checker']),/INVALID_TRANSITION/);await assert.rejects(db.execute('CALL pss_mobile_create(?,?,?,?,?,?)',[m.id,`SIMMOB261029${String(++sequence).padStart(6,'0')}`,200000,12,2026,'mobile-maker']),/PENDING_CONFLICT/);}finally{await db.end();}});

integration('a failure at the final header update rolls back both earlier configuration effects',async()=>{const m=await member();const ref=await publicRequest(m,{ready:true});const before=await facts(m,ref);const admin=await connect('admin');const db=await connect('legacy');const trigger=`pss_fail_${hex()}`;try{await admin.query(`CREATE TRIGGER ${trigger} BEFORE UPDATE ON trans_simpanan_pengajuan FOR EACH ROW BEGIN IF OLD.doc_no='${ref}' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_HEADER_FAILURE'; END IF; END`);await assert.rejects(db.execute('CALL pss_legacy_transition(?,?,?)',[ref,'APPROVE','legacy-checker']),/SYNTHETIC_LATE_HEADER_FAILURE/);assert.deepEqual(await facts(m,ref),before);}finally{await admin.query(`DROP TRIGGER IF EXISTS ${trigger}`);await admin.end();await db.end();}});

integration('snapshot tampering, profile replacement and mobile mutations cannot rewrite a PUBLIC request',async()=>{const m=await member();const ref=await publicRequest(m,{ready:true});const before=await facts(m,ref);const admin=await connect('admin');const legacy=await connect('legacy');const app=await connect();try{await assert.rejects(admin.execute("UPDATE pss_application SET snapshot_cipher='tampered' WHERE reference=?",[ref]),/IMMUTABLE_SUBMISSION/);await assert.rejects(admin.execute("UPDATE trans_simpanan_pengajuan SET potongan=900000 WHERE doc_no=?",[ref]),/CONTROLLED_LEGACY_COMMAND_REQUIRED/);await assert.rejects(app.execute("UPDATE pss_application SET pdf_ref='replacement' WHERE reference=?",[ref]),/IMMUTABLE_READY_PROOF/);for(const action of ['EDIT','CANCEL'])await assert.rejects(legacy.execute('CALL pss_mobile_mutate(?,?,?,?)',[ref,action,200000,'public-savings']),/PUBLIC_MUTATION_FORBIDDEN/);assert.deepEqual(await facts(m,ref),before);}finally{await admin.end();await legacy.end();await app.end();}});

integration('rejection changes only header, releases reservation and permits a later source-equivalent mobile request',async()=>{const m=await member();const ref=await publicRequest(m,{ready:true});const db=await connect('legacy');try{await db.execute('CALL pss_legacy_transition(?,?,?)',[ref,'REJECT','legacy-checker']);const result=await facts(m,ref);assert.equal(result.header[0].doc_status,'REJECTED');assert.equal(Number(result.member[0].sim_sukarela),100000);assert.equal(result.active.length,0);assert.equal(result.reservation[0].active_reference,null);const mobile=`SIMMOB261029${String(++sequence).padStart(6,'0')}`;await db.execute('CALL pss_mobile_create(?,?,?,?,?,?)',[m.id,mobile,200000,11,2026,'mobile-maker']);await db.execute('CALL pss_mobile_mutate(?,?,?,?)',[mobile,'EDIT',250000,'mobile-maker']);assert.equal(Number((await facts(m,mobile)).header[0].potongan),250000);await db.execute('CALL pss_mobile_mutate(?,?,?,?)',[mobile,'CANCEL',0,'mobile-maker']);assert.equal((await facts(m,mobile)).reservation[0].active_reference,null);}finally{await db.end();}});

integration('two independent mobile connections serialize one active request for the same canonical member',async()=>{const m=await member();const a=await connect('legacy'),b=await connect('legacy');try{const refs=[`SIMMOB261029${String(++sequence).padStart(6,'0')}`,`SIMMOB261029${String(++sequence).padStart(6,'0')}`];const result=await Promise.allSettled([a.execute('CALL pss_mobile_create(?,?,?,?,?,?)',[m.id,refs[0],200000,11,2026,'mobile-one']),b.execute('CALL pss_mobile_create(?,?,?,?,?,?)',[m.id,refs[1],300000,12,2026,'mobile-two'])]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.filter(x=>x.status==='rejected'&&/PENDING_CONFLICT/.test(x.reason.message)).length,1);}finally{await a.end();await b.end();}});

integration('null actions and amounts are rejected without converting a request to REJECTED or storing NULL money',async()=>{const m=await member();const ref=await publicRequest(m,{ready:true});const before=await facts(m,ref);const db=await connect('legacy');try{await assert.rejects(db.execute('CALL pss_legacy_transition(?,?,?)',[ref,null,'legacy-checker']),/INVALID_COMMAND/);assert.deepEqual(await facts(m,ref),before);const other=await member();await assert.rejects(db.execute('CALL pss_mobile_create(?,?,?,?,?,?)',[other.id,`SIMMOB261029${String(++sequence).padStart(6,'0')}`,null,11,2026,'mobile-maker']),/INVALID_COMMAND/);}finally{await db.end();}});
integration('the enrolled mobile command also refuses numeric-prefix department coercion',async()=>{
 const m=await member(),admin=await connect('admin'),legacy=await connect('legacy');
 try{await admin.execute("UPDATE m_anggota SET bagian='1junk' WHERE id=?",[m.id]);await assert.rejects(legacy.execute('CALL pss_mobile_create(?,?,?,?,?,?)',[m.id,`SIMMOB261029${String(++sequence).padStart(6,'0')}`,200000,11,2026,'mobile-maker']),/MEMBER_INELIGIBLE/);}
 finally{await admin.end();await legacy.end();}
});

integration('PUBLIC intake holding the member lock prevents a simultaneous MOBILE create before either header exists',async()=>{
 const m=await member(),app=await connect(),legacy=await connect('legacy'),admin=await connect('admin');
 const ref=`PSS${hex()}00000`;let mobile;
 try{
  await app.beginTransaction();
  await app.execute('SELECT member_id FROM pss_member_control WHERE member_id=? FOR UPDATE',[m.id]);
  mobile=legacy.query('CALL pss_mobile_create(?,?,?,?,?,?)',[m.id,`SIMMOB261029${String(++sequence).padStart(6,'0')}`,200000,12,2026,'mobile-racer']).then(()=>({ok:true}),error=>({ok:false,error}));
  // Let MariaDB publish the new transaction before taking its first cached INNODB_TRX snapshot.
  await new Promise(resolve=>setTimeout(resolve,100));
  let waiting=false;
  for(let attempt=0;attempt<100;attempt++){
   const [rows]=await admin.query('SELECT trx_mysql_thread_id,trx_state FROM information_schema.INNODB_TRX');
   if(rows.some(row=>String(row.trx_mysql_thread_id)===String(legacy.threadId)&&row.trx_state==='LOCK WAIT')){waiting=true;break;}
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(waiting,true,'mobile connection must be observed waiting on the member row');
  await app.execute('INSERT INTO pss_application(reference,member_id,link_id,idempotency_key,request_hash,payload_hash,snapshot_cipher,snapshot_hash,created_ms,verified_ms) VALUES(?,?,?,?,?,?,?,?,?,?)',[ref,m.id,hex(),hex(),'a'.repeat(64),'b'.repeat(64),'synthetic-cipher','c'.repeat(64),Date.now(),Date.now()-1000]);
  await app.execute('UPDATE pss_member_control SET active_reference=? WHERE member_id=?',[ref,m.id]);
  await app.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_status,jenis_simpanan,nik_kar,nama,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,cd_usr,status_notif,is_mobile) VALUES(?,'OPEN','SIMPANAN SUKARELA',?,'SYNTH CONTROL MEMBER',100000,150000,'11','2026','public-savings',0,0)",[ref,m.nik]);
  await app.commit();const result=await mobile;assert.equal(result.ok,false);assert.match(result.error.message,/PENDING_CONFLICT/);
  assert.equal((await facts(m,ref)).reservation[0].active_reference,ref);
 }finally{await app.rollback();if(mobile)await mobile;await app.end();await legacy.end();await admin.end();}
});

// The deployed legacy account holds broad DML, so these run as admin: only the triggers stand between it and the data.
const legacyHeader=(db,ref,nik,type='SIMPANAN SUKARELA')=>db.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,remarks,created_at,cd_usr,status_notif,ttd,is_mobile) VALUES(?,CURRENT_DATE(),'OPEN',?,?,'SYNTH CONTROL MEMBER','SYNTH',100000,150000,'11','2026','SYNTH',NOW(),?,0,'synthetic-ttd.png',1)",[ref,type,nik,nik]);
const mobileRef=()=>`SIMMOB261029${String(++sequence).padStart(6,'0')}`;
integration('unmodified Laravel-style insert for an enrolled member shares the B-05 reservation with PUBLIC intake and plain rejection releases it',async()=>{
 const m=await member(),admin=await connect('admin'),ref=mobileRef();
 try{
  await legacyHeader(admin,ref,m.nik);assert.equal((await facts(m,ref)).reservation[0].active_reference,ref);
  await assert.rejects(legacyHeader(admin,mobileRef(),m.nik),/PENDING_CONFLICT/);
  await assert.rejects(publicRequest(m),/PENDING_CONFLICT|PUBLIC_INSERT_BOUNDARY/);
  await admin.execute("UPDATE trans_simpanan_pengajuan SET potongan=200000 WHERE doc_no=?",[ref]);
  await assert.rejects(admin.execute("UPDATE trans_simpanan_pengajuan SET nik_kar='OTHER' WHERE doc_no=?",[ref]),/RESERVED_REQUEST_IDENTITY_IMMUTABLE/);
  await admin.execute("UPDATE trans_simpanan_pengajuan SET doc_status='REJECTED' WHERE doc_no=?",[ref]);assert.equal((await facts(m,ref)).reservation[0].active_reference,null);
  const [events]=await admin.execute("SELECT event FROM pss_audit WHERE member_id=? AND reference=? ORDER BY id",[m.id,ref]);assert.deepEqual(events.map(e=>e.event),['LEGACY_RESERVED','LEGACY_RELEASED']);
  assert.match(await publicRequest(m),/^PSS/);
 }finally{await admin.end();}
});
integration('other savings types, unenrolled members and ordinary deletes keep existing legacy behaviour',async()=>{
 const m=await member(),admin=await connect('admin');const id=++sequence,nik=`U${String(id).padStart(9,'0')}`;
 try{
  await admin.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,'SYNTH UNENROLLED',1,'u@example.invalid','AKTIVE','AKTIVE',0,'SYNTH')",[id,nik]);
  for(const ref of [mobileRef(),mobileRef()])await legacyHeader(admin,ref,nik);
  const wajib=mobileRef();await legacyHeader(admin,wajib,m.nik,'SIMPANAN WAJIB');assert.equal((await facts(m,wajib)).reservation[0].active_reference,null);
  await admin.execute("UPDATE trans_simpanan_pengajuan SET doc_status='APPROVED' WHERE doc_no=?",[wajib]);
  const reserved=mobileRef();await legacyHeader(admin,reserved,m.nik);await admin.execute('DELETE FROM trans_simpanan_pengajuan WHERE doc_no=?',[reserved]);assert.equal((await facts(m,reserved)).reservation[0].active_reference,null);
 }finally{await admin.end();}
});
integration('duplicate header references are refused because the deployed table has no UNIQUE(doc_no)',async()=>{
 const m=await member(),admin=await connect('admin'),ref=mobileRef();
 try{await legacyHeader(admin,ref,m.nik);await assert.rejects(legacyHeader(admin,ref,m.nik,'SIMPANAN WAJIB'),/DUPLICATE_HEADER_REFERENCE/);
  const pub=await publicRequest(await member(),{ready:true});await assert.rejects(admin.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_status,jenis_simpanan,nik_kar,status_notif,is_mobile) VALUES(?,'OPEN','SIMPANAN SUKARELA','X',0,0)",[pub]),/DUPLICATE_HEADER_REFERENCE/);
  await assert.rejects(admin.execute("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_status,jenis_simpanan,nik_kar,status_notif,is_mobile) VALUES(?,'OPEN','SIMPANAN SUKARELA',?,0,1)",[`PSS${hex()}00000`,m.nik]),/PUBLIC_INSERT_BOUNDARY/);}
 finally{await admin.end();}
});
integration('a broad principal cannot bind configuration to an unprocessed PUBLIC request or delete it; edits after controlled approval stay possible',async()=>{
 const m=await member(),ref=await publicRequest(m,{ready:true}),admin=await connect('admin'),legacy=await connect('legacy');
 try{
  const before=await facts(m,ref);
  await assert.rejects(admin.execute("INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES(?,'SIMPANAN SUKARELA',?,'X','SYNTH',100000,150000,1,0)",[ref,m.nik]),/CONTROLLED_LEGACY_COMMAND_REQUIRED/);
  await assert.rejects(admin.execute('DELETE FROM trans_simpanan_pengajuan WHERE doc_no=?',[ref]),/NO_HEADER_DELETE/);
  assert.deepEqual(await facts(m,ref),before);
  await legacy.execute('CALL pss_legacy_transition(?,?,?)',[ref,'APPROVE','legacy-checker']);
  await admin.execute("UPDATE m_simpanan_aktif SET potongan_payroll=175000 WHERE nik_kar=?",[m.nik]);assert.equal(Number((await facts(m,ref)).active[0].potongan_payroll),175000);
  const [audit]=await admin.execute("SELECT actor_ref FROM pss_audit WHERE reference=? AND event='LEGACY_APPROVE'",[ref]);assert.equal(audit[0].actor_ref,'legacy-checker');
 }finally{await admin.end();await legacy.end();}
});
