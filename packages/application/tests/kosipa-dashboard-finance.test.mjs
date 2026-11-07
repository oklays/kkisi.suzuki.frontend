import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCE_CACHE_MS, clearFinanceCache, financeWindow, parseFinancePeriod, readKosipaFinanceKpis } from '../src/kosipa/dashboard-finance.ts';

const TODAY = '2026-11-07';

test('period: defaults to the current Bangkok month; only allow-listed values are accepted', () => {
  assert.deepEqual(parseFinancePeriod({}, TODAY), { range: 'bulan', year: 2026, month: 11 });
  assert.deepEqual(parseFinancePeriod({ periode: 'tahun', tahun: '2024', bulan: '3' }, TODAY), { range: 'tahun', year: 2024, month: 3 });
  assert.deepEqual(parseFinancePeriod({ periode: 'bulan', bulan: '09', tahun: '2026' }, TODAY), { range: 'bulan', year: 2026, month: 9 });
  for (const bad of [{ bulan: '13' }, { bulan: '0' }, { bulan: '1; DROP' }, { tahun: '2018' }, { tahun: '2028' }, { tahun: '20x6' }, { periode: 'hari' }, { bulan: ['3'] }]) {
    assert.deepEqual(parseFinancePeriod(bad, TODAY), { range: 'bulan', year: 2026, month: 11 }, JSON.stringify(bad));
  }
});

test('window: month and year ranges with the legacy periode columns (zero-padded month)', () => {
  assert.deepEqual(financeWindow({ range: 'bulan', year: 2026, month: 9 }), { from: '2026-09-01', toExclusive: '2026-10-01', year: '2026', month: '09' });
  assert.deepEqual(financeWindow({ range: 'bulan', year: 2026, month: 12 }), { from: '2026-12-01', toExclusive: '2027-01-01', year: '2026', month: '12' });
  assert.deepEqual(financeWindow({ range: 'tahun', year: 2025, month: 4 }), { from: '2025-01-01', toExclusive: '2026-01-01', year: '2025', month: null });
});

function reader({ failLoans = false } = {}) {
  const calls = [];
  return { calls, value: {
    async loanSchedule(w) { calls.push(['schedule', w]); if (failLoans) throw new Error('timeout'); return { loanCash: '26784051303.20', installments: '1767880841.45' }; },
    async loanSubmissions(w) { calls.push(['submissions', w]); return '1196097274.00'; },
    async savingsDebit(w) { calls.push(['debit', w]); return '264927775.00'; },
    async latestSubmissionOn() { calls.push(['latestLoan']); return '2026-10-30'; },
    async latestDebitPeriod() { calls.push(['latestDebit']); return '2026-10'; },
  } };
}
const period = { range: 'bulan', year: 2026, month: 10 };
test.beforeEach(() => clearFinanceCache());

test('cards: loan cards need loan view, the savings card savings view; neither = FORBIDDEN', async () => {
  await assert.rejects(readKosipaFinanceKpis(reader().value, new Set(['kosipa.member.view']), period), { code: 'FORBIDDEN' });
  const all = await readKosipaFinanceKpis(reader().value, new Set(['kosipa.loan.view', 'kosipa.savings.view']), period);
  assert.deepEqual(all, { period,
    loans: { state: 'ok', data: { loanCash: '26784051303.20', installments: '1767880841.45', submissions: '1196097274.00', latestSubmissionOn: '2026-10-30' } },
    savings: { state: 'ok', data: { debit: '264927775.00', latestDebitPeriod: '2026-10' } } });
  const r = reader();
  const loansOnly = await readKosipaFinanceKpis(r.value, new Set(['kosipa.loan.view']), period);
  assert.deepEqual(loansOnly.savings, { state: 'restricted' });
  assert.ok(!r.calls.some(([k]) => k === 'debit' || k === 'latestDebit'), 'a restricted figure (and its freshness hint) is never read');
});

test('cards: a failed loan read is "unavailable", never zero, and does not hide the savings card', async () => {
  const kpis = await readKosipaFinanceKpis(reader({ failLoans: true }).value, new Set(['kosipa.loan.view', 'kosipa.savings.view']), period);
  assert.deepEqual(kpis.loans, { state: 'unavailable', reason: 'READ_FAILED' });
  assert.deepEqual(kpis.savings, { state: 'ok', data: { debit: '264927775.00', latestDebitPeriod: '2026-10' } });
});

test('cache: one database read per period per minute; month and year never share an entry; failures are not cached', async () => {
  const caps = new Set(['kosipa.loan.view', 'kosipa.savings.view']);
  const r = reader();
  await readKosipaFinanceKpis(r.value, caps, period, 1_000);
  await readKosipaFinanceKpis(r.value, caps, period, 1_000 + FINANCE_CACHE_MS - 1);
  assert.equal(r.calls.filter(([k]) => k === 'schedule').length, 1, 'second view within a minute is served from cache');
  await readKosipaFinanceKpis(r.value, caps, { range: 'tahun', year: 2026, month: 10 }, 2_000);
  assert.equal(r.calls.filter(([k]) => k === 'schedule').length, 2, 'the year is a different period');
  await readKosipaFinanceKpis(r.value, caps, period, 1_000 + FINANCE_CACHE_MS);
  assert.equal(r.calls.filter(([k]) => k === 'schedule').length, 3, 'expired entries are read again');
  const failing = reader({ failLoans: true });
  await readKosipaFinanceKpis(failing.value, caps, { range: 'bulan', year: 2025, month: 1 }, 5_000);
  await readKosipaFinanceKpis(failing.value, caps, { range: 'bulan', year: 2025, month: 1 }, 5_001);
  assert.equal(failing.calls.filter(([k]) => k === 'schedule').length, 2, 'a timeout is retried, not remembered');
});
