import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLogin } from '../src/infrastructure/auth/handlers/login.ts';
import { handleLoanReportExport, handlePayrollReportExport, handleDataQualityExport } from '../src/infrastructure/console/report-handlers.ts';
import {
  handleLoanCardPdfExport,
  handlePayrollMemberSlipPdfExport,
  handleMemberSavingsPassbookPdfExport,
} from '../src/infrastructure/console/document-pdf-handlers.ts';
import { WindowThrottle } from '../../../packages/application/src/kosipa/report-export.ts';
import { makeWorld, makeRequest, cookieOf } from './helpers/auth-fakes.mjs';
import { makeReportWorld, bucket, header, aggregate } from '../../../packages/application/tests/helpers/report-fakes.mjs';

const MENUS = { member: 'anggota/anggota_c', loan: 'anggota/trans_pinjaman_c', payroll: 'payroll/matrix_c' };
async function signedIn() {
  const world = makeWorld(); world.addUser({ id: 4, roleId: 4 });
  const r = await handleLogin(world.services, makeRequest('/api/auth/login', { method: 'POST', body: { username: 'kasir', password: 'Pw-Synthetic-1' } }));
  return { world, cookie: cookieOf(r), permissions: { async grantedAmong() { return new Set(); } } };
}
function ports(rw, { menus = [MENUS.member, MENUS.loan, MENUS.payroll], exportPolicy = { enabled: true, allowedUserIds: new Set([4]) }, audit = [], throttle } = {}) {
  return { audit, value: {
    links: { async activeForConsoleUser() { return { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' }; } },
    kosipa: { async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; }, async allowedMenuUrls() { return menus; } },
    audit: { async append(e) { audit.push(e); } }, now: () => new Date('2026-10-17T05:00:00Z'), reports: rw.reader, exportPolicy: exportPolicy ?? undefined, exportThrottle: throttle,
  } };
}
const world = () => makeReportWorld({ loanBuckets: [bucket('2026-03', 'APPROVED', 'BELUM LUNAS', 2, '2000000.25')], headers: [header('A')], aggregates: [aggregate('A')] });
const get = (path, cookie, headers = {}) => makeRequest(path, { cookie, headers });

test('flag off 404, anonymous 401, no services 503, cross-site navigation 403: all before any audit or read', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw);
  for (const handler of [handleLoanReportExport, handlePayrollReportExport, handleDataQualityExport]) {
    const call = (req, deps = {}) => handler(w.services, req, { enabled: true, permissions, ports: p.value, ...deps });
    assert.equal((await call(get('/x', cookie), { enabled: false })).status, 404); assert.equal((await call(get('/x', undefined))).status, 401); assert.equal((await call(get('/x', cookie), { ports: null })).status, 503);
    assert.equal((await call(get('/x', cookie, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  }
  assert.equal(rw.calls.length, 0); assert.equal(p.audit.length, 0);
});

test('view without export is 403; export without view is 403; a user outside the allow-list or with the flag off is 403 — nothing audited or read', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const cases = [{ exportPolicy: { enabled: true, allowedUserIds: new Set([99]) } }, { exportPolicy: { enabled: false, allowedUserIds: new Set([4]) } }, { exportPolicy: null }, { menus: [MENUS.member, MENUS.payroll] }, { menus: [MENUS.member] }];
  for (const opts of cases) {
    const rw = world(); const p = ports(rw, opts);
    const r = await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value });
    assert.equal(r.status, 403, JSON.stringify(opts)); assert.equal(rw.calls.length, 0); assert.equal(p.audit.length, 0);
  }
  const rw = world(); const p = ports(rw, { menus: [MENUS.member, MENUS.loan] });   // loan view + export is not payroll export
  assert.equal((await handlePayrollReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value })).status, 403);
});

test('an allowed export is a no-store, nosniff, attachment CSV with exact figures and an opaque audit record', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw); const deps = { enabled: true, permissions, ports: p.value };
  const r = await handleLoanReportExport(w.services, get('/x?tahun=2026', cookie), deps);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8'); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="laporan-pinjaman-2026.csv"');
  const body = await r.text(); assert.equal(String(new TextEncoder().encode(body).length), r.headers.get('content-length')); assert.ok(body.includes('BULAN,2026-03,APPROVED,BELUM LUNAS,2,2000000.25'));
  assert.equal((await (await handlePayrollReportExport(w.services, get('/x', cookie), deps)).text()).includes(',A,ANGGOTA,APPROVED,2,2,1000.00,1000.00,0.00,'), true);
  assert.equal((await handleDataQualityExport(w.services, get('/x', cookie), deps)).status, 200);
  assert.deepEqual(p.audit.map((a) => [a.action, a.subjectId, a.outcome]), [['kosipa.report.export', 'report:loan', 'success'], ['kosipa.report.export', 'report:payroll', 'success'], ['kosipa.report.export', 'report:quality', 'success']]);
  assert.ok(!JSON.stringify(p.audit).includes('2000000'), 'no figure in the audit record');
});

test('invalid year 400, rate limit 429 with Retry-After, too large 413, outage 503 code-only, malformed data 502', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const rw = world(); const p = ports(rw, { throttle: new WindowThrottle(1, 60_000) }); const deps = { enabled: true, permissions, ports: p.value };
  assert.equal((await handleLoanReportExport(w.services, get('/x?tahun=26', cookie), deps)).status, 400);
  assert.equal((await handleLoanReportExport(w.services, get('/x', cookie), deps)).status, 200);
  const limited = await handleLoanReportExport(w.services, get('/x', cookie), deps); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal(p.audit.at(-1).outcome, 'denied');
  const big = makeReportWorld({ loanBuckets: Array.from({ length: 600 }, (_, i) => bucket(`2026-${String((i % 12) + 1).padStart(2, '0')}`, `S${i}`, 'LUNAS', 1, '1.00')) });
  assert.equal((await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(big).value })).status, 413);
  const down = world(); down.failures.add('loanYears'); const out = await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(down).value });
  assert.equal(out.status, 503); assert.equal(await out.text(), '{"error":"KOSIPA_UNAVAILABLE"}');
  const bad = makeReportWorld({ loanBuckets: [bucket('2026-01', 'APPROVED', 'LUNAS', 1, 'oops')] });
  assert.equal((await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: ports(bad).value })).status, 502);
});

test('an audit failure means no data is read and no file is produced (503, code only)', async () => {
  const { world: w, cookie, permissions } = await signedIn(); const rw = world(); const p = ports(rw);
  p.value.audit = { async append() { throw new Error('console db down'); } };
  const r = await handleLoanReportExport(w.services, get('/x', cookie), { enabled: true, permissions, ports: p.value });
  assert.equal(r.status, 503); assert.equal(await r.text(), '{"error":"KOSIPA_UNAVAILABLE"}'); assert.equal(rw.calls.length, 0);
});

test('multi-format HTTP report export serves binary XLSX and PDF with accurate Content-Length and rejects invalid format with 400', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const rw = world();
  const p = ports(rw);
  const deps = { enabled: true, permissions, ports: p.value };

  const bad = await handleLoanReportExport(w.services, get('/x?tahun=2026&format=xls', cookie), deps);
  assert.equal(bad.status, 400);
  assert.equal(await bad.text(), '{"error":"FORMAT_INVALID"}');

  const xlsxRes = await handleLoanReportExport(w.services, get('/x?tahun=2026&format=xlsx', cookie), deps);
  assert.equal(xlsxRes.status, 200);
  assert.equal(xlsxRes.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(xlsxRes.headers.get('content-disposition'), 'attachment; filename="laporan-pinjaman-2026.xlsx"');
  const xlsxBuf = new Uint8Array(await xlsxRes.arrayBuffer());
  assert.equal(String(xlsxBuf.byteLength), xlsxRes.headers.get('content-length'));
  assert.equal(Buffer.from(xlsxBuf.subarray(0, 4)).toString('binary'), 'PK\x03\x04');

  const pdfRes = await handleLoanReportExport(w.services, get('/x?tahun=2026&format=pdf', cookie), deps);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  assert.equal(pdfRes.headers.get('content-disposition'), 'attachment; filename="laporan-pinjaman-2026.pdf"');
  const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());
  assert.equal(String(pdfBuf.byteLength), pdfRes.headers.get('content-length'));
  assert.equal(Buffer.from(pdfBuf.subarray(0, 8)).toString('ascii'), '%PDF-1.4');
});

test('document PDF HTTP handlers enforce auth, cross-site protection, capabilities, 404 on missing doc, and serve attachment PDFs', async () => {
  const { world: w, cookie, permissions } = await signedIn();
  const audit = [];
  const docPorts = {
    links: { async activeForConsoleUser() { return { id: 1, consoleUserId: 4, externalUserId: 9, status: 'active' }; } },
    kosipa: {
      async kosipaUser(id) { return { id, username: 'k', fullName: 'K', active: true, activeGroups: 1 }; },
      async allowedMenuUrls() { return [MENUS.member, MENUS.loan, MENUS.payroll, 'simpanan/kas_anggota_c']; },
    },
    audit: { async append(e) { audit.push(e); } },
    now: () => new Date('2026-10-17T05:00:00Z'),
    exportPolicy: { enabled: true, allowedUserIds: new Set([4]) },
    loans: {
      async loanHeaders(docNo) {
        if (docNo === 'PINJ-404') return [];
        return [{
          id: 1, docNo, docDate: '2026-01-15', nik: '09901', name: 'SYNTH LOAN', type: 'REGULER', financier: 'KOPERASI', method: 'FLAT', rate: '1',
          planMonths: 12, actualMonths: 12, planPrincipal: '12000000.00', actualPrincipal: '12000000.00', planInstallment: '1100000.00', actualInstallment: '1100000.00',
          adminFee: '0.00', insuranceFee: '0.00', totalDeduction: '0.00', totalReceived: '12000000.00', disbursedAmount: '12000000.00',
          disbursedDate: '2026-01-20', startDate: '2026-02-25', endDate: '2027-01-25', docStatus: 'APPROVED', disbursement: 'APPROVED', repayment: 'BELUM LUNAS',
          settlementStatus: null, settlementDate: null, settlementTotal: '0.00', rollOver: null,
        }];
      },
      async scheduleAggregate() {
        return { rows: 0, distinctNo: 0, minNo: null, maxNo: null, paidRows: 0, unpaidRows: 0, otherStatusRows: 0, principalSum: '0.00', interestSum: '0.00', totalSum: '0.00', paidPrincipal: '0.00', unpaidPrincipal: '0.00', unpaidTotal: '0.00', zeroDue: 0, missingDue: 0, implausibleDue: 0, componentMismatch: 0, paidWithoutPaidDate: 0 };
      },
      async scheduleRows() { return []; },
    },
    payroll: {
      async batchHeader(docNo) {
        if (docNo === 'PB-40400') return null;
        return { id: 1, docNo, periodDate: '2026-08-25', cashDate: '2026-08-28', periodMonth: '08', periodYear: '2026', group: 'ANGGOTA', status: 'APPROVED', headerTotal: '100000.00' };
      },
      async memberRows() {
        return [{ id: 1, nik: '09901', name: 'SYNTH PAY', group: 'ANGGOTA', amounts: { total_potongan: '100000.00', SIMPANAN_WAJIB: '100000.00' } }];
      },
      async memberInstallments() { return []; },
    },
    members: {
      async member(id) {
        if (id !== 42) return null;
        return { id: 42, nik: '09901', name: 'SYNTH SAV', group: 'ANGGOTA', status: 'AKTIVE' };
      },
    },
    savings: {
      async typeSummary() { return []; },
      async movements() { return []; },
      async headersByDocNo() { return []; },
    },
  };
  const deps = { enabled: true, permissions, ports: docPorts };

  assert.equal((await handleLoanCardPdfExport(w.services, get('/x', cookie, { 'sec-fetch-site': 'cross-site' }), deps, { docNo: 'PINJ-2026-01' })).status, 403);
  assert.equal((await handleLoanCardPdfExport(w.services, get('/x', cookie), deps, { docNo: 'PINJ-404' })).status, 404);

  const loanPdf = await handleLoanCardPdfExport(w.services, get('/x', cookie), deps, { docNo: 'PINJ-2026-01' });
  assert.equal(loanPdf.status, 200);
  assert.equal(loanPdf.headers.get('content-type'), 'application/pdf');
  assert.equal(loanPdf.headers.get('content-disposition'), 'attachment; filename="kartu-pinjaman-PINJ-2026-01.pdf"');

  const payPdf = await handlePayrollMemberSlipPdfExport(w.services, get('/x', cookie), deps, { docNo: 'PB-2026-01', nik: '09901' });
  assert.equal(payPdf.status, 200);
  assert.equal(payPdf.headers.get('content-disposition'), 'attachment; filename="slip-potongan-payroll-PB-2026-01.pdf"');

  const savPdf = await handleMemberSavingsPassbookPdfExport(w.services, get('/x', cookie), deps, { memberId: '42' });
  assert.equal(savPdf.status, 200);
  assert.equal(savPdf.headers.get('content-disposition'), 'attachment; filename="buku-mutasi-simpanan-42.pdf"');
});
