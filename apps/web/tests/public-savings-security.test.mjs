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
