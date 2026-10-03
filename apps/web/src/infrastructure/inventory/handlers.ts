import { InventoryManagement, type InventoryRepository } from '@koperasi/application/inventory';
import { InventoryError } from '@koperasi/domain/inventory';
import { guard, json, readJson, type AuthServices } from '../auth/http.ts';
import { inventoryRepository } from './services.ts';
import { inventoryErrorResponse } from './http-errors.ts';
import { handleReadStockOpnames, handleReadWarehouses } from './read-handlers.ts';
export { handleInventoryItems } from './read-handlers.ts';

type Factory = (write: boolean) => InventoryRepository;
export async function handleStockOpnames(services: AuthServices, request: Request, repoFactory: Factory = inventoryRepository): Promise<Response> {
  if (request.method === 'GET') return handleReadStockOpnames(services, request, repoFactory);
  const g = await guard(services, request, { permission: 'inventory_so', csrf: true });
  if (!g.ok) return g.response;
  try {
    const raw = await readJson(request, 6000);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InventoryError('INVALID_INPUT');
    const body = raw as Record<string, unknown>;
    if (!['create', 'count', 'approve', 'cancel'].includes(String(body.action))) throw new InventoryError('INVALID_INPUT');
    const management = new InventoryManagement(repoFactory(true)), now = services.deps.clock.now();
    let output: object, id: number;
    if (body.action === 'create') { const document = await management.create(g.ctx, body, now); output = { document }; id = document.id; }
    else if (body.action === 'count') { const detail = await management.count(g.ctx, body, now); output = { detail }; id = detail.document.id; }
    else if (body.action === 'approve') { const detail = await management.approve(g.ctx, body.id as number, now); output = { detail }; id = detail.document.id; }
    else { await management.cancel(g.ctx, body.id as number, now); output = { canceled: true }; id = body.id as number; }
    services.deps.log(`inventory_${body.action}`, { actorId: g.ctx.userId, companyId: g.ctx.companyId, documentId: id });
    return json(200, output);
  } catch (error) { return inventoryErrorResponse(services, error); }
}
export async function handleWarehouses(services: AuthServices, request: Request, repoFactory: Factory = inventoryRepository): Promise<Response> {
  if (request.method === 'GET') return handleReadWarehouses(services, request, repoFactory);
  const g = await guard(services, request, { permission: 'inventory_view', csrf: true });
  if (!g.ok) return g.response;
  if (!g.ctx.canSwitchBranch) return json(403, { error: 'FORBIDDEN' });
  try {
    const body = await readJson(request, 3000);
    const management = new InventoryManagement(repoFactory(true));
    const warehouse = await management.saveWarehouse(g.ctx, body);
    services.deps.log('inventory_warehouse_saved', { actorId: g.ctx.userId, companyId: g.ctx.companyId, warehouseId: warehouse.id });
    return json(200, { warehouse });
  } catch (error) { return inventoryErrorResponse(services, error); }
}
