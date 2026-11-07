import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalCaptures } from '../src/infrastructure/public-savings/providers.ts';
import { connectReplica, loadReplicaConfig } from '../../../integration/public-savings/replica-stage.mjs';

// This harness exercises the loopback-only production-copy replica with an existing registered member. It never prints credentials, OTPs or private URLs.
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
assert.equal(process.env.PSS_LOCAL_REPLICA_UAT,'1','Explicit replica opt-in required.');
const base=process.env.PSS_BROWSER_URL || 'http://127.0.0.1:3000';
assert.ok(new URL(base).hostname==='127.0.0.1','Browser acceptance is restricted to loopback.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const directory=process.env.PSS_LOCAL_DIRECTORY || join(root,'.local/public-savings-replica');
const config=await loadReplicaConfig();
const candidate=JSON.parse(await readFile(join(directory,'manual-member.json'),'utf8'));
const database=await connectReplica('admin');
const [[beforeMember]]=await database.execute('SELECT id,nik_kar,nama_kar,sim_wajib,sim_sukarela FROM m_anggota WHERE id=?',[candidate.memberRef]);
assert.ok(beforeMember,'Registered member required.');
const [beforeMaster]=await database.execute('SELECT doc_no,jenis_simpanan,potongan_old,potongan_payroll,status FROM m_simpanan_aktif WHERE BINARY nik_kar=BINARY ? ORDER BY doc_no',[candidate.nik]);
const [[beforeCount]]=await database.execute('SELECT COUNT(*) n FROM trans_simpanan_pengajuan WHERE BINARY nik_kar=BINARY ?',[candidate.nik]);
const [[beforeApplications]]=await database.execute('SELECT COUNT(*) n FROM pss_application WHERE member_id=?',[candidate.memberRef]);
const secrets=new Set([config.operatorKey,candidate.nik,String(beforeMember.nama_kar)]);
const output=process.env.PSS_BROWSER_OUTPUT || '/private/tmp/kkisi-public-savings-replica-browser';
await mkdir(output,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true});
const browserErrors=[],externalRequests=[];
async function privateGoto(page,url){const absolute=new URL(url,base);assert.equal(absolute.origin,new URL(base).origin);secrets.add(absolute.href);const secretToken=new URLSearchParams(absolute.hash.slice(1)).get('token');if(secretToken)secrets.add(secretToken);try{await page.goto(absolute.href);}catch{throw new Error('Private member navigation failed; URL redacted.');}}
async function context(viewport={width:1440,height:1000},mobile=false){
  const result=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  result.on('page',page=>{
    page.on('pageerror',()=>browserErrors.push('Browser runtime error'));
    page.on('request',request=>{const url=new URL(request.url());if(/^https?:$/.test(url.protocol)&&url.hostname!=='127.0.0.1')externalRequests.push('External request');});
  });
  return result;
}
async function waitForCapture(challengeRef){
  for(let attempt=0;attempt<30;attempt++){
    const match=(await readLocalCaptures(config,join(directory,'capture'))).find(delivery=>delivery.id===challengeRef && delivery.kind==='OTP');
    if(match?.code){secrets.add(match.code);return match.code;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('Local OTP capture was not delivered.');
}
const credentials=JSON.parse(await readFile(process.env.PSS_BROWSER_ACCOUNTS || join(root,'apps/web/.e2e-adminpos.json'),'utf8'));
for(const secret of Object.values(credentials))if(typeof secret==='string')secrets.add(secret);
async function login(page){
 await page.goto(`${base}/login?next=%2Fconsole`);
 await page.getByLabel('Username',{exact:true}).fill(credentials.username);await page.getByLabel('Password',{exact:true}).fill(credentials.password);
 await page.getByRole('button',{name:'Masuk',exact:true}).click();await page.waitForURL(url=>url.pathname!='/login');
}
async function submitMember(privateUrl,type){
 const ctx=await context({width:390,height:844},true),page=await ctx.newPage();
 await privateGoto(page,privateUrl);await page.getByText('LOCAL REPLICA UAT · SIMULASI',{exact:true}).waitFor();await page.getByRole('heading',{name:'Verifikasi anggota',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hash,'');await page.getByRole('heading',{name:`Pengajuan ${type.toLowerCase()}`,exact:true}).waitFor();
 const challengeResponse=page.waitForResponse(r=>r.url().endsWith('/verification-challenges')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click();const challenge=await(await challengeResponse).json();assert.equal(challenge.code,undefined,'No public OTP code');
 await page.getByLabel('Kode verifikasi 6 digit').fill(await waitForCapture(challenge.challengeRef));
 await page.getByRole('button',{name:'Verifikasi & lanjutkan',exact:true}).click();await page.getByRole('heading',{name:'Data anggota',exact:true}).waitFor();
 assert.equal(await page.locator('dd').filter({hasText:type}).count(),1);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Public layout ${width}`);}
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Nominal potongan baru (rupiah)',{exact:false}).fill(String(beforeMember.sim_wajib)==='150000'?'160000':'150000');
 const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();assert.ok(box);
 await page.mouse.move(box.x+box.width*.12,box.y+box.height*.65);await page.mouse.down();
 for(const [x,y]of[[.25,.2],[.18,.7],[.45,.3],[.65,.7],[.85,.35]])await page.mouse.move(box.x+box.width*x,box.y+box.height*y,{steps:6});
 await page.mouse.up();await page.locator('#pss-consent').check();
 await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();await page.getByRole('heading',{name:'Tinjau pengajuan',exact:true}).waitFor();
 const submission=page.waitForResponse(r=>r.url().endsWith('/submissions')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Kirim pengajuan',exact:true}).click();const response=await submission;
 if(!response.ok()){const body=await response.json().catch(()=>({}));assert.fail(`Submission HTTP status ${response.status()} ${JSON.stringify({error:body.error,code:body.code,field:body.field})}`);}const receipt=await response.json();assert.equal(receipt.savingsType,type);
 await page.getByRole('heading',{name:'Pengajuan telah tercatat',exact:true}).waitFor();
 for(let i=0;i<30&&!await page.getByRole('button',{name:'Unduh bukti PDF',exact:true}).count();i++){await page.getByRole('button',{name:'Perbarui status bukti',exact:true}).click();await page.waitForTimeout(300);}
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Unduh bukti PDF',exact:true}).click();const download=await downloadPromise;
 const file=join(output,`${type.endsWith('WAJIB')?'wajib':'sukarela'}-receipt.pdf`);await download.saveAs(file);assert.equal((await readFile(file)).subarray(0,5).toString(),'%PDF-');
 const {execFileSync}=await import('node:child_process');const pdfText=execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});assert.ok(pdfText.includes(`PENGAJUAN ${type}`));assert.ok(pdfText.includes('LOCAL_CAPTURE_SIMULATION'),'PDF simulation marker required');assert.ok(pdfText.includes('Terbilang:'),'Current document format preserved');assert.ok(!pdfText.includes(type.endsWith('WAJIB')?'SIMPANAN SUKARELA':'SIMPANAN WAJIB'));
 await ctx.close();return receipt.reference;
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(`${base}/login`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 const operatorContext=await context(),operator=await operatorContext.newPage();await login(operator);
 const sessionResponse=await operatorContext.request.get(`${base}/api/auth/session`);const session=await sessionResponse.json();console.log('Session context:',JSON.stringify({userId:session.user?.id,roleId:session.user?.roleId,companyId:session.company?.id}));
 const results=[];
 for(const type of ['SIMPANAN WAJIB']){
  const member=candidate.nik;await operator.goto(`${base}/console/kosipa/simpanan-sukarela`);
  try{await operator.getByText('LOCAL REPLICA UAT · SIMULASI',{exact:true}).waitFor({timeout:15000});}catch{const body=await operator.locator('body').innerText();throw new Error(`Replica console unavailable: ${JSON.stringify({authorizationUnavailable:body.includes('Layanan otorisasi belum tersedia'),policyUnavailable:body.includes('Konfigurasi akses pengajuan'),accessDenied:body.includes('tidak tersedia untuk akun ini'),notFound:body.includes('404'),consoleRendered:body.includes('Terbitkan tautan'),applicationError:body.includes('Application error')})}`);}
  await operator.getByRole('button',{name:'Terbitkan tautan',exact:true}).click();await operator.getByLabel('Jenis simpanan',{exact:true}).selectOption(type);
  await operator.locator('#pssc-member').fill(member);await operator.getByRole('button',{name:'Cari',exact:true}).click();
  const issuedResponse=operator.waitForResponse(r=>r.url().endsWith('/api/kosipa/public-savings-links')&&r.request().method()==='POST');
  await operator.getByRole('button',{name:'Terbitkan',exact:true}).click();const response=await issuedResponse;assert.ok(response.ok(),`Issue HTTP status ${response.status()}`);
  const url=await operator.getByLabel('Tautan privat anggota',{exact:true}).inputValue();

  const reference=await submitMember(url,type);console.log(`Submitted ${type}: actual PDF verified.`);
  await operator.goto(`${base}/console/kosipa/simpanan-sukarela`);await operator.getByRole('searchbox').fill(reference);
  const row=operator.getByRole('row').filter({has:operator.locator(`code[title="${reference}"]`)});await row.waitFor();assert.ok((await row.innerText()).includes(type));assert.ok((await row.innerText()).includes('Menunggu proses'));
results.push({type,reference});
 }
 const [[afterMember]]=await database.execute('SELECT id,nik_kar,nama_kar,sim_wajib,sim_sukarela FROM m_anggota WHERE id=?',[candidate.memberRef]);
 const [afterMaster]=await database.execute('SELECT doc_no,jenis_simpanan,potongan_old,potongan_payroll,status FROM m_simpanan_aktif WHERE BINARY nik_kar=BINARY ? ORDER BY doc_no',[candidate.nik]);
 const [[afterCount]]=await database.execute('SELECT COUNT(*) n FROM trans_simpanan_pengajuan WHERE BINARY nik_kar=BINARY ?',[candidate.nik]);
 assert.ok(JSON.stringify(beforeMember)===JSON.stringify(afterMember),'Member financial state unchanged');assert.ok(JSON.stringify(beforeMaster)===JSON.stringify(afterMaster),'Active deductions unchanged');assert.equal(Number(afterCount.n)-Number(beforeCount.n),1,'Exactly one intake header');
 const [[afterApplications]]=await database.execute('SELECT COUNT(*) n FROM pss_application WHERE member_id=?',[candidate.memberRef]);assert.equal(Number(afterApplications.n)-Number(beforeApplications.n),1,'Exactly one public application');
 const [[header]]=await database.execute('SELECT doc_status FROM trans_simpanan_pengajuan WHERE doc_no=?',[results[0].reference]);assert.equal(header.doc_status,'OPEN');
 assert.equal(browserErrors.length,0,'Browser runtime errors');assert.equal(externalRequests.length,0,'External resources');
 await writeFile(join(output,'results.json'),JSON.stringify({scope:'LOCAL_REPLICA_UAT_REAL_REGISTERED_MEMBER_BROWSER',passed:true,results,counts:{intakeHeadersAdded:1,publicApplicationsAdded:1},checks:['console-login','issue-wajib','real-otp','fragment-scrub','responsive-public','drawn-signature','consent-review-submit','actual-pdf-type','console-open-type','member-master-unchanged','one-open-intake-header','pdf-simulation-marker'],browserErrors,externalRequests},null,2),{mode:0o600});
 await rm(join(output,'failure.txt'),{force:true});
 console.log('PASS: local replica Wajib browser UAT; member/master unchanged; one OPEN intake; private values redacted.');
}catch(error){let safe=String(error?.stack||error).replace(/#token=[^\s"'<>]+/g,'#token=[REDACTED]');for(const secret of [...secrets].sort((a,b)=>b.length-a.length))safe=safe.replaceAll(secret,'[REDACTED]');await writeFile(join(output,'failure.txt'),safe,{mode:0o600});throw new Error(safe);}finally{await database.end();await browser.close();}
