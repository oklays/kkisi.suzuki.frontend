import { parseProductCreate, type ProductCreateInput, type ProductCreateOptions, type ProductCreateResult } from '@koperasi/domain/inventory';
import type { ProductActor } from './edit-products.ts';
export type ProductAddMeta = { now: Date; ip: string };
export interface ProductAddRepository {
  options(ctx: ProductActor): Promise<ProductCreateOptions>;
  add(ctx: ProductActor, input: ProductCreateInput, meta: ProductAddMeta): Promise<ProductCreateResult>;
}
export class AddProducts {
  private readonly repository: ProductAddRepository;
  constructor(repository: ProductAddRepository) { this.repository = repository; }
  options(ctx: ProductActor) { return this.repository.options(ctx); }
  add(ctx: ProductActor, raw: unknown, meta: ProductAddMeta) { return this.repository.add(ctx, parseProductCreate(raw), meta); }
}
