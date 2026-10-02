import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaItemRepository } from '../src/infrastructure/repositories/prisma-item.repository.ts';

test('all sellable catalog reads exclude stock opname and the PPOB balance barcode', async () => {
  const queries=[];
  const item={findMany:async q=>{queries.push(q);return[];}, findFirst:async q=>{queries.push(q);return null;},groupBy:async q=>{queries.push(q);return[];}};
  const repo=new PrismaItemRepository({item});
  await repo.search({companyId:2,term:'x',limit:24});
  await repo.findByBarcode({companyId:2,barcode:'X'});
  await repo.listCategories({companyId:2});
  for(const {where} of queries){
    assert.equal(where.companyId,2);
    assert.equal(where.status,1);
    assert.equal(where.statusSo,0);
    assert.equal(where.type,'Produk Jadi');
    assert.deepEqual(where.AND,[{customBarcode:{not:'SALDOPPOB'}}]);
  }
});
