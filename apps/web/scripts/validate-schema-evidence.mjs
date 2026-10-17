#!/usr/bin/env node
// Schema-evidence validator (Checkpoint 11, TASK-003). OFFLINE: reads files only, never opens a database connection and never needs credentials.
//   node --experimental-strip-types scripts/validate-schema-evidence.mjs --bundle bundle.json [--scan] [--out report.md]
//        [--semantic g2-v_saldo_awal.json ...] [--gudang-bundle gudang.json --gudang-mapping mapping.json]
// --semantic (repeatable): operator-supplied semantic/parity evidence per financial object (levels 4-5), refused if it carries anything personal.
// Input is the single JSON document produced by docs/migration/sql/schema-evidence-bundle-json.sql (reviewed by the operator).
// Output is the readiness report: identifiers, statuses, fingerprints and referenced table names; never view/routine bodies.
// Exit code: 0 = every gate ELIGIBLE, 2 = at least one gate BLOCKED/PARTIAL (not an error: the honest current state), 1 = unusable input.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEvidenceBundle, validateKosipaEvidence, renderReadinessReport, scanSensitive, parseSemanticEvidence } from '../../../packages/domain/src/kosipa/index.ts';
import { validateGudangMapping, renderGudangReport } from '../../../packages/domain/src/warehouse/index.ts';

/** mysql --batch may prefix the column name and escape backslashes; accept both so a straight redirect works. */
export function extractJson(text) {
  let t = String(text).replace(/^﻿/, '').trim();
  if (t.startsWith('evidence_bundle')) t = t.slice('evidence_bundle'.length).trim();
  try { return { ok: true, value: JSON.parse(t) }; } catch { /* try escaped */ }
  try { return { ok: true, value: JSON.parse(t.replace(/\\\\/g, '\\')) }; } catch (e) { return { ok: false, error: `not valid JSON (${e.message}); was the output truncated? raise group_concat_max_len and use --raw` }; }
}

function readJson(path, label) {
  let text; try { text = readFileSync(path, 'utf8'); } catch (e) { return { ok: false, error: `${label}: cannot read ${path} (${e.code ?? e.message})` }; }
  const r = extractJson(text); return r.ok ? r : { ok: false, error: `${label}: ${r.error}` };
}

function parseArgs(argv) {
  const a = { scan: false, semantic: [] }; for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (k === '--scan') a.scan = true; else if (k === '--semantic') a.semantic.push(argv[++i]); else if (['--bundle', '--gudang-bundle', '--gudang-mapping', '--out'].includes(k)) a[k.slice(2)] = argv[++i]; else return { error: `unknown argument ${k}` }; }
  return a;
}

export function run(argv, { write = (s) => process.stdout.write(s) } = {}) {
  const a = parseArgs(argv); if (a.error) { write(`${a.error}\n`); return 1; }
  if (!a.bundle && !a['gudang-bundle']) { write('usage: --bundle <kosipa.json> [--scan] [--semantic <file> ...] [--gudang-bundle <g.json> --gudang-mapping <m.json>] [--out <report.md>]\n'); return 1; }
  const parts = []; let code = 0;
  if (a.bundle) {
    const j = readJson(a.bundle, 'bundle'); if (!j.ok) { write(`${j.error}\n`); return 1; }
    const p = parseEvidenceBundle(j.value); if (!p.ok) { write(`bundle refused: ${p.error}\n`); return 1; }
    if (a.scan) { const found = scanSensitive(p.bundle); parts.push(['# Sensitive-text scan (counts only)', '', ...(found.length ? found.map((x) => `- ${x.pattern}: ${x.objects} object(s) — review/redact the bundle before sharing it`) : ['- nothing matched']), ''].join('\n')); }
    const semantic = [];
    for (const file of a.semantic) { const j = readJson(file, 'semantic evidence'); if (!j.ok) { write(`${j.error}\n`); return 1; } const sp = parseSemanticEvidence(j.value); if (!sp.ok) { write(`semantic evidence ${file} refused: ${sp.error}\n`); return 1; } semantic.push(sp.evidence); }
    const r = validateKosipaEvidence(p.bundle, semantic); parts.push(renderReadinessReport(r)); if (r.gates.some((g) => g.status !== 'ELIGIBLE')) code = 2;
  }
  if (a['gudang-bundle'] || a['gudang-mapping']) {
    let bundle = null, mapping = null;
    if (a['gudang-bundle']) { const j = readJson(a['gudang-bundle'], 'gudang bundle'); if (!j.ok) { write(`${j.error}\n`); return 1; } const p = parseEvidenceBundle(j.value); if (!p.ok) { write(`gudang bundle refused: ${p.error}\n`); return 1; } bundle = p.bundle; }
    if (a['gudang-mapping']) { const j = readJson(a['gudang-mapping'], 'gudang mapping'); if (!j.ok) { write(`${j.error}\n`); return 1; } mapping = j.value; }
    const g = validateGudangMapping(bundle, mapping); parts.push(renderGudangReport(g, bundle?.schema ?? null)); if (g.gates.some((x) => x.status !== 'ELIGIBLE')) code = 2;
  }
  const out = parts.join('\n\n---\n\n') + '\n';
  if (a.out) writeFileSync(a.out, out, { mode: 0o644 }); else write(out);
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = run(process.argv.slice(2));
