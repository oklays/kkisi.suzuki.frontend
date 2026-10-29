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
