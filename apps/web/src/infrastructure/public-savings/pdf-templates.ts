/**
 * Versioned submission-PDF templates. A submission's evidence envelope records the template and renderer it was
 * created under; renders and retries always use that recorded version, so a document is never re-rendered with a
 * newer layout than the one it was issued under. Never change a published template: add a new version instead.
 */
export const PDF_TEMPLATES = {
  /** Original layout: amounts printed as stored decimals. Frozen; historical submissions stay bound to it. */
  'kkisi-pss-a4/v1': { renderer: 'pdf-lib-1.17.1/kkisi-pss-v1', amounts: 'raw', layout: 'v1' },
  /** KKISI Rupiah document standard (`Rp100.000,25`) plus the requested amount in words (terbilang). */
  'kkisi-pss-a4/v2': { renderer: 'pdf-lib-1.17.1/kkisi-pss-v2', amounts: 'document', layout: 'v2' },
  /** KKISI Financial Document Standard v3 card layout (masthead, side-by-side deduction cards, terbilang banner, signature card, SHA-256 seal). */
  'kkisi-pss-a4/v3': { renderer: 'pdf-lib-1.17.1/kkisi-pss-v3', amounts: 'document', layout: 'v3' },
  'kkisi-pss-wajib-a4/v1': { renderer: 'pdf-lib-1.17.1/kkisi-pss-v1', amounts: 'raw', layout: 'v1' },
  'kkisi-pss-wajib-a4/v2': { renderer: 'pdf-lib-1.17.1/kkisi-pss-wajib-v2', amounts: 'document', layout: 'v2' },
  'kkisi-pss-wajib-a4/v3': { renderer: 'pdf-lib-1.17.1/kkisi-pss-wajib-v3', amounts: 'document', layout: 'v3' },
} as const;

export type PdfTemplateVersion = keyof typeof PDF_TEMPLATES;
/** What a caller that records no version gets; keeps pre-v2 behaviour for any envelope without an explicit version. */
export const LEGACY_PDF_TEMPLATE: PdfTemplateVersion = 'kkisi-pss-a4/v1';
/** Pinned into the evidence envelope of every NEW submission. */
export const CURRENT_PDF_TEMPLATE: PdfTemplateVersion = 'kkisi-pss-a4/v3';

export const isPdfTemplate = (version: string): version is PdfTemplateVersion => Object.prototype.hasOwnProperty.call(PDF_TEMPLATES, version);
