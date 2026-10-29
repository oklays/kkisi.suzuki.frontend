import {createHash,randomBytes,randomInt} from 'node:crypto';
import path from 'node:path';
import mysql, {type PoolConnection,type RowDataPacket} from 'mysql2/promise';
import {PSS_POLICY_V1,PSS_POLICY_V1_VERSION} from '@koperasi/domain/kosipa/savings-policy';
import {evaluateMembershipEligibility,type MemberEligibilityFacts} from '@koperasi/domain/kosipa/savings-eligibility';
import {evaluateOtpAttempt,evaluateOtpResend,evaluateVerificationProof,PUBLIC_SAVINGS_LINK_PURPOSE} from '@koperasi/domain/kosipa/savings-link';
import {resolveRequestedPeriod,type PayrollCalendarFacts} from '@koperasi/domain/kosipa/savings-period';
import type {SubmissionSnapshot} from '@koperasi/domain/kosipa/savings-snapshot';
import {submitPublicSavingsChange} from '@koperasi/application/kosipa/public-savings-submit';
import type {LockedSubmissionFacts,SubmissionTransaction} from '@koperasi/application/kosipa/public-savings';
import {createPublicSavingsArtifactStore} from './artifacts.ts';
import {legacyPublicReference,mapLegacySubmission,mapLegacyRequestState,type LegacyMemberSnapshot} from './legacy-mapping.ts';
import {keyedDigest,secretMatches,sealEvidence,openEvidence,validateStagingConfig,localDirectory,type StagingConfig} from './security.ts';
import {createLocalCaptureProvider,type PublicSavingsDeliveryProvider} from './providers.ts';

export const CONSENT_VERSION='KKISI-PSS-CONSENT-v1';
export const FORM_VERSION='KKISI-PSS-FORM-v1';
export const CONSENT_TEXT='Saya mengajukan perubahan potongan Simpanan Sukarela sesuai nominal dan periode yang saya tinjau. Saya menyetujui penyimpanan bukti persetujuan dan tanda tangan untuk pengajuan ini. Perubahan berlaku pada siklus payroll pertama yang memenuhi syarat setelah persetujuan koperasi, tanpa berlaku surut. Pengajuan ini belum merupakan persetujuan atau bukti pemotongan payroll.';
export class PublicSavingsServiceError extends Error {readonly code:string;constructor(code:string){super(code);this.name='PublicSavingsServiceError';this.code=code;}}
function deny(code:string):never {throw new PublicSavingsServiceError(code);}
const id=()=>randomBytes(16).toString('hex');
const opaque=()=>randomBytes(32).toString('base64url');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const text=(value:unknown,max=128):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const mask=(nik:string)=>'••••'+nik.slice(-4);
const jakarta=(n:number)=>new Date(n+7*3600000).toISOString().slice(0,19).replace('T',' ');
type Row=RowDataPacket & Record<string,unknown>;
interface Review {member:LegacyMemberSnapshot;original:string|null;period:{year:number;month:number};formVersion:string;consentVersion:string;contactVersion:string;policyVersion:string;savingsReference:string;}
interface Envelope {contractVersion:'pss-evidence/v1';snapshot:SubmissionSnapshot;member:{name:string;maskedIdentifier:string;departmentName:string};consentText:string;verifiedAtEpochMs:number;templateVersion:string;rendererVersion:string;requestHash:string;review:Review;contactDestination:string}
export interface SubmissionInput {amountRupiah:string;sectionId:string;startMonth:string;startYear:string;consentVersion:string;formVersion:string;reviewFingerprint:string;consent:boolean;signature:Uint8Array;idempotencyKey:string}
/** Server-derived console actor; absent only for the sentinel-verified LOCAL_SYNTHETIC staging key. */
export interface OperatorScope {actorRef:string;branch:string;action?:string}
export interface ServiceOptions {clock?:()=>number;provider?:PublicSavingsDeliveryProvider;directory?:string;intakeEnabled?:()=>boolean}

/** Application-owned persistence adapter, explicitly restricted to the sentinel-verified synthetic local environment. */
export function createPublicSavingsService(rawConfig:StagingConfig,options:ServiceOptions={}) {
 const config=validateStagingConfig(rawConfig),now=options.clock??Date.now;
 const directory=options.directory??localDirectory();
 const pool=mysql.createPool({host:config.host,port:config.port,database:config.database,...config.app,connectionLimit:2,queueLimit:32,connectTimeout:3000,supportBigNumbers:true,bigNumberStrings:true,decimalNumbers:false,multipleStatements:false,timezone:'Z'});
 const artifacts=createPublicSavingsArtifactStore({directory:path.join(directory,'artifacts'),encryptionKeyHex:config.encryptionKeyHex});
 const provider=options.provider??createLocalCaptureProvider(config,path.join(directory,'capture'));
 const digest=(purpose:string,value:string)=>keyedDigest(config.hashKey,purpose,value);
 const boundContact=(m:Row)=>digest('contact',JSON.stringify([String(m.id),m.nik_kar,m.contact_version,m.email,m.no_telp]));
 let checked:Promise<void>|undefined;
 async function ready(){
  checked??=(async()=>{const [rows]=await pool.query<Row[]>('SELECT id,mode FROM pss_installation');if(rows.length!==1||rows[0].id!==config.installationId||rows[0].mode!=='LOCAL_SYNTHETIC')deny('ACTIVATION_BLOCKED');})();
  return checked;
 }
 async function transaction<T>(work:(c:PoolConnection)=>Promise<T>):Promise<T>{
  await ready();const c=await pool.getConnection();
  let committing=false;
  try {await c.query('SET SESSION innodb_lock_wait_timeout=5');await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await c.beginTransaction();const value=await work(c);committing=true;await c.commit();return value;}
  catch(e){await c.rollback().catch(()=>{});if(committing)throw Object.assign(new Error('COMMIT_OUTCOME_UNKNOWN'),{commitOutcome:'UNKNOWN'});throw e;}finally{c.release();}
 }
 async function audit(c:PoolConnection,memberId:string,event:string,reference:string|null=null,operator?:OperatorScope,reason:string|null=null){await c.execute('INSERT INTO pss_audit(member_id,event,reference,created_ms,actor_ref,reason) VALUES(?,?,?,?,?,?)',[memberId,event,reference,now(),operator?.actorRef??null,reason]);}
 // Branch comes from the persisted member evidence, never from the request.
 function inScope(operator:OperatorScope|undefined,branch:unknown){if(operator&&String(branch)!==operator.branch)deny('FORBIDDEN');}
 const branchFilter=(operator:OperatorScope|undefined,memberColumn:string)=>operator?{sql:` AND EXISTS(SELECT 1 FROM pss_member_evidence e WHERE e.member_id=${memberColumn} AND BINARY e.branch=BINARY ?)`,params:[operator.branch]}:{sql:'',params:[] as string[]};
 async function member(c:PoolConnection,memberRef:string,lock=false){
  if(!/^[1-9][0-9]{0,15}$/.test(memberRef))deny('MEMBER_UNAVAILABLE');
  // One member lock serializes ALL enrolled writer commands. Calendar locks have a consistent later order.
  if(lock){const [controls]=await c.execute<Row[]>('SELECT member_id FROM pss_member_control WHERE member_id=? FOR UPDATE',[memberRef]);if(controls.length!==1)deny('MEMBER_UNAVAILABLE');}
  const [rows]=await c.execute<Row[]>(`SELECT m.id,m.nik_kar,m.nama_kar,m.bagian,m.no_telp,m.email,m.kd_group,m.status_anggota,m.status_karyawan,m.tgl_keluar,
   CAST(CAST(m.sim_sukarela AS DECIMAL(18,2)) AS CHAR) original,b.name_bagian,b.id section_id,b.status section_status,e.contact_version,e.contact_verified_ms,e.eligible,e.payroll_active,e.branch
   ,e.deduction_evidence FROM m_anggota m JOIN m_bagian b ON (BINARY CAST(b.id AS CHAR)=BINARY m.bagian OR BINARY b.name_bagian=BINARY m.bagian) JOIN pss_member_evidence e ON e.member_id=m.id WHERE m.id=?${lock?' FOR UPDATE':''}`,[memberRef]);
  if(rows.length!==1)deny('MEMBER_UNAVAILABLE');return rows[0];
 }
 function mappedMember(m:Row):LegacyMemberSnapshot{return {id:String(m.id),nik:String(m.nik_kar),name:String(m.nama_kar),sectionId:String(m.section_id),sectionName:String(m.name_bagian),branch:String(m.branch),phone:m.no_telp===null?null:String(m.no_telp),groupCode:String(m.kd_group)};}
 async function eligibility(c:PoolConnection,m:Row):Promise<MemberEligibilityFacts>{
  const [identities]=await c.execute<Row[]>('SELECT id FROM m_anggota WHERE nik_kar=?',[m.nik_kar]);
  const [active]=await c.execute<Row[]>('SELECT doc_no FROM trans_simpanan_pengajuan WHERE nik_kar=? AND jenis_simpanan=? AND doc_status NOT IN (\'REJECTED\',\'CANCELLED\')',[m.nik_kar,'SIMPANAN SUKARELA']);
  return {membershipStatus:String(m.status_anggota),identity:identities.length===1?'UNIQUE':'AMBIGUOUS',identifierMappingConflict:String(m.nik_kar).length>10,
   payrollRoster:Number(m.payroll_active)===1&&m.tgl_keluar===null?'ACTIVE':'INACTIVE',groupCode:String(m.kd_group),activePayrollEligibleGroups:Number(m.eligible)===1?[String(m.kd_group)]:[],
   branch:Number(m.section_status)===1&&text(m.branch)?'VALID':'INVALID',conflictingActiveSubmission:active.length>0,
   contact:{status:text(m.contact_version)&&text(m.email)?'VERIFIED':'MISSING',verifiedAtEpochMs:Number(m.contact_verified_ms),provenanceRef:'staging-member-evidence:'+String(m.id),changedSinceVerification:false}};
 }
 async function ensureEligible(c:PoolConnection,m:Row){const result=evaluateMembershipEligibility(await eligibility(c,m),PSS_POLICY_V1,now());if(!result.ok)deny(result.error.code);}
 async function originalDeduction(c:PoolConnection,m:Row,lock=false):Promise<string|null>{
  const [masters]=await c.execute<Row[]>('SELECT CAST(CAST(potongan_payroll AS DECIMAL(18,2)) AS CHAR) amount,status FROM m_simpanan_aktif WHERE BINARY nik_kar=BINARY ? AND jenis_simpanan=?'+(lock?' FOR UPDATE':''),[m.nik_kar,'SIMPANAN SUKARELA']);
  if(m.deduction_evidence==='VERIFIED_NONE'&&masters.length===0&&(m.original===null||/^0(?:\.0+)?$/.test(String(m.original))))return null;
  if(m.deduction_evidence!=='CONFIG_VERIFIED'||masters.length!==1||Number(masters[0].status)!==1||m.original===null||masters[0].amount===null||String(masters[0].amount)!==String(m.original))deny('ASSISTED_REQUIRED');
  const amount=String(masters[0].amount);if(!/^(0|[1-9][0-9]*)(?:\.0+)?$/.test(amount))deny('ASSISTED_REQUIRED');
  return amount.split('.')[0];
 }
 async function calendar(c:PoolConnection,lock=false):Promise<PayrollCalendarFacts>{const [rows]=await c.query<Row[]>('SELECT year,month,status,locked FROM pss_calendar ORDER BY year,month'+(lock?' FOR UPDATE':''));return {source:'AUTHORITATIVE_KOSIPA_CI2_PAYROLL_CALENDAR',verified:true,periods:rows.map(r=>({year:Number(r.year),month:Number(r.month),state:Number(r.locked)===1?'LOCKED':String(r.status) as 'OPEN'|'CLOSED'|'LOCKED'|'POSTING'}))};}
 async function review(c:PoolConnection,m:Row,lock=false):Promise<Review>{
  const [types]=await c.execute<Row[]>('SELECT id,status_pengajuan FROM m_simpanan_mobile WHERE BINARY jenis_simpanan=BINARY ?'+(lock?' FOR UPDATE':''),['SIMPANAN SUKARELA']);
  if(types.length!==1||Number(types[0].status_pengajuan)!==1)deny('FORM_REFERENCE_UNVERIFIED');
  const current=new Date(now()+7*3600000);const result=resolveRequestedPeriod(await calendar(c),{year:current.getUTCFullYear(),month:current.getUTCMonth()+1},PSS_POLICY_V1,now());if(!result.ok)return deny(result.error.code);
  return {member:mappedMember(m),original:await originalDeduction(c,m),period:result.value.requestedPeriod,formVersion:FORM_VERSION,consentVersion:CONSENT_VERSION,contactVersion:boundContact(m),policyVersion:PSS_POLICY_V1_VERSION,savingsReference:String(types[0].id)};
 }
 async function link(c:PoolConnection,token:string,lock=false){
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))deny('LINK_INVALID');
  const [rows]=await c.execute<Row[]>('SELECT * FROM pss_link WHERE token_hash=?'+(lock?' FOR UPDATE':''),[digest('token',token)]);
  if(rows.length!==1)deny('LINK_INVALID');return rows[0];
 }
 function usable(l:Row,m:Row,receipt=false){
  if(l.state==='REVOKED'||l.revoked_ms!==null&&l.revoked_ms!==undefined)deny('LINK_REVOKED');
  if(Number(l.expires_ms)<=now())deny('LINK_EXPIRED');
  if(l.contact_version!==boundContact(m))deny('VERIFICATION_REQUIRED');
  if(l.state!=='ACTIVE'&&!(receipt&&l.state==='CONSUMED'))deny('LINK_CONSUMED');
 }
 async function proof(c:PoolConnection,l:Row,m:Row,value?:string){
  if(!value||!/^[A-Za-z0-9_-]{43}$/.test(value))return deny('VERIFICATION_REQUIRED');
  const [rows]=await c.execute<Row[]>('SELECT * FROM pss_proof WHERE link_id=? AND proof_hash=?',[l.id,digest('proof',value)]);
  if(rows.length!==1)return deny('VERIFICATION_REQUIRED');const p=rows[0];
  const checked=evaluateVerificationProof({memberRef:String(m.id),linkRef:String(l.id),contactVersion:p.contact_version,verifiedAtEpochMs:Number(p.created_ms)}, {memberRef:String(m.id),linkRef:String(l.id),contactVersion:boundContact(m),linkExpiresAtEpochMs:Number(l.expires_ms)},now(),PSS_POLICY_V1);
  if(!checked.ok)deny(checked.error.code);return p;
 }
 async function issueLink(memberRef:string,operator?:OperatorScope){if(options.intakeEnabled?.()===false)deny('ACTIVATION_BLOCKED');return transaction(async c=>{const m=await member(c,memberRef,true);inScope(operator,m.branch);await ensureEligible(c,m);const token=opaque(),linkRef=id(),created=now(),expires=created+48*3600000;
  await c.execute("UPDATE pss_link SET state='REVOKED',revoked_ms=? WHERE member_id=? AND state='ACTIVE'",[created,memberRef]);
  await c.execute('INSERT INTO pss_link(id,member_id,token_hash,contact_version,expires_ms,state,created_ms) VALUES(?,?,?,?,?,\'ACTIVE\',?)',[linkRef,memberRef,digest('token',token),boundContact(m),expires,created]);await audit(c,memberRef,'LINK_ISSUED',linkRef,operator);
  return {linkRef,url:'/simpanan-sukarela#token='+token,expiresAt:expires};});}
 async function validate(token:string,proofValue?:string){return transaction(async c=>{const l=await link(c,token),m=await member(c,String(l.member_id));
  if(l.state==='REVOKED')return {state:'REVOKED'};
  if(Number(l.expires_ms)<=now())return {state:'EXPIRED'};
  if(l.contact_version!==boundContact(m))deny('VERIFICATION_REQUIRED');
  if(l.state==='CONSUMED')return {state:'CONSUMED',canVerifyReceipt:true};
  if(!proofValue)return {state:'VERIFICATION_REQUIRED'};
  await proof(c,l,m,proofValue);await ensureEligible(c,m);const r=await review(c,m),cipher=sealEvidence(r,config.encryptionKeyHex,'review:'+String(l.id));
  await c.execute('UPDATE pss_link SET review_cipher=?,review_hash=? WHERE id=?',[cipher,hash(JSON.stringify(r)),l.id]);
  return {state:'READY',form:{memberName:r.member.name,maskedIdentifier:mask(r.member.nik),sectionId:r.member.sectionId,sectionName:r.member.sectionName,savingsType:'SIMPANAN SUKARELA',originalDeduction:r.original,requestedPeriod:r.period,consentVersion:CONSENT_VERSION,consentText:CONSENT_TEXT,formVersion:FORM_VERSION,reviewFingerprint:hash(JSON.stringify(r)),policy:PSS_POLICY_V1.rules.monetary}};
 });}
 async function requestChallenge(token:string){
  const result=await transaction(async c=>{const initial=await link(c,token),m=await member(c,String(initial.member_id),true),l=await link(c,token,true);usable(l,m,true);
   if(l.state!=='CONSUMED')await ensureEligible(c,m);
   if(Number(l.failed_attempts)>=5)deny('CHALLENGE_LOCKED');
   const [history]=await c.execute<Row[]>('SELECT c.created_ms,c.link_id FROM pss_challenge c JOIN pss_link l ON l.id=c.link_id WHERE l.member_id=? AND c.created_ms>?',[m.id,now()-3600000]);
   const resend=evaluateOtpResend({linkSendTimesEpochMs:history.filter(r=>r.link_id===l.id).map(r=>Number(r.created_ms)),memberSendTimesEpochMs:history.map(r=>Number(r.created_ms))},now(),PSS_POLICY_V1);if(!resend.ok)deny(resend.error.code);
   await c.execute('UPDATE pss_challenge SET used=2,code_hash=NULL WHERE link_id=? AND used=0',[l.id]);
   const challengeRef=id(),code=randomInt(0,1000000).toString().padStart(6,'0'),created=now();
   await c.execute('INSERT INTO pss_challenge(id,link_id,code_hash,created_ms,expires_ms,used) VALUES(?,?,?,?,?,0)',[challengeRef,l.id,digest('otp:'+challengeRef,code),created,created+300000]);await audit(c,String(m.id),'OTP_REQUESTED',challengeRef);
   return {challengeRef,code,destination:String(m.email),expiresAt:created+300000};
  });
  try{await provider.deliver({id:result.challengeRef,kind:'OTP',destination:result.destination,code:result.code,expiresAt:result.expiresAt});}catch{deny('DELIVERY_UNAVAILABLE');}
  return {challengeRef:result.challengeRef,retryAfterSeconds:60};
 }
 async function verifyChallenge(token:string,challengeRef:string,code:string){
  if(!/^[0-9a-f]{32}$/.test(challengeRef)||!/^\d{6}$/.test(code))deny('INVALID_INPUT');
  const result=await transaction(async c=>{const initial=await link(c,token),m=await member(c,String(initial.member_id),true),l=await link(c,token,true);usable(l,m,true);
   const [rows]=await c.execute<Row[]>('SELECT * FROM pss_challenge WHERE id=? AND link_id=? FOR UPDATE',[challengeRef,l.id]);if(rows.length!==1)deny('CHALLENGE_INVALID');const ch=rows[0];
   const allowed=evaluateOtpAttempt({issuedAtEpochMs:Number(ch.created_ms),failedAttempts:Number(l.failed_attempts),usedAtEpochMs:Number(ch.used)===1?Number(ch.created_ms):null,superseded:Number(ch.used)===2},now(),PSS_POLICY_V1);if(!allowed.ok)deny(allowed.error.code);
   if(!secretMatches(String(ch.code_hash),digest('otp:'+challengeRef,code))){await c.execute('UPDATE pss_link SET failed_attempts=failed_attempts+1 WHERE id=?',[l.id]);await audit(c,String(m.id),'OTP_REJECTED',challengeRef);return {error:'OTP_INVALID'} as const;}
   await c.execute('UPDATE pss_challenge SET used=1,code_hash=NULL WHERE id=?',[challengeRef]);
   const rawProof=opaque(),created=now();await c.execute('INSERT INTO pss_proof(id,link_id,proof_hash,contact_version,created_ms,expires_ms) VALUES(?,?,?,?,?,?)',[id(),l.id,digest('proof',rawProof),boundContact(m),created,Math.min(created+900000,Number(l.expires_ms))]);await audit(c,String(m.id),'OTP_VERIFIED',challengeRef);return {proof:rawProof};
  });
  if(result.error!==undefined)deny(result.error);return {proof:result.proof};
 }
 async function readEnvelope(row:Row):Promise<Envelope>{const envelope=openEvidence<Envelope>(String(row.snapshot_cipher),config.encryptionKeyHex,String(row.reference));if(!secretMatches(hash(JSON.stringify(envelope)),String(row.snapshot_hash)))deny('SNAPSHOT_INTEGRITY_INVALID');return envelope;}
 async function submit(token:string,proofValue:string,input:SubmissionInput){
  if(options.intakeEnabled?.()===false)deny('ACTIVATION_BLOCKED');
  if(!input||!text(input.idempotencyKey,128)||!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)||!text(input.amountRupiah,20)||!/^\d+$/.test(input.startMonth)||!/^\d{4}$/.test(input.startYear)||input.consent!==true)deny('INVALID_INPUT');
  const rawSignatureHash=hash(input.signature),requestHash=hash(JSON.stringify({amount:input.amountRupiah,section:input.sectionId,month:input.startMonth,year:input.startYear,consent:input.consentVersion,form:input.formVersion,review:input.reviewFingerprint,signature:rawSignatureHash}));
  let l:Row,m:Row,p:Row,r:Review;
  await transaction(async c=>{l=await link(c,token);m=await member(c,String(l.member_id));usable(l,m,true);p=await proof(c,l,m,proofValue);
   if(!l.review_cipher||!secretMatches(input.reviewFingerprint??'',String(l.review_hash)))return deny('FORM_CHANGED');r=openEvidence<Review>(String(l.review_cipher),config.encryptionKeyHex,'review:'+String(l.id));
   if(hash(JSON.stringify(r))!==l.review_hash)deny('SNAPSHOT_INTEGRITY_INVALID');
  });
  // The snapshot reviewed by the member is retained; no reconstruction from the public payload.
  const reviewed=r!,initialLink=l!,initialMember=m!,verified=p!;
  if(input.sectionId!==reviewed.member.sectionId||input.formVersion!==reviewed.formVersion||input.consentVersion!==reviewed.consentVersion||Number(input.startMonth)!==reviewed.period.month||Number(input.startYear)!==reviewed.period.year)deny('FORM_CHANGED');
  let signature:SubmissionSnapshot['signature'];
  try{signature=await artifacts.stageSignature(input.signature);}catch{deny('SIGNATURE_INVALID');}
  const snapshotInput={memberRef:String(initialMember.id),sectionId:input.sectionId,savingsType:'SIMPANAN SUKARELA',originalDeduction:reviewed.original,requestedAmount:input.amountRupiah,requestedPeriod:reviewed.period,effectivePeriodCondition:'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL',consentTextVersion:CONSENT_VERSION,formVersion:FORM_VERSION,consent:true,submittedAtEpochMs:now(),verification:{proofRef:String(verified.id),contactVersion:String(verified.contact_version),method:'EMAIL_CHANNEL_POSSESSION'},signature};
  let rejectionCode:string|undefined;
  const result=await submitPublicSavingsChange({policies:{read:()=>PSS_POLICY_V1},clock:{nowEpochMs:now},activation:{publicSubmissionEnabled:()=>true},digest:{payloadDigest:async value=>hash(value)},uow:{run:async work=>{try{return await transaction(async c=>{
   const current=await member(c,String(initialMember.id),true);
   const tx:SubmissionTransaction={
    async findReceipt(request){const [rows]=await c.execute<Row[]>('SELECT * FROM pss_application WHERE member_id=? AND link_id=? AND idempotency_key=?',[current.id,initialLink.id,request.key]);if(!rows.length)return null;await readEnvelope(rows[0]);if(rows[0].request_hash!==requestHash)deny('IDEMPOTENCY_CONFLICT');return {receiptRef:String(rows[0].reference),payloadFingerprint:request.payloadFingerprint};},
    async lockFacts(){const lockedLink=await link(c,token,true);usable(lockedLink,current);const lockedProof=await proof(c,lockedLink,current,proofValue);await originalDeduction(c,current,true);const freshReview=await review(c,current,true);if(JSON.stringify(freshReview)!==JSON.stringify(reviewed))deny('FORM_CHANGED');
     const [requests]=await c.execute<Row[]>('SELECT doc_status,doc_no FROM trans_simpanan_pengajuan WHERE nik_kar=? AND jenis_simpanan=?',[current.nik_kar,'SIMPANAN SUKARELA']);
     return {form:{contractVersion:'pss-form-facts/v1',referenceStatus:'VERIFIED',sourceEvidenceRef:'local-sentinel:'+config.installationId,memberRef:String(current.id),sectionId:String(current.section_id),savingsType:'SIMPANAN SUKARELA',formVersion:FORM_VERSION,consentTextVersion:CONSENT_VERSION},calendar:await calendar(c,true),eligibility:await eligibility(c,current),existing:reviewed.original===null?{kind:'VERIFIED_NONE'}:{kind:'AMOUNT',value:reviewed.original},requests:requests.map(x=>({memberRef:String(current.id),state:mapLegacyRequestState(x.doc_status),channel:'LEGACY',period:null})),branch:String(current.branch),link:{memberRef:String(current.id),purpose:PUBLIC_SAVINGS_LINK_PURPOSE,issuedAtEpochMs:Number(lockedLink.created_ms),expiresAtEpochMs:Number(lockedLink.expires_ms),consumedAtEpochMs:lockedLink.consumed_ms===null?null:Number(lockedLink.consumed_ms),revokedAtEpochMs:lockedLink.revoked_ms===null?null:Number(lockedLink.revoked_ms)},proof:{memberRef:String(current.id),linkRef:String(lockedLink.id),contactVersion:String(lockedProof.contact_version),verifiedAtEpochMs:Number(lockedProof.created_ms)},contactVersion:boundContact(current)} as LockedSubmissionFacts;
    },
    async appendSubmission(snapshot,snapshotDigest,intents){const reference=legacyPublicReference(id()),envelope:Envelope={contractVersion:'pss-evidence/v1',snapshot,member:{name:reviewed.member.name,maskedIdentifier:mask(reviewed.member.nik),departmentName:reviewed.member.sectionName},consentText:CONSENT_TEXT,verifiedAtEpochMs:Number(verified.created_ms),templateVersion:'kkisi-pss-a4/v1',rendererVersion:'pdf-lib-1.17.1/kkisi-pss-v1',requestHash,review:reviewed,contactDestination:String(current.email)};
     const mapped=mapLegacySubmission({reference,member:reviewed.member,snapshot,signatureRef:snapshot.signature.storageRef,createdAt:jakarta(snapshot.submittedAtEpochMs),actor:'PUBLIC:'+String(initialLink.id)});if(!mapped.ok)deny(mapped.error.code);
     await c.execute('INSERT INTO pss_application(reference,member_id,link_id,idempotency_key,request_hash,payload_hash,snapshot_cipher,snapshot_hash,verified_ms,created_ms) VALUES(?,?,?,?,?,?,?,?,?,?)',[reference,current.id,initialLink.id,input.idempotencyKey,requestHash,snapshotDigest,sealEvidence(envelope,config.encryptionKeyHex,reference),hash(JSON.stringify(envelope)),verified.created_ms,snapshot.submittedAtEpochMs]);
     const [reservation]=await c.execute<Row[]>('SELECT active_reference FROM pss_member_control WHERE member_id=?',[current.id]);if(reservation[0].active_reference!==null)deny('PENDING_CONFLICT');await c.execute('UPDATE pss_member_control SET active_reference=? WHERE member_id=?',[reference,current.id]);
     const columns=Object.keys(mapped.value),values=Object.values(mapped.value);await c.execute('INSERT INTO trans_simpanan_pengajuan('+columns.map(x=>'`'+x+'`').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')',values);
     for(const kind of [...intents.map(intent=>intent.kind),'NOTIFY_MEMBER'])await c.execute('INSERT INTO pss_outbox(reference,kind,status,attempts) VALUES(?,?,\'PENDING\',0)',[reference,kind]);await audit(c,String(current.id),'SUBMISSION_COMMITTED',reference);return {submissionRef:reference};
    },
    async consumeLink(linkRef,reference){await c.execute("UPDATE pss_link SET state='CONSUMED',consumed_reference=?,consumed_ms=? WHERE id=? AND state='ACTIVE'",[reference,now(),linkRef]);},
    async saveReceipt(){/* Receipt identity is uniquely persisted by appendSubmission in this same transaction. */},
   };return work(tx);
  });}catch(error){if(error instanceof PublicSavingsServiceError)rejectionCode=error.code;throw error;}}}}, {memberRef:String(initialMember.id),linkRef:String(initialLink.id),idempotencyKey:input.idempotencyKey,snapshotInput});
  if(!result.ok)deny(rejectionCode??result.error.code);
  // Work is durable before processing; provider/render failures leave retryable outbox rows.
  await processOutbox();return receipt(token,proofValue);
 }
 async function receipt(token:string,proofValue:string){return transaction(async c=>{const l=await link(c,token),m=await member(c,String(l.member_id));usable(l,m,true);await proof(c,l,m,proofValue);if(l.state!=='CONSUMED')deny('SUBMISSION_NOT_FOUND');const [rows]=await c.execute<Row[]>('SELECT * FROM pss_application WHERE reference=? AND link_id=?',[l.consumed_reference,l.id]);if(rows.length!==1)deny('SUBMISSION_NOT_FOUND');await readEnvelope(rows[0]);return {reference:String(rows[0].reference),state:'SUBMITTED',artifactState:rows[0].proof_status==='READY'?'READY':'PENDING',pdfAvailable:rows[0].proof_status==='READY'};});}
 async function pdf(token:string,proofValue:string){const record=await transaction(async c=>{const l=await link(c,token),m=await member(c,String(l.member_id));usable(l,m,true);await proof(c,l,m,proofValue);const [rows]=await c.execute<Row[]>('SELECT * FROM pss_application WHERE link_id=?',[l.id]);if(rows.length!==1||rows[0].proof_status!=='READY')deny('PDF_NOT_READY');await readEnvelope(rows[0]);return rows[0];});const bytes=await artifacts.readPrivateArtifact(String(record.pdf_ref));if(!secretMatches(hash(bytes),String(record.pdf_digest)))deny('SNAPSHOT_INTEGRITY_INVALID');return bytes;}
 async function processOutbox(){
  // ponytail: short per-job transaction around local render/capture; use a lease worker for remote providers before deployment.
  let lastJobId='0';
  for(let index=0;index<100;index++){
   const didWork=await transaction(async c=>{const [jobs]=await c.execute<Row[]>("SELECT * FROM pss_outbox WHERE id>? AND status IN ('PENDING','FAILED') AND attempts<5 AND next_attempt_ms<=? ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED",[lastJobId,now()]);if(!jobs.length)return false;const job=jobs[0];lastJobId=String(job.id);
    try{const [apps]=await c.execute<Row[]>('SELECT * FROM pss_application WHERE reference=?',[job.reference]);if(apps.length!==1)deny('SUBMISSION_NOT_FOUND');const app=apps[0],env=await readEnvelope(app);
     const destination=async(role:string)=>{const [recipients]=await c.execute<Row[]>('SELECT destination FROM pss_notification_recipient WHERE branch=? AND role=? AND active=1',[env.review.member.branch,role]);if(recipients.length!==1)deny('RECIPIENT_UNCONFIGURED');return String(recipients[0].destination);};
     if(job.kind==='RENDER_PDF'){const artifact=await artifacts.renderSubmissionPdf({reference:String(app.reference),snapshot:env.snapshot,member:env.member,consentText:env.consentText,templateVersion:env.templateVersion,verifiedAtEpochMs:env.verifiedAtEpochMs});if(artifact.rendererVersion!==env.rendererVersion)deny('PDF_TEMPLATE_UNSUPPORTED');await c.execute("UPDATE pss_application SET pdf_ref=?,pdf_digest=?,proof_status='READY' WHERE reference=? AND proof_status='PENDING'",[artifact.storageRef,artifact.contentDigest.replace(/^sha256:/,''),app.reference]);}
     else if(job.kind==='NOTIFY_ESCALATION')await provider.deliver({id:'notification-'+hash(String(job.reference)+':'+String(job.kind)),kind:'SUBMISSION_CONFIRMATION',destination:await destination('SUPERVISOR'),reference:String(app.reference)});
     else if(job.kind==='NOTIFY_MEMBER')await provider.deliver({id:'notification-'+hash(String(job.reference)+':'+String(job.kind)),kind:'SUBMISSION_CONFIRMATION',destination:env.contactDestination,reference:String(app.reference)});
     else if(job.kind==='NOTIFY_OPERATIONS')await provider.deliver({id:'notification-'+hash(String(job.reference)+':'+String(job.kind)),kind:'SUBMISSION_CONFIRMATION',destination:await destination('OPERATIONS'),reference:String(app.reference)});
     else deny('OUTBOX_KIND_INVALID');
     await c.execute("UPDATE pss_outbox SET status='SENT',attempts=attempts+1,last_error=NULL WHERE id=?",[job.id]);await audit(c,String(app.member_id),'OUTBOX_COMPLETED',String(app.reference));
    }catch{await c.execute("UPDATE pss_outbox SET status='FAILED',attempts=attempts+1,last_error='PROVIDER_OR_RENDER_FAILED',next_attempt_ms=? WHERE id=?",[now()+Math.min(3600000,60000*2**Number(job.attempts)),job.id]);}
    return true;
   });if(!didWork)break;
  }
 }
 async function revokeLink(linkRef:string,reason:string,operator?:OperatorScope){if(!/^[0-9a-f]{32}$/.test(linkRef)||!text(reason,200))deny('INVALID_INPUT');await transaction(async c=>{const [links]=await c.execute<Row[]>('SELECT member_id FROM pss_link WHERE id=?',[linkRef]);if(!links.length)deny('LINK_INVALID');const m=await member(c,String(links[0].member_id),true);inScope(operator,m.branch);await c.execute("UPDATE pss_link SET state='REVOKED',revoked_ms=? WHERE id=?",[now(),linkRef]);await audit(c,String(links[0].member_id),'LINK_REVOKED',linkRef,operator,reason);});}
 async function listMembers(query:string,operator?:OperatorScope){if(query.length<2||query.length>50)deny('INVALID_INPUT');await ready();const scope=branchFilter(operator,'m.id');const [rows]=await pool.execute<Row[]>('SELECT m.id,m.nama_kar,m.nik_kar,b.name_bagian FROM m_anggota m JOIN m_bagian b ON (BINARY CAST(b.id AS CHAR)=BINARY m.bagian OR BINARY b.name_bagian=BINARY m.bagian) WHERE (BINARY m.nik_kar=BINARY ? OR CAST(m.id AS CHAR)=?)'+scope.sql+' LIMIT 20',[query,query,...scope.params]);return {members:rows.map(r=>({memberRef:String(r.id),name:r.nama_kar,maskedIdentifier:mask(String(r.nik_kar)),sectionName:r.name_bagian}))};}
 async function listLinks(operator?:OperatorScope){await ready();const scope=branchFilter(operator,'l.member_id');const [rows]=await pool.execute<Row[]>('SELECT l.id,l.member_id,l.state,l.expires_ms FROM pss_link l WHERE 1=1'+scope.sql+' ORDER BY l.created_ms DESC LIMIT 100',scope.params);return {links:rows.map(r=>({linkRef:r.id,memberRef:String(r.member_id),state:r.state,expiresAt:Number(r.expires_ms)}))};}
 async function listApplications(operator?:OperatorScope){await ready();const scope=branchFilter(operator,'a.member_id');const [rows]=await pool.execute<Row[]>('SELECT a.*,h.doc_status FROM pss_application a JOIN trans_simpanan_pengajuan h ON h.doc_no=a.reference WHERE 1=1'+scope.sql+' ORDER BY a.created_ms DESC LIMIT 100',scope.params);const applications=[];for(const row of rows){try{const env=await readEnvelope(row);applications.push({reference:row.reference,name:env.member.name,amount:env.snapshot.requestedAmount,requestedPeriod:env.snapshot.requestedPeriod,status:row.doc_status,artifactState:row.proof_status,integrityState:'VALID'});}catch{applications.push({reference:row.reference,name:'Bukti tidak tersedia',amount:'',requestedPeriod:'Perlu pemeriksaan',status:'ASSISTED_REQUIRED',artifactState:'FAILED',integrityState:'INVALID'});}}return {applications};}
 async function operatorPdf(reference:string,operator?:OperatorScope){if(!/^PSS[0-9a-f]{32}00000$/.test(reference))deny('SUBMISSION_NOT_FOUND');await ready();const scope=branchFilter(operator,'a.member_id');const [rows]=await pool.execute<Row[]>('SELECT a.* FROM pss_application a WHERE a.reference=?'+scope.sql,[reference,...scope.params]);if(rows.length!==1||rows[0].proof_status!=='READY')deny('PDF_NOT_READY');await readEnvelope(rows[0]);const bytes=await artifacts.readPrivateArtifact(String(rows[0].pdf_ref));if(hash(bytes)!==rows[0].pdf_digest)deny('SNAPSHOT_INTEGRITY_INVALID');return bytes;}
 return {issueLink,validate,requestChallenge,verifyChallenge,submit,receipt,pdf,processOutbox,revokeLink,listMembers,listLinks,listApplications,operatorPdf,close:()=>pool.end()};
}
