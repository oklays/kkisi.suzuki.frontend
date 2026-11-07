import test from 'node:test';
import assert from 'node:assert/strict';
import {businessDaysElapsed,retentionCutoffs} from '../../../integration/public-savings/operations.mjs';
test('operational escalation counts Jakarta weekdays rather than elapsed weekend hours',()=>{
 assert.equal(businessDaysElapsed(Date.parse('2026-10-23T10:00:00+07:00'),Date.parse('2026-10-26T10:00:00+07:00')),1);
 assert.equal(businessDaysElapsed(Date.parse('2026-10-23T10:00:00+07:00'),Date.parse('2026-10-27T10:00:00+07:00')),2);
 assert.equal(businessDaysElapsed(Date.now(),Date.now()-1000),0);
});
test('security cleanup is bounded and financial evidence deletion has no automatic deadline',()=>{
 const now=Date.now(),cutoffs=retentionCutoffs(now);
 assert.equal(cutoffs.tombstoneBefore,now-90*86400000);assert.equal(cutoffs.securityLogBefore,now-180*86400000);
 assert.equal(cutoffs.deleteFinancialEvidence,false);
 assert.throws(()=>retentionCutoffs(Number.NaN));
});
test('OTP capture projection sorts latest expiry first, resolves ties, and limits output safely',async()=>{
 const {projectOtpCaptures}=await import('../../../integration/public-savings/operations.mjs');
 const captures=[{kind:'OTP',id:'z',code:'synthetic-old',expiresAt:100,destination:'private'},{kind:'NOTICE',id:'notice',expiresAt:999},{kind:'OTP',id:'b',code:'synthetic-b',expiresAt:200,secret:'private'},{kind:'OTP',id:'a',code:'synthetic-a',expiresAt:200}];
 const expected=[{challengeRef:'a',code:'synthetic-a',expiresAt:200},{challengeRef:'b',code:'synthetic-b',expiresAt:200},{challengeRef:'z',code:'synthetic-old',expiresAt:100}];
 assert.deepEqual(projectOtpCaptures(captures),expected);
 assert.deepEqual(projectOtpCaptures(captures,{latest:true}),expected.slice(0,1));
 assert.deepEqual(projectOtpCaptures([],{latest:true}),[]);
 assert.equal(captures[0].id,'z');
});
