import { parseProductEdit, parseProductAdjustment, productId, type ProductEditInput, type ProductAdjustmentInput, type ProductEditSnapshot } from '@koperasi/domain/inventory';
export type ProductActor = { userId: number; companyId: number };
export interface ProductEditRepository {
  snapshot(ctx: ProductActor, id: number): Promise<ProductEditSnapshot>;
  save(ctx: ProductActor, input: ProductEditInput, now: Date): Promise<{ id: number }>;
  adjust(ctx: ProductActor, input: ProductAdjustmentInput, now: Date): Promise<{ id: number; stock: number; delta: number }>;
}
export class EditProducts {
  private readonly repository: ProductEditRepository;
  constructor(repository: ProductEditRepository) { this.repository = repository; }
  snapshot(ctx: ProductActor, id: number) { return this.repository.snapshot(ctx, productId(id)); }
  save(ctx: ProductActor, raw: unknown, now: Date) { return this.repository.save(ctx, parseProductEdit(raw), now); }
  adjust(ctx: ProductActor, raw: unknown, now: Date) { return this.repository.adjust(ctx, parseProductAdjustment(raw), now); }
}
