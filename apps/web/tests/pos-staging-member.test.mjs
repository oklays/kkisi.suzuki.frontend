import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaPosRepository } from '../src/infrastructure/repositories/prisma-pos.repository.ts';

test('duplicate matches inside the chosen NIK/card namespace remain ambiguous', async () => {
  const repo = new PrismaPosRepository({ $queryRaw: async () => [{ id: 1 }, { id: 2 }] });
  for (const kind of ['nik', 'card', 'identifier']) {
    await assert.rejects(repo.member({ companyId: 1, userId: 18 }, 'SYNTHETIC-DUPLICATE', new Date(), kind), e => e.code === 'MEMBER_AMBIGUOUS');
  }
});

// Targeted read-only regression for the member reported by the user. No fixtures or writes.
test('staging: NIK and member ID resolve the reported member despite a different member sharing its card value', { skip: process.env.POS_STAGING_DB_TEST !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/kkisi_staging');
  const db = new PrismaClient();
  try {
    const repo = new PrismaPosRepository(db);
    const context = { companyId: 1, userId: 18 };
    for (const [value, kind] of [['04296', 'nik'], ['62', 'id'], ['04296', 'identifier']]) {
      const member = await repo.member(context, value, new Date(), kind);
      assert.equal(member.id, 62);
      assert.equal(member.nik, '04296', 'leading zero is preserved');
      assert.equal(member.limitSen, 250000000);
      assert.ok(Number.isSafeInteger(member.remainingSen));
    }
    await assert.rejects(repo.member(context, '04296', new Date(), 'card'), e => e.code === 'MEMBER_INACTIVE');
  } finally { await db.$disconnect(); }
});
