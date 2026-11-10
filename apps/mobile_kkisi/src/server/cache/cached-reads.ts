import type { Db } from '../kosipa/sql.ts';
import { readLoanProducts, readShu, type LoanProductRow, type ShuRow } from '../kosipa/member.reader.ts';
import { readCatalogCategories } from '../kosipa/store.reader.ts';
import { readFaqs, readNotices } from '../kosipa/content.reader.ts';
import type { MemberIdentityReader } from '../auth/types.ts';
import { namedCache } from './ttl-cache.ts';

// What is cached, for how long, and why it is safe (P2):
//   account state   30 s per account    every page re-checks is_active / is_delete; a deactivation takes effect within the TTL instead of instantly
//                                       (MEMBER_ACCOUNT_STATE_CACHE_MS, default 30000, 0 = off; the synthetic test stack runs with 0)
//   loan products    5 min, global       Master Pinjaman Mobile changes rarely; the apps/web intake re-checks the bounds on the live master anyway
//   catalog groups   5 min, per company  category names only, no prices or stock
//   FAQ / notices    5 min, global       public content
//   SHU             10 min per member    only PUBLISHED SHU is shown, and a published SHU is never recalculated
// Never cached: savings balances and movements, loans and schedules, payroll deductions, store credit, transactions, requests, favourites,
// login and PIN lookups (a password or PIN change must apply on the next attempt).
const SECOND = 1000;
const MINUTE = 60 * SECOND;

const loanProducts = namedCache<LoanProductRow[]>('loan-products', 5 * MINUTE, 4);
const categories = namedCache<string[]>('catalog-categories', 5 * MINUTE, 16);
const faqs = namedCache<Awaited<ReturnType<typeof readFaqs>>>('faqs', 5 * MINUTE, 2);
const notices = namedCache<Awaited<ReturnType<typeof readNotices>>>('notices', 5 * MINUTE, 2);
const shu = namedCache<ShuRow[]>('shu', 10 * MINUTE, 5000);

export const cachedLoanProducts = (db: Db) => loanProducts.get('all', () => readLoanProducts(db));
export const cachedCatalogCategories = (db: Db, companyId: number) => categories.get(String(companyId), () => readCatalogCategories(db, companyId));
export const cachedFaqs = (db: Db) => faqs.get('all', () => readFaqs(db));
export const cachedNotices = (db: Db) => notices.get('all', () => readNotices(db));
/** Keyed by the session's NIK keys (never by request input), so one member never receives another member's SHU. */
export const cachedShu = (db: Db, nikKeys: string[]) => shu.get([...nikKeys].sort().join('|'), () => readShu(db, nikKeys));

/** Identity reader whose account-state check is cached for `ttlMs`; account lookups and PIN reads always hit the database. */
export function withCachedAccountState(reader: MemberIdentityReader, ttlMs = 30 * SECOND): MemberIdentityReader {
  if (ttlMs <= 0) return reader;
  const accountStates = namedCache<{ active: boolean; deleted: boolean } | null>(`account-state-${ttlMs}`, ttlMs, 5000);
  return {
    findAccounts: (q, limit) => reader.findAccounts(q, limit),
    storedPin: (userId) => reader.storedPin(userId),
    memberByNik: (keys) => reader.memberByNik(keys),
    accountState: (userId) => accountStates.get(String(userId), () => reader.accountState(userId)),
  };
}
