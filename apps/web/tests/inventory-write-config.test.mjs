import assert from 'node:assert/strict';
import test from 'node:test';
const mod=await import('../src/infrastructure/db/prisma-inventory-write.ts').catch(()=>null);
const env={INVENTORY_WRITES_ENABLED:'1',POS_WRITE_DATABASE:'kkisi_staging',DATABASE_URL:'mysql://reader:p@127.0.0.1:3306/kkisi_staging',DATABASE_URL_WRITE:'mysql://checkout:p@127.0.0.1:3306/kkisi_staging',DATABASE_URL_REGISTER_WRITE:'mysql://register:p@127.0.0.1:3306/kkisi_staging',DATABASE_URL_INVENTORY_WRITE:'mysql://inventory:p@127.0.0.1:3306/kkisi_staging'};
test('inventory writer requires explicit local staging and its own credential',()=>{
 assert.ok(mod?.validateInventoryWriteConfig,'inventory writer validator exists');
 assert.match(mod.validateInventoryWriteConfig(env),/inventory/);
 for(const change of [{INVENTORY_WRITES_ENABLED:'0'},{DATABASE_URL_INVENTORY_WRITE:undefined},{POS_WRITE_DATABASE:'production'},{DATABASE_URL_INVENTORY_WRITE:'mysql://inventory:p@remote.test/kkisi_staging'},{DATABASE_URL_INVENTORY_WRITE:'mysql://inventory:p@127.0.0.1:3307/kkisi_staging'},{DATABASE_URL_INVENTORY_WRITE:'mysql://inventory:p@127.0.0.1:3306/kkisi_other_staging'}])assert.throws(()=>mod.validateInventoryWriteConfig({...env,...change}),{code:'WRITE_NOT_CONFIGURED'});
 for(const user of ['root','reader','checkout','register'])assert.throws(()=>mod.validateInventoryWriteConfig({...env,DATABASE_URL_INVENTORY_WRITE:`mysql://${user}:p@127.0.0.1:3306/kkisi_staging`}),{code:'WRITE_NOT_CONFIGURED'});
});
