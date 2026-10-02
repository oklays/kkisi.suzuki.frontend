// Seeds ONLY the disposable POS test container. Never reads private fixture files.
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
const url=new URL(process.env.POS_TEST_DATABASE_URL);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3310');assert.equal(url.pathname,'/kkisi_pos_staging');
const db=new PrismaClient({datasources:{db:{url:url.href}}});
try {
 assert.equal((await db.$queryRaw`SELECT marker FROM _pos_test_marker WHERE id=1`)[0]?.marker,'kkisi-pos-disposable-synthetic');
 const hash=bcrypt.hashSync('Synthetic-Pos-1',4).replace(/^\$2b\$/,'$2y$');
 await db.$executeRaw`UPDATE db_users SET password=${hash} WHERE id IN (1,2) AND username IN ('synthetic1','synthetic2')`;
 await db.$executeRaw`UPDATE db_items SET sales_price=10000, discount=500, item_name='SYNTHETIC ITEM', stock=20, category_id=NULL,custom_barcode_pack='ITEM1PACK' WHERE id IN (11,12)`;
 await db.$executeRaw`UPDATE m_anggota SET status_anggota='AKTIVE',status_karyawan='TETAP',limit_toko=50000,gaji_minus=0,tgl_keluar=NULL WHERE id=7`;
 await db.$executeRaw`UPDATE db_buka_kasir SET tgl_buka=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 HOUR),status=1 WHERE id IN (1,2)`;
 console.log('Synthetic browser identities ready; credentials not printed.');
}finally{await db.$disconnect();}
