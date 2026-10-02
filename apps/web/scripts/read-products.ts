import { ReadProductsUseCase } from '@koperasi/application/inventory';
import { ProductReadError } from '@koperasi/domain/inventory';
import { PrismaItemRepository } from '../src/infrastructure/repositories/prisma-item.repository.ts';

const [companyArg, term = ''] = process.argv.slice(2);
const companyId = Number(companyArg);

async function main() {
  if (!process.env.DATABASE_URL) throw new ProductReadError('DB_UNAVAILABLE');
  const products = await new ReadProductsUseCase(new PrismaItemRepository())
    .search({ companyId, term, limit: 10 });
  console.log(JSON.stringify(products, null, 2));
}

main().catch((error: unknown) => {
  const safe = error instanceof ProductReadError ? error : new ProductReadError('UNEXPECTED');
  console.error(JSON.stringify({ error: safe.code, message: safe.message }));
  process.exitCode = 1;
});
