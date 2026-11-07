import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLocalCaptureProvider,readLocalCaptures} from '../src/infrastructure/public-savings/providers.ts';
test('local provider is encrypted, idempotent and refuses deliverable destinations',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'pss-provider-'));
 const config={mode:'LOCAL_SYNTHETIC',encryptionKeyHex:'ab'.repeat(32)};
 try{
  const provider=createLocalCaptureProvider(config,directory);
  await provider.deliver({id:'test-1',kind:'OTP',destination:'member@example.invalid',code:'123456',expiresAt:Date.now()+300000});
  await provider.deliver({id:'test-1',kind:'OTP',destination:'member@example.invalid',code:'123456',expiresAt:Date.now()+300000});
  assert.equal((await readLocalCaptures(config,directory)).length,1);
  assert.equal((await readFile(path.join(directory,'test-1.capture'),'utf8')).includes('123456'),false);
  await assert.rejects(provider.deliver({id:'test-2',kind:'OTP',destination:'real@example.com',code:'123456',expiresAt:Date.now()+1}),/CAPTURE_DESTINATION_INVALID/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('replica UAT captures existing contact locally with explicit opt-in and no external delivery',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'pss-replica-provider-'));
 const config={mode:'LOCAL_REPLICA_UAT',encryptionKeyHex:'ab'.repeat(32)};
 const prior=process.env.PSS_LOCAL_REPLICA_UAT,priorApp=process.env.APP_ENV;
 const message={id:'replica-1',kind:'OTP',destination:'existing.member@example.com',code:'123456',expiresAt:Date.now()+300000};
 try{
  process.env.PSS_LOCAL_REPLICA_UAT='1';delete process.env.APP_ENV;
  await createLocalCaptureProvider(config,directory).deliver(message);
  assert.deepEqual(await readLocalCaptures(config,directory),[message]);
  assert.equal((await readFile(path.join(directory,'replica-1.capture'),'utf8')).includes('123456'),false);
  delete process.env.PSS_LOCAL_REPLICA_UAT;
  await assert.rejects(createLocalCaptureProvider(config,directory).deliver({...message,id:'replica-2'}),/CAPTURE_DESTINATION_INVALID/);
  await assert.rejects(readLocalCaptures(config,directory),/ACTIVATION_BLOCKED/);
  process.env.PSS_LOCAL_REPLICA_UAT='1';process.env.APP_ENV='production';
  await assert.rejects(createLocalCaptureProvider(config,directory).deliver({...message,id:'replica-3'}),/CAPTURE_DESTINATION_INVALID/);
 }finally{if(prior===undefined)delete process.env.PSS_LOCAL_REPLICA_UAT;else process.env.PSS_LOCAL_REPLICA_UAT=prior;if(priorApp===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=priorApp;await rm(directory,{recursive:true,force:true});}
});
