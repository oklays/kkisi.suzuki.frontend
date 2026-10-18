#!/usr/bin/env node
// Capacity evidence intake (decision B5/B8). OFFLINE. Input: JSON { scope, limit, legacyPhpPeak, reserve, instances } supplied by the operator/hosting provider,
// and the pool set to test (default: every existing pool + the two proposed Warehouse pools).
//   node --experimental-strip-types scripts/validate-capacity-evidence.mjs --evidence cap.json [--pools reader,auth,console,pos,...]
// Exit 0 FITS, 2 DOES_NOT_FIT or INSUFFICIENT_EVIDENCE (the honest state, not an error), 1 unusable input.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assessCapacityEvidence, POOLS } from '../src/infrastructure/db/capacity-plan.ts';
export function run(argv, { write = (s) => process.stdout.write(s) } = {}) {
  const i = argv.indexOf('--evidence'); const pi = argv.indexOf('--pools');
  if (i < 0 || !argv[i + 1]) { write('usage: --evidence <cap.json> [--pools a,b,c]\n'); return 1; }
  let ev; try { ev = JSON.parse(readFileSync(argv[i + 1], 'utf8')); } catch { write('cannot read or parse the evidence file\n'); return 1; }
  const ids = pi >= 0 ? String(argv[pi + 1]).split(',') : POOLS.map((p) => p.id); const known = new Set(POOLS.map((p) => p.id));
  for (const id of ids) if (!known.has(id)) { write(`unknown pool ${id}\n`); return 1; }
  const r = assessCapacityEvidence(ids, ev);
  write(`verdict: ${r.verdict}\npools: ${ids.join(', ')}\nneeded: ${r.totalUsed}; available: ${r.available ?? 'unknown'}; margin: ${r.margin ?? 'unknown'}\n${r.reasons.map((x) => `- ${x}`).join('\n')}\n`);
  return r.verdict === 'FITS' ? 0 : 2;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = run(process.argv.slice(2));
