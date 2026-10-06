import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReturnWriteConfig } from '../src/infrastructure/db/prisma-return-write.ts';

const local = { SALES_RETURN_WRITES_ENABLED: '1', POS_WRITE_DATABASE: 'kkisi_staging', DATABASE_URL: 'mysql://kkisi_read:p@127.0.0.1:3307/kkisi_staging',
  DATABASE_URL_WRITE: 'mysql://kkisi_pos_runtime:p@127.0.0.1:3307/kkisi_staging', DATABASE_URL_REGISTER_WRITE: 'mysql://kkisi_pos_register:p@127.0.0.1:3307/kkisi_staging',
  DATABASE_URL_RETURN_WRITE: 'mysql://kkisi_pos_return:p@127.0.0.1:3307/kkisi_staging' };

test('return writer is its own flag and account on the replicated local staging copy', () => {
  assert.match(validateReturnWriteConfig(local), /kkisi_pos_return/);
  for (const change of [{ SALES_RETURN_WRITES_ENABLED: '0' }, { DATABASE_URL_RETURN_WRITE: undefined }, { POS_WRITES_ENABLED: '1', SALES_RETURN_WRITES_ENABLED: undefined },
    { DATABASE_URL_RETURN_WRITE: 'mysql://kkisi_pos_return:p@127.0.0.1:3306/kkisi_staging' }, { DATABASE_URL_RETURN_WRITE: 'mysql://root:p@127.0.0.1:3307/kkisi_staging' }]) {
    assert.throws(() => validateReturnWriteConfig({ ...local, ...change }), { code: 'WRITE_NOT_CONFIGURED' }, JSON.stringify(change));
  }
});

test('return writer never reuses the checkout, register, inventory, product or auth identity', () => {
  for (const name of ['DATABASE_URL_WRITE', 'DATABASE_URL_REGISTER_WRITE', 'DATABASE_URL_INVENTORY_WRITE', 'DATABASE_URL_PRODUCT_WRITE', 'DATABASE_URL_AUTH']) {
    assert.throws(() => validateReturnWriteConfig({ ...local, [name]: local.DATABASE_URL_RETURN_WRITE }), { code: 'WRITE_NOT_CONFIGURED' }, name);
  }
});
