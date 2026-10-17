import assert from 'node:assert/strict';
import test from 'node:test';
import { listShipmentsView, listMappingsView, warehouseOverview } from '@koperasi/application/warehouse';
import { previewWorld } from '../src/infrastructure/warehouse/synthetic-world.ts';
import { warehousePreviewEnabled } from '../src/infrastructure/warehouse/preview-flag.ts';

test('the preview flag is off unless exactly "true"', () => {
  assert.equal(warehousePreviewEnabled({}), false); assert.equal(warehousePreviewEnabled({ WAREHOUSE_PREVIEW_ENABLED: '1' }), false); assert.equal(warehousePreviewEnabled({ WAREHOUSE_PREVIEW_ENABLED: 'true' }), true);
});

test('the synthetic world is built through the real use cases and exercises every outcome, with ids that cannot be mistaken for real documents', async () => {
  const w = await previewWorld(); const ships = await listShipmentsView(w.read, w.viewer); const maps = await listMappingsView(w.read, w.viewer);
  assert.ok(ships.items.every((s) => s.sourceRef.startsWith('synthetic:dispatch:')), 'every document reference says synthetic');
  assert.deepEqual(new Set(ships.items.map((s) => s.outcome)), new Set(['FULLY_RECEIVED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCY', 'NOT_RECEIVED']));
  assert.deepEqual(new Set(ships.items.map((s) => s.status)), new Set(['DRAFT', 'APPROVED', 'DISPATCHED', 'CLOSED']));
  assert.deepEqual(new Set(maps.items.map((m) => m.status)), new Set(['PROPOSED', 'CONFIRMED', 'RETIRED']));
  assert.ok(ships.items.every((s) => s.treatment === 'UNSPECIFIED'), 'no accounting treatment is assumed');
  const o = await warehouseOverview(w.read, w.viewer); assert.equal(o.truncated, false); assert.ok(o.openDiscrepancies >= 1);
  assert.equal(await previewWorld(), w, 'built once per process');
});
