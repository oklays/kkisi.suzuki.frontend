import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KosipaError, canonicalNik, nikLookupKeys, sameMember, evaluateMemberEligibility, nextDocumentState, isEditable, DOCUMENT_STATES,
  loanSchedule, evaluateDeductionRatio, savingsPosition, assertWithdrawal, payrollStoreWindow, storeObligations,
  planPayrollSettlement, loansFullyPaid, allocateShu, assertBalancedJournal,
} from '../src/kosipa/index.ts';
import { memberCredit, PosError } from '../src/pos/sale.ts';

const code = (fn) => { try { fn(); return null; } catch (e) { assert.ok(e instanceof KosipaError, String(e)); return e.code; } };
const RP = (n) => n * 100;

// ---------- NIK ----------
test('NIK: numeric keys drop leading zeros, alphanumeric keys are kept, invalid input is refused', () => {
  assert.equal(canonicalNik(' 000123 '), '123');
  assert.equal(canonicalNik('0'), '0');
  assert.equal(canonicalNik('A0012'), 'A0012');
  assert.deepEqual(nikLookupKeys('00123'), ['00123', '123']);
  assert.ok(sameMember('00123', '123'));
  assert.ok(!sameMember('A1', 'B1'), 'legacy CONVERT(...,UNSIGNED) made every non-numeric NIK equal 0; we do not');
  for (const bad of ['', '12 34', "1' OR 1=1", 'x'.repeat(21)]) assert.equal(code(() => canonicalNik(bad)), 'NIK_INVALID');
});

// ---------- eligibility parity with POS ----------
test('member eligibility matches the POS Kredit rule exactly', () => {
  const now = new Date('2026-10-16T05:00:00Z'); // 12:00 WIB -> business day 2026-10-16
  const cases = [
    { nik: '123', status: 'AKTIVE', employment: 'TETAP', exitOn: null },
    { nik: '0', status: 'AKTIVE', employment: 'TETAP', exitOn: null },
    { nik: '123', status: 'RESIGN', employment: 'TETAP', exitOn: null },
    { nik: '123', status: 'LUAR BIASA', employment: 'TETAP', exitOn: null },
    { nik: '123', status: 'AKTIVE', employment: 'KONTRAK', exitOn: '2026-10-17' },
    { nik: '123', status: 'AKTIVE', employment: 'KONTRAK', exitOn: '2026-10-16' },
    { nik: '123', status: 'AKTIVE', employment: 'KONTRAK', exitOn: null },
  ];
  for (const facts of cases) {
    let posAllows = true;
    try { memberCredit({ id: 1, name: 'x', limitSen: 0, gajiMinusSen: 0, ...facts }, 0, now); } catch (e) { assert.ok(e instanceof PosError); posAllows = false; }
    assert.equal(evaluateMemberEligibility(facts, '2026-10-16').eligible, posAllows, JSON.stringify(facts));
  }
  assert.deepEqual(evaluateMemberEligibility({ nik: '', status: 'PENSIUN', employment: 'KONTRAK', exitOn: '2020-01-01' }, '2026-10-16').reasons, ['NO_NIK', 'STATUS_NOT_ACTIVE', 'CONTRACT_EXPIRED']);
});

// ---------- document state machine ----------
test('state machine: valid lifecycle for payout and posting documents', () => {
  const loan = { kind: 'loan', makerId: 1 };
  assert.equal(nextDocumentState({ ...loan, state: 'DRAFT' }, { action: 'submit', actorId: 1 }), 'OPEN');
  assert.equal(nextDocumentState({ ...loan, state: 'OPEN' }, { action: 'approve', actorId: 2 }), 'APPROVED');
  assert.equal(nextDocumentState({ ...loan, state: 'APPROVED' }, { action: 'disburse', actorId: 2 }), 'DISBURSED');
  assert.equal(nextDocumentState({ ...loan, state: 'DISBURSED' }, { action: 'settle', actorId: 1 }), 'SETTLED');
  const batch = { kind: 'payroll-batch', makerId: 1 };
  assert.equal(nextDocumentState({ ...batch, state: 'APPROVED' }, { action: 'post', actorId: 3 }), 'POSTED');
  assert.equal(nextDocumentState({ ...batch, state: 'POSTED' }, { action: 'reverse', actorId: 3, reason: 'salah periode' }), 'REVERSED');
});

test('state machine: maker cannot approve/post/disburse/reverse their own document', () => {
  for (const [state, action, kind] of [['OPEN', 'approve', 'loan'], ['OPEN', 'reject', 'loan'], ['APPROVED', 'disburse', 'withdrawal'], ['APPROVED', 'post', 'savings'], ['POSTED', 'reverse', 'shu']]) {
    assert.equal(code(() => nextDocumentState({ kind, state, makerId: 7 }, { action, actorId: 7, reason: 'r' })), 'MAKER_CHECKER', `${kind} ${action}`);
  }
});

test('state machine: invalid transitions, re-approval and terminal states are refused', () => {
  assert.equal(code(() => nextDocumentState({ kind: 'loan', state: 'APPROVED', makerId: 1 }, { action: 'approve', actorId: 2 })), 'INVALID_TRANSITION', 're-approval');
  assert.equal(code(() => nextDocumentState({ kind: 'savings', state: 'APPROVED', makerId: 1 }, { action: 'disburse', actorId: 2 })), 'INVALID_TRANSITION', 'savings are posted, not disbursed');
  assert.equal(code(() => nextDocumentState({ kind: 'loan', state: 'APPROVED', makerId: 1 }, { action: 'post', actorId: 2 })), 'INVALID_TRANSITION');
  assert.equal(code(() => nextDocumentState({ kind: 'withdrawal', state: 'DISBURSED', makerId: 1 }, { action: 'settle', actorId: 2 })), 'INVALID_TRANSITION');
  for (const terminal of ['REJECTED', 'CANCELLED', 'SETTLED', 'REVERSED']) {
    for (const action of ['submit', 'cancel', 'approve', 'reject', 'disburse', 'post', 'settle', 'reverse']) {
      assert.equal(code(() => nextDocumentState({ kind: 'loan', state: terminal, makerId: 1 }, { action, actorId: 2, reason: 'r' })), 'INVALID_TRANSITION', `${terminal} ${action}`);
    }
  }
  assert.equal(code(() => nextDocumentState({ kind: 'loan', state: 'OPEN', makerId: 1 }, { action: 'reject', actorId: 2, reason: '  ' })), 'REASON_REQUIRED');
  assert.equal(code(() => nextDocumentState({ kind: 'loan', state: 'OPEN', makerId: 1 }, { action: 'APPROVED', actorId: 2 })), 'INVALID_TRANSITION', 'a client-supplied status string is not an action');
  assert.deepEqual(DOCUMENT_STATES.filter(isEditable), ['DRAFT', 'OPEN']);
});

// ---------- loan schedule ----------
test('flat schedule: monthly interest on the original principal; remainder in the last instalment', () => {
  const s = loanSchedule({ method: 'Flat', principalSen: RP(12_000_000), months: 12, monthlyRateBp: 100 });
  assert.equal(s.rows.length, 12);
  assert.ok(s.rows.every((r) => r.interestSen === RP(120_000) && r.principalSen === RP(1_000_000)));
  assert.equal(s.totalSen, RP(13_440_000));
  const uneven = loanSchedule({ method: 'Flat', principalSen: RP(1_000_000), months: 3, monthlyRateBp: 0 });
  assert.deepEqual(uneven.rows.map((r) => r.principalSen), [RP(333_333), RP(333_333), RP(333_334)]);
  assert.equal(uneven.rows.at(-1).balanceAfterSen, 0);
});

test('annuity schedule: standard PMT, interest on the outstanding balance, exact payoff', () => {
  const s = loanSchedule({ method: 'Anuitas', principalSen: RP(10_000_000), months: 12, monthlyRateBp: 100 });
  assert.equal(s.rows[0].totalSen, RP(888_488), 'PMT(1%, 12, 10jt) = 888,487.88 -> Rp 888,488');
  assert.equal(s.rows[0].interestSen, RP(100_000));
  assert.equal(s.rows[0].principalSen, RP(788_488));
  assert.equal(s.totalPrincipalSen, RP(10_000_000));
  assert.equal(s.rows.at(-1).balanceAfterSen, 0);
  for (const r of s.rows.slice(0, -1)) assert.equal(r.totalSen, RP(888_488), 'constant instalment except the last');
});

test('loan schedule property: principal always sums exactly and balances never go negative (2,000 random loans)', () => {
  let seed = 42; const rnd = (n) => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % n;
  for (let i = 0; i < 2000; i++) {
    const input = { method: i % 2 ? 'Flat' : 'Anuitas', principalSen: RP(1 + rnd(500_000_000)), months: 1 + rnd(360), monthlyRateBp: rnd(500) };
    const s = loanSchedule(input);
    assert.equal(s.totalPrincipalSen, input.principalSen, JSON.stringify(input));
    assert.equal(s.rows.length, input.months);
    assert.ok(s.rows.every((r) => r.principalSen >= 0 && r.interestSen >= 0 && r.balanceAfterSen >= 0 && r.totalSen % 100 === 0));
    assert.equal(s.rows.at(-1).balanceAfterSen, 0);
  }
});

test('loan schedule input validation', () => {
  assert.equal(code(() => loanSchedule({ method: 'Bunga', principalSen: 100, months: 1, monthlyRateBp: 0 })), 'LOAN_METHOD_INVALID');
  assert.equal(code(() => loanSchedule({ method: 'Flat', principalSen: 0, months: 1, monthlyRateBp: 0 })), 'LOAN_PRINCIPAL_INVALID');
  assert.equal(code(() => loanSchedule({ method: 'Flat', principalSen: 100, months: 361, monthlyRateBp: 0 })), 'LOAN_TERM_INVALID');
  assert.equal(code(() => loanSchedule({ method: 'Flat', principalSen: 100, months: 1, monthlyRateBp: 1.5 })), 'LOAN_RATE_INVALID');
  assert.equal(code(() => loanSchedule({ method: 'Flat', principalSen: 150, months: 1, monthlyRateBp: 0 })), 'LOAN_UNIT_INVALID', 'principal must be whole rupiah');
});

test('deduction ratio needs an explicit ratio and never auto-approves a zero salary', () => {
  assert.deepEqual(evaluateDeductionRatio({ salarySen: RP(5_000_000), existingMonthlySen: RP(1_000_000), newMonthlySen: RP(2_500_000), maxRatioBp: 7000 }), { status: 'ok', limitSen: RP(3_500_000), projectedSen: RP(3_500_000) });
  assert.equal(evaluateDeductionRatio({ salarySen: RP(5_000_000), existingMonthlySen: RP(1_000_000), newMonthlySen: RP(2_500_001), maxRatioBp: 7000 }).status, 'needs-override');
  assert.equal(evaluateDeductionRatio({ salarySen: 0, existingMonthlySen: 0, newMonthlySen: 0, maxRatioBp: 7000 }).status, 'needs-override');
  assert.equal(code(() => evaluateDeductionRatio({ salarySen: 1, existingMonthlySen: 0, newMonthlySen: 0 })), 'RATIO_INVALID');
});

// ---------- savings ----------
test('savings position comes from persisted lines; pending debits are reserved, pending credits are not spendable', () => {
  const lines = [
    { direction: 'credit', amountSen: RP(1_000_000), state: 'POSTED' },
    { direction: 'interest', amountSen: RP(10_000), state: 'POSTED' },
    { direction: 'debit', amountSen: RP(200_000), state: 'POSTED' },
    { direction: 'debit', amountSen: RP(300_000), state: 'PENDING' },
    { direction: 'credit', amountSen: RP(999_999), state: 'PENDING' },
    { direction: 'debit', amountSen: RP(999_999), state: 'VOID' },
  ];
  assert.deepEqual(savingsPosition(lines, RP(50_000)), { postedSen: RP(860_000), pendingDebitSen: RP(300_000), pendingCreditSen: RP(999_999), availableSen: RP(560_000) });
});

test('withdrawal: policy is mandatory; balance, type and floor are enforced; a second concurrent request sees the reservation', () => {
  const position = savingsPosition([{ direction: 'credit', amountSen: RP(500_000), state: 'POSTED' }]);
  const open = { withdrawable: true, minimumBalanceSen: 0 };
  assert.equal(code(() => assertWithdrawal(position, RP(100), undefined)), 'WITHDRAWAL_POLICY_MISSING');
  assert.equal(code(() => assertWithdrawal(position, RP(100), { withdrawable: false, minimumBalanceSen: 0 })), 'SAVINGS_TYPE_NOT_WITHDRAWABLE');
  assert.equal(code(() => assertWithdrawal(position, 0, open)), 'AMOUNT_INVALID');
  assert.equal(code(() => assertWithdrawal(position, RP(500_000), open)), null);
  assert.equal(code(() => assertWithdrawal(position, RP(500_001), open)), 'INSUFFICIENT_BALANCE');
  assert.equal(code(() => assertWithdrawal(position, RP(450_001), { withdrawable: true, minimumBalanceSen: RP(50_000) })), 'INSUFFICIENT_BALANCE');
  // Request A reserved 400k (pending). Request B, evaluated after A's row is written under the same lock, must fail.
  const afterA = savingsPosition([{ direction: 'credit', amountSen: RP(500_000), state: 'POSTED' }, { direction: 'debit', amountSen: RP(400_000), state: 'PENDING' }]);
  assert.equal(code(() => assertWithdrawal(afterA, RP(400_000), open)), 'INSUFFICIENT_BALANCE');
});

// ---------- store credit ----------
test('payroll store window is the previous calendar month', () => {
  assert.deepEqual(payrollStoreWindow(2026, 10), { from: '2026-09-01', toExclusive: '2026-10-01' });
  assert.deepEqual(payrollStoreWindow(2026, 1), { from: '2025-12-01', toExclusive: '2026-01-01' });
  assert.equal(code(() => payrollStoreWindow(2026, 13)), 'PERIOD_INVALID');
});

test('store obligations net Kredit returns of in-window sales, per member and branch', () => {
  const window = payrollStoreWindow(2026, 10);
  const sales = [
    { saleId: 1, nik: '00123', companyId: 1, saleDate: '2026-09-05', grandTotalSen: RP(100_000), paymentType: 'Kredit', status: 'Final' },
    { saleId: 2, nik: '123', companyId: 1, saleDate: '2026-09-30', grandTotalSen: RP(50_000), paymentType: 'Kredit', status: 'Final' },
    { saleId: 3, nik: '123', companyId: 3, saleDate: '2026-09-10', grandTotalSen: RP(70_000), paymentType: 'Kredit', status: 'Final' },
    { saleId: 4, nik: '123', companyId: 1, saleDate: '2026-09-10', grandTotalSen: RP(999), paymentType: 'Cash', status: 'Final' },
    { saleId: 5, nik: '123', companyId: 1, saleDate: '2026-10-01', grandTotalSen: RP(999), paymentType: 'Kredit', status: 'Final' },
    { saleId: 6, nik: '123', companyId: 1, saleDate: '2026-08-31', grandTotalSen: RP(999), paymentType: 'Kredit', status: 'Final' },
    { saleId: 7, nik: '123', companyId: 1, saleDate: '2026-09-11', grandTotalSen: RP(999), paymentType: 'Kredit', status: 'Draft' },
  ];
  const returns = [{ saleId: 1, amountSen: RP(30_000) }, { saleId: 1, amountSen: RP(10_000) }, { saleId: 6, amountSen: RP(999) }];
  assert.deepEqual(storeObligations(sales, returns, window), [
    { nik: '123', companyId: 1, salesSen: RP(150_000), returnsSen: RP(40_000), netSen: RP(110_000) },
    { nik: '123', companyId: 3, salesSen: RP(70_000), returnsSen: 0, netSen: RP(70_000) },
  ]);
  assert.equal(code(() => storeObligations(sales, [{ saleId: 2, amountSen: RP(50_001) }], window)), 'RETURN_EXCEEDS_SALE');
});

// ---------- payroll settlement ----------
const inst = (id, loanDocNo, nik, dueOn, totalSen, paid = false) => ({ id, loanDocNo, nik, dueOn, totalSen, paid });
test('approving one batch settles only that batch\'s members (the legacy defect settled everyone in the month)', () => {
  const installments = [
    inst(1, 'PIN1', '100', '2026-10-25', RP(500_000)),   // ANGGOTA batch member, covered
    inst(2, 'PIN2', '200', '2026-10-25', RP(300_000)),   // BMP member: not in this batch
    inst(3, 'PIN3', '300', '2026-10-25', RP(400_000)),   // in batch, deduction too small
    inst(4, 'PIN1', '100', '2026-11-25', RP(500_000)),   // next month
    inst(5, 'PIN4', '100', '2026-10-25', RP(100_000), true), // already paid
  ];
  const plan = planPayrollSettlement({ batchDocNo: 'POT202610-ANGGOTA', period: { year: 2026, month: 10 },
    matrix: [{ nik: '0100', installmentSen: RP(500_000) }, { nik: '300', installmentSen: RP(100_000) }, { nik: '400', installmentSen: RP(50_000) }], installments });
  assert.deepEqual(plan.settle, [{ installmentId: 1, loanDocNo: 'PIN1', nik: '100' }]);
  assert.deepEqual(plan.exceptions, [
    { nik: '300', reason: 'SHORTFALL', dueSen: RP(400_000), deductedSen: RP(100_000) },
    { nik: '400', reason: 'NO_DUE_INSTALLMENT', dueSen: 0, deductedSen: RP(50_000) },
  ]);
  assert.equal(plan.untouchedOutsideBatch, 1, 'the BMP member stays unpaid');
  assert.equal(code(() => planPayrollSettlement({ batchDocNo: 'X', period: { year: 2026, month: 10 }, matrix: [{ nik: '1', installmentSen: 1 }, { nik: '001', installmentSen: 1 }], installments: [] })), 'DUPLICATE_MATRIX_ROW');
  assert.equal(code(() => planPayrollSettlement({ batchDocNo: '', period: { year: 2026, month: 10 }, matrix: [], installments: [] })), 'BATCH_REQUIRED');
});

test('loans become fully paid only when every instalment is paid', () => {
  const all = [inst(1, 'A', '1', '2026-10-25', 1), inst(2, 'A', '1', '2026-11-25', 1), inst(3, 'B', '2', '2026-10-25', 1)];
  assert.deepEqual(loansFullyPaid(all, new Set([1, 3])), ['B']);
  assert.deepEqual(loansFullyPaid(all, new Set([1, 2, 3])), ['A', 'B']);
});

// ---------- SHU ----------
test('SHU: parts always add up to the pool (legacy rounding lost Rp 1,000 here)', () => {
  const r = allocateShu({ poolSen: RP(10_000), unitSen: RP(1_000), weights: [{ nik: 'a', weightSen: 1 }, { nik: 'b', weightSen: 1 }, { nik: 'c', weightSen: 1 }] });
  assert.deepEqual(r.allocations.map((a) => a.amountSen), [RP(4_000), RP(3_000), RP(3_000)]);
  assert.equal(r.allocations.reduce((s, a) => s + a.amountSen, 0) + r.remainderSen, RP(10_000));
  const odd = allocateShu({ poolSen: RP(10_500), unitSen: RP(1_000), weights: [{ nik: 'a', weightSen: 3 }, { nik: 'b', weightSen: 7 }] });
  assert.deepEqual(odd, { allocations: [{ nik: 'a', amountSen: RP(3_000) }, { nik: 'b', amountSen: RP(7_000) }], remainderSen: RP(500) });
  assert.equal(code(() => allocateShu({ poolSen: RP(1), unitSen: 100, weights: [{ nik: 'a', weightSen: 0 }] })), 'SHU_TOTAL_ZERO');
  assert.equal(code(() => allocateShu({ poolSen: RP(1), unitSen: 100, weights: [{ nik: 'a', weightSen: 1 }, { nik: 'a', weightSen: 1 }] })), 'DUPLICATE_MEMBER');
});

// ---------- journal ----------
test('journal must balance, use explicit sides and more than one account', () => {
  assert.deepEqual(assertBalancedJournal([{ account: '1-101', debitSen: 500, creditSen: 0 }, { account: '2-201', debitSen: 0, creditSen: 500 }]), { debitSen: 500, creditSen: 500 });
  assert.equal(code(() => assertBalancedJournal([{ account: '1-101', debitSen: 500, creditSen: 0 }, { account: '2-201', debitSen: 0, creditSen: 499 }])), 'JOURNAL_UNBALANCED');
  assert.equal(code(() => assertBalancedJournal([{ account: '2-201', debitSen: 500, creditSen: 0 }, { account: '2-201', debitSen: 0, creditSen: 500 }])), 'JOURNAL_SAME_ACCOUNT');
  assert.equal(code(() => assertBalancedJournal([{ account: '1', debitSen: 5, creditSen: 5 }, { account: '2', debitSen: 0, creditSen: 0 }])), 'JOURNAL_LINE_INVALID');
  assert.equal(code(() => assertBalancedJournal([{ account: '1', debitSen: 5, creditSen: 0 }])), 'JOURNAL_EMPTY');
});
