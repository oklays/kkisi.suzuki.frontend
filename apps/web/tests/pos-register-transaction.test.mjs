import assert from 'node:assert/strict';
import test from 'node:test';
import {PrismaRegisterRepository} from '../src/infrastructure/repositories/prisma-register.repository.ts';
const ctx={companyId:1,userId:4};const now=new Date('2026-10-02T01:00:00Z');
function fake(rows=[]){let queries=[],writes=[];const tx={$queryRaw:async(s)=>{let sql=s.join('?');queries.push(sql);if(sql.includes('FROM db_company'))return[{id:1}];if(sql.includes('FROM db_users'))return[{id:4}];if(sql.includes('FROM db_kasir'))return[{id:1}];if(sql.includes('FROM db_buka_kasir'))return rows;if(sql.includes('LAST_INSERT_ID'))return[{id:23n}];throw Error(sql);},$executeRaw:async(s,...values)=>{writes.push({sql:s.join('?'),values});return 1;}};return{queries,writes,db:{$transaction:async(fn)=>fn(tx)}};}
test('open uses branch then user lock, global own-session check and insert ID reference with local timestamp',async()=>{const f=fake();assert.deepEqual(await new PrismaRegisterRepository(f.db).open(ctx,{idKasir:1,saldoAwal:0},now),{id:23,noref:'KRS-202610020023'});assert.match(f.queries[0],/db_company.*FOR UPDATE/);assert.match(f.queries[1],/db_users/);assert.match(f.queries[3],/b.user_id = \? AND b.status = 1/);assert.equal(f.writes[0].values[2],'2026-10-02 08:00:00');assert.equal(f.writes[1].values[0],'KRS-202610020023');});
test('open is idempotent and rejects stale, multiple, outside sessions without writes',async()=>{for(const [rows,code]of [[[{id:1,noref:'existing',company_id:1,opened_on:'2026-10-02',kasir_status:1}],null],[[{company_id:2}],'REGISTER_OPEN_OUTSIDE'],[[{company_id:1},{company_id:1}],'REGISTER_AMBIGUOUS'],[[{company_id:1,opened_on:'2026-10-01'}],'REGISTER_STALE']]){const f=fake(rows);const call=new PrismaRegisterRepository(f.db).open(ctx,{idKasir:1,saldoAwal:0},now);if(code)await assert.rejects(call,{code});else assert.deepEqual(await call,{id:1,noref:'existing'});assert.equal(f.writes.length,0);}});
import {Prisma} from '@prisma/client';
test('close locks ownership, totals only Final owned sales, preserves quotation and returns saved recap idempotently',async()=>{
 for(const status of [1,0]){
  const calls=[],writes=[];const tx={$queryRaw:async(s)=>{const sql=s.join('?');calls.push(sql);if(sql.includes('FROM db_company'))return[{id:1}];if(sql.includes('FROM db_users'))return[{username:'synthetic'}];if(sql.includes('FROM db_buka_kasir'))return[{id:12,id_kasir:1,noref:'KRS-test',status,saldo_awal:new Prisma.Decimal('100'),saldo_akhir:new Prisma.Decimal('175'),saldo_kredit:new Prisma.Decimal('50')}];if(sql.includes('FROM db_sales'))return[{cash:new Prisma.Decimal('75'),credit:new Prisma.Decimal('50'),discount:new Prisma.Decimal('5.25'),transaction_count:2n,unsupported:0n}];throw Error(sql);},$executeRaw:async(s,...values)=>{writes.push({sql:s.join('?'),values});return 1;}};
  const result=await new PrismaRegisterRepository({$transaction:fn=>fn(tx)}).close(ctx,12,now);
  assert.equal(result.saldoAkhir,'175.00');assert.equal(result.saldoKredit,'50.00');assert.equal(writes.length,status===1?1:0);
  assert.equal(result.transactionCount,2);assert.equal(result.discountTotal,'5.25');
  assert.match(calls[3],/COUNT\(\*\) AS transaction_count/);assert.match(calls[3],/SUM\(tot_discount_to_all_amt\)/);
  assert.match(calls[0],/db_company.*FOR UPDATE/);assert.match(calls[1],/db_users/);assert.match(calls[2],/b.user_id=\? AND b.company_id=\? FOR UPDATE/);
  if(status===1){assert.match(calls[3],/company_id=\? AND id_buka_kasir=\? AND sales_status='Final'/);assert.doesNotMatch(calls[3],/created_by=|id_kasir=/,'historical sessions can contain sales created by another cashier');assert.match(calls[3],/payment_type='Cash' THEN CAST\(grand_total AS DECIMAL\(18,2\)\)/);assert.match(writes[0].sql,/UPDATE db_buka_kasir/);assert.equal(writes[0].values[2],'2026-10-02 08:00:00');}
 }
});
test('close includes QRIS sales in summary without adding to saldoAkhir cash or saldoKredit', async () => {
  const calls = [];
  const tx = {
    $queryRaw: async (s) => {
      const sql = s.join('?');
      calls.push(sql);
      if (sql.includes('FROM db_company')) return [{ id: 1 }];
      if (sql.includes('FROM db_users')) return [{ username: 'synthetic' }];
      if (sql.includes('FROM db_buka_kasir')) return [{ id: 15, id_kasir: 1, noref: 'KRS-qris', status: 1, saldo_awal: new Prisma.Decimal('100.00'), saldo_akhir: null, saldo_kredit: new Prisma.Decimal('0.00') }];
      if (sql.includes('FROM db_sales')) {
        return [{ cash: new Prisma.Decimal('50.00'), qris: new Prisma.Decimal('30.00'), credit: new Prisma.Decimal('20.00'), discount: new Prisma.Decimal('0.00'), transaction_count: 3n, unsupported: 0n }];
      }
      throw Error(sql);
    },
    $executeRaw: async (s, ...values) => 1,
  };
  const result = await new PrismaRegisterRepository({ $transaction: (fn) => fn(tx) }).close(ctx, 15, now);
  assert.equal(result.saldoAwal, '100.00');
  // Physical cash drawer is only saldo_awal + cash: 100.00 + 50.00 = 150.00 (QRIS 30.00 must NOT be in cash drawer)
  assert.equal(result.saldoAkhir, '150.00');
  assert.equal(result.saldoKredit, '20.00');
  assert.equal(result.saldoQris, '30.00');
  assert.equal(result.transactionCount, 3);
  assert.match(calls[3], /payment_type='QRIS'/);
  assert.match(calls[3], /payment_type NOT IN \('Cash','QRIS','Kredit'\)/);
});

test('whole opening transaction retries deadlocks rather than individual statements',async()=>{const f=fake();let attempts=0;const real=f.db.$transaction;f.db.$transaction=async(fn)=>{if(++attempts<3)throw{code:'P2010',meta:{code:'1213'}};return real(fn);};await new PrismaRegisterRepository(f.db).open(ctx,{idKasir:1,saldoAwal:0},now);assert.equal(attempts,3);assert.equal(f.writes.length,2);});
