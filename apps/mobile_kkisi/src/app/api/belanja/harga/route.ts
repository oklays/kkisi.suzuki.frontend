import { currentMember } from '@/lib/auth/session.server';
import { ServiceUnavailableError } from '@/lib/errors/service-errors';
import { parseCartIds } from '@/features/catalog/services/catalog';
import { priceCart } from '@/features/catalog/services/catalog.server';
import { getStoreCredit } from '@/features/store-credit/services/store-credit.server';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

/** Current catalog prices for the member's cart (`?items=id:qty,...`) and the remaining store credit. Read-only, member-only. */
export async function GET(request: Request) {
  try {
    if (!(await currentMember())) return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401, headers: NO_STORE });
    const lines = parseCartIds(new URL(request.url).searchParams.get('items'));
    const priced = await priceCart(lines);
    const credit = await getStoreCredit();
    return Response.json({
      lines: priced.map((l) => ({ id: l.id, quantity: l.quantity, item: l.item })),
      credit: credit.state === 'ok' && credit.data.credit.eligible ? { remainingSen: credit.data.credit.remainingSen } : null,
    }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof ServiceUnavailableError) return Response.json({ error: e.code }, { status: 503, headers: NO_STORE });
    return Response.json({ error: 'UNAVAILABLE' }, { status: 503, headers: NO_STORE });
  }
}
