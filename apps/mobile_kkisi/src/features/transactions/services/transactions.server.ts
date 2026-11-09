import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { readOrders, readSales } from '../../../server/kosipa/store.reader.ts';
import { buildTransactions } from './transactions.ts';

/** Newest 60 POS sales + 40 orders of the member; filtering happens on this bounded set (no free-text reaches SQL). */
export const getTransactions = cache(async () => {
  const m = await requireMember();
  return attempt(async () => {
    const db = readerDb();
    const sales = await readSales(db, m.nikKeys, { limit: 60 });
    const orders = await readOrders(db, m.nikKeys, 40);
    return buildTransactions(sales, orders);
  });
});
