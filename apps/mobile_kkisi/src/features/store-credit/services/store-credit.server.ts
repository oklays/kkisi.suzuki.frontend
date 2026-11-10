import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { businessMonth } from '../../../lib/utils/dates.ts';
import { readerDb } from '../../../server/container.ts';
import { readCreditUsage, readSales } from '../../../server/kosipa/store.reader.ts';
import { getProfileRow } from '../../member/services/member.server.ts';
import { buildPurchases, buildStoreCredit } from './store-credit.ts';

export const getStoreCredit = cache(async () => attempt(async () => {
  await requireMember();
  const now = new Date();
  const month = businessMonth(now);
  const profile = await getProfileRow();
  // The POS rule matches nik_kar exactly with the member record's NIK (kosipa-member.repository.ts storeCredit).
  const usage = await readCreditUsage(readerDb(), profile.nik, month.start, month.endExclusive);
  return { month: month.key, credit: buildStoreCredit(profile, usage, now) };
}));

export const getMonthCreditPurchases = cache(async () => {
  const m = await requireMember();
  return attempt(async () => {
    const month = businessMonth(new Date());
    return buildPurchases(await readSales(readerDb(), m.nikKeys, { from: month.start, toExclusive: month.endExclusive, kreditOnly: true, limit: 50 }));
  });
});
