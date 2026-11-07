import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalCaptures } from '../src/infrastructure/public-savings/providers.ts';
import { connect } from '../../../integration/public-savings/staging.mjs';

// This harness exercises the real loopback-only synthetic installation. It never prints credentials, OTPs or private URLs.
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PSS_BROWSER_URL || 'http://127.0.0.1:3204';
assert.ok(new URL(base).hostname==='127.0.0.1','Browser acceptance is restricted to loopback.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const directory=process.env.PSS_LOCAL_DIRECTORY || join(root,'.local/public-savings');
const config=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
assert.ok(config.mode==='LOCAL_SYNTHETIC' && config.database==='kkisi_public_savings','Synthetic installation configuration required.');
const secrets=new Set([config.operatorKey]);
const output=process.env.PSS_BROWSER_OUTPUT || '/private/tmp/kkisi-public-savings-console-browser';
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
async function screenshot(page,name,mask=[]){await page.screenshot({path:join(output,name),fullPage:true,mask});}
async function waitForCapture(challengeRef){
  for(let attempt=0;attempt<30;attempt++){
    const match=(await readLocalCaptures(config,join(directory,'capture'))).find(delivery=>delivery.id===challengeRef && delivery.kind==='OTP');
    if(match?.code){secrets.add(match.code);return match.code;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error('Local OTP capture was not delivered.');
}
async function createSyntheticMember(){
  const id=randomInt(80_000_000,89_999_999),nik=`B${id}`,name=`SYNTHETIC BROWSER ${id}`;
  const admin=await connect('admin');
  try{
    const [installation]=await admin.execute('SELECT id,mode FROM pss_installation');
    assert.ok(installation.length===1 && installation[0].id===config.installationId && installation[0].mode==='LOCAL_SYNTHETIC','Synthetic browser fixture sentinel must match.');
    await admin.beginTransaction();
    await admin.execute("INSERT INTO m_bagian(id,name_bagian,status,id_lokasi) VALUES(?,'SYNTHETIC BROWSER SECTION',1,1)",[id]);
    await admin.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,no_telp,email,status_anggota,status_karyawan,sim_sukarela,sim_wajib,kd_group) VALUES(?,?,?,?,NULL,?,'AKTIVE','AKTIVE',100000,100000,'SYNTH')",[id,nik,name,id,`browser-${id}@example.invalid`]);
    await admin.execute('INSERT INTO pss_member_control(member_id,active_reference) VALUES(?,NULL)',[id]);
    await admin.execute("INSERT INTO pss_member_evidence(member_id,contact_version,contact_verified_ms,eligible,payroll_active,branch,deduction_evidence) VALUES(?,'synthetic-contact-v1',?,1,1,'SYNTHETIC BRANCH','CONFIG_VERIFIED')",[id,Date.now()-86_400_000]);
    await admin.execute("INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES(?,'SIMPANAN SUKARELA',?,?,'SYNTH',100000,100000,1,0)",[`SYNTHBASEB${id}`,nik,name]);
    await admin.execute("INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES(?,'SIMPANAN WAJIB',?,?,'SYNTH',100000,100000,1,0)",[`SYNTHBASEW${id}`,nik,name]);
    await admin.commit();return nik;
  }catch{await admin.rollback();throw new Error('Isolated synthetic browser fixture creation failed.');}finally{await admin.end();}
}
const credentials=JSON.parse(await readFile(process.env.PSS_BROWSER_ACCOUNTS || '/Users/macbookprom2/Documents/Working_Space/OctopushStudio/Website/kkisi.suzuki.web/apps/web/.env.dev-local-accounts.json','utf8'));
for(const secret of Object.values(credentials))if(typeof secret==='string')secrets.add(secret);
async function login(page,role){
 await page.goto(`${base}/login?next=%2Fconsole`);
 await page.getByLabel('Username',{exact:true}).fill(`synth_${role}`);await page.getByLabel('Password',{exact:true}).fill(credentials[role]);
 await page.getByRole('button',{name:'Masuk',exact:true}).click();await page.waitForURL(url=>url.pathname!='/login');
}
async function submitMember(privateUrl,type){
 const ctx=await context({width:390,height:844},true),page=await ctx.newPage();
 await privateGoto(page,privateUrl);await page.getByRole('heading',{name:'Verifikasi anggota',exact:true}).waitFor();
 assert.equal(new URL(page.url()).hash,'');await page.getByRole('heading',{name:`Pengajuan ${type.toLowerCase()}`,exact:true}).waitFor();
 const challengeResponse=page.waitForResponse(r=>r.url().endsWith('/verification-challenges')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click();const challenge=await(await challengeResponse).json();
 await page.getByLabel('Kode verifikasi 6 digit').fill(await waitForCapture(challenge.challengeRef));
 await page.getByRole('button',{name:'Verifikasi & lanjutkan',exact:true}).click();await page.getByRole('heading',{name:'Data anggota',exact:true}).waitFor();
 assert.equal(await page.locator('dd').filter({hasText:type}).count(),1);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Public layout ${width}`);}
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Nominal potongan baru (rupiah)',{exact:false}).fill('150000');
 const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();assert.ok(box);
 await page.mouse.move(box.x+box.width*.12,box.y+box.height*.65);await page.mouse.down();
 for(const [x,y]of[[.25,.2],[.18,.7],[.45,.3],[.65,.7],[.85,.35]])await page.mouse.move(box.x+box.width*x,box.y+box.height*y,{steps:6});
 await page.mouse.up();await page.locator('#pss-consent').check();await screenshot(page,`${type.endsWith('WAJIB')?'wajib':'sukarela'}-draft.png`);
 await page.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();await page.getByRole('heading',{name:'Tinjau pengajuan',exact:true}).waitFor();
 const submission=page.waitForResponse(r=>r.url().endsWith('/submissions')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Kirim pengajuan',exact:true}).click();const response=await submission;
 assert.ok(response.ok(),`Submission HTTP status ${response.status()}`);const receipt=await response.json();assert.equal(receipt.savingsType,type);
 await page.getByRole('heading',{name:'Pengajuan telah tercatat',exact:true}).waitFor();
 for(let i=0;i<30&&!await page.getByRole('button',{name:'Unduh bukti PDF',exact:true}).count();i++){await page.getByRole('button',{name:'Perbarui status bukti',exact:true}).click();await page.waitForTimeout(300);}
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Unduh bukti PDF',exact:true}).click();const download=await downloadPromise;
 const file=join(output,`${type.endsWith('WAJIB')?'wajib':'sukarela'}-receipt.pdf`);await download.saveAs(file);assert.equal((await readFile(file)).subarray(0,5).toString(),'%PDF-');
 const {execFileSync}=await import('node:child_process');const pdfText=execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});assert.ok(pdfText.includes(`PENGAJUAN ${type}`));assert.ok(!pdfText.includes(type.endsWith('WAJIB')?'SIMPANAN SUKARELA':'SIMPANAN WAJIB'));
 await screenshot(page,`${type.endsWith('WAJIB')?'wajib':'sukarela'}-receipt.png`);await ctx.close();return receipt.reference;
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(`${base}/login`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 const operatorContext=await context(),operator=await operatorContext.newPage();await login(operator,'koperasi');
 const results=[];
 for(const type of ['SIMPANAN WAJIB','SIMPANAN SUKARELA']){
  const member=await createSyntheticMember();await operator.goto(`${base}/console/kosipa/simpanan-sukarela`);
  await operator.getByRole('button',{name:'Terbitkan tautan',exact:true}).click();await operator.getByLabel('Jenis simpanan',{exact:true}).selectOption(type);
  await operator.locator('#pssc-member').fill(member);await operator.getByRole('button',{name:'Cari',exact:true}).click();
  const issuedResponse=operator.waitForResponse(r=>r.url().endsWith('/api/kosipa/public-savings-links')&&r.request().method()==='POST');
  await operator.getByRole('button',{name:'Terbitkan',exact:true}).click();const response=await issuedResponse;assert.ok(response.ok(),`Issue HTTP status ${response.status()}`);
  const url=await operator.getByLabel('Tautan privat anggota',{exact:true}).inputValue();
  await screenshot(operator,`${type.endsWith('WAJIB')?'wajib':'sukarela'}-issued.png`,[operator.getByLabel('Tautan privat anggota')]);
  const reference=await submitMember(url,type);console.log(`Submitted ${type}: actual PDF verified.`);
  await operator.goto(`${base}/console/kosipa/simpanan-sukarela`);await operator.getByRole('searchbox').fill(reference);
  const row=operator.getByRole('row').filter({has:operator.locator(`code[title="${reference}"]`)});await row.waitFor();assert.ok((await row.innerText()).includes(type));assert.ok((await row.innerText()).includes('Menunggu proses'));
  await screenshot(operator,`${type.endsWith('WAJIB')?'wajib':'sukarela'}-console-open.png`);results.push({type,reference});
 }
 const unauthorized=await context(),page=await unauthorized.newPage();await login(page,'kasir1');await page.goto(`${base}/console/kosipa/simpanan-sukarela`);
 assert.equal(await page.getByRole('button',{name:'Terbitkan tautan',exact:true}).count(),0);assert.ok((await page.locator('body').innerText()).includes('tidak tersedia'));
 assert.equal(browserErrors.length,0,'Browser runtime errors');assert.equal(externalRequests.length,0,'External resources');
 await writeFile(join(output,'results.json'),JSON.stringify({scope:'LOCAL_SYNTHETIC_REAL_CONSOLE_BROWSER',passed:true,results,checks:['console-login','issue-wajib','issue-sukarela','real-otp','fragment-scrub','responsive-public','drawn-signature','consent-review-submit','actual-pdf-type','console-open-type','unauthorized-console-denied'],browserErrors,externalRequests},null,2),{mode:0o600});
 await rm(join(output,'failure.txt'),{force:true});
 console.log('PASS: real console issuance and member submission for Wajib and Sukarela; private values redacted.');
}catch(error){let safe=String(error?.stack||error).replace(/#token=[^\s"'<>]+/g,'#token=[REDACTED]');for(const secret of [...secrets].sort((a,b)=>b.length-a.length))safe=safe.replaceAll(secret,'[REDACTED]');await writeFile(join(output,'failure.txt'),safe,{mode:0o600});throw new Error(safe);}finally{await browser.close();}
