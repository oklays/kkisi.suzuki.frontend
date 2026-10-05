import { PosError } from '@koperasi/domain/pos/sale';
import { parseReceiptId, type Receipt, type ReceiptReadMode } from '@koperasi/domain/pos/receipt';

export interface ReceiptRepository { find(companyId: number, saleId: number, mode?: ReceiptReadMode): Promise<Receipt | null> }

export async function readReceipt(repo: ReceiptRepository, context: { companyId: number }, id: string, mode: ReceiptReadMode = 'checkout'): Promise<Receipt> {
  const saleId = parseReceiptId(id);
  const receipt = await repo.find(context.companyId, saleId, mode);
  if (!receipt) throw new PosError('NOT_FOUND');
  return receipt;
}
