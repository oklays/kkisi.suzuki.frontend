import {randomUUID} from 'node:crypto';
import {createPublicSavingsService,PublicSavingsServiceError} from './service.ts';
import {keyedDigest,secretMatches,loadStagingConfig} from './security.ts';

export type PublicSavingsOperation='validate'|'challenge'|'verify'|'submit'|'receipt'|'pdf'|'members'|'links-list'|'links-create'|'links-revoke'|'applications'|'application-pdf';
let servicePromise:Promise<ReturnType<typeof createPublicSavingsService>>|undefined;
const budget=new Map<string,{until:number;count:number}>();
const common={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:common});
const fail=(code:string,status:number)=>json({error:{code}},status);
async function bounded(request:Request,max:number){
 if(Number(request.headers.get('content-length')??0)>max)throw new PublicSavingsServiceError('REQUEST_TOO_LARGE');
 if(!request.body)return new Uint8Array();const reader=request.body.getReader(),chunks:Uint8Array[]=[];let count=0;
 while(true){const next=await reader.read();if(next.done)break;count+=next.value.length;if(count>max){await reader.cancel();throw new PublicSavingsServiceError('REQUEST_TOO_LARGE');}chunks.push(next.value);}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function strictObject(input:unknown,fields:string[]):Record<string,unknown>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==fields.length||!fields.every(k=>Object.hasOwn(input,k)))throw new PublicSavingsServiceError('INVALID_INPUT');return input as Record<string,unknown>;}
const string=(value:unknown,max=128)=>{if(typeof value!=='string'||value.length===0||value.length>max)throw new PublicSavingsServiceError('INVALID_INPUT');return value;};
/** All routes stay disabled outside explicitly configured loopback synthetic staging. No management cookie substitutes for public proof. */
export async function handlePublicSavingsRequest(request:Request,operation:PublicSavingsOperation,recordId?:string):Promise<Response>{
 const correlation=randomUUID();
 try{
  const url=new URL(request.url),origin=request.headers.get('origin');
  const host=request.headers.get('host')??url.host;
  if(!/^(127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/.test(host))return fail('ACTIVATION_BLOCKED',503);
  // Next may normalize request.url to localhost. Direct Host is validated above; forwarded host headers are never trusted.
  if(origin&&origin!==`${url.protocol}//${host}`||request.headers.get('sec-fetch-site')==='cross-site')return fail('ORIGIN_REJECTED',403);
  const bytes=await bounded(request,operation==='submit'?1150000:8192);
  const config=await loadStagingConfig();
  const current=Date.now(),key=operation,bucket=budget.get(key);
  if(!bucket||bucket.until<current)budget.set(key,{until:current+60000,count:1});else if(++bucket.count>120)return fail('RATE_LIMITED',429);
  servicePromise??=Promise.resolve(createPublicSavingsService(config,{intakeEnabled:()=>process.env.PSS_INTAKE_ENABLED!=='0'}));const service=await servicePromise;
  const staff=['members','links-list','links-create','links-revoke','applications','application-pdf'].includes(operation);
  if(staff&&!secretMatches(keyedDigest(config.hashKey,'operator',config.operatorKey),keyedDigest(config.hashKey,'operator',request.headers.get('x-pss-staging-operator')??'')))return fail('FORBIDDEN',403);
  const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]??'';
  const proof=request.headers.get('x-public-proof')??'';
  let result:unknown;
  if(operation==='validate')result=await service.validate(token,proof||undefined);
  else if(operation==='challenge')result=await service.requestChallenge(token);
  else if(operation==='verify'){const input=strictObject(JSON.parse(new TextDecoder().decode(bytes)),['challengeRef','code']);result=await service.verifyChallenge(token,string(input.challengeRef),string(input.code,6));}
  else if(operation==='submit'){
   const parsed=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')??''},body:bytes}).formData();
   const fields=['amountRupiah','sectionId','startMonth','startYear','consentVersion','formVersion','reviewFingerprint','consent','signature'];
   if(Array.from(parsed.keys()).length!==fields.length||!fields.every(k=>parsed.has(k)))return fail('INVALID_INPUT',400);
   const signature=parsed.get('signature');if(!(signature instanceof File)||signature.type!=='image/png'||signature.size>1048576)return fail('SIGNATURE_INVALID',422);
   result=await service.submit(token,proof,{amountRupiah:string(parsed.get('amountRupiah'),20),sectionId:string(parsed.get('sectionId')),startMonth:string(parsed.get('startMonth'),2),startYear:string(parsed.get('startYear'),4),consentVersion:string(parsed.get('consentVersion')),formVersion:string(parsed.get('formVersion')),reviewFingerprint:string(parsed.get('reviewFingerprint'),64),consent:parsed.get('consent')==='true',signature:new Uint8Array(await signature.arrayBuffer()),idempotencyKey:string(request.headers.get('idempotency-key'))});
  }else if(operation==='receipt')result=await service.receipt(token,proof);
  else if(operation==='pdf'||operation==='application-pdf'){
   const pdf=operation==='pdf'?await service.pdf(token,proof):await service.operatorPdf(string(recordId,50));
   return new Response(Buffer.from(pdf),{headers:{...common,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="pengajuan-simpanan-sukarela.pdf"'}});
  }else if(operation==='members')result=await service.listMembers(url.searchParams.get('query')??'');
  else if(operation==='links-list')result=await service.listLinks();
  else if(operation==='links-create'){const input=strictObject(JSON.parse(new TextDecoder().decode(bytes)),['memberRef']);result=await service.issueLink(string(input.memberRef));}
  else if(operation==='links-revoke'){const input=strictObject(JSON.parse(new TextDecoder().decode(bytes)),['reason']);await service.revokeLink(string(recordId),string(input.reason,200));result={state:'REVOKED'};}
  else if(operation==='applications')result=await service.listApplications();
  else return fail('NOT_FOUND',404);
  return json(result);
 }catch(error){
  const code=error instanceof PublicSavingsServiceError?error.code:error instanceof Error&&error.message==='ACTIVATION_BLOCKED'?'ACTIVATION_BLOCKED':error instanceof SyntaxError?'INVALID_INPUT':'DEPENDENCY_UNAVAILABLE';
  const status=code==='REQUEST_TOO_LARGE'?413:code==='ACTIVATION_BLOCKED'||code==='DEPENDENCY_UNAVAILABLE'||code==='DELIVERY_UNAVAILABLE'?503:/LIMIT|TOO_SOON|LOCKED/.test(code)?429:/EXPIRED|REVOKED/.test(code)?410:/INVALID_INPUT|CHALLENGE_INVALID/.test(code)?400:/FORM_CHANGED|CONFLICT|CONSUMED/.test(code)?409:/REQUIRED|PROOF|LINK_INVALID/.test(code)?403:422;
  // No URL, token, OTP, contact, payload or database error is logged.
  console.info(JSON.stringify({feature:'public-savings',operation,correlation,code,status}));
  return fail(code,status);
 }
}
