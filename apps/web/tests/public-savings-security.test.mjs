import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStagingConfig, sealEvidence, openEvidence, keyedDigest, secretMatches } from '../src/infrastructure/public-savings/security.ts';

const config = {mode:'LOCAL_SYNTHETIC',host:'127.0.0.1',port:3318,database:'kkisi_public_savings',installationId:'a'.repeat(32),app:{user:'pss_app',password:'synthetic-test-password'},legacy:{user:'pss_legacy',password:'other-synthetic-password'},encryptionKeyHex:'ab'.repeat(32),hashKey:'cd'.repeat(32),operatorKey:'ef'.repeat(32)};
test('staging configuration refuses production destinations before opening any connection',()=>{
 assert.equal(validateStagingConfig(config).database,'kkisi_public_savings');
 for(const override of [{mode:'PRODUCTION'},{host:'db.example.com'},{database:'production'},{port:3306},{app:{user:'root',password:'x'}},{encryptionKeyHex:'x'},{operatorKey:''}]) assert.throws(()=>validateStagingConfig({...config,...override}),/STAGING_CONFIGURATION_INVALID/);
});
test('encrypted immutable evidence authenticates ciphertext and resource identity',()=>{
 const cipher=sealEvidence({amount:'10000',name:'SYNTHETIC MEMBER'},config.encryptionKeyHex,'reference-a');
 assert.equal(cipher.includes('SYNTHETIC'),false);
 assert.deepEqual(openEvidence(cipher,config.encryptionKeyHex,'reference-a'),{amount:'10000',name:'SYNTHETIC MEMBER'});
 assert.throws(()=>openEvidence(cipher,config.encryptionKeyHex,'reference-b'));
 assert.throws(()=>openEvidence(cipher.slice(0,-2)+'aa',config.encryptionKeyHex,'reference-a'));
});
test('token/code digests are purpose bound and comparison rejects malformed values',()=>{
 const token=keyedDigest(config.hashKey,'token','secret');
 assert.match(token,/^[0-9a-f]{64}$/);
 assert.notEqual(token,keyedDigest(config.hashKey,'otp','secret'));
 assert.equal(secretMatches(token,token),true);
 assert.equal(secretMatches(token,'x'),false);
});

test('replica UAT config requires separate opt-in and exact local database accounts',()=>{
 const prior=process.env.PSS_LOCAL_REPLICA_UAT, priorApp=process.env.APP_ENV;
 const replica={...config,mode:'LOCAL_REPLICA_UAT',port:3307,database:'kkisi_staging',app:{...config.app,user:'pss_replica_public'},legacy:{...config.legacy,user:'pss_replica_legacy'}};
 try{
  delete process.env.PSS_LOCAL_REPLICA_UAT;
  assert.throws(()=>validateStagingConfig(replica),/STAGING_CONFIGURATION_INVALID/);
  process.env.PSS_LOCAL_REPLICA_UAT='1';delete process.env.APP_ENV;
  assert.equal(validateStagingConfig(replica).mode,'LOCAL_REPLICA_UAT');
  for(const patch of [{host:'localhost'},{host:'remote.invalid'},{port:3318},{database:'production'},{database:'kkisi_public_savings'},{app:config.app},{legacy:config.legacy},{encryptionKeyHex:'a'.repeat(63)},{hashKey:'x'.repeat(64)},{mode:'PRODUCTION'}])assert.throws(()=>validateStagingConfig({...replica,...patch}),/STAGING_CONFIGURATION_INVALID/);
  process.env.APP_ENV='production';assert.throws(()=>validateStagingConfig(replica),/STAGING_CONFIGURATION_INVALID/);
 }finally{if(prior===undefined)delete process.env.PSS_LOCAL_REPLICA_UAT;else process.env.PSS_LOCAL_REPLICA_UAT=prior;if(priorApp===undefined)delete process.env.APP_ENV;else process.env.APP_ENV=priorApp;}
});


test('replica flag is independent from the existing staging and console gates and permits a local production build',async()=>{
 const {publicSavingsReplicaUatEnabled,publicSavingsStagingEnabled,publicSavingsConsoleEnabled}=await import('../src/features/public-savings/flags.ts');
 assert.equal(publicSavingsReplicaUatEnabled({}),false);
 assert.equal(publicSavingsReplicaUatEnabled({PSS_LOCAL_REPLICA_UAT:'true'}),false);
 assert.equal(publicSavingsReplicaUatEnabled({PSS_LOCAL_REPLICA_UAT:'1',NODE_ENV:'production',APP_ENV:'local'}),true);
 assert.equal(publicSavingsReplicaUatEnabled({PSS_LOCAL_REPLICA_UAT:'1',APP_ENV:'production'}),false);
 assert.equal(publicSavingsStagingEnabled({PSS_LOCAL_REPLICA_UAT:'1'}),false);
 assert.equal(publicSavingsConsoleEnabled({PSS_LOCAL_STAGING:'1',PSS_LOCAL_REPLICA_UAT:'1'}),false);
 assert.equal(publicSavingsConsoleEnabled({PSS_LOCAL_STAGING:'1',PSS_OPERATOR_AUTH:'CONSOLE'}),true);
});
