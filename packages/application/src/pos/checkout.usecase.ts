import { parseCheckout, type CheckoutInput, type CheckoutResult, type MemberCredit } from '@koperasi/domain/pos/sale';
import type { AuthContext } from '../auth/validate-session.usecase.ts';

export type PosContext = Pick<AuthContext, 'userId' | 'companyId'>;
export interface PosRepository {
  member(context: PosContext, identifier: string, now: Date): Promise<MemberCredit>;
  checkout(context: PosContext, input: CheckoutInput, now: Date): Promise<CheckoutResult>;
}
export async function checkout(repo: PosRepository, context: PosContext, body: unknown, now: Date): Promise<CheckoutResult> {
  return repo.checkout(context, parseCheckout(body), now);
}
