import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KosipaError, LOAN_PRODUCTS, buildLoanPortfolio, classifyLoanProduct, loanSegment, loanProduct, parseLoanListQuery, parseLoanProductFilter, parseRolloverQuery, parseSettlementQuery,
  describeSettlement, summarizeSettlements, describeRollover,
} from '../src/kosipa/index.ts';

const RP = (n) => n * 10000;
const g = (type, financier, docStatus, disbursement, repayment, documents, planPrincipal, latestDocDate = '2026-01-10') => ({ type, financier, docStatus, disbursement, repayment, documents, planPrincipal, latestDocDate });

test('legacy menu rules: each product matches exactly the jenis (and Reguler the KOPERASI financier) of its legacy list', () => {
  assert.deepEqual(LOAN_PRODUCTS.map((p) => p.slug), ['reguler', 'bank', 'kasbon', 'pembiayaan', 'gaji-minus', 'kpr-btn'], 'legacy sidebar order');
  assert.equal(classifyLoanProduct('PINJAMAN REGULAR', 'KOPERASI'), 'reguler');
  assert.equal(classifyLoanProduct('PINJAMAN REGULAR (ANUITAS)', 'KOPERASI'), 'reguler');
  assert.equal(classifyLoanProduct('pinjaman regular  ', 'koperasi'), 'reguler', 'compared like the default MariaDB collation');
  assert.equal(classifyLoanProduct('PINJAMAN REGULAR', '0'), 'lainnya', 'legacy Reguler list requires bank_pembiaya = KOPERASI');
  assert.equal(classifyLoanProduct('PINJAMAN BANK', 'BANK BSI'), 'bank');
  assert.equal(classifyLoanProduct('PINJAMAN BANK', '0'), 'bank', 'the Bank list does not filter on the financier');
  assert.equal(classifyLoanProduct('KASBON', 'FAMILY DAY'), 'kasbon');
  assert.equal(classifyLoanProduct('POTONGAN', 'PPOB'), 'pembiayaan', 'legacy Pembiayaan menu lists jenis POTONGAN');
  assert.equal(classifyLoanProduct('GAJI MINUS', 'GAJI MINUS'), 'gaji-minus');
  assert.equal(classifyLoanProduct('KPR BTN', 'KPR BTN BEKASI'), 'kpr-btn');
  for (const [t, f] of [['PEMBIAYAAN', 'BARANG KONSINYASI'], ['REGULLER', 'GAJI MINUS'], ['REGULER', 'GAJI MINUS'], [null, null], ['', 'KOPERASI']]) assert.equal(classifyLoanProduct(t, f), 'lainnya', String(t));
  assert.equal(loanSegment(loanProduct('reguler'), 'PINJAMAN REGULAR (ANUITAS)', 'KOPERASI'), 'PINJAMAN REGULAR (ANUITAS)', 'Reguler splits by jenis');
  assert.equal(loanSegment(loanProduct('kasbon'), 'KASBON', 'FAMILY DAY'), 'FAMILY DAY');
  assert.equal(loanSegment(loanProduct('bank'), 'PINJAMAN BANK', '0'), null, "'0' is not a financier");
});

test('product filter: known slugs only; a segment needs a product; the list query carries both', () => {
  assert.deepEqual(parseLoanProductFilter({}), { product: null, segment: null });
  assert.deepEqual(parseLoanProductFilter({ produk: 'kasbon', segmen: ' FAMILY DAY ' }), { product: 'kasbon', segment: 'FAMILY DAY' });
  assert.deepEqual(parseLoanProductFilter({ produk: 'lainnya' }), { product: 'lainnya', segment: null });
  for (const bad of [{ produk: 'KASBON' }, { produk: "kasbon' OR 1=1" }, { segmen: 'BANK BSI' }, { produk: 'lainnya', segmen: 'X' }, { produk: 'bank', segmen: 'x'.repeat(61) }]) assert.throws(() => parseLoanProductFilter(bad), (e) => e instanceof KosipaError && e.code === 'FILTER_INVALID', JSON.stringify(bad));
  const q = parseLoanListQuery({ produk: 'bank', segmen: 'BANK BJB', status: 'APPROVED' });
  assert.equal(q.product, 'bank'); assert.equal(q.segment, 'BANK BJB'); assert.equal(q.docStatus, 'APPROVED');
  assert.deepEqual(parseLoanListQuery({ q: 'BON20260164473' }).search, { nikKeys: null, docNoPrefix: 'BON20260164473', nameLike: null }, 'Kasbon numbers are document prefixes, not NIKs');
});

test('portfolio: every document lands in exactly one product, active figures follow the legacy active rule, sums are exact', () => {
  const groups = [
    g('KASBON', 'FAMILY DAY', 'APPROVED', 'APPROVED', 'BELUM LUNAS', 3, '1500000.00', '2026-07-29'),
    g('KASBON', 'FAMILY DAY', 'APPROVED', 'OPEN', 'BELUM LUNAS', 2, '1000000.00', '2026-07-30'),
    g('KASBON', 'KASBON >1X POT', 'POSTING', 'OPEN', 'BELUM LUNAS', 1, '400000.00'),
    g('KASBON', 'KASBON >1X POT', 'APPROVED', 'APPROVED', 'LUNAS', 10, '9999999.99'),
    g('PINJAMAN REGULAR', 'KOPERASI', 'REJECTED', 'OPEN', 'LUNAS', 1, '5000000.00'),
    g('REGULLER', 'GAJI MINUS', 'APPROVED', 'APPROVED', 'LUNAS', 2, '10.00', '0000-00-00'),
  ];
  const schedule = [{ docNo: 'BON1', type: 'KASBON', financier: 'FAMILY DAY', principal: '100000.50', total: '110000.00' }, { docNo: 'BON2', type: 'KASBON', financier: 'FAMILY DAY', principal: '0.25', total: '0.25' }];
  const p = buildLoanPortfolio(groups, schedule);
  assert.deepEqual(p.lines.map((l) => l.product), ['reguler', 'bank', 'kasbon', 'pembiayaan', 'gaji-minus', 'kpr-btn', 'lainnya']);
  assert.equal(p.lines.reduce((t, l) => t + l.documents, 0), p.total.documents, 'products add up to all documents');
  const kasbon = p.lines.find((l) => l.product === 'kasbon');
  assert.equal(kasbon.documents, 16); assert.equal(kasbon.active, 3); assert.equal(kasbon.activePrincipal4, RP(1500000));
  assert.equal(kasbon.awaitingApproval, 1); assert.equal(kasbon.posted, 1); assert.equal(kasbon.submitted, 0); assert.equal(kasbon.awaitingDisbursement, 2); assert.equal(kasbon.settled, 10);
  assert.equal(kasbon.unpaidPrincipal4, RP(100000) + 7500, 'exact four-decimal sum'); assert.equal(kasbon.unpaidTotal4, RP(110000) + 2500);
  assert.equal(kasbon.latestDocDate, '2026-07-30');
  assert.deepEqual(kasbon.segments.map((s) => [s.key, s.documents, s.active]), [['FAMILY DAY', 5, 3], ['KASBON >1X POT', 11, 0]], 'segments sorted by active documents');
  assert.equal(kasbon.segments[0].unpaidPrincipal4, RP(100000) + 7500);
  const reguler = p.lines.find((l) => l.product === 'reguler');
  assert.equal(reguler.conflicting, 1, 'REJECTED but LUNAS is flagged, not corrected'); assert.equal(reguler.rejected, 1); assert.equal(reguler.unpaidPrincipal4, 0);
  const other = p.lines.find((l) => l.product === 'lainnya');
  assert.equal(other.documents, 2); assert.equal(other.latestDocDate, null, 'a zero date is never a latest date'); assert.deepEqual(other.segments, [], 'no legacy segmentation for unmapped documents');
  assert.equal(p.total.unpaidPrincipal4, RP(100000) + 7500); assert.equal(p.scheduleRead, true);
});

test('portfolio without a readable schedule: header figures stay, unpaid sums are unknown (null), never a made-up zero', () => {
  const p = buildLoanPortfolio([g('PINJAMAN BANK', 'BANK BSI', 'APPROVED', 'APPROVED', 'BELUM LUNAS', 4, '400000000.00')], null);
  const bank = p.lines.find((l) => l.product === 'bank');
  assert.equal(bank.active, 4); assert.equal(bank.activePrincipal4, RP(400000000));
  assert.equal(bank.unpaidPrincipal4, null); assert.equal(bank.segments[0].unpaidPrincipal4, null); assert.equal(p.total.unpaidTotal4, null); assert.equal(p.scheduleRead, false);
  assert.throws(() => buildLoanPortfolio([g('KASBON', 'X', 'APPROVED', 'APPROVED', 'BELUM LUNAS', 1, 'abc')], null), (e) => e.code === 'AMOUNT_INVALID', 'unparseable amounts are surfaced');
});

test('settlements and roll-over: filters validated; settlement total = pokok + admin + penalti like the legacy list', () => {
  assert.deepEqual(parseSettlementQuery({}), { product: null, remark: null, period: null, search: null, afterId: null });
  const q = parseSettlementQuery({ produk: 'pembiayaan', keterangan: 'LUNAS PENSIUN', periode: '2026-08', after: '72222' });
  assert.deepEqual([q.product, q.remark, q.period, q.afterId], ['pembiayaan', 'LUNAS PENSIUN', { year: 2026, month: 8 }, 72222]);
  for (const bad of [{ keterangan: 'ROLLOVER' }, { keterangan: 'lunas pensiun' }, { produk: 'x' }]) assert.throws(() => parseSettlementQuery(bad), (e) => e.code === 'FILTER_INVALID', JSON.stringify(bad));
  assert.throws(() => parseSettlementQuery({ periode: '2026-13' }), (e) => e.code === 'PERIOD_INVALID');
  assert.throws(() => parseRolloverQuery({ after: '-1' }), (e) => e.code === 'CURSOR_INVALID');
  const s = describeSettlement({ id: 1, docNo: 'PEMBYN1', settledOn: '2026-09-10', nik: '1', name: 'X', type: 'POTONGAN', financier: 'PPOB', remark: 'LUNAS DIPERCEPAT', method: 'Cash', status: 'YES', planPrincipal: '9000000.00', principal: '8625000.00', adminFee: '2213750.00', penalty: '0.00' });
  assert.equal(s.total4, RP(10838750)); assert.equal(s.product, 'pembiayaan');
  assert.deepEqual(summarizeSettlements([{ remark: 'LUNAS PENSIUN', documents: 3, principal: '10.00', adminFee: '1.00', penalty: '0.00' }, { remark: ' ', documents: 9, principal: '0.00', adminFee: '0.00', penalty: '0.00' }]),
    [{ remark: null, documents: 9, total4: 0 }, { remark: 'LUNAS PENSIUN', documents: 3, total4: RP(11) }]);
  assert.equal(describeRollover({ id: 1, newDocNo: 'A', oldDocNo: 'B', nik: '1', name: null, oldType: 'KASBON', remainingInstallments: 6, remainingPrincipal: '8695931.74', fee: '251319.17' }).remainingPrincipal4, 86959317400);
});
