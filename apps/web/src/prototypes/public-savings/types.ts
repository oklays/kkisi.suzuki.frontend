// Presentation contracts only. Not the CP1 domain/application or submission API contract.
export type PrototypeScenario = 'verification' | 'loading' | 'ready' | 'invalid' | 'expired' | 'revoked' | 'consumed' | 'unavailable' | 'success' | 'submit-error';
export type PrototypeDraft = { amountRupiah: string; hasSignature: boolean; consent: boolean };
export type DraftErrors = Partial<Record<'amountRupiah' | 'signature' | 'consent', string>>;
export type SignaturePoint = { x: number; y: number };
export type ProvisionalRules = { status: 'PROVISIONAL_UI_ONLY'; minimumRupiah: string; maximumRupiah: string | null };
export type MockReceipt = { provenance: 'SYNTHETIC_ONLY'; reference: string };
export type MockSavingsService = { verify(code: string): Promise<boolean>; submit(draft: Readonly<PrototypeDraft>): Promise<MockReceipt> };
