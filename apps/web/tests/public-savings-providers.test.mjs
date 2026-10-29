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
