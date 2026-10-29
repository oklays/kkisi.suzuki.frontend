/**
 * Server-side switches for the unfinished public savings feature. Both default OFF: with them off every public savings
 * page answers 404, the console entry is hidden and every API answers 503 before any configuration or database access.
 */
type Env = Record<string, string | undefined>;

/** Loopback synthetic staging only; the service additionally refuses any non-loopback, non-sentinel database. */
export function publicSavingsStagingEnabled(env: Env = process.env): boolean {
  return env.PSS_LOCAL_STAGING === '1';
}

/** Console management needs real console auth AND the staging service it manages. */
export function publicSavingsConsoleEnabled(env: Env = process.env): boolean {
  return publicSavingsStagingEnabled(env) && env.PSS_OPERATOR_AUTH === 'CONSOLE';
}
