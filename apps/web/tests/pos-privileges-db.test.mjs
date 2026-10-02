import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaClient} from '@prisma/client';
const enabled=process.env.POS_PRIVILEGES_DB_TEST==='1';
test('synthetic POS reader, writer and auth accounts enforce separate minimum privileges',{skip:!enabled},async()=>{
 const urls=[process.env.DATABASE_URL,process.env.DATABASE_URL_WRITE,process.env.DATABASE_URL_AUTH];
 for(const raw of urls){const url=new URL(raw);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'3310');assert.ok(['/kkisi_pos_staging','/kkisi_pos_auth_staging'].includes(url.pathname));}
 const [reader,writer,auth]=urls.map(url=>new PrismaClient({datasources:{db:{url}}}));
 const denied=e=>e.code==='P2010'&&['1142','1044'].includes(String(e.meta?.code));
 try{
  await reader.$queryRaw`SELECT id FROM db_items WHERE id=-1`;
  await writer.$queryRaw`SELECT id FROM db_items WHERE id=-1`;
  await auth.$queryRaw`SELECT sid_hash FROM auth_session WHERE user_id=-1`;
  await assert.rejects(reader.$executeRaw`UPDATE db_items SET stock=stock WHERE id=-1`,denied);
  await assert.rejects(writer.$executeRaw`UPDATE db_users SET status=status WHERE id=-1`,denied);
  await assert.rejects(writer.$executeRaw`DELETE FROM db_sales WHERE id=-1`,denied);
  await assert.rejects(auth.$queryRaw`SELECT id FROM kkisi_pos_staging.db_items WHERE id=-1`,denied);
  await assert.rejects(writer.$queryRaw`SELECT sid_hash FROM kkisi_pos_auth_staging.auth_session WHERE user_id=-1`,denied);
 }finally{await Promise.all([reader,writer,auth].map(db=>db.$disconnect()));}
});
