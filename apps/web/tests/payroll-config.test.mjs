import assert from 'node:assert/strict';
import test from 'node:test';
import { storeColumnMapFromEnv } from '../src/infrastructure/console/payroll-config.ts';

test('the branch map is empirical and review-only unless the owner decision is explicit and well-formed', () => {
  assert.equal(storeColumnMapFromEnv({}).basis, 'EMPIRICAL_UNCONFIRMED');
  const ok = storeColumnMapFromEnv({ KOSIPA_STORE_COLUMN_MAP: '{"basis":"OWNER_CONFIRMED","byCompany":{"1":"TOKO_TAMBUN","2":"TOKO_MJ","3":"TOKO_GIIC"}}' });
  assert.deepEqual([ok.basis, ok.byCompany[2]], ['OWNER_CONFIRMED', 'TOKO_MJ']);
  for (const bad of ['not json', '{}', '{"basis":"EMPIRICAL_UNCONFIRMED","byCompany":{"1":"TOKO_TAMBUN"}}', '{"basis":"OWNER_CONFIRMED","byCompany":{}}',
    '{"basis":"OWNER_CONFIRMED","byCompany":{"1":"TOKO_TAMBUN","2":"TOKO_TAMBUN"}}', '{"basis":"OWNER_CONFIRMED","byCompany":{"x":"TOKO_MJ"}}', '{"basis":"OWNER_CONFIRMED","byCompany":{"1":"gaji_payroll"}}'])
    assert.equal(storeColumnMapFromEnv({ KOSIPA_STORE_COLUMN_MAP: bad }).basis, 'EMPIRICAL_UNCONFIRMED', bad);
});
