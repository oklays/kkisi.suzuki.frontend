import type { ItemRepository } from '../../../domain/inventory/item-repository.ts';
import { ProductReadError } from '../../../domain/shared/product-read-error.ts';

function positiveId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export class ReadProductsUseCase {
  private readonly items: ItemRepository;

  constructor(items: ItemRepository) { this.items = items; }

  async search(input: { companyId: number; term?: string; limit?: number; categoryId?: number }) {
    if (!positiveId(input.companyId)) throw new ProductReadError('INVALID_INPUT');
    if (input.term !== undefined && typeof input.term !== 'string') {
      throw new ProductReadError('INVALID_INPUT');
    }
    if (input.categoryId !== undefined && !positiveId(input.categoryId)) {
      throw new ProductReadError('INVALID_INPUT');
    }
    const limit = input.limit ?? 20;
    const term = input.term?.trim() ?? '';
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || term.length > 100) {
      throw new ProductReadError('INVALID_INPUT');
    }
    try {
      return await this.items.search({
        companyId: input.companyId, term, limit,
        ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
      });
    } catch (error) {
      if (error instanceof ProductReadError) throw error;
      throw new ProductReadError('UNEXPECTED');
    }
  }

  async findById(input: { companyId: number; id: number }) {
    if (!positiveId(input.companyId) || !positiveId(input.id)) {
      throw new ProductReadError('INVALID_INPUT');
    }
    try {
      const item = await this.items.findById(input);
      if (!item) throw new ProductReadError('NOT_FOUND');
      return item;
    } catch (error) {
      if (error instanceof ProductReadError) throw error;
      throw new ProductReadError('UNEXPECTED');
    }
  }

  /** Optimised exact-barcode lookup for scanner input */
  async findByBarcode(input: { companyId: number; barcode: string }) {
    if (!positiveId(input.companyId)) throw new ProductReadError('INVALID_INPUT');
    const barcode = typeof input.barcode === 'string' ? input.barcode.trim() : '';
    if (!barcode || barcode.length > 100) throw new ProductReadError('INVALID_INPUT');
    try {
      const item = await this.items.findByBarcode({ companyId: input.companyId, barcode });
      if (!item) throw new ProductReadError('NOT_FOUND');
      return item;
    } catch (error) {
      if (error instanceof ProductReadError) throw error;
      throw new ProductReadError('UNEXPECTED');
    }
  }

  async categories(input: { companyId: number }) {
    if (!positiveId(input.companyId)) throw new ProductReadError('INVALID_INPUT');
    try {
      return await this.items.listCategories({ companyId: input.companyId });
    } catch (error) {
      if (error instanceof ProductReadError) throw error;
      throw new ProductReadError('UNEXPECTED');
    }
  }
}
