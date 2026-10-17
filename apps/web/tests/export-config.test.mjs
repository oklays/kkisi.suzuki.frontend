import assert from 'node:assert/strict';
import test from 'node:test';
import { exportEnabled, exportUserIds, exportPolicyFromEnv } from '../src/infrastructure/console/export-config.ts';

test('export is off unless the flag is exactly "true"; the allow-list is strict and any bad entry empties it (fail closed)', () => {
  assert.equal(exportEnabled({}), false); assert.equal(exportEnabled({ KOSIPA_EXPORT_ENABLED: '1' }), false); assert.equal(exportEnabled({ KOSIPA_EXPORT_ENABLED: 'true' }), true);
  assert.deepEqual([...exportUserIds({ KOSIPA_EXPORT_USER_IDS: '12, 45,7' })], [12, 45, 7]);
  for (const bad of ['', 'abc', '12,x', '0', '-1', '12;13', '1.5', '12,,13', Array.from({ length: 51 }, (_, i) => i + 1).join(',')]) assert.equal(exportUserIds({ KOSIPA_EXPORT_USER_IDS: bad }).size, 0, JSON.stringify(bad).slice(0, 40));
  assert.deepEqual(exportPolicyFromEnv({ KOSIPA_EXPORT_ENABLED: 'true', KOSIPA_EXPORT_USER_IDS: '3' }), { enabled: true, allowedUserIds: new Set([3]) });
  assert.equal(exportPolicyFromEnv({ KOSIPA_EXPORT_USER_IDS: '3' }).enabled, false, 'an allow-list without the flag grants nothing');
});
