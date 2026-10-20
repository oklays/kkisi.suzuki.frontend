import assert from 'node:assert/strict';
import test from 'node:test';
import { formatExactRupiah, maskIdentifier, exportFeedback, privateSearchTarget, syntheticKosipaEnvironment } from '../src/components/console/kosipa/presentation.ts';

test('financial presentation preserves authoritative decimal digits without float rounding', () => {
  assert.equal(formatExactRupiah('9007199254740993.0001'), 'Rp 9.007.199.254.740.993,0001');
  assert.equal(formatExactRupiah('-1000.2300'), '-Rp 1.000,2300');
  assert.equal(formatExactRupiah('0'), 'Rp 0');
  assert.equal(formatExactRupiah(null), 'Tidak tersedia');
  assert.throws(() => formatExactRupiah('1e10'));
});
test('identifiers expose at most the final four characters and never a full short identifier', () => {
  assert.equal(maskIdentifier('S9001'), '•••• 9001');
  assert.equal(maskIdentifier('123'), '••••');
  assert.equal(maskIdentifier(''), 'Tidak tersedia');
});
test('export feedback distinguishes permission, bounds, throttle and unavailable without server internals', () => {
  assert.match(exportFeedback(403), /izin/i);
  assert.match(exportFeedback(413), /Persempit filter/);
  assert.match(exportFeedback(429), /Tunggu/);
  assert.match(exportFeedback(503), /belum dapat/);
  assert.match(exportFeedback(0), /koneksi/i);
});
test('private search routes reject outside destinations, URL queries and malformed document paths', () => {
  for (const path of ['/console/kosipa/anggota','/console/kosipa/simpanan','/console/kosipa/pinjaman','/console/kosipa/payroll/DOC1','/console/kosipa/payroll/DOC1/rekonsiliasi']) assert.ok(privateSearchTarget(path));
  for (const path of ['https://evil.test','/console/settings/identitas','/console/kosipa/anggota?q=SECRET','/console/kosipa/payroll/../admin','/console/kosipa/payroll/A%2FB','/console/kosipa/payroll/A/export']) assert.equal(privateSearchTarget(path), null);
});
test('synthetic label requires the exact DEV LOCAL database target, never development mode alone', () => {
  assert.equal(syntheticKosipaEnvironment({NODE_ENV:'development'}), false);
  assert.equal(syntheticKosipaEnvironment({DATABASE_URL:'mysql://reader:placeholder@127.0.0.1:3307/kkisi_devlocal_staging'}), true);
  assert.equal(syntheticKosipaEnvironment({DATABASE_URL:'mysql://reader:placeholder@remote:3307/kkisi_devlocal_staging'}), false);
  assert.equal(syntheticKosipaEnvironment({DATABASE_URL:'mysql://reader:placeholder@127.0.0.1:3307/kkisi_staging'}), false);
});
