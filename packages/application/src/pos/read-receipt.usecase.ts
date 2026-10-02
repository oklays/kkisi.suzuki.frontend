import { PosError } from '@koperasi/domain/pos/sale';
import { parseReceiptId, type Receipt } from '@koperasi/domain/pos/receipt';

export interface ReceiptRepository { find(companyId: number, saleId: number): Promise<Receipt | null> }

export async function readReceipt(repo: ReceiptRepository, context: { companyId: number }, id: string): Promise<Receipt> {
  const saleId = parseReceiptId(id);
  const receipt = await repo.find(context.companyId, saleId);
  if (!receipt) throw new PosError('NOT_FOUND');
  return receipt;
}
