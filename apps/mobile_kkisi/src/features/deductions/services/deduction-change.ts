// Savings-deduction change (mockup "Pengajuan Potongan"). The rule is shared with apps/web, which re-checks it when it records the request:
// Simpanan Wajib may only go up; a new amount must differ from the current one and be a whole Rupiah amount. Effective from next month.
export { validateDeductionChange, type DeductionOption } from '@koperasi/domain/kosipa/member-request';
