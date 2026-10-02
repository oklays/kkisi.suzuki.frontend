import assert from 'node:assert/strict';
import test from 'node:test';
const config=await import('../src/infrastructure/db/prisma-pos-write.ts').catch(()=>null);
test('legacy writes require an explicit local staging database, independent account and opt-in',()=>{
 assert.ok(config?.validatePosWriteConfig,'isolated writer configuration is implemented');
 const env={POS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_pos_staging',DATABASE_URL:'mysql://reader:p@127.0.0.1:3310/kkisi_pos_staging',DATABASE_URL_WRITE:'mysql://pos_writer:p@127.0.0.1:3310/kkisi_pos_staging'};
 assert.equal(config.validatePosWriteConfig(env),env.DATABASE_URL_WRITE);
 for(const over of [{POS_WRITES_ENABLED:'0'},{POS_WRITE_DATABASE:'production'},{DATABASE_URL_WRITE:'mysql://pos_writer:p@example.com/kkisi_pos_staging'},{DATABASE_URL_WRITE:'mysql://reader:p@127.0.0.1:3310/kkisi_pos_staging'},{DATABASE_URL_WRITE:'mysql://root:p@127.0.0.1:3310/kkisi_pos_staging'},{DATABASE_URL_WRITE:'mysql://pos_writer:p@127.0.0.1:3307/kkisi_pos_staging'}])assert.throws(()=>config.validatePosWriteConfig({...env,...over}),e=>e.code==='WRITE_NOT_CONFIGURED');
});
test('percent-encoding cannot bypass forbidden root or shared read accounts',()=>{
 const env={POS_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_pos_staging',DATABASE_URL:'mysql://reader:p@127.0.0.1:3310/kkisi_pos_staging'};
 for(const user of ['%72oot','%72eader'])assert.throws(()=>config.validatePosWriteConfig({...env,DATABASE_URL_WRITE:`mysql://${user}:p@127.0.0.1:3310/kkisi_pos_staging`}),e=>e.code==='WRITE_NOT_CONFIGURED');
});
