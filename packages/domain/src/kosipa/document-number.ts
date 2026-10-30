import { KosipaError } from './errors.ts';

/**
 * KOSIPA document numbering (TASK-109; REQ-107, BR-116; 05 R-02, ANO-K06). Pure rules; allocation under concurrency is infrastructure.
 *
 * Verified legacy conventions (E1, kosipa/application/modules; FA-03A re-read every generator):
 *   - visible format = PREFIX + YYYY + MM + n, n left-padded with zeros to a minimum width and NEVER truncated (PHP str_pad);
 *     YYYY/MM = the server's current year/month (Asia/Jakarta) — except POT, whose YYYY/MM is the batch's payroll period (matrix_c.php:443);
 *   - "row-id" families take n = last id + 1, i.e. the id the new row is expected to get (global AUTO_INCREMENT, so numbers jump):
 *       KAS  simpanan_m.php:194-212   last id of trans_simpanan (no month filter)
 *       POT  matrix_c.php:443-458     last id of trans_potongan_bulanan (no month filter), period = payroll period
 *       PIN  pinjaman_m.php:551-573   last id among THIS MONTH's loans, or 1 when the month has none (legacy quirk: the first loan of a month
 *                                     is PIN…00001; native uses the row id instead — never colliding, documented deviation)
 *   - "period-sequence" families take n = count(rows of the month) + 1, 4-digit pattern ('000n','00n','0n'; for n >= 1000 legacy gives a
 *     5-digit '0n', native the 4-minimum str_pad form 'n' — both unique, documented):
 *       REG  master/models/anggota_m.php:160-185   members created this month
 *       DBT  simpanan_m.php:290-312                 savings DEBIT documents created this month
 * Native policy (R-02 proposed + spec): unique per scheme, allocated inside the creating transaction, verified unique before commit; a number
 * committed once is never issued again (documents are cancelled/voided, never deleted: REQ-123, FD-14); gaps are allowed (legacy has them);
 * a number held by a transaction that rolls back was never committed and may be issued again.
 * Rollback compatibility: for row-id families native keeps n = the new row's id, so legacy, resuming after a rollback with MAX(id)+1, can never
 * produce a number native already issued. A native per-period counter would collide with legacy's id basis almost immediately.
 */
export type NumberingStrategy = 'row-id' | 'period-sequence';
export type DocumentNumberScheme = {
  key: string; prefix: string; width: number; strategy: NumberingStrategy;
  /** clock = the current Jakarta month; document = a period carried by the document itself (payroll period). */
  period: 'clock' | 'document';
  /** Legacy table and column holding the number (for uniqueness checks against legacy-written rows). */
  table: string; column: string; legacySource: string;
};

export const DOCUMENT_NUMBER_SCHEMES = {
  'member-registration': { key: 'member-registration', prefix: 'REG', width: 4, strategy: 'period-sequence', period: 'clock', table: 'm_anggota', column: 'doc_no', legacySource: 'master/models/anggota_m.php:160-185' },
  'savings-withdrawal': { key: 'savings-withdrawal', prefix: 'DBT', width: 4, strategy: 'period-sequence', period: 'clock', table: 'trans_simpanan', column: 'doc_no', legacySource: 'simpanan/models/simpanan_m.php:290-312' },
  'loan': { key: 'loan', prefix: 'PIN', width: 5, strategy: 'row-id', period: 'clock', table: 'trans_pinjaman', column: 'doc_no', legacySource: 'pinjaman/models/pinjaman_m.php:551-573' },
  'savings-deposit': { key: 'savings-deposit', prefix: 'KAS', width: 5, strategy: 'row-id', period: 'clock', table: 'trans_simpanan', column: 'doc_no', legacySource: 'simpanan/models/simpanan_m.php:194-212' },
  'payroll-batch': { key: 'payroll-batch', prefix: 'POT', width: 5, strategy: 'row-id', period: 'document', table: 'trans_potongan_bulanan', column: 'doc_no', legacySource: 'payroll/controllers/matrix_c.php:443-458' },
} as const satisfies Record<string, DocumentNumberScheme>;
export type DocumentNumberSchemeKey = keyof typeof DOCUMENT_NUMBER_SCHEMES;

/** VAL-112 identifier shape; also the registry column size. */
export const DOCUMENT_NUMBER_MAX = 30;

export function documentNumberScheme(key: string): DocumentNumberScheme {
  if (!Object.prototype.hasOwnProperty.call(DOCUMENT_NUMBER_SCHEMES, key)) throw new KosipaError('NUMBERING_SCHEME_UNKNOWN');
  return DOCUMENT_NUMBER_SCHEMES[key as DocumentNumberSchemeKey];
}

/** YYYYMM of `now` in Asia/Jakarta (UTC+7, no daylight saving), the clock legacy's date('Y'), date('m') use. */
export function numberingPeriod(now: Date): string {
  const t = new Date(now.getTime() + 7 * 3600_000);
  const period = `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(period)) throw new KosipaError('NUMBERING_PERIOD_INVALID');
  return period;
}

export function formatDocumentNumber(scheme: DocumentNumberScheme, period: string, n: number): string {
  if (!/^\d{4}(0[1-9]|1[0-2])$/.test(period)) throw new KosipaError('NUMBERING_PERIOD_INVALID');
  if (!Number.isSafeInteger(n) || n < 1) throw new KosipaError('NUMBERING_SEQUENCE_INVALID');
  const docNo = `${scheme.prefix}${period}${String(n).padStart(scheme.width, '0')}`;
  if (docNo.length > DOCUMENT_NUMBER_MAX) throw new KosipaError('NUMBERING_OVERFLOW');
  return docNo;
}

/**
 * Sequence part of an existing number of this scheme and period, or null for numbers of other schemes, periods or legacy eras
 * (e.g. PINREG… never parses as PIN…, because the period digits must follow the prefix immediately).
 */
export function parseDocumentSequence(scheme: DocumentNumberScheme, period: string, docNo: string): number | null {
  const head = `${scheme.prefix}${period}`;
  if (!docNo.startsWith(head)) return null;
  const tail = docNo.slice(head.length);
  if (!/^\d+$/.test(tail)) return null;
  const n = Number(tail);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** period-sequence: strictly above every number already issued for scheme x period, by legacy (table) or natively (registry). */
export function nextPeriodSequence(existingNumbers: readonly string[], scheme: DocumentNumberScheme, period: string, registryMax: number | null): number {
  let max = registryMax ?? 0;
  for (const docNo of existingNumbers) { const n = parseDocumentSequence(scheme, period, docNo); if (n !== null && n > max) max = n; }
  return max + 1;
}

/** The period a number belongs to: the Jakarta month for clock schemes; the document's own period (YYYYMM) for document schemes. */
export function resolveNumberingPeriod(scheme: DocumentNumberScheme, now: Date, documentPeriod?: string): string {
  if (scheme.period === 'clock') {
    if (documentPeriod !== undefined) throw new KosipaError('NUMBERING_PERIOD_NOT_ALLOWED');
    return numberingPeriod(now);
  }
  const m = /^(\d{4})(\d{2})$/.exec(documentPeriod ?? '');
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new KosipaError('NUMBERING_PERIOD_INVALID');
  return documentPeriod as string;
}
