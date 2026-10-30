import assert from 'node:assert/strict';
import test from 'node:test';
import { DocumentNumberingService } from '../src/kosipa/document-numbering.ts';

// The service validates scope, period and strategy before the repository is reached; the repository gets the resolved scheme and period.
const recorder = () => {
  const calls = [];
  return { calls, repository: { allocate: async (tx, scheme, period, request) => { calls.push({ tx, key: scheme.key, period, request }); return { docNo: 'X', scheme: scheme.key, period, sequence: 1 }; } } };
};
const NOW = new Date('2026-10-31T17:30:00Z'); // already November in Jakarta

test('passes the transaction, resolved scheme and Jakarta period through to the repository', async () => {
  const { calls, repository } = recorder();
  const service = new DocumentNumberingService(repository);
  await service.allocate('tx', { scheme: 'member-registration', table: 'm_anggota', now: NOW, requestId: 'r1' });
  await service.allocate('tx', { scheme: 'loan', table: 'trans_pinjaman', now: NOW, rowId: 42, requestId: 'r2' });
  await service.allocate('tx', { scheme: 'payroll-batch', table: 'trans_potongan_bulanan', now: NOW, documentPeriod: '202610', rowId: 7, requestId: 'r3' });
  assert.deepEqual(calls.map((c) => [c.tx, c.key, c.period, c.request.rowId, c.request.requestId]), [
    ['tx', 'member-registration', '202611', undefined, 'r1'], ['tx', 'loan', '202611', 42, 'r2'], ['tx', 'payroll-batch', '202610', 7, 'r3'],
  ]);
});

test('refuses unknown schemes, a foreign table, and missing or forbidden row ids and periods without touching the repository', async () => {
  const { calls, repository } = recorder();
  const service = new DocumentNumberingService(repository);
  const refused = [
    [{ scheme: 'shu', table: 'm_anggota' }, 'NUMBERING_SCHEME_UNKNOWN'],
    [{ scheme: 'member-registration', table: 'trans_simpanan' }, 'NUMBERING_SCOPE_MISMATCH'],
    [{ scheme: 'member-registration', table: 'm_anggota', rowId: 3 }, 'NUMBERING_ROW_ID_NOT_ALLOWED'],
    [{ scheme: 'member-registration', table: 'm_anggota', documentPeriod: '202610' }, 'NUMBERING_PERIOD_NOT_ALLOWED'],
    [{ scheme: 'loan', table: 'trans_pinjaman' }, 'NUMBERING_ROW_ID_REQUIRED'],
    [{ scheme: 'loan', table: 'trans_pinjaman', rowId: 0 }, 'NUMBERING_ROW_ID_REQUIRED'],
    [{ scheme: 'loan', table: 'trans_pinjaman', rowId: 1.5 }, 'NUMBERING_ROW_ID_REQUIRED'],
    [{ scheme: 'payroll-batch', table: 'trans_potongan_bulanan', rowId: 7 }, 'NUMBERING_PERIOD_INVALID'],
  ];
  for (const [request, code] of refused) {
    await assert.rejects(Promise.resolve().then(() => service.allocate('tx', { now: NOW, requestId: 'r', ...request })), { code }, code);
  }
  assert.equal(calls.length, 0);
});
