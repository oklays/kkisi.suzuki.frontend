import assert from 'node:assert/strict';
import test from 'node:test';
import {createPublicSavingsService} from '../src/infrastructure/public-savings/service.ts';
const enabled=process.env.PSS_REPLICA_TEST==='1';
test('explicit local replica service accepts only its matching installation sentinel',{skip:!enabled},async()=>{
 const {loadReplicaConfig}=await import('../../../integration/public-savings/replica-stage.mjs');
 const config=await loadReplicaConfig();const service=createPublicSavingsService(config);
 try{assert.ok(Array.isArray((await service.listLinks()).links));}finally{await service.close();}
 const wrong=createPublicSavingsService({...config,installationId:'0'.repeat(32)});
 try{await assert.rejects(()=>wrong.listLinks(),e=>e.code==='ACTIVATION_BLOCKED');}finally{await wrong.close();}
});
