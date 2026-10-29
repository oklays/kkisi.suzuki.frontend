import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRuntime} from './runtime.mjs';
const enabled=process.env.PSS_LEGACY_RUNTIME==='1';
test('actual CI2 controller/model methods on isolated synthetic SQL with explicit framework boundary', {skip:!enabled,timeout:180000}, async t=>{
 const runtime=await prepareRuntime();
 try{
  for(const variant of ['mobile','simpanan']){
   await t.test(`${variant} original existing-master approval runs actual PHP and commits all three effects`,async()=>{
    const result=await runtime.run({variant,scenario:'approve'});assert.equal(result.phpVersion,'5.6.40');assert.equal(result.header,'APPROVED');assert.equal(result.deduction,150000);assert.equal(result.active,150000);assert.equal(result.statementWrites,3);
   });
   await t.test(`${variant} original late header failure leaves earlier autocommit effects`,async()=>{
    const result=await runtime.run({variant,scenario:'late-failure'});assert.equal(result.header,'OPEN');assert.equal(result.deduction,150000);assert.equal(result.active,150000);assert.equal(result.failure,'SQL_FAILURE');
   });
   await t.test(`${variant} original reject changes only header`,async()=>{
    const result=await runtime.run({variant,scenario:'reject'});assert.equal(result.header,'REJECTED');assert.equal(result.deduction,100000);assert.equal(result.active,100000);
   });
   await t.test(`${variant} actual list/model includes PUBLIC reference and source-specific action links`,async()=>{
    const result=await runtime.run({variant,scenario:'list'});assert.equal(result.list.data[0][1],result.reference);if(variant==='mobile')assert.match(result.list.data[0][11],/print_pengajuan_pdf/);else assert.doesNotMatch(result.list.data[0][11],/print_pengajuan_pdf/);assert.equal(result.list.recordsFiltered,1);
   });
  }
  for(const scenario of ['guarded-approve','guarded-reject','guarded-proof-missing','guarded-late-failure'])await t.test(`actual source entry hook ${scenario} uses controlled SQL boundary`,async()=>{
   const result=await runtime.run({variant:'mobile',scenario});
   assert.equal(result.header,scenario==='guarded-approve'?'APPROVED':scenario==='guarded-reject'?'REJECTED':'OPEN');
   assert.equal(result.deduction,scenario==='guarded-approve'?150000:100000);
   assert.equal(result.active,scenario==='guarded-approve'?150000:0);
   if(scenario.includes('missing')||scenario.includes('failure'))assert.equal(result.failure,'SQL_FAILURE');
  });
  // Migration 001 installed; unmodified CI2 runs as a deployed-style broad DML principal. Only the recovered
  // production DDL has the m_anggota columns CI2 reads, so these cases are meaningless on the synthetic schema.
  const installed=process.env.PSS_LEGACY_ACTUAL_SCHEMA==='1'?{}:{skip:'requires PSS_LEGACY_ACTUAL_SCHEMA=1 (recovered production DDL)'};
  for(const scenario of ['installed-public-unmodified','installed-public-unmodified-new'])await t.test(`unmodified CI2 cannot process a PUBLIC request: ${scenario} fails before any financial effect`,installed,async()=>{
   const result=await runtime.run({variant:'mobile',scenario});
   assert.equal(result.failure,'SQL_FAILURE');assert.equal(result.signal,'CONTROLLED_LEGACY_COMMAND_REQUIRED');assert.equal(result.header,'OPEN');assert.equal(result.deduction,100000);
   assert.equal(result.active,scenario.endsWith('-new')?0:100000);assert.equal(result.reservation,result.reference);
  });
  for(const variant of ['mobile','simpanan']){
   await t.test(`${variant} unmodified CI2 still approves an ordinary enrolled mobile request and keeps the B-05 reservation`,installed,async()=>{
    const result=await runtime.run({variant,scenario:'installed-legacy-approve'});
    assert.equal(result.failure,null);assert.equal(result.header,'APPROVED');assert.equal(result.deduction,150000);assert.equal(result.active,150000);assert.equal(result.reservation,result.reference);
   });
   await t.test(`${variant} unmodified CI2 rejection of an ordinary request releases the reservation`,installed,async()=>{
    const result=await runtime.run({variant,scenario:'installed-legacy-reject'});
    assert.equal(result.failure,null);assert.equal(result.header,'REJECTED');assert.equal(result.deduction,100000);assert.equal(result.reservation,null);
   });
  }
  await t.test('entry hook with broad principal routes PUBLIC approval through the controlled command',installed,async()=>{
   const result=await runtime.run({variant:'mobile',scenario:'installed-hook-approve'});
   assert.equal(result.failure,null);assert.equal(result.header,'APPROVED');assert.equal(result.deduction,150000);assert.equal(result.active,150000);assert.equal(result.reservation,result.reference);
  });
  await t.test('actual print controller projects mutable profile signature instead of submitted private reference',async()=>{
   const result=await runtime.run({variant:'mobile',scenario:'print'});assert.equal(result.view,'simpanan/print_pengajuan_simpanan_pdf');assert.equal(result.printData.foto_ttd,'SYNTHETIC_PROFILE_SIGNATURE.png');assert.notEqual(result.printData.foto_ttd,result.privateSignature);
  });
 }finally{await runtime.close();}
});
