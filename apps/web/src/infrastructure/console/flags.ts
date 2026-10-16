/**
 * Unified console release flag (spec REQ-017). Off unless explicitly "true": with it off, /console answers 404 and the
 * login keeps its pre-console /pos fallback, so turning it off is a complete rollback without data changes.
 */
export function consoleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CONSOLE_ENABLED === 'true';
}
