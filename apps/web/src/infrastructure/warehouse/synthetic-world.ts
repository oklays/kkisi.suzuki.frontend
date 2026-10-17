import { WAREHOUSE_PERMISSIONS as P, advanceDispatch, closeShipmentForBranch, confirmItemMapping, proposeItemMapping, receiveShipment, registerDispatch, resolveShipmentDiscrepancy, retireItemMapping, type WarehouseActor, type WarehouseDeps, type WarehouseReadDeps } from '@koperasi/application/warehouse';
import { MemoryWarehouseStore } from './memory-store.ts';

/**
 * SYNTHETIC preview data for the Warehouse screens. Everything here is fictitious and built through the real use cases (so the shipments obey the real
 * rules), in memory, per process. It is NOT Gudang data and NOT TOKO stock: the authoritative Gudang schema has not been obtained (decision B2) and no
 * connection exists. The preview is off unless WAREHOUSE_PREVIEW_ENABLED=true and every page says it is synthetic.
 */
export const PREVIEW_WAREHOUSE_IDS = [5, 6] as const;
export type PreviewWorld = { read: WarehouseReadDeps; deps: WarehouseDeps; viewer: WarehouseActor };

const actor = (userId: number, permissions: string[], extra: Partial<Pick<WarehouseActor, 'storeCompanyId' | 'warehouseIds'>> = {}): WarehouseActor =>
  ({ userId, requestId: `synthetic-${userId}`, permissions: new Set(permissions), storeCompanyId: extra.storeCompanyId ?? null, warehouseIds: extra.warehouseIds ?? new Set() });

let cached: Promise<PreviewWorld> | null = null;
export function previewWorld(): Promise<PreviewWorld> { return (cached ??= build()); }
export const resetPreviewWorldForTests = () => { cached = null; };

async function build(): Promise<PreviewWorld> {
  const store = new MemoryWarehouseStore();
  let tick = 0; const now = () => new Date(Date.UTC(2026, 9, 1, 8, 0, tick++ * 60));
  const deps: WarehouseDeps = { mappings: store, shipments: store, items: store, now };
  for (const [id, code, unit, active] of [[11, 'SYN-G11', 'PCS', true], [12, 'SYN-G12', 'BOX', true], [13, 'SYN-G13', 'PCS', false], [14, 'SYN-G14', 'PCS', true]] as const)
    store.seedGudangItem({ id, active, code, barcode: `899000${id}`, unit });
  for (const company of [1, 2]) for (const [id, code, unit] of [[77, 'SYN-S77', 'PCS'], [78, 'SYN-S78', 'PCS'], [79, 'SYN-S79', 'PCS']] as const) store.seedStoreItem(company, { id, active: true, code, barcode: id === 77 ? '8990011' : id === 78 ? '8990012' : `x${id}`, unit });
  const admin = actor(1, [P.MAPPING_MANAGE, P.MAPPING_VIEW]), confirmer = actor(2, [P.MAPPING_MANAGE]);
  const maker = actor(10, [P.DISPATCH_CREATE, P.DISPATCH_VIEW], { warehouseIds: new Set(PREVIEW_WAREHOUSE_IDS) }), checker = actor(11, [P.DISPATCH_APPROVE, P.DISPATCH_RELEASE], { warehouseIds: new Set(PREVIEW_WAREHOUSE_IDS) });
  const branch1 = actor(20, [P.RECEIVE, P.RESOLVE, P.RECEIVING_VIEW], { storeCompanyId: 1 }), branch2 = actor(30, [P.RECEIVE, P.RESOLVE, P.RECEIVING_VIEW], { storeCompanyId: 2 });
  const RATIO = { kind: 'RATIO', numerator: 12, denominator: 1, approvedBy: 9, approvedAt: '2026-09-20T00:00:00Z', evidence: 'SYNTHETIC memo (fictitious)' } as const;

  // mappings: confirmed identical, confirmed with an approved ratio, proposed-only (not usable), retired
  const confirm = async (g: number, c: number, s: number, conversion: Parameters<typeof proposeItemMapping>[2]['conversion'], basis: 'barcode' | 'manual') => { const m = await proposeItemMapping(deps, admin, { gudangItemId: g, storeCompanyId: c, storeItemId: s, conversion, basis }); await confirmItemMapping(deps, confirmer, { ref: m.ref }); return m; };
  await confirm(11, 1, 77, { kind: 'IDENTICAL' }, 'barcode'); await confirm(12, 1, 78, RATIO, 'manual'); await confirm(11, 2, 77, { kind: 'IDENTICAL' }, 'barcode');
  await proposeItemMapping(deps, admin, { gudangItemId: 14, storeCompanyId: 1, storeItemId: 79, conversion: { kind: 'IDENTICAL' }, basis: 'manual' });
  const old = await confirm(14, 2, 79, { kind: 'IDENTICAL' }, 'manual'); await retireItemMapping(deps, confirmer, { ref: old.ref, reason: 'SYNTHETIC: replaced item' });

  const dispatch = async (n: number, dest: number, lines: { gudangItemId: number; quantity: number }[], multi = true) => {
    const sourceRef = `synthetic:dispatch:${String(n).padStart(4, '0')}`;
    await registerDispatch(deps, maker, { sourceRef, sourceWarehouseId: 5, destinationStoreCompanyId: dest, idempotencyKey: `idem-synthetic-${n}-0001`, receivingPolicy: { allowMultipleReceipts: multi }, lines });
    return sourceRef;
  };
  const move = async (ref: string, dest: number, ...steps: ('submit' | 'approve' | 'dispatch')[]) => { for (const a of steps) await advanceDispatch(deps, a === 'submit' ? maker : checker, { sourceRef: ref, destinationStoreCompanyId: dest, action: a }); };
  const recv = (ref: string, who: WarehouseActor, n: number, lines: { lineNo: number; acceptedQuantity: number; rejectedQuantity?: number; rejectedReason?: 'DAMAGED' | 'REJECTED' }[]) => receiveShipment(deps, who, { sourceRef: ref, eventKey: `event-synthetic-${ref.slice(-4)}-${n}`, lines: lines.map((l) => ({ rejectedQuantity: 0, rejectedReason: null, ...l })) as never });

  const a = await dispatch(1, 1, [{ gudangItemId: 11, quantity: 100 }, { gudangItemId: 12, quantity: 5 }]); await move(a, 1, 'submit', 'approve', 'dispatch');
  await recv(a, branch1, 1, [{ lineNo: 1, acceptedQuantity: 100 }, { lineNo: 2, acceptedQuantity: 60 }]);                               // fully received
  const b = await dispatch(2, 1, [{ gudangItemId: 11, quantity: 100 }]); await move(b, 1, 'submit', 'approve', 'dispatch');
  await recv(b, branch1, 1, [{ lineNo: 1, acceptedQuantity: 98 }]);                                                                      // partial: 2 outstanding
  const c = await dispatch(3, 1, [{ gudangItemId: 11, quantity: 50 }]); await move(c, 1, 'submit', 'approve', 'dispatch');
  await recv(c, branch1, 1, [{ lineNo: 1, acceptedQuantity: 45, rejectedQuantity: 5, rejectedReason: 'DAMAGED' }]);                      // 5 damaged, unresolved
  const d3 = await dispatch(4, 1, [{ gudangItemId: 11, quantity: 20 }]); await move(d3, 1, 'submit', 'approve', 'dispatch');
  await recv(d3, branch1, 1, [{ lineNo: 1, acceptedQuantity: 18 }]);
  await resolveShipmentDiscrepancy(deps, branch1, { sourceRef: d3, resolutionKey: 'resolution-synthetic-0004-1', lineNo: 1, target: 'OUTSTANDING', kind: 'SHORT_CLOSED', quantity: 2, reason: 'SYNTHETIC: shortage accepted' } as never);   // short-closed explicitly
  await closeShipmentForBranch(deps, branch1, { sourceRef: d3 });                                                                        // then closed
  await dispatch(5, 1, [{ gudangItemId: 11, quantity: 10 }]);                                                                            // DRAFT
  const f = await dispatch(6, 2, [{ gudangItemId: 11, quantity: 30 }]); await move(f, 2, 'submit', 'approve');                           // approved, not dispatched
  const g = await dispatch(7, 2, [{ gudangItemId: 11, quantity: 40 }], false); await move(g, 2, 'submit', 'approve', 'dispatch');        // dispatched, nothing received yet
  void branch2;

  const viewer = actor(900, [P.DISPATCH_VIEW, P.MAPPING_VIEW], { warehouseIds: new Set(PREVIEW_WAREHOUSE_IDS) });
  return { read: { mappings: store, shipments: store, now }, deps, viewer };
}
