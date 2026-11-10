import 'server-only';
import { cache } from 'react';
import { requireMember } from '../../../lib/auth/session.server.ts';
import { attempt } from '../../../lib/errors/service-errors.ts';
import { businessMonth } from '../../../lib/utils/dates.ts';
import { readerDb } from '../../../server/container.ts';
import { readLoanApplications, readLoanProducts, readLoans, readScheduleAggregate, readScheduleRows } from '../../../server/kosipa/member.reader.ts';
import { buildActiveLoan, buildApplications, buildLoanHistory, buildLoanProducts, isActiveLoan } from './loans.ts';

const getLoanHeaders = cache(async () => {
  const m = await requireMember();
  return readLoans(readerDb(), m.nikKeys);
});

/**
 * Active loan with its schedule. OWNERSHIP: the schedule is read only for a doc_no that came from THIS member's own headers
 * (getLoanHeaders, filtered by the session NIK keys) — the URL never names a loan.
 */
export const getActiveLoan = cache(async () => attempt(async () => {
  const headers = await getLoanHeaders();
  const active = headers.find(isActiveLoan);
  if (!active) return null;
  const db = readerDb();
  const aggregate = await readScheduleAggregate(db, active.docNo);
  const rows = await readScheduleRows(db, active.docNo, 120);
  return buildActiveLoan(active, aggregate, rows, businessMonth(new Date()).key);
}));

export const getLoanHistory = cache(async () => attempt(async () => buildLoanHistory(await getLoanHeaders())));

export const getLoanApplications = cache(async () => {
  const m = await requireMember();
  return attempt(async () => buildApplications(await readLoanApplications(readerDb(), m.nikKeys)));
});

export const getLoanProducts = cache(async () => {
  await requireMember();
  return attempt(async () => buildLoanProducts(await readLoanProducts(readerDb())));
});
