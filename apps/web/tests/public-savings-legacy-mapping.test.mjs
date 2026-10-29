import test from 'node:test';
import assert from 'node:assert/strict';

const mapping = await import('../src/infrastructure/public-savings/legacy-mapping.ts');
const reference = 'PSS0123456789abcdef0123456789abcdef00000';
const snapshot = {contractVersion:'pss-snapshot/v2',policyVersion:'KKISI-PSS-2026-V1',memberRef:'123',sectionId:'7',savingsType:'SIMPANAN SUKARELA',originalDeduction:'100000.00',requestedAmount:'150000',requestedPeriod:{year:2026,month:11},effectivePeriodCondition:'FIRST_ELIGIBLE_PAYROLL_CYCLE_AFTER_APPROVAL',consentTextVersion:'v1',formVersion:'v1',consent:true,submittedAtEpochMs:1793206800000,verification:{proofRef:'proof-1',contactVersion:'v1',method:'EMAIL_CHANNEL_POSSESSION'},signature:{format:'PNG',decodedBytes:100,width:20,height:20,contentDigest:'sha256:fixture',storageRef:'signature/private-1'}};
const member = {id:'123',nik:'0012345678',name:'SYNTH MEMBER',sectionId:'7',sectionName:'SYNTH SECTION',branch:'SYNTH BRANCH',phone:null,groupCode:'SYNTH GROUP'};
const valid = () => ({reference,member:{...member},snapshot:structuredClone(snapshot),signatureRef:'signature/private-1',createdAt:'2026-10-29 12:30:01',actor:'public-savings'});

test('maps one complete OPEN legacy header with exact identity and explicit defaults', () => {
  assert.equal(typeof mapping.mapLegacySubmission,'function');
  const result=mapping.mapLegacySubmission(valid());
  assert.deepEqual(result,{ok:true,value:{doc_no:reference,doc_date:'2026-10-29',doc_status:'OPEN',jenis_simpanan:'SIMPANAN SUKARELA',nik_kar:'0012345678',nama:'SYNTH MEMBER',phone:null,bank:null,norek:null,bagian:'SYNTH SECTION',lokasi:'SYNTH BRANCH',potongan_old:'100000',potongan:'150000',awal_potong_bulan:'11',awal_potong_tahun:'2026',remarks:null,posting_date:null,created_at:'2026-10-29 12:30:01',cd_usr:'public-savings',updated_at:'2026-10-29 12:30:01',ud_usr:'public-savings',status_notif:0,ttd:'signature/private-1',is_mobile:0}});
});

test('verified first enrollment retains null; no missing amount is inferred as zero', () => {
  const input=valid(); input.snapshot.originalDeduction=null;
  assert.equal(mapping.mapLegacySubmission(input).value.potongan_old,null);
  delete input.snapshot.originalDeduction;
  assert.equal(mapping.mapLegacySubmission(input).ok,false);
});

test('rejects incompatible identity, column lengths and text instead of truncating data', () => {
  for (const patch of [{nik:'00012345678'},{nik:123},{nik:' 012345678'},{name:'x'.repeat(51)},{name:'Anggota 😀'},{sectionName:'x'.repeat(101)},{branch:'x'.repeat(101)},{phone:'x'.repeat(51)},{groupCode:'x'.repeat(51)},{name:'bad\u0000name'}]) {
    const input=valid(); Object.assign(input.member,patch);
    assert.equal(mapping.mapLegacySubmission(input).ok,false,JSON.stringify(patch));
  }
  const input=valid();input.member.name='André';assert.equal(mapping.mapLegacySubmission(input).ok,true);
});

test('rejects wrong types, fractional loss, numeric overflow, mismatched binding and invalid period', () => {
  for(const patch of [{requestedAmount:150000},{requestedAmount:'0150000'},{requestedAmount:'1e5'},{requestedAmount:'9007199254740992'},{originalDeduction:'100000.50'},{originalDeduction:0},{memberRef:'124'},{sectionId:'8'},{savingsType:'SIMPANAN WAJIB'},{requestedPeriod:{year:2026,month:13}},{requestedPeriod:{year:10000,month:1}},{requestedPeriod:{year:'2026',month:11}}]) {
    const input=valid();Object.assign(input.snapshot,patch);assert.equal(mapping.mapLegacySubmission(input).ok,false,JSON.stringify(patch));
  }
  for(const patch of [{createdAt:'2026-02-30 12:00:00'},{createdAt:'2026-10-29T12:00:00Z'},{actor:'x'.repeat(51)},{signatureRef:'https://example.com/private.png'},{signatureRef:'x'.repeat(101)},{signatureRef:'../private'},{reference:'x'.repeat(51)}]) assert.equal(mapping.mapLegacySubmission({...valid(),...patch}).ok,false,JSON.stringify(patch));
});

test('reference namespace never contributes a nonzero RIGHT5 suffix to Laravel numbering', () => {
  assert.equal(typeof mapping.legacyPublicReference,'function');
  assert.equal(mapping.legacyPublicReference('0123456789abcdef0123456789abcdef'),reference);
  assert.equal(Number(reference.slice(-5)),0);
  assert.ok(reference.length<=50);
  assert.throws(()=>mapping.legacyPublicReference('not-128-bit-hex'));
  assert.equal(mapping.mapLegacySubmission({...valid(),reference:'PSS12300001'}).ok,false);
});

test('APPROVED remains blocking until independent posting confirmation', () => {
  assert.equal(typeof mapping.mapLegacyRequestState,'function');
  for (const [raw,state] of [['OPEN','OPEN'],['POSTING','POSTING'],['APPROVED','APPROVED_NOT_POSTED'],['REJECTED','REJECTED'],['ELSE_LABEL_REJECTED','UNKNOWN'],[null,'UNKNOWN'],['POSTED_CONFIRMED','UNKNOWN'],['CANCELLED','UNKNOWN']]) assert.equal(mapping.mapLegacyRequestState(raw),state);
  assert.equal(mapping.mapLegacyRequestState('APPROVED',{postedConfirmed:true}),'POSTED_CONFIRMED');
  assert.equal(mapping.mapLegacyRequestState('OPEN',{postedConfirmed:true}),'UNKNOWN');
});
