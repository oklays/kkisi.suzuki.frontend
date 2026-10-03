import { InventoryManagement, type InventoryRepository } from '@koperasi/application/inventory';
import { guard, json, type AuthServices } from '../auth/http.ts';
import { inventoryRepository } from './services.ts';
import { inventoryErrorResponse } from './http-errors.ts';

type Factory = (write: boolean) => InventoryRepository;
export async function handleInventoryItems(services: AuthServices, request: Request, repoFactory: Factory = inventoryRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'inventory_so' });
  if (!g.ok) return g.response;
  try { return json(200, { items: await new InventoryManagement(repoFactory(false)).items(g.ctx, new URL(request.url).searchParams.get('q') ?? '') }); }
  catch (error) { return inventoryErrorResponse(services, error); }
}
export async function handleReadStockOpnames(services: AuthServices, request: Request, repoFactory: Factory = inventoryRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'inventory_so' });
  if (!g.ok) return g.response;
  try {
    const id = new URL(request.url).searchParams.get('id'), management = new InventoryManagement(repoFactory(false));
    return id === null ? json(200, { documents: await management.list(g.ctx) }) : json(200, { detail: await management.detail(g.ctx, Number(id)) });
  } catch (error) { return inventoryErrorResponse(services, error); }
}
export async function handleReadWarehouses(services: AuthServices, request: Request, repoFactory: Factory = inventoryRepository): Promise<Response> {
  const g = await guard(services, request, { permission: 'inventory_view' });
  if (!g.ok) return g.response;
  if (!g.ctx.canSwitchBranch) return json(403, { error: 'FORBIDDEN' });
  try { return json(200, { warehouses: await new InventoryManagement(repoFactory(false)).warehouses(g.ctx) }); }
  catch (error) { return inventoryErrorResponse(services, error); }
}
