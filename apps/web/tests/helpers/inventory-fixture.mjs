import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {businessDates} from '@koperasi/domain/pos/sale';
export const inventoryNow=new Date();
export const inventoryDay=businessDates(inventoryNow).day;
const ddl=['pos-schema.sql','inventory-schema.sql'].map(name=>readFileSync(new URL('../fixtures/'+name,import.meta.url),'utf8')).join('\n');
const tables=[...ddl.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\)/g)].filter(table=>table[1]!=='_pos_test_marker');
export function assertInventoryTarget(target){const url=new URL(target);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3310');assert.equal(url.pathname,'/kkisi_pos_staging');}
export async function assertInventoryMarker(db){assert.equal((await db.$queryRaw`SELECT marker FROM _pos_test_marker WHERE id=1`)[0]?.marker,'kkisi-pos-disposable-synthetic');}
export async function insertInventoryFixture(db,table,overrides){
 const block=tables.find(value=>value[1]===table)?.[2];assert.ok(block,'allowlisted synthetic table');const values={};
 for(const line of block.split('\n')){const match=/^\s*`([^`]+)` (\w+)(?:\([^)]+\))?(.*)/.exec(line);if(!match)continue;const[,name,kind,rest]=match;
  if(name==='id'||!rest.includes('NOT NULL')||/DEFAULT|AUTO_INCREMENT/.test(rest))continue;
  values[name]=['date','datetime','timestamp'].includes(kind)?inventoryDay+(kind==='date'?'':' 12:00:00'):['varchar','text','enum'].includes(kind)?(kind==='enum'?(table==='db_stockentry'?'Stok Awal':'Inclusive'):''):0;
 }
 Object.assign(values,overrides);const fields=Object.keys(values);
 await db.$executeRawUnsafe(`INSERT INTO \`${table}\` (${fields.map(field=>'`'+field+'`').join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,...Object.values(values));
}
export async function resetInventoryFixture(db){
 await assertInventoryMarker(db);
 for(const table of tables)await db.$executeRawUnsafe('DELETE FROM `'+table[1]+'`');
 for(const id of [1,2]){
  await insertInventoryFixture(db,'db_company',{id,company_name:`Synthetic ${id}`,sales_init:`S${id}`,status:1});
  await insertInventoryFixture(db,'db_users',{id,username:`synthetic${id}`,fullname:`Synthetic ${id}`,role_id:4,company_id:id,status:1});
  await insertInventoryFixture(db,'db_kasir',{id,company_id:id,no_kasir:`K${id}`,status:1});
  await insertInventoryFixture(db,'db_buka_kasir',{id,noref:`KRS-SYNTH-${id}`,id_kasir:id,user_id:id,company_id:id,status:1,tgl_buka:inventoryDay+' 08:00:00'});
  await insertInventoryFixture(db,'db_items',{id:id+10,company_id:id,item_name:`SYNTHETIC ITEM ${id}`,item_code:`SYNTH-${id}`,custom_barcode:`ITEM${id}`,custom_barcode_pack:`ITEM${id}PACK`,sales_price:10000,purchase_price:4000,discount:500,stock:20,type:'Produk Jadi',status:1,status_so:0});
 }
 for(const id of [2,4])await insertInventoryFixture(db,'db_roles',{id,role_name:`Synthetic ${id}`,status:1});
 for(const role_id of [2,4])for(const permissions of ['sales_add','inventory_so','inventory_view'])await insertInventoryFixture(db,'db_permissions',{role_id,permissions});
 await insertInventoryFixture(db,'m_anggota',{id:7,nik_kar:'NIK-7',id_card:'CARD-7',nama_kar:'Synthetic Member',status_anggota:'AKTIVE',status_karyawan:'TETAP',limit_toko:50000,gaji_minus:0});
 await insertInventoryFixture(db,'db_users',{id:3,username:'syntheticadmin',fullname:'Synthetic Admin',role_id:2,company_id:1,status:1});
}
