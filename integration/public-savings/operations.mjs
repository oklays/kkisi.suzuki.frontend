/** Local installation operations only. No production URL, credentials or schema can be selected. */
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadConfig,connect} from './staging.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const day=86400000;
export function retentionCutoffs(now){if(!Number.isSafeInteger(now)||now<0)throw new Error('INVALID_TIME');return {tombstoneBefore:now-90*day,securityLogBefore:now-180*day,deleteFinancialEvidence:false};}
/** Synthetic weekday calendar. Actual operational holiday calendar must be supplied before deployment. */
export function businessDaysElapsed(from,to){let days=0;const start=Math.floor((from+7*3600000)/day),end=Math.floor((to+7*3600000)/day);for(let date=start+1;date<=end;date++){const weekday=new Date(date*day).getUTCDay();if(weekday!==0&&weekday!==6)days++;}return days;}
export async function reconcile(){const db=await connect('admin');try{
 const checks={
  consumedWithoutApplication:"SELECT COUNT(*) count FROM pss_link l LEFT JOIN pss_application a ON a.reference=l.consumed_reference WHERE l.state='CONSUMED' AND a.reference IS NULL",
  missingLegacyHeader:'SELECT COUNT(*) count FROM pss_application a LEFT JOIN trans_simpanan_pengajuan h ON h.doc_no=a.reference WHERE h.id IS NULL',
  invalidReservation:"SELECT COUNT(*) count FROM pss_member_control c LEFT JOIN trans_simpanan_pengajuan h ON h.doc_no=c.active_reference WHERE c.active_reference IS NOT NULL AND (h.id IS NULL OR h.doc_status='REJECTED')",
  incompleteProof:"SELECT COUNT(*) count FROM pss_application WHERE proof_status<>'READY'",
  failedJobs:"SELECT COUNT(*) count FROM pss_outbox WHERE status='FAILED'",
  staleStaffReviews:"SELECT COUNT(*) count FROM pss_application a JOIN trans_simpanan_pengajuan h ON h.doc_no=a.reference WHERE h.doc_status='OPEN' AND a.created_ms<UNIX_TIMESTAMP(UTC_TIMESTAMP()-INTERVAL 30 DAY)*1000",
  deadLetters:"SELECT COUNT(*) count FROM pss_outbox WHERE status='FAILED' AND attempts>=5",
 };
 const counts={};for(const [key,sql]of Object.entries(checks)){const [rows]=await db.query(sql);counts[key]=Number(rows[0].count);}
 return {mode:'LOCAL_SYNTHETIC',counts,financialPostingPerformed:false};
}finally{await db.end();}}
export async function maintenance({apply=false,now=Date.now()}={}){const db=await connect('admin');try{
 const cutoffs=retentionCutoffs(now),queries=[
  ['expiredCodeHashes','UPDATE pss_challenge SET code_hash=NULL WHERE expires_ms<=? AND code_hash IS NOT NULL',[now]],
  ['expiredChallengeTombstones','DELETE FROM pss_challenge WHERE expires_ms<?',[cutoffs.tombstoneBefore]],
  ['expiredProofTombstones','DELETE FROM pss_proof WHERE expires_ms<?',[cutoffs.tombstoneBefore]],
  ['expiredSecurityLogs',"DELETE FROM pss_audit WHERE event IN('LINK_ISSUED','LINK_REVOKED','OTP_REQUESTED','OTP_REJECTED','OTP_VERIFIED') AND created_ms<?",[cutoffs.securityLogBefore]],
 ];
 const counts={};await db.beginTransaction();
 for(const [key,sql,params]of queries){const [result]=await db.execute(sql,params);counts[key]=result.affectedRows;}
 if(apply)await db.commit();else await db.rollback();
 const {readLocalCaptures}=await import('../../apps/web/src/infrastructure/public-savings/providers.ts');
 if(apply)await readLocalCaptures(await loadConfig(),resolve(root,'.local/public-savings/capture'));
 return {mode:'LOCAL_SYNTHETIC',applied:apply,counts,financialEvidenceDeletion:false,legalHoldsPreserved:true};
}catch(error){await db.rollback();throw error;}finally{await db.end();}}
export async function queueEscalations(now=Date.now()){const db=await connect('admin');try{
 const [rows]=await db.query("SELECT a.reference,a.created_ms FROM pss_application a JOIN trans_simpanan_pengajuan h ON h.doc_no=a.reference WHERE h.doc_status='OPEN'");let queued=0;
 for(const row of rows){if(businessDaysElapsed(Number(row.created_ms),now)<2)continue;const [result]=await db.execute("INSERT IGNORE INTO pss_outbox(reference,kind,status,attempts) VALUES(?,'NOTIFY_ESCALATION','PENDING',0)",[row.reference]);queued+=result.affectedRows;}
 return {mode:'LOCAL_SYNTHETIC',queued,calendar:'SYNTHETIC_WEEKDAYS_ONLY'};
}finally{await db.end();}}
export async function dispatch(){const {createPublicSavingsService}=await import('../../apps/web/src/infrastructure/public-savings/service.ts');const service=createPublicSavingsService(await loadConfig(),{directory:resolve(root,'.local/public-savings')});try{await service.processOutbox();return await reconcile();}finally{await service.close();}}
async function retry(reference){if(!/^PSS[0-9a-f]{32}00000$/.test(reference??''))throw new Error('INVALID_REFERENCE');const db=await connect('admin');try{const [result]=await db.execute("UPDATE pss_outbox SET status='PENDING',attempts=0,last_error=NULL,next_attempt_ms=0 WHERE reference=? AND status='FAILED'",[reference]);return {mode:'LOCAL_SYNTHETIC',resetJobs:result.affectedRows,financialWrites:false};}finally{await db.end();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{
 const command=process.argv[2]??'reconcile';let result;
 if(command==='reconcile')result=await reconcile();else if(command==='dispatch')result=await dispatch();else if(command==='maintenance')result=await maintenance({apply:process.argv.includes('--apply')});else if(command==='escalate')result=await queueEscalations();else if(command==='retry')result=await retry(process.argv[3]);else if(command==='capture'){
  const {readLocalCaptures}=await import('../../apps/web/src/infrastructure/public-savings/providers.ts');
  // Deliberately explicit local manual-testing command. No HTTP endpoint exposes codes.
  const captures=await readLocalCaptures(await loadConfig(),resolve(root,'.local/public-savings/capture'));result=captures.filter(x=>x.kind==='OTP').map(x=>({challengeRef:x.id,code:x.code,expiresAt:x.expiresAt}));
 }else throw new Error('UNKNOWN_OPERATION');
 console.log(JSON.stringify(result,null,2));
}catch{console.error('LOCAL_OPERATION_FAILED');process.exitCode=1;}}
