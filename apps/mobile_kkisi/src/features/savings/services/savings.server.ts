import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { readerDb } from '../../../server/container.ts';
import { MysqlSavingsReader, readActiveDeductions, readDeductionRequests, readWithdrawals } from '../../../server/kosipa/member.reader.ts';
import { buildActiveDeductions, buildDeductionRequests, buildMovements, buildSavingsSummary, buildWithdrawals } from './savings.ts';

export const MOVEMENT_PAGE = 20;

export const getSavingsSummary = cache(async () => {
  const m = await requireMember();
  return attempt(async () => buildSavingsSummary(await new MysqlSavingsReader(readerDb()).typeSummary(m.nikKeys)));
});

/** One page of movements, optionally of one type and/or only credits (setoran). Sequential statements (shared reader pool). */
export async function getMovements(type: string | null, beforeId: number | null) {
  const m = await requireMember();
  return attempt(async () => {
    const reader = new MysqlSavingsReader(readerDb());
    const rows = await reader.movements(m.nikKeys, type, beforeId, MOVEMENT_PAGE + 1);
    const page = rows.slice(0, MOVEMENT_PAGE);
    const refs = await reader.headersByDocNo([...new Set(page.map((r) => r.docNo))]);
    return { items: buildMovements(page, refs), nextCursor: rows.length > MOVEMENT_PAGE ? page[page.length - 1].id : null };
  });
}

export const getActiveDeductions = cache(async () => {
  const m = await requireMember();
  return attempt(async () => buildActiveDeductions(await readActiveDeductions(readerDb(), m.nikKeys)));
});
export const getDeductionRequests = cache(async () => {
  const m = await requireMember();
  return attempt(async () => buildDeductionRequests(await readDeductionRequests(readerDb(), m.nikKeys)));
});
export const getWithdrawals = cache(async () => {
  const m = await requireMember();
  return attempt(async () => buildWithdrawals(await readWithdrawals(readerDb(), m.nikKeys)));
});
