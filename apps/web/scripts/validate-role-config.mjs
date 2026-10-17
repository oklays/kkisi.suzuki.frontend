#!/usr/bin/env node
// Real role-configuration readiness (checkpoint 12). OFFLINE: reads the pseudonymised JSON from docs/migration/sql/role-config-export-readonly.sql and evaluates
// every role and KOSIPA group with the console's runtime rules and navigation registry. Prints counts and role/group ids only.
//   node --experimental-strip-types scripts/validate-role-config.mjs --bundle roles.json [--out report.md]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateRoleConfig, parseRoleBundle, renderRoleConfigReport } from '../../../packages/domain/src/console/role-config.ts';
import { CONSOLE_NAVIGATION } from '../src/features/console/navigation.ts';
import { extractJson } from './validate-schema-evidence.mjs';

export function run(argv, { write = (s) => process.stdout.write(s) } = {}) {
  const i = argv.indexOf('--bundle'); const o = argv.indexOf('--out');
  if (i < 0 || !argv[i + 1]) { write('usage: --bundle <roles.json> [--out <report.md>]\n'); return 1; }
  let text; try { text = readFileSync(argv[i + 1], 'utf8'); } catch (e) { write(`cannot read ${argv[i + 1]} (${e.code ?? e.message})\n`); return 1; }
  const j = extractJson(text.replace(/^role_config\s*/, '')); if (!j.ok) { write(`${j.error}\n`); return 1; }
  const p = parseRoleBundle(j.value); if (!p.ok) { write(`role bundle refused: ${p.error}\n`); return 1; }
  const report = renderRoleConfigReport(evaluateRoleConfig(p.bundle, CONSOLE_NAVIGATION));
  if (o >= 0 && argv[o + 1]) writeFileSync(argv[o + 1], report); else write(report);
  return 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = run(process.argv.slice(2));
