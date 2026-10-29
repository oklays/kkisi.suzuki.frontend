import type { DraftErrors, MockSavingsService, PrototypeDraft, ProvisionalRules } from './types.ts';

export const fixture = Object.freeze({
  provenance: 'SYNTHETIC_ONLY' as const,
  name: 'Anggota contoh', identifier: '•••• 0042', section: 'Tim Produksi Contoh',
  previousRupiah: '100000', requestedPeriod: 'November 2026 (contoh)',
});
export const provisionalRules: ProvisionalRules = Object.freeze({
  status: 'PROVISIONAL_UI_ONLY', minimumRupiah: '1', maximumRupiah: null,
});

// UI feedback for explicitly provisional fixtures. Never use as business approval/authorization.
export function validatePrototypeDraft(draft: PrototypeDraft, rules: ProvisionalRules): DraftErrors {
  const errors: DraftErrors = {};
  if (!/^(0|[1-9][0-9]{0,15})$/.test(draft.amountRupiah)) {
    errors.amountRupiah = 'Isi angka rupiah bulat, tanpa desimal.';
  } else if (BigInt(draft.amountRupiah) < BigInt(rules.minimumRupiah) || (rules.maximumRupiah !== null && BigInt(draft.amountRupiah) > BigInt(rules.maximumRupiah))) {
    errors.amountRupiah = 'Nominal di luar rentang contoh. Aturan bisnis belum disahkan.';
  }
  if (!draft.hasSignature) errors.signature = 'Tambahkan tanda tangan simulasi atau gunakan contoh yang tersedia.';
  if (!draft.consent) errors.consent = 'Centang persetujuan setelah memeriksa isian contoh.';
  return errors;
}

export function createMockService({ failFirstSubmit = false, delayMs = 250 }: {failFirstSubmit?: boolean; delayMs?: number} = {}): MockSavingsService {
  let shouldFail = failFirstSubmit;
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, delayMs));
  return {
    async verify(code) { await pause(); return code === '123456'; },
    async submit() {
      await pause();
      if (shouldFail) { shouldFail = false; throw new Error('SIMULATED_UNAVAILABLE'); }
      return { provenance: 'SYNTHETIC_ONLY', reference: 'DEMO-SS-0042' };
    },
  };
}
