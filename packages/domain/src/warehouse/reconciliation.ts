import { WarehouseError } from './errors.ts';
import { addQuantity } from './quantity.ts';
import type { Shipment } from './shipment.ts';

/**
 * Pure quantity reconciliation of one shipment (spec REQ-052). Deterministic: the result depends only on the shipment's
 * recorded events, never on time or call order. Per line, in TOKO units:
 *   expected = accepted + rejected + shortClosed + outstanding        (checked; a violation is an INVARIANT_VIOLATION)
 * Only `accepted` may ever become stock. `outstanding` is still awaited; shortClosed/rejected-handled units were decided
 * explicitly by a named actor. Every figure traces back to the source document and the event keys that produced it.
 */
export type LineReconciliation = {
  lineNo: number; gudangItemId: number; storeItemId: number; mappingRef: string;
  expectedQuantity: number;
  acceptedQuantity: number; rejectedQuantity: number;
  shortClosedQuantity: number; rejectedResolvedQuantity: number;
  outstandingQuantity: number; unresolvedRejectedQuantity: number;
};
export type Outcome = 'NOT_RECEIVED' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED' | 'RECEIVED_WITH_DISCREPANCY';
export type Reconciliation = {
  sourceRef: string; destinationStoreCompanyId: number; lines: LineReconciliation[];
  totals: { expected: number; accepted: number; rejected: number; shortClosed: number; outstanding: number; unresolvedRejected: number };
  /** FULLY_RECEIVED only when every expected unit was accepted: shortages and rejections are never "close enough". */
  outcome: Outcome;
  hasOpenDiscrepancy: boolean;
  receiptKeys: string[]; resolutionKeys: string[];
};

export function reconcile(s: Shipment): Reconciliation {
  const lines: LineReconciliation[] = s.lines.map((line) => {
    let accepted = 0, rejected = 0, shortClosed = 0, rejectedResolved = 0;
    for (const receipt of s.receipts) for (const l of receipt.lines) if (l.lineNo === line.lineNo) { accepted = addQuantity(accepted, l.acceptedQuantity); rejected = addQuantity(rejected, l.rejectedQuantity); }
    for (const r of s.resolutions) if (r.lineNo === line.lineNo) { if (r.target === 'OUTSTANDING') shortClosed = addQuantity(shortClosed, r.quantity); else rejectedResolved = addQuantity(rejectedResolved, r.quantity); }
    const outstanding = line.expectedQuantity - accepted - rejected - shortClosed;
    const unresolvedRejected = rejected - rejectedResolved;
    if (outstanding < 0 || unresolvedRejected < 0) throw new WarehouseError('INVARIANT_VIOLATION');
    return {
      lineNo: line.lineNo, gudangItemId: line.gudangItemId, storeItemId: line.storeItemId, mappingRef: line.mappingRef, expectedQuantity: line.expectedQuantity,
      acceptedQuantity: accepted, rejectedQuantity: rejected, shortClosedQuantity: shortClosed, rejectedResolvedQuantity: rejectedResolved,
      outstandingQuantity: outstanding, unresolvedRejectedQuantity: unresolvedRejected,
    };
  });
  const sum = (pick: (l: LineReconciliation) => number) => lines.reduce((t, l) => addQuantity(t, pick(l)), 0);
  const totals = { expected: sum((l) => l.expectedQuantity), accepted: sum((l) => l.acceptedQuantity), rejected: sum((l) => l.rejectedQuantity), shortClosed: sum((l) => l.shortClosedQuantity), outstanding: sum((l) => l.outstandingQuantity), unresolvedRejected: sum((l) => l.unresolvedRejectedQuantity) };
  const anything = totals.accepted + totals.rejected + totals.shortClosed > 0;
  const outcome: Outcome = totals.accepted === totals.expected ? 'FULLY_RECEIVED'
    : !anything ? 'NOT_RECEIVED'
    : totals.outstanding > 0 ? 'PARTIALLY_RECEIVED' : 'RECEIVED_WITH_DISCREPANCY';
  return {
    sourceRef: s.sourceRef, destinationStoreCompanyId: s.destinationStoreCompanyId, lines, totals, outcome,
    hasOpenDiscrepancy: totals.outstanding > 0 && anything || totals.unresolvedRejected > 0,
    receiptKeys: s.receipts.map((r) => r.eventKey), resolutionKeys: s.resolutions.map((r) => r.resolutionKey),
  };
}

/**
 * The stock the destination branch may add, as deterministic QUANTITY intents (not mutations, not valuation). One intent per
 * (receiving event, line) with a stable key, so a downstream writer that applies each key at most once cannot double-post
 * a repeated or replayed event. Rejected and damaged units are never included.
 */
export type StockIntent = { intentKey: string; sourceRef: string; eventKey: string; storeCompanyId: number; storeItemId: number; mappingRef: string; quantity: number };
export function stockIntents(s: Shipment): StockIntent[] {
  const byLine = new Map(s.lines.map((l) => [l.lineNo, l]));
  const out: StockIntent[] = [];
  for (const receipt of s.receipts) {
    for (const l of [...receipt.lines].sort((a, b) => a.lineNo - b.lineNo)) {
      const line = byLine.get(l.lineNo);
      if (!line) throw new WarehouseError('INVARIANT_VIOLATION');
      if (l.acceptedQuantity > 0) out.push({ intentKey: `${s.sourceRef}|${receipt.eventKey}|${l.lineNo}`, sourceRef: s.sourceRef, eventKey: receipt.eventKey, storeCompanyId: s.destinationStoreCompanyId, storeItemId: line.storeItemId, mappingRef: line.mappingRef, quantity: l.acceptedQuantity });
    }
  }
  return out;
}
