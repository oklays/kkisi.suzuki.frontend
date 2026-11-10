import type { Pool } from 'mysql2/promise';
import { rows } from '../db/mysql.ts';

// Shared rules for every legacy read (same as apps/web/src/infrastructure/repositories/kosipa-*.repository.ts):
//  - SELECT-only account; every statement capped at 5 s (MariaDB `SET STATEMENT max_statement_time`) and LIMITed;
//  - values are always bound parameters; identifiers come only from closed lists in code;
//  - money is CAST to DECIMAL in SQL so it reaches JS as an exact string (DOUBLE columns would otherwise arrive as floats);
//  - legacy dates are read as text so '0000-00-00' reaches the domain unchanged;
//  - member scoping: callers pass NIK keys / ids that come from the authenticated session, never from request input.
export const capped = (sql: string) => `SET STATEMENT max_statement_time=5 FOR ${sql}`;
export const dec = (col: string, scale = 2) => `CAST(COALESCE(${col}, 0) AS DECIMAL(24,${scale}))`;
export const txt = (col: string) => `CAST(${col} AS CHAR)`;
export const query = <T>(db: Pool, sql: string, params: unknown[] = []) => rows<T>(db, capped(sql), params);
export type Db = Pool;
