import type { OutboxRecord } from './stock-outbox.ts';

/**
 * Cross-store reconciliation of the Warehouse outbox against what the TOKO posting side actually recorded (checkpoint 11).
 * Pure: the caller supplies both snapshots (two separate databases cannot be joined). The classification is what an operator needs after
 * any interruption: which hand-offs are complete, which only lack the acknowledgement (safe to re-drain: the target answers ALREADY_APPLIED),
 * and which are DANGEROUS (acknowledged without a posting, or a posting with different content).
 */
export type PostingSnapshot = { intentKey: string; sourceRef: string; eventKey: string; storeCompanyId: number; storeItemId: number; mappingRef: string; quantity: number };
export type StockSnapshot = { storeCompanyId: number; storeItemId: number; quantity: number };

export type ReconciliationFinding =
  | 'CONSISTENT'                    // outbox APPLIED and an identical posting exists
  | 'PENDING_NOT_POSTED'            // outbox PENDING, nothing posted yet: a normal drain will apply it
  | 'POSTED_NOT_ACKNOWLEDGED'       // outbox PENDING, posting exists with identical content: crash/network loss before the acknowledgement; re-drain repairs it, no double post
  | 'DEAD_NOT_POSTED'               // outbox DEAD, nothing posted: needs a human (requeue)
  | 'DEAD_BUT_POSTED'               // outbox DEAD although a posting exists: acknowledge manually (do not requeue as a fresh post)
  | 'ACKNOWLEDGED_WITHOUT_POSTING'  // CRITICAL: outbox says APPLIED but TOKO has no posting
  | 'CONTENT_MISMATCH'              // CRITICAL: a posting exists under this key with different content
  | 'POSTING_WITHOUT_OUTBOX';       // CRITICAL: a posting no outbox record explains

export type ReconciliationRow = { intentKey: string; finding: ReconciliationFinding; outbox: OutboxRecord['status'] | 'MISSING'; posted: boolean };
export type StockInvariantRow = { storeCompanyId: number; storeItemId: number; stock: number; postedSum: number; holds: boolean };
export type CrossStoreReport = { rows: ReconciliationRow[]; counts: Record<ReconciliationFinding, number>; stock: StockInvariantRow[]; critical: boolean; repairable: boolean; invariantHolds: boolean };

const FINDINGS: ReconciliationFinding[] = ['CONSISTENT', 'PENDING_NOT_POSTED', 'POSTED_NOT_ACKNOWLEDGED', 'DEAD_NOT_POSTED', 'DEAD_BUT_POSTED', 'ACKNOWLEDGED_WITHOUT_POSTING', 'CONTENT_MISMATCH', 'POSTING_WITHOUT_OUTBOX'];
const CRITICAL: ReconciliationFinding[] = ['ACKNOWLEDGED_WITHOUT_POSTING', 'CONTENT_MISMATCH', 'POSTING_WITHOUT_OUTBOX'];

const sameContent = (o: OutboxRecord, p: PostingSnapshot) => o.sourceRef === p.sourceRef && o.eventKey === p.eventKey && o.storeCompanyId === p.storeCompanyId && o.storeItemId === p.storeItemId && o.mappingRef === p.mappingRef && o.quantity === p.quantity;

export function reconcileOutboxAgainstPostings(outbox: readonly OutboxRecord[], postings: readonly PostingSnapshot[], stock: readonly StockSnapshot[]): CrossStoreReport {
  const posted = new Map(postings.map((p) => [p.intentKey, p]));
  const seen = new Set<string>(); const rows: ReconciliationRow[] = [];
  for (const o of outbox) {
    seen.add(o.intentKey); const p = posted.get(o.intentKey);
    let finding: ReconciliationFinding;
    if (p && !sameContent(o, p)) finding = 'CONTENT_MISMATCH';
    else if (o.status === 'APPLIED') finding = p ? 'CONSISTENT' : 'ACKNOWLEDGED_WITHOUT_POSTING';
    else if (o.status === 'PENDING') finding = p ? 'POSTED_NOT_ACKNOWLEDGED' : 'PENDING_NOT_POSTED';
    else finding = p ? 'DEAD_BUT_POSTED' : 'DEAD_NOT_POSTED';
    rows.push({ intentKey: o.intentKey, finding, outbox: o.status, posted: !!p });
  }
  for (const p of postings) if (!seen.has(p.intentKey)) rows.push({ intentKey: p.intentKey, finding: 'POSTING_WITHOUT_OUTBOX', outbox: 'MISSING', posted: true });
  rows.sort((a, b) => (a.intentKey < b.intentKey ? -1 : a.intentKey > b.intentKey ? 1 : 0));
  const counts = Object.fromEntries(FINDINGS.map((f) => [f, rows.filter((r) => r.finding === f).length])) as Record<ReconciliationFinding, number>;

  const sums = new Map<string, number>(); for (const p of postings) { const k = `${p.storeCompanyId}:${p.storeItemId}`; sums.set(k, (sums.get(k) ?? 0) + p.quantity); }
  const stockMap = new Map(stock.map((s) => [`${s.storeCompanyId}:${s.storeItemId}`, s]));
  const keys = [...new Set([...sums.keys(), ...stockMap.keys()])].sort();
  const stockRows: StockInvariantRow[] = keys.map((k) => { const s = stockMap.get(k); const [c, i] = k.split(':').map(Number); const have = s?.quantity ?? 0, sum = sums.get(k) ?? 0; return { storeCompanyId: c, storeItemId: i, stock: have, postedSum: sum, holds: have === sum }; });
  const critical = CRITICAL.some((f) => counts[f] > 0);
  return { rows, counts, stock: stockRows, critical, repairable: !critical && counts.POSTED_NOT_ACKNOWLEDGED > 0, invariantHolds: stockRows.every((r) => r.holds) };
}
