import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { KosipaError } from '@koperasi/domain/kosipa';
import { WindowThrottle } from '../src/kosipa/report-export.ts';
import {
  exportLoanCardPdf,
  exportPayrollMemberSlipPdf,
  exportMemberSavingsPassbookPdf,
  maskDocumentNik,
} from '../src/kosipa/document-pdf-export.ts';

const NOW = () => new Date('2026-10-17T05:00:00Z');
const actor = (...caps) => ({ userId: 7, capabilities: new Set(caps), requestId: 'req-doc-pdf' });
const code = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    assert.ok(e instanceof KosipaError, String(e?.stack ?? e));
    return e.code;
  }
};

function extractPdfText(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'kosipa-doc-pdf-'));
  try {
    const file = join(dir, 'doc.pdf');
    writeFileSync(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('maskDocumentNik masks all but the last 2 characters of a NIK', () => {
  assert.equal(maskDocumentNik('09901'), '***01');
  assert.equal(maskDocumentNik('12345678'), '******78');
  assert.equal(maskDocumentNik(''), '-');
});

test('exportLoanCardPdf enforces capabilities, validates docNo before audit/read, rate-limits, masks NIK, and renders schedule table', async () => {
  const calls = [];
  const events = [];
  const loanReader = {
    async loanHeaders(docNo) {
      calls.push(['loanHeaders', docNo]);
      if (docNo === 'PINJ-MISSING') return [];
      return [{
        id: 11,
        docNo,
        docDate: '2026-01-15',
        nik: '09901',
        name: 'SYNTH ANGGOTA PINJAMAN',
        type: 'PINJAMAN REGULER',
        financier: 'KOPERASI',
        method: 'FLAT',
        rate: '1.00',
        planMonths: 12,
        actualMonths: 12,
        planPrincipal: '12000000.00',
        actualPrincipal: '12000000.00',
        planInstallment: '1100000.00',
        actualInstallment: '1100000.00',
        adminFee: '120000.00',
        insuranceFee: '0.00',
        totalDeduction: '120000.00',
        totalReceived: '11880000.00',
        disbursedAmount: '12000000.00',
        disbursedDate: '2026-01-20',
        startDate: '2026-02-25',
        endDate: '2027-01-25',
        docStatus: 'APPROVED',
        disbursement: 'APPROVED',
        repayment: 'BELUM LUNAS',
        settlementStatus: null,
        settlementDate: null,
        settlementTotal: '0.00',
        rollOver: null,
      }];
    },
    async scheduleAggregate(docNo) {
      calls.push(['scheduleAggregate', docNo]);
      return {
        rows: 2,
        distinctNo: 2,
        minNo: 1,
        maxNo: 2,
        paidRows: 1,
        unpaidRows: 1,
        otherStatusRows: 0,
        principalSum: '2000000.00',
        interestSum: '200000.00',
        totalSum: '2200000.00',
        paidPrincipal: '1000000.00',
        unpaidPrincipal: '1000000.00',
        unpaidTotal: '1100000.00',
        zeroDue: 0,
        missingDue: 0,
        implausibleDue: 0,
        componentMismatch: 0,
        paidWithoutPaidDate: 0,
      };
    },
    async scheduleRows(docNo) {
      calls.push(['scheduleRows', docNo]);
      return [
        { id: 101, installmentNo: 1, dueRaw: '2026-02-25', paidRaw: '2026-02-25', principal: '1000000.00', interest: '100000.00', total: '1100000.00', status: 'Bayar', type: 'REGULER', blocked: null, rollOver: null, cicilanDocNo: null },
        { id: 102, installmentNo: 2, dueRaw: '2026-03-25', paidRaw: null, principal: '1000000.00', interest: '100000.00', total: '1100000.00', status: 'Belum Bayar', type: 'REGULER', blocked: null, rollOver: null, cicilanDocNo: null },
      ];
    },
    async rolloverLinks() {
      return [];
    },
  };
  const deps = { reader: loanReader, audit: { async append(e) { events.push(e); } }, now: NOW, throttle: new WindowThrottle(2, 60_000) };

  assert.equal(await code(exportLoanCardPdf(deps, actor('kosipa.loan.view'), { docNo: 'PINJ-2026-01' })), 'FORBIDDEN');
  assert.equal(await code(exportLoanCardPdf(deps, actor('kosipa.report.export'), { docNo: 'PINJ-2026-01' })), 'FORBIDDEN');
  assert.equal(await code(exportLoanCardPdf(deps, actor('kosipa.loan.view', 'kosipa.report.export'), { docNo: 'bad doc!' })), 'DOC_NO_INVALID');
  assert.equal(calls.length, 0);
  assert.equal(events.length, 0);

  const authActor = actor('kosipa.loan.view', 'kosipa.report.export');
  assert.equal(await code(exportLoanCardPdf(deps, authActor, { docNo: 'PINJ-MISSING' })), 'NOT_FOUND');

  const out = await exportLoanCardPdf(deps, authActor, { docNo: 'PINJ-2026-01' });
  assert.equal(out.filename, 'kartu-pinjaman-PINJ-2026-01.pdf');
  assert.equal(out.contentType, 'application/pdf');
  const text = extractPdfText(out.body);
  for (const s of [
    'KARTU PINJAMAN & JADWAL ANGSURAN',
    'PINJ-2026-01',
    'SYNTH ANGGOTA PINJAMAN',
    '***01',
    'Rp12.000.000,00',
    'Rp1.100.000,00',
    'OFFICIAL_BALANCE_UNVERIFIED',
    '2026-02-25',
    'Belum Bayar',
  ]) {
    assert.ok(text.includes(s), `missing "${s}" in loan PDF:\n${text}`);
  }
  assert.ok(!text.includes('09901'), 'raw NIK is masked in PDF');

  // 3rd call hits rate limit of 2
  assert.equal(await code(exportLoanCardPdf(deps, authActor, { docNo: 'PINJ-2026-01' })), 'EXPORT_RATE_LIMITED');
});

test('exportPayrollMemberSlipPdf enforces capabilities, validates inputs, masks NIK in PDF and audit, and renders deduction components', async () => {
  const events = [];
  const payrollReader = {
    async batchHeader(docNo) {
      if (docNo === 'PB-MISSING') return null;
      return { id: 1, docNo, periodDate: '2026-08-25', cashDate: '2026-08-28', periodMonth: '08', periodYear: '2026', group: 'ANGGOTA', status: 'APPROVED', headerTotal: '250000.00' };
    },
    async memberRows(docNo, nikKeys) {
      if (!nikKeys.includes('09901')) return [];
      return [{
        id: 50,
        nik: '09901',
        name: 'SYNTH ANGGOTA PAYROLL',
        group: 'ANGGOTA',
        amounts: {
          total_potongan: '250000.00',
          potongan_toko: '0.00',
          SIMPANAN_POKOK: '100000.00',
          SIMPANAN_WAJIB: '150000.00',
        },
      }];
    },
    async memberInstallments() {
      return [];
    },
    async loanHeadersPresent() {
      return new Set();
    },
    async memberInstallmentSummary() {
      return { total: 0, unpaid: 0, zeroDue: 0, missingDue: 0, implausibleDue: 0 };
    },
  };
  const deps = { reader: payrollReader, audit: { async append(e) { events.push(e); } }, now: NOW };
  const authActor = actor('kosipa.payroll.view', 'kosipa.report.export');

  assert.equal(await code(exportPayrollMemberSlipPdf(deps, actor('kosipa.payroll.view'), { docNo: 'PB-2026-01', nik: '09901' })), 'FORBIDDEN');
  assert.equal(await code(exportPayrollMemberSlipPdf(deps, authActor, { docNo: 'PB-2026-01', nik: 'bad-nik!' })), 'NIK_INVALID');
  assert.equal(await code(exportPayrollMemberSlipPdf(deps, authActor, { docNo: 'PB-MISSING', nik: '09901' })), 'NOT_FOUND');

  const out = await exportPayrollMemberSlipPdf(deps, authActor, { docNo: 'PB-2026-01', nik: '09901' });
  assert.equal(out.filename, 'slip-potongan-payroll-PB-2026-01.pdf');
  assert.equal(out.contentType, 'application/pdf');
  assert.ok(!JSON.stringify(events).includes('09901'), 'no raw NIK in audit log');
  const text = extractPdfText(out.body);
  for (const s of [
    'SLIP RINCIAN POTONGAN PAYROLL ANGGOTA',
    'PB-2026-01',
    'SYNTH ANGGOTA PAYROLL',
    '***01',
    'Rp100.000,00',
    'Rp150.000,00',
    'Rp250.000,00',
  ]) {
    assert.ok(text.includes(s), `missing "${s}" in payroll slip PDF:\n${text}`);
  }
  assert.ok(!text.includes('09901'), 'raw NIK is masked in PDF');
});

test('exportMemberSavingsPassbookPdf enforces capabilities, validates memberId, masks NIK, and renders type summary and movements', async () => {
  const events = [];
  const deps = {
    members: {
      async member(id) {
        if (id !== 42) return null;
        return { id: 42, nik: '09901', name: 'SYNTH ANGGOTA SIMPANAN', group: 'ANGGOTA', status: 'AKTIVE' };
      },
    },
    savings: {
      async typeSummary() {
        return [{ type: 'WAJIB', headerStatus: 'APPROVED', rows: 2, credit: '300000.00', debit: '0.00', interest: '0.00' }];
      },
      async movements() {
        return [{ id: 1, docNo: 'SIMP-2026-01', type: 'WAJIB', credit: '150000.00', cashCredit: '0.00', debit: '0.00', interest: '0.00', detailStatus: 'APPROVED', remark: 'Setoran bulanan' }];
      },
      async headersByDocNo() {
        return [{ docNo: 'SIMP-2026-01', headerCount: 1, header: { docDate: '2026-05-10', status: 'APPROVED', kind: 'SETOR' } }];
      },
    },
    audit: { async append(e) { events.push(e); } },
    now: NOW,
  };

  assert.equal(await code(exportMemberSavingsPassbookPdf(deps, actor('kosipa.savings.view', 'kosipa.member.view'), { memberId: '42' })), 'FORBIDDEN');
  assert.equal(await code(exportMemberSavingsPassbookPdf(deps, actor('kosipa.savings.view', 'kosipa.report.export'), { memberId: '42' })), 'FORBIDDEN');
  const authActor = actor('kosipa.savings.view', 'kosipa.member.view', 'kosipa.report.export');
  assert.equal(await code(exportMemberSavingsPassbookPdf(deps, authActor, { memberId: 'abc' })), 'MEMBER_ID_INVALID');
  assert.equal(await code(exportMemberSavingsPassbookPdf(deps, authActor, { memberId: '99' })), 'NOT_FOUND');

  const out = await exportMemberSavingsPassbookPdf(deps, authActor, { memberId: '42' });
  assert.equal(out.filename, 'buku-mutasi-simpanan-42.pdf');
  assert.equal(out.contentType, 'application/pdf');
  const text = extractPdfText(out.body);
  for (const s of [
    'BUKU MUTASI SIMPANAN ANGGOTA',
    'SYNTH ANGGOTA SIMPANAN',
    '***01',
    'OFFICIAL_BALANCE_UNVERIFIED',
    'WAJIB',
    'Rp300.000,00',
    'SIMP-2026-01',
    'Rp150.000,00',
  ]) {
    assert.ok(text.includes(s), `missing "${s}" in savings passbook PDF:\n${text}`);
  }
  assert.ok(!text.includes('09901'), 'raw NIK is masked in PDF');
});
