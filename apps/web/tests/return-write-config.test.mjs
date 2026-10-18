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

test('checkpoint 14: locally, only two EXACT databases are accepted — the local legacy copy and the synthetic DEV LOCAL database; any other *staging name is refused', () => {
  const dl = (u) => `mysql://${u}:p@127.0.0.1:3307/kkisi_devlocal_staging`;
  const devlocal = { SALES_RETURN_WRITES_ENABLED: '1', POS_WRITE_DATABASE: 'kkisi_devlocal_staging', DATABASE_URL: dl('devlocal_read'), DATABASE_URL_WRITE: dl('devlocal_pos'), DATABASE_URL_REGISTER_WRITE: dl('devlocal_register'), DATABASE_URL_RETURN_WRITE: dl('devlocal_return') };
  assert.match(validateReturnWriteConfig(devlocal), /devlocal_return/);
  const other = (db) => ({ ...devlocal, POS_WRITE_DATABASE: db, DATABASE_URL: `mysql://r:p@127.0.0.1:3307/${db}`, DATABASE_URL_WRITE: `mysql://w:p@127.0.0.1:3307/${db}`, DATABASE_URL_RETURN_WRITE: `mysql://ret:p@127.0.0.1:3307/${db}` });
  for (const db of ['kkisi_other_staging', 'kkisi_staging_copy', 'kkisi_devlocal_staging2']) assert.throws(() => validateReturnWriteConfig(other(db)), { code: 'WRITE_NOT_CONFIGURED' }, db);
  assert.throws(() => validateReturnWriteConfig({ ...devlocal, DATABASE_URL_RETURN_WRITE: 'mysql://devlocal_return:p@127.0.0.1:3306/kkisi_devlocal_staging' }), { code: 'WRITE_NOT_CONFIGURED' }, 'wrong port');
});
