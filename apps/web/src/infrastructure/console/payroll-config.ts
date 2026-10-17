import { DEFAULT_STORE_COLUMN_MAP, STORE_COLUMNS, type StoreColumnMap } from '@koperasi/domain/kosipa';

/**
 * Branch (company_id) -> payroll store column. The built-in map is EMPIRICAL_UNCONFIRMED (matched on the 30 Sep data); the reconciliation
 * stays review-only with it. Only an explicit, well-formed owner decision may change the basis: KOSIPA_STORE_COLUMN_MAP =
 * {"basis":"OWNER_CONFIRMED","byCompany":{"1":"TOKO_TAMBUN","2":"TOKO_MJ","3":"TOKO_GIIC"}}. Anything malformed falls back to the safe default.
 */
export function storeColumnMapFromEnv(env: Record<string, string | undefined> = process.env): StoreColumnMap {
  const raw = env.KOSIPA_STORE_COLUMN_MAP;
  if (!raw) return DEFAULT_STORE_COLUMN_MAP;
  try {
    const v = JSON.parse(raw) as { basis?: unknown; byCompany?: Record<string, unknown> };
    if (v.basis !== 'OWNER_CONFIRMED' || !v.byCompany || typeof v.byCompany !== 'object') return DEFAULT_STORE_COLUMN_MAP;
    const byCompany: Record<number, (typeof STORE_COLUMNS)[number]> = {};
    for (const [company, column] of Object.entries(v.byCompany)) {
      if (!/^\d{1,9}$/.test(company) || !(STORE_COLUMNS as readonly unknown[]).includes(column)) return DEFAULT_STORE_COLUMN_MAP;
      byCompany[Number(company)] = column as (typeof STORE_COLUMNS)[number];
    }
    if (new Set(Object.values(byCompany)).size !== Object.keys(byCompany).length || Object.keys(byCompany).length === 0) return DEFAULT_STORE_COLUMN_MAP;   // two branches on one column would merge obligations
    return { basis: 'OWNER_CONFIRMED', byCompany };
  } catch { return DEFAULT_STORE_COLUMN_MAP; }
}
