import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecoveryTarget, runRecovery } from '../../../integration/public-savings/backup-recovery.mjs';
test('recovery refuses the live fixture and arbitrary database targets',()=>{
 for(const target of ['kkisi_public_savings','mysql','production','kkisi_public_savings_recovery;DROP DATABASE mysql']) assert.throws(()=>validateRecoveryTarget(target),/RECOVERY_TARGET_REFUSED/);
 assert.equal(validateRecoveryTarget('kkisi_public_savings_recovery'),'kkisi_public_savings_recovery');
});
test('encrypted synthetic backup restores SQL rows, artifact bytes and key relationship into a sibling database',{skip:process.env.PSS_RECOVERY_TEST!=='1'},async()=>{
 const result=await runRecovery();
 assert.equal(result.mode,'LOCAL_SYNTHETIC');assert.equal(result.rowsVerified,true);assert.equal(result.artifactsVerified,true);assert.equal(result.keyRelationshipVerified,true);assert.ok(result.tableCount>10);assert.equal(result.productionRestorationVerified,false);
});
