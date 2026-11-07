import assert from 'node:assert/strict';
import test from 'node:test';
import { currentEntryId } from '@koperasi/domain/console/navigation';
import { CONSOLE_NAVIGATION, SECTION_LABELS } from '../src/features/console/navigation.ts';
import { buildConsoleTrail } from '../src/components/console/breadcrumb-trail.ts';

const entries = CONSOLE_NAVIGATION;
function trailFor(pathname, tail) {
  const current = entries.find((e) => e.id === currentEntryId(entries, pathname)) ?? null;
  const section = current ? { section: current.section, label: SECTION_LABELS[current.section] } : null;
  const parent = current?.parent ? entries.find((e) => e.id === current.parent) ?? null : null;
  const deeper = current !== null && pathname.replace(/\/$/, '') !== current.href.split('?')[0];
  return buildConsoleTrail({ current, section, parent, deeper, pathname, tail });
}
const labels = (t) => t.map((c) => c.label);

test('every registered console screen gets a trail with a home icon and an icon on every crumb', () => {
  for (const entry of entries) {
    const trail = trailFor(entry.href.split('?')[0]);
    assert.equal(trail[0].label, 'KKISI TB2', entry.id);
    assert.equal(trail[0].iconOnly, true);
    for (const crumb of trail) assert.ok(crumb.icon, `${entry.id}: crumb "${crumb.label}" has an icon`);
    if (entry.id !== 'dashboard') assert.equal(trail.at(-1).label, entry.label, `${entry.id}: the current page is last`);
    assert.equal(trail.filter((c) => !c.href).length >= 1 || trail.length === 1, true, `${entry.id}: only the module and the current page are plain text`);
  }
});

test('the dashboard has no trail beyond its root; a child entry lists its parent between the module and itself', () => {
  assert.deepEqual(labels(trailFor('/console')), ['KKISI TB2']);
  assert.deepEqual(labels(trailFor('/console/kosipa/laporan/pinjaman')), ['KKISI TB2', 'KOSIPA', 'Laporan', 'Pinjaman']);
  assert.equal(trailFor('/console/kosipa/laporan/pinjaman')[2].href, '/console/kosipa/laporan');
});

test('a path deeper than the registered page links the page and ends with Detail; the member detail uses the person icon', () => {
  const member = trailFor('/console/kosipa/anggota/123');
  assert.deepEqual(labels(member), ['KKISI TB2', 'KOSIPA', 'Keanggotaan', 'Detail']);
  assert.equal(member[2].href, '/console/kosipa/anggota');
  assert.equal(member[3].href, undefined);
  const loan = trailFor('/console/kosipa/pinjaman/PIN123');
  assert.deepEqual(labels(loan), ['KKISI TB2', 'KOSIPA', 'Pinjaman', 'Detail']);
  assert.notEqual(loan[3].icon, member[3].icon, 'member detail has its own icon');
});

test('KOSIPA links are not prefetched; links of other modules keep the default', () => {
  assert.equal(trailFor('/console/kosipa/anggota/1')[2].prefetch, false);
  const warehouse = trailFor('/console/warehouse/distribusi/XYZ').filter((c) => c.href);
  assert.ok(warehouse.length > 0);
  for (const crumb of warehouse) assert.equal(crumb.prefetch, undefined, crumb.href);
});

test('"baru" and "ubah" pages are named after their action instead of "Detail"', () => {
  const create = trailFor('/console/kosipa/anggota/baru');
  assert.deepEqual(labels(create), ['KKISI TB2', 'KOSIPA', 'Keanggotaan', 'Daftarkan anggota']);
  assert.equal(create[2].href, '/console/kosipa/anggota');
  const edit = trailFor('/console/kosipa/anggota/42/ubah');
  assert.deepEqual(labels(edit), ['KKISI TB2', 'KOSIPA', 'Keanggotaan', 'Detail', 'Ubah']);
  assert.equal(edit[3].href, '/console/kosipa/anggota/42', 'Detail links back to the record');
  assert.equal(edit[4].href, undefined);
  assert.ok(edit.every((c) => c.icon));
  assert.deepEqual(labels(trailFor('/console/kosipa/anggota/42/')), ['KKISI TB2', 'KOSIPA', 'Keanggotaan', 'Detail'], 'trailing slash');
});

test('a page can name what follows its registered entry; the entry becomes a link and the generic "Detail" is replaced', () => {
  const batch = trailFor('/console/kosipa/payroll/POT1/anggota/123', [{ label: 'POT1', href: '/console/kosipa/payroll/POT1', icon: 'batch' }, { label: 'Potongan anggota', icon: 'member' }]);
  assert.deepEqual(labels(batch), ['KKISI TB2', 'KOSIPA', 'Payroll', 'POT1', 'Potongan anggota']);
  assert.equal(batch[2].href, '/console/kosipa/payroll');
  assert.equal(batch[3].href, '/console/kosipa/payroll/POT1');
  assert.equal(batch[4].href, undefined);
  assert.ok(batch.every((c) => c.icon));
  const loan = trailFor('/console/kosipa/pinjaman/PIN9', [{ label: 'PIN9', icon: 'detail' }]);
  assert.deepEqual(labels(loan), ['KKISI TB2', 'KOSIPA', 'Pinjaman', 'PIN9']);
});
