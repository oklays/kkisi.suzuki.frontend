import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { renderKosipaPdfDocument } from '../src/kosipa/index.ts';

function extractPdfText(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'kosipa-pdf-'));
  try {
    const file = join(dir, 'doc.pdf');
    writeFileSync(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('renderKosipaPdfDocument renders an A4 Portrait financial document with masthead, KPI strip, KV grid, callout, and table', () => {
  const pdf = renderKosipaPdfDocument({
    orientation: 'portrait',
    title: 'KARTU PINJAMAN & JADWAL ANGSURAN',
    subtitle: 'Pinjaman Reguler · Metode Flat',
    badge: { label: 'APPROVED · BELUM LUNAS', tone: 'info' },
    docMeta: [
      { label: 'No. Dokumen', value: 'PINJ-2026-0001' },
      { label: 'Dicetak (UTC)', value: '2026-10-17 05:00' },
    ],
    footerNote: 'Dokumen informasi baca-saja KOSIPA KKISI TB2.',
    sections: [
      {
        kind: 'kpi-strip',
        items: [
          { label: 'POKOK PINJAMAN', value: 'Rp12.000.000,00', subtext: 'Rencana dokumen', highlight: true },
          { label: 'ANGSURAN / BULAN', value: 'Rp1.100.000,00', subtext: 'Tenor 12 bulan' },
          { label: 'PROGRES JADWAL', value: '3 / 12 (25%)', subtext: '9 belum dibayar' },
        ],
      },
      {
        kind: 'kv-grid',
        title: 'Identitas Anggota & Rincian Pencairan',
        items: [
          { label: 'Nama Anggota', value: 'SYNTH ANGGOTA SATU' },
          { label: 'NIK (Disamarkan)', value: '***01', mono: true },
          { label: 'Tanggal Dokumen', value: '2026-01-15' },
          { label: 'Diterima Anggota', value: 'Rp11.880.000,00' },
        ],
      },
      {
        kind: 'callout',
        tone: 'warning',
        title: 'Catatan Provenance & Saldo Resmi',
        lines: [
          'Sisa pokok dihitung dari jadwal angsuran tercatat, bukan saldo outstanding resmi (OFFICIAL_BALANCE_UNVERIFIED).',
        ],
      },
      {
        kind: 'table',
        title: 'Jadwal Angsuran Tercatat',
        subtitle: '12 baris jadwal untuk dokumen PINJ-2026-0001',
        columns: [
          { header: 'Ke', width: 36, align: 'right' },
          { header: 'Jatuh Tempo', width: 90, align: 'left', mono: true },
          { header: 'Pokok', width: 115, align: 'right' },
          { header: 'Bunga', width: 100, align: 'right' },
          { header: 'Total Angsuran', width: 115, align: 'right' },
          { header: 'Status', width: 67, align: 'left' },
        ],
        rows: [
          ['1', '2026-02-25', 'Rp1.000.000,00', 'Rp100.000,00', 'Rp1.100.000,00', 'Bayar'],
          ['2', '2026-03-25', 'Rp1.000.000,00', 'Rp100.000,00', 'Rp1.100.000,00', 'Belum Bayar'],
        ],
        footerRow: ['TOTAL', '', 'Rp2.000.000,00', 'Rp200.000,00', 'Rp2.200.000,00', ''],
      },
    ],
  });

  assert.ok(pdf instanceof Uint8Array && pdf.byteLength > 500);
  assert.equal(Buffer.from(pdf.subarray(0, 8)).toString('ascii'), '%PDF-1.4');
  const text = extractPdfText(pdf);
  for (const expected of [
    'KOPERASI KARYAWAN PT SUZUKI INDOMOBIL',
    'KARTU PINJAMAN & JADWAL ANGSURAN',
    'PINJ-2026-0001',
    'APPROVED',
    'POKOK PINJAMAN',
    'Rp12.000.000,00',
    'SYNTH ANGGOTA SATU',
    '***01',
    'OFFICIAL_BALANCE_UNVERIFIED',
    'Jadwal Angsuran Tercatat',
    '2026-02-25',
    'Belum Bayar',
    'Rp2.200.000,00',
    'Halaman 1 dari 1',
  ]) {
    assert.ok(text.includes(expected), `missing "${expected}" in extracted PDF text:\n${text}`);
  }
  assert.ok(!text.includes('\u2014'), 'no em dash in generated PDF text');
});

test('renderKosipaPdfDocument paginates long tables across multiple pages and repeats headers with Halaman X dari Y', () => {
  const rows = Array.from({ length: 40 }, (_, i) => [
    String(i + 1),
    `DOC-2026-${String(i + 1).padStart(3, '0')}`,
    'Rp500.000,00',
  ]);
  const pdf = renderKosipaPdfDocument({
    orientation: 'landscape',
    title: 'LAPORAN MULTI HALAMAN',
    docMeta: [{ label: 'Tahun', value: '2026' }],
    sections: [
      {
        kind: 'table',
        title: 'Daftar Transaksi',
        columns: [
          { header: 'No', width: 60, align: 'right' },
          { header: 'Nomor Dokumen', width: 300, align: 'left', mono: true },
          { header: 'Nominal', width: 200, align: 'right' },
        ],
        rows,
        footerRow: ['TOTAL', '40 dokumen', 'Rp20.000.000,00'],
      },
    ],
  });

  const rawPdf = Buffer.from(pdf).toString('latin1');
  assert.ok(rawPdf.includes('/MediaBox [0 0 841.89 595.28]'), 'landscape A4 MediaBox');
  const text = extractPdfText(pdf);
  assert.ok(text.includes('DOC-2026-001'));
  assert.ok(text.includes('DOC-2026-040'));
  assert.ok(text.includes('Daftar Transaksi (Lanjutan)'), 'repeated table title on continuation page');
  assert.ok(text.includes('Halaman 1 dari 2'));
  assert.ok(text.includes('Halaman 2 dari 2'));
});
