import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLocalCaptures } from '../src/infrastructure/public-savings/providers.ts';
import { connect } from '../../../integration/public-savings/staging.mjs';

// This harness exercises the real loopback-only synthetic installation. It never prints credentials, OTPs or private URLs.
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PSS_BROWSER_URL || 'http://127.0.0.1:3489';
assert.ok(new URL(base).hostname==='127.0.0.1','Browser acceptance is restricted to loopback.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const directory=process.env.PSS_LOCAL_DIRECTORY || join(root,'.local/public-savings');
const config=JSON.parse(await readFile(join(directory,'config.json'),'utf8'));
assert.ok(config.mode==='LOCAL_SYNTHETIC' && config.database==='kkisi_public_savings','Synthetic installation configuration required.');
const secrets=new Set([config.operatorKey]);
const output=process.env.PSS_BROWSER_OUTPUT || '/private/tmp/kkisi-public-savings-browser';
await mkdir(output,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true});
const browserErrors=[],externalRequests=[];
let applicationReference='',lostResponseReference='';
const operatorHeaders={'X-PSS-Staging-Operator':config.operatorKey};
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
    await admin.execute("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,no_telp,email,status_anggota,status_karyawan,sim_sukarela,kd_group) VALUES(?,?,?,?,NULL,?,'AKTIVE','AKTIVE',100000,'SYNTH')",[id,nik,name,id,`browser-${id}@example.invalid`]);
    await admin.execute('INSERT INTO pss_member_control(member_id,active_reference) VALUES(?,NULL)',[id]);
    await admin.execute("INSERT INTO pss_member_evidence(member_id,contact_version,contact_verified_ms,eligible,payroll_active,branch,deduction_evidence) VALUES(?,'synthetic-contact-v1',?,1,1,'SYNTHETIC BRANCH','CONFIG_VERIFIED')",[id,Date.now()-86_400_000]);
    await admin.execute("INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES(?,'SIMPANAN SUKARELA',?,?,'SYNTH',100000,100000,1,0)",[`SYNTHBASEB${id}`,nik,name]);
    await admin.commit();return nik;
  }catch{await admin.rollback();throw new Error('Isolated synthetic browser fixture creation failed.');}finally{await admin.end();}
}
async function parsedSubmission(request){
  const multipart=await new Request(request.url(),{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData();
  const signature=multipart.get('signature');
  return {key:request.headers()['idempotency-key'],amount:multipart.get('amountRupiah'),consent:multipart.get('consent'),
    signature:createHash('sha256').update(Buffer.from(await signature.arrayBuffer())).digest('hex'),signatureType:signature.type};
}
try{
  const primaryMember=process.env.PSS_BROWSER_MEMBER || await createSyntheticMember();
  const revokeMember=process.env.PSS_BROWSER_REVOKE_MEMBER || await createSyntheticMember();
  console.log('1. Invalid-link page and local operator controls');
  const operatorContext=await context(),operator=await operatorContext.newPage();
  await operator.goto(`${base}/simpanan-sukarela`);
  await operator.getByRole('heading',{name:'Tautan tidak valid',exact:true}).waitFor();
  await screenshot(operator,'invalid-link-desktop.png');
  await operator.goto(`${base}/simpanan-sukarela/operator`);
  await operator.getByText('LOCAL STAGING ONLY',{exact:true}).waitFor();
  await operator.getByLabel('Kunci operator local staging').fill('invalid-key');
  await operator.getByRole('button',{name:'Muat tautan & pengajuan',exact:true}).click();
  await operator.locator('.pss-error[role=alert]').waitFor();
  await operator.getByLabel('Kunci operator local staging').fill(config.operatorKey);
  await operator.getByLabel('NIK atau ID anggota sintetis (pencocokan tepat)').fill(primaryMember);
  await operator.getByRole('button',{name:'Cari anggota',exact:true}).click();
  await operator.getByRole('button',{name:'Terbitkan tautan',exact:true}).first().click();
  const privateUrl=await operator.getByLabel('Tautan privat anggota').inputValue();
  assert.ok(new URL(privateUrl).origin===base && Boolean(new URL(privateUrl).hash),'Issued link must use the local private fragment.');
  await screenshot(operator,'operator-link-desktop.png',[operator.getByLabel('Kunci operator local staging'),operator.getByLabel('Tautan privat anggota')]);

  console.log('2. Real OTP capture, mobile form validation and drawn signature');
  const memberContext=await context({width:390,height:844},true),member=await memberContext.newPage();
  const validateResponses=[];
  member.on('response',async response=>{if(response.url().endsWith('/api/public/simpanan-sukarela/validate') && response.ok())validateResponses.push(await response.json());});
  await privateGoto(member,privateUrl);
  await member.getByRole('heading',{name:'Verifikasi anggota',exact:true}).waitFor();
  assert.ok(new URL(member.url()).hash==='','Private fragment must be removed immediately.');
  assert.ok(!await member.getByRole('heading',{name:'Data anggota',exact:true}).count(),'Member details must be withheld before verification.');
  const challengePromise=member.waitForResponse(response=>response.url().endsWith('/verification-challenges') && response.request().method()==='POST');
  await member.getByRole('button',{name:'Kirim kode verifikasi',exact:true}).click();
  const challenge=await (await challengePromise).json();
  assert.ok(typeof challenge.challengeRef==='string','Challenge reference required.');
  const otp=await waitForCapture(challenge.challengeRef);
  await member.getByLabel('Kode verifikasi 6 digit').fill(otp);
  await member.getByRole('button',{name:'Verifikasi & lanjutkan',exact:true}).click();
  await member.getByRole('heading',{name:'Data anggota',exact:true}).waitFor();
  const form=validateResponses.findLast(response=>response.state==='READY')?.form;
  assert.ok(form && !String(form.memberName).includes('undefined'),'Server form must be present.');
  for(const width of [320,390,768,1440,720]){
    await member.setViewportSize({width,height:900});
    assert.ok(await member.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`No horizontal overflow at ${width}px`);
  }
  await member.setViewportSize({width:390,height:844});
  assert.equal(await member.getByLabel(form.consentText,{exact:true}).isChecked(),false);
  await member.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  await member.locator('.pss-error[role=alert]').waitFor();
  assert.ok(await member.locator('.pss-error[role=alert]').evaluate(element=>element===document.activeElement),'Validation errors must receive focus.');
  const amount=String(form.originalDeduction)==='150000'?'160000':'150000';
  await member.getByLabel('Nominal potongan baru (rupiah)',{exact:false}).fill(amount);
  const pad=member.locator('canvas');await pad.scrollIntoViewIfNeeded();
  const box=await pad.boundingBox();assert.ok(box,'Signature canvas must be visible.');
  await member.mouse.move(box.x+box.width*.12,box.y+box.height*.65);await member.mouse.down();
  for(const [x,y] of [[.25,.25],[.18,.7],[.45,.4],[.35,.7],[.7,.4],[.85,.55]])await member.mouse.move(box.x+box.width*x,box.y+box.height*y,{steps:5});
  await member.mouse.up();
  await member.getByLabel(form.consentText,{exact:true}).check();
  await screenshot(member,'member-draft-mobile.png');
  await member.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  await member.getByRole('heading',{name:'Tinjau pengajuan',exact:true}).waitFor();
  await member.getByRole('button',{name:'Ubah isian',exact:true}).click();
  assert.equal(await member.getByLabel('Nominal potongan baru (rupiah)',{exact:false}).inputValue(),amount);
  assert.equal(await member.getByLabel(form.consentText,{exact:true}).isChecked(),true);
  await member.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  await member.setViewportSize({width:1440,height:1000});
  await screenshot(member,'member-review-desktop.png');

  console.log('3. Stale review recovery, lost-response exact retry, receipt and protected PDF');
  await member.route('**/api/public/simpanan-sukarela/submissions',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'FORM_CHANGED'}})}),{times:1});
  await member.getByRole('button',{name:'Kirim pengajuan',exact:true}).click();
  await member.getByRole('heading',{name:'Rencana potongan',exact:true}).waitFor();
  assert.equal(await member.getByLabel(form.consentText,{exact:true}).isChecked(),false,'Material change requires renewed consent');
  await member.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  assert.ok(await member.locator('.pss-error').innerText().then(text=>text.includes('tanda tangan')),'Old signature cannot authorize a refreshed review');
  const renewedPad=member.locator('canvas');await renewedPad.scrollIntoViewIfNeeded();const renewed=await renewedPad.boundingBox();
  await member.mouse.move(renewed.x+renewed.width*.12,renewed.y+renewed.height*.6);await member.mouse.down();
  for(const [x,y] of [[.25,.2],[.4,.7],[.6,.35],[.8,.65]])await member.mouse.move(renewed.x+renewed.width*x,renewed.y+renewed.height*y,{steps:5});
  await member.mouse.up();await member.getByLabel(form.consentText,{exact:true}).check();
  await member.getByRole('button',{name:'Tinjau pengajuan',exact:true}).click();
  const attempts=[];
  await member.route('**/api/public/simpanan-sukarela/submissions',async route=>{
    attempts.push(await parsedSubmission(route.request()));
    if(attempts.length===1){
      const response=await route.fetch();
      assert.ok(response.ok(),'The initial real submission must be accepted.');
      lostResponseReference=(await response.json()).reference;
      await route.abort('connectionreset');
    }else await route.continue();
  });
  await member.getByRole('button',{name:'Kirim pengajuan',exact:true}).click();
  await member.getByRole('button',{name:'Coba kirim kembali',exact:true}).waitFor();
  await member.locator('.pss-error[role=alert]').waitFor();
  assert.ok(await member.getByRole('button',{name:'Ubah isian',exact:true}).isDisabled(),'Uncertain submission must preserve the exact frozen request.');
  await member.getByRole('button',{name:'Coba kirim kembali',exact:true}).click();
  await member.getByRole('heading',{name:'Pengajuan telah tercatat',exact:true}).waitFor();
  assert.equal(attempts.length,2);
  assert.ok(attempts[0].key===attempts[1].key,'Idempotency key must remain identical.');
  assert.ok(attempts[0].signature===attempts[1].signature,'Signature bytes must remain identical.');
  assert.equal(attempts[0].signatureType,'image/png');assert.equal(attempts[0].consent,'true');
  applicationReference=await member.locator('.pss-receipt dd').first().innerText();
  assert.ok(applicationReference===lostResponseReference,'Retry must return the original recorded application.');
  for(let attempt=0;attempt<20 && !await member.getByRole('button',{name:'Unduh bukti PDF',exact:true}).count();attempt++){
    await member.getByRole('button',{name:'Perbarui status bukti',exact:true}).click();await member.waitForTimeout(300);
  }
  const downloadPromise=member.waitForEvent('download');
  await member.getByRole('button',{name:'Unduh bukti PDF',exact:true}).click();
  const download=await downloadPromise;
  const pdfPath=join(output,'synthetic-member-receipt.pdf');await download.saveAs(pdfPath);
  assert.ok((await readFile(pdfPath)).subarray(0,5).toString()==='%PDF-','Receipt download must contain a real PDF.');
  await screenshot(member,'member-receipt-desktop.png');
  const storage=await member.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}));
  assert.equal(storage.local.length,0);assert.equal(storage.session.length,0);

  console.log('4. Operator application visibility, consumed-link recovery and revoked-link rejection');
  await operator.getByRole('button',{name:'Perbarui',exact:true}).click();
  const row=operator.getByRole('row').filter({hasText:applicationReference});await row.waitFor();
  assert.equal(await row.count(),1,'One application must exist after the retry.');
  await screenshot(operator,'operator-applications-desktop.png',[operator.getByLabel('Kunci operator local staging'),operator.getByLabel('Tautan privat anggota')]);
  const reopened=await memberContext.newPage();await privateGoto(reopened,privateUrl);
  await reopened.getByRole('heading',{name:'Tautan telah digunakan',exact:true}).waitFor();
  assert.ok(new URL(reopened.url()).hash==='','Consumed private URL must also be scrubbed.');
  assert.equal(await reopened.getByRole('button',{name:'Verifikasi untuk melihat bukti',exact:true}).count(),1);
  await screenshot(reopened,'member-consumed-desktop.png');
  const memberDataResponse=await operatorContext.request.get(`${base}/api/kosipa/public-savings-links/members?query=${encodeURIComponent(revokeMember)}`,{headers:operatorHeaders});
  assert.ok(memberDataResponse.ok(),'Synthetic revoke member query must succeed.');
  const secondMember=(await memberDataResponse.json()).members[0];assert.ok(secondMember,'Second synthetic member required.');
  const secondLinkResponse=await operatorContext.request.post(`${base}/api/kosipa/public-savings-links`,{headers:operatorHeaders,data:{memberRef:secondMember.memberRef}});
  assert.ok(secondLinkResponse.ok(),'Synthetic revoke link must be issued.');
  const secondLink=await secondLinkResponse.json();
  const revokeResponse=await operatorContext.request.post(`${base}/api/kosipa/public-savings-links/${encodeURIComponent(secondLink.linkRef)}/revoke`,{headers:operatorHeaders,data:{reason:'Synthetic browser acceptance revoke'}});
  assert.ok(revokeResponse.ok(),'Revoke must succeed.');
  await privateGoto(reopened,secondLink.url);
  await reopened.getByRole('heading',{name:'Tautan telah dinonaktifkan',exact:true}).waitFor();
  await screenshot(reopened,'member-revoked-desktop.png');
  assert.equal(browserErrors.length,0,'No browser runtime errors.');assert.equal(externalRequests.length,0,'No external resources may load.');
  await writeFile(join(output,'results.json'),JSON.stringify({scope:'LOCAL_SYNTHETIC_REAL_HTTP_BROWSER',passed:true,checks:['invalid-link','operator-key','issue-link','fragment-scrub','private-otp-capture','mobile-validation-focus','unchecked-consent','drawn-png-signature','responsive-320-390-768-1440-720','review-back','stale-review-renewed-consent-signature','lost-response-exact-retry','one-application','real-pdf','empty-browser-storage','operator-visibility','consumed-recovery-entry','revoked-link'],applicationReference,browserErrors:0,externalRequests:0},null,2),{mode:0o600});
  await memberContext.close();await operatorContext.close();
  console.log('PASS: real local synthetic browser checks; private values redacted.');
}catch(error){
  // Playwright diagnostics can contain a private navigation URL, so redact fragments and operator keys before reporting.
  let safe=String(error?.stack || error).replace(/#token=[^\s"'<>]+/g,'#token=[REDACTED]');
  for(const secret of [...secrets].sort((a,b)=>b.length-a.length))safe=safe.replaceAll(secret,'[REDACTED]');
  throw new Error(safe);
}finally{await browser.close();}
