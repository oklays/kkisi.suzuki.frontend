import assert from 'node:assert/strict';
import test from 'node:test';
import { toMinorUnits } from '@koperasi/domain/money';

test('money converts exact decimal strings to integer sen without floating point drift', () => {
  assert.equal(toMinorUnits('3500.00'), 350000);
  assert.equal(toMinorUnits('4000.10'), 400010);
  assert.equal(toMinorUnits('9909.90'), 990990);
  assert.equal(toMinorUnits('0.07'), 7);
  assert.equal(toMinorUnits('12'), 1200);
  assert.equal(toMinorUnits('11220000.00'), 1122000000);
  assert.equal(toMinorUnits('-1.5'), -150);
  for (const bad of ['', '1e3', '1,5', '1.234', 'abc', '.5']) assert.throws(() => toMinorUnits(bad), RangeError, bad);
});
