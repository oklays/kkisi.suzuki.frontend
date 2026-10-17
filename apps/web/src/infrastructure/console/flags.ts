import { parseLandingPolicy, type LandingPolicy } from '@koperasi/domain/console/landing-policy';

/**
 * Unified console release flag (spec REQ-017). Off unless explicitly "true": with it off, /console answers 404 and the
 * login keeps its pre-console /pos fallback, so turning it off is a complete rollback without data changes.
 */
export function consoleEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CONSOLE_ENABLED === 'true';
}

/**
 * R1 landing policy (CONSOLE_LANDING_ROLES, e.g. "4:pos,1:console"). Unset = unchanged capability-derived landing. Malformed = ignored as a whole
 * (the unchanged behaviour applies) and logged once. Do not set it in production until owner decision R1 is approved and the real role export is validated.
 */
let reported = false;
export function landingPolicy(env: Record<string, string | undefined> = process.env): LandingPolicy | null {
  const { policy, error } = parseLandingPolicy(env.CONSOLE_LANDING_ROLES);
  if (error && !reported) { reported = true; console.warn(`[console] CONSOLE_LANDING_ROLES ignored: ${error}`); }
  return policy;
}
