import { postLoginLanding, type CapabilitySet } from './capabilities.ts';

/**
 * Explicit post-login landing policy (owner decision R1, checkpoint 13). Landing is a CONVENIENCE, never a grant: it only chooses where a fresh login
 * without a valid `next` deep link starts; every page still enforces its own gate.
 *
 * Source of truth: an operator-set mapping of legacy role id -> landing (`CONSOLE_LANDING_ROLES`, e.g. "4:pos,1:console"), read on the server.
 *   - mapped 'pos'     -> /pos, but only if the user can check out (toko.pos.checkout); otherwise /console (no loop, no expansion)
 *   - mapped 'console' -> /console
 *   - role not mapped  -> the existing capability-derived rule (unchanged behaviour), so nothing changes until a mapping is configured
 *   - console disabled -> /pos (pre-console behaviour)
 * A malformed mapping is ignored as a whole (fail to the unchanged behaviour) and reported, never partially applied.
 */
export type LandingTarget = 'pos' | 'console';
export type LandingPolicy = ReadonlyMap<number, LandingTarget>;
export type LandingDecision = { target: '/pos' | '/console'; reason: 'console-disabled' | 'policy' | 'policy-pos-without-checkout' | 'derived' };

export function parseLandingPolicy(raw: string | undefined): { policy: LandingPolicy | null; error: string | null } {
  if (raw === undefined || raw.trim() === '') return { policy: null, error: null };
  const out = new Map<number, LandingTarget>();
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length > 50) return { policy: null, error: 'too many entries' };
  for (const p of parts) {
    const m = /^([1-9]\d{0,9}):(pos|console)$/.exec(p);
    if (!m) return { policy: null, error: `malformed entry "${p.slice(0, 40)}"` };
    const role = Number(m[1]);
    if (out.has(role)) return { policy: null, error: `duplicate role ${role}` };
    out.set(role, m[2] as LandingTarget);
  }
  return { policy: out, error: null };
}

export function resolvePostLoginLanding(input: { roleId: number; capabilities: CapabilitySet; consoleEnabled: boolean; policy: LandingPolicy | null }): LandingDecision {
  if (!input.consoleEnabled) return { target: '/pos', reason: 'console-disabled' };
  const mapped = input.policy?.get(input.roleId);
  if (mapped === 'console') return { target: '/console', reason: 'policy' };
  if (mapped === 'pos') return input.capabilities.has('toko.pos.checkout') ? { target: '/pos', reason: 'policy' } : { target: '/console', reason: 'policy-pos-without-checkout' };
  return { target: postLoginLanding({ capabilities: input.capabilities, consoleEnabled: true }), reason: 'derived' };
}
