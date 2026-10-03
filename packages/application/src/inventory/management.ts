import { InventoryError, inventoryId, parseStockOpnameCreate, parseStockOpnameCount, parseWarehouse, type InventoryItem, type StockOpname, type StockOpnameDetail, type Warehouse, type StockOpnameCreate, type StockOpnameCount, type WarehouseInput } from '@koperasi/domain/inventory';

export type InventoryContext = { userId: number; companyId: number; canSwitchBranch: boolean };
export interface InventoryRepository {
  list(ctx: InventoryContext): Promise<StockOpname[]>;
  detail(ctx: InventoryContext, id: number): Promise<StockOpnameDetail>;
  items(ctx: InventoryContext, term: string): Promise<InventoryItem[]>;
  warehouses(ctx: InventoryContext): Promise<Warehouse[]>;
  saveWarehouse(ctx: InventoryContext, input: WarehouseInput): Promise<Warehouse>;
  create(ctx: InventoryContext, input: StockOpnameCreate, now: Date): Promise<StockOpname>;
  count(ctx: InventoryContext, input: StockOpnameCount, now: Date): Promise<StockOpnameDetail>;
  approve(ctx: InventoryContext, id: number, now: Date): Promise<StockOpnameDetail>;
  cancel(ctx: InventoryContext, id: number, now: Date): Promise<void>;
}
export class InventoryManagement {
  private readonly repository: InventoryRepository;
  constructor(repository: InventoryRepository) { this.repository = repository; }
  async list(ctx: InventoryContext) { return this.repository.list(ctx); }
  async detail(ctx: InventoryContext, id: number) { return this.repository.detail(ctx, inventoryId(id)); }
  async items(ctx: InventoryContext, term: string) {
    if (typeof term !== 'string' || term.length > 100) throw new InventoryError('INVALID_INPUT');
    return this.repository.items(ctx, term.trim());
  }
  async warehouses(ctx: InventoryContext) {
    if (!ctx.canSwitchBranch) throw new InventoryError('FORBIDDEN');
    return this.repository.warehouses(ctx);
  }
  async saveWarehouse(ctx: InventoryContext, value: unknown) {
    if (!ctx.canSwitchBranch) throw new InventoryError('FORBIDDEN');
    return this.repository.saveWarehouse(ctx, parseWarehouse(value));
  }
  async create(ctx: InventoryContext, value: unknown, now: Date) { return this.repository.create(ctx, parseStockOpnameCreate(value), now); }
  async count(ctx: InventoryContext, value: unknown, now: Date) { return this.repository.count(ctx, parseStockOpnameCount(value), now); }
  async approve(ctx: InventoryContext, id: number, now: Date) { return this.repository.approve(ctx, inventoryId(id), now); }
  async cancel(ctx: InventoryContext, id: number, now: Date) { return this.repository.cancel(ctx, inventoryId(id), now); }
}
