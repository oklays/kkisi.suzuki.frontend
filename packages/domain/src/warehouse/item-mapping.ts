import { WarehouseError } from './errors.ts';
import { validateUnitConversion, type UnitConversion } from './unit-conversion.ts';

/**
 * Item identity mapping between a Gudang item and a TOKO item of one branch (spec REQ-051). Ids are NEVER assumed equal
 * across the two databases and products are NEVER matched by name: candidates come only from an exact barcode, then an
 * exact item code, and become a mapping only through an explicit propose -> confirm step by a named actor.
 */
export type ItemFacts = { id: number; active: boolean; code: string; barcode: string | null; unit: string };
export type MappingBasis = 'barcode' | 'item_code' | 'manual';
export type MappingStatus = 'PROPOSED' | 'CONFIRMED' | 'RETIRED';

export type ItemMapping = {
  /** Stable, deterministic external reference derived only from the three identities (never from time or order). */
  ref: string;
  gudangItemId: number;
  storeCompanyId: number;
  storeItemId: number;
  gudangUnit: string;
  storeUnit: string;
  conversion: UnitConversion;
  basis: MappingBasis;
  status: MappingStatus;
  proposedBy: number; proposedAt: string;
  confirmedBy: number | null; confirmedAt: string | null;
  retiredBy: number | null; retiredAt: string | null; retireReason: string | null;
};

const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function mappingRef(gudangItemId: number, storeCompanyId: number, storeItemId: number): string {
  if (![gudangItemId, storeCompanyId, storeItemId].every(positiveId)) throw new WarehouseError('INVALID_REFERENCE');
  return `map:g${gudangItemId}:c${storeCompanyId}:s${storeItemId}`;
}

export type Candidate = { storeItemId: number; basis: 'barcode' | 'item_code' };
export type Suggestion = { candidates: Candidate[]; ambiguous: boolean };

/**
 * Suggestions only (a suggestion is not a mapping). Exact barcode first; only when no barcode matches, exact item code.
 * More than one match at the winning level is flagged ambiguous and the caller must choose explicitly. Inactive TOKO items
 * are never suggested. Names are not consulted.
 */
export function suggestCandidates(gudangItem: ItemFacts, storeItems: readonly ItemFacts[]): Suggestion {
  const live = storeItems.filter((s) => s.active);
  const barcode = norm(gudangItem.barcode);
  const byBarcode = barcode ? live.filter((s) => norm(s.barcode) === barcode) : [];
  const code = norm(gudangItem.code);
  const level = byBarcode.length > 0
    ? byBarcode.map((s): Candidate => ({ storeItemId: s.id, basis: 'barcode' }))
    : (code ? live.filter((s) => norm(s.code) === code).map((s): Candidate => ({ storeItemId: s.id, basis: 'item_code' })) : []);
  const candidates = level.sort((a, b) => a.storeItemId - b.storeItemId);
  return { candidates, ambiguous: candidates.length > 1 };
}

const isLive = (m: ItemMapping) => m.status !== 'RETIRED';

/** Duplicate / ambiguity guard against the existing book. One live mapping per (gudang item, branch) AND per (branch, TOKO item). */
export function assertNoConflict(book: readonly ItemMapping[], gudangItemId: number, storeCompanyId: number, storeItemId: number): void {
  for (const m of book.filter(isLive)) {
    if (m.storeCompanyId !== storeCompanyId) continue;
    if (m.gudangItemId === gudangItemId) throw new WarehouseError('DUPLICATE_MAPPING');       // even to a different TOKO item: retire first
    if (m.storeItemId === storeItemId) throw new WarehouseError('AMBIGUOUS_MAPPING');         // two Gudang items feeding one TOKO item
  }
}

export type ProposeInput = {
  gudangItem: ItemFacts | null; storeCompanyId: number; storeItem: ItemFacts | null; conversion: UnitConversion;   // null = not found: refused as ITEM_NOT_FOUND
  basis: MappingBasis; actorUserId: number; at: string;
};

export function proposeMapping(input: ProposeInput, book: readonly ItemMapping[]): ItemMapping {
  const { gudangItem, storeItem } = input;
  if (!gudangItem || !storeItem) throw new WarehouseError('ITEM_NOT_FOUND');
  if (!gudangItem.active || !storeItem.active) throw new WarehouseError('ITEM_INACTIVE');
  if (!positiveId(input.actorUserId) || !input.at) throw new WarehouseError('INVALID_REFERENCE');
  validateUnitConversion(gudangItem.unit, storeItem.unit, input.conversion);
  assertNoConflict(book, gudangItem.id, input.storeCompanyId, storeItem.id);
  return {
    ref: mappingRef(gudangItem.id, input.storeCompanyId, storeItem.id),
    gudangItemId: gudangItem.id, storeCompanyId: input.storeCompanyId, storeItemId: storeItem.id,
    gudangUnit: gudangItem.unit.trim(), storeUnit: storeItem.unit.trim(), conversion: input.conversion, basis: input.basis,
    status: 'PROPOSED', proposedBy: input.actorUserId, proposedAt: input.at,
    confirmedBy: null, confirmedAt: null, retiredBy: null, retiredAt: null, retireReason: null,
  };
}

/** Explicit verification step. Re-checks both items and the unit rule at confirmation time. */
export function confirmMapping(mapping: ItemMapping, facts: { gudangItem: ItemFacts | null; storeItem: ItemFacts | null }, actorUserId: number, at: string): ItemMapping {
  if (mapping.status !== 'PROPOSED') throw new WarehouseError('MAPPING_INVALID_STATE');
  if (!facts.gudangItem || !facts.storeItem) throw new WarehouseError('ITEM_NOT_FOUND');
  if (!facts.gudangItem.active || !facts.storeItem.active) throw new WarehouseError('ITEM_INACTIVE');
  if (facts.gudangItem.id !== mapping.gudangItemId || facts.storeItem.id !== mapping.storeItemId) throw new WarehouseError('MAPPING_INCONSISTENT');
  validateUnitConversion(facts.gudangItem.unit, facts.storeItem.unit, mapping.conversion);
  if (!positiveId(actorUserId) || !at) throw new WarehouseError('INVALID_REFERENCE');
  return { ...mapping, status: 'CONFIRMED', confirmedBy: actorUserId, confirmedAt: at };
}

export function retireMapping(mapping: ItemMapping, actorUserId: number, at: string, reason: string): ItemMapping {
  if (mapping.status === 'RETIRED') throw new WarehouseError('MAPPING_INVALID_STATE');
  const clean = (reason ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (clean.length < 3 || clean.length > 200) throw new WarehouseError('REASON_REQUIRED');
  if (!positiveId(actorUserId) || !at) throw new WarehouseError('INVALID_REFERENCE');
  return { ...mapping, status: 'RETIRED', retiredBy: actorUserId, retiredAt: at, retireReason: clean };
}

/**
 * The mapping to use for posting a Gudang item into a branch: CONFIRMED only, and both items must still be active.
 * Proposed, retired or missing mappings are refused; there is no name-based or id-equality fallback.
 */
export function resolveMapping(book: readonly ItemMapping[], gudangItemId: number, storeCompanyId: number, items: { gudangItem: ItemFacts | null; storeItem: ItemFacts | null }): ItemMapping {
  const candidates = book.filter((m) => m.gudangItemId === gudangItemId && m.storeCompanyId === storeCompanyId);
  const live = candidates.filter(isLive);
  if (live.length > 1) throw new WarehouseError('AMBIGUOUS_MAPPING');
  const mapping = live[0];
  if (!mapping) throw new WarehouseError(candidates.length > 0 ? 'MAPPING_RETIRED' : 'MAPPING_NOT_FOUND');
  if (mapping.status !== 'CONFIRMED') throw new WarehouseError('MAPPING_NOT_CONFIRMED');
  if (!items.gudangItem || !items.storeItem) throw new WarehouseError('ITEM_NOT_FOUND');
  if (!items.gudangItem.active || !items.storeItem.active) throw new WarehouseError('ITEM_INACTIVE');
  if (items.gudangItem.id !== mapping.gudangItemId || items.storeItem.id !== mapping.storeItemId) throw new WarehouseError('MAPPING_INCONSISTENT');
  return mapping;
}
