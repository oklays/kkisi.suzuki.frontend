import { ProductReadError, type MasterProductQuery, type MasterProductPage } from '@koperasi/domain/inventory';
export interface MasterProductRepository { list(query: MasterProductQuery): Promise<MasterProductPage> }
export class ReadMasterProducts {
  private readonly repository: MasterProductRepository;
  constructor(repository: MasterProductRepository) { this.repository = repository; }
  async list(input: Partial<Omit<MasterProductQuery, 'companyId'>> & { companyId: number }): Promise<MasterProductPage> {
    if (input.term !== undefined && typeof input.term !== 'string') throw new ProductReadError('INVALID_INPUT');
    const query = { ...input, term: input.term?.trim() ?? '', page: input.page ?? 1, pageSize: input.pageSize ?? 25, status: input.status ?? 'all', stock: input.stock ?? 'all', sort: input.sort ?? 'newest' };
    const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
    if (!positive(query.companyId) || !positive(query.page) || query.page > 100000 || ![10, 25, 50, 100].includes(query.pageSize)
      || query.term.length > 100 || !['all', 'active', 'inactive'].includes(query.status)
      || !['all', 'available', 'low', 'empty', 'locked'].includes(query.stock) || !['newest', 'name', 'stock', 'price'].includes(query.sort)
      || (query.categoryId !== undefined && !positive(query.categoryId)) || (query.brandId !== undefined && !positive(query.brandId))) throw new ProductReadError('INVALID_INPUT');
    return this.repository.list(query);
  }
}
