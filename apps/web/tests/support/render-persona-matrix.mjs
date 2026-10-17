// TEST-ONLY: renders the persona matrix table that is embedded in staging-rbac-uat-matrix.md (a test fails when the document drifts from the code).
//   node --experimental-strip-types tests/support/render-persona-matrix.mjs
import { fileURLToPath } from 'node:url';
import { PERSONAS, ENDPOINTS, evaluatePersona, apiMatrix } from './personas.mjs';

const short = (c) => c.replace(/^toko\./, 't.').replace(/^kosipa\./, 'k.').replace(/^warehouse\./, 'w.').replace(/^iam\./, 'iam.');
export async function renderPersonaMatrix() {
  const rows = [
    '| Persona (testing role) | Legacy role / chooser | Permission slugs | KOSIPA link | Capabilities (flags: preview ON, export policy ON) | Visible menu | Landing | ' + ENDPOINTS.join(' | ') + ' |',
    '|---|---|---|---|---|---|---|' + ENDPOINTS.map(() => '---').join('|') + '|',
  ];
  for (const p of PERSONAS) {
    const r = await evaluatePersona(p); const a = await apiMatrix(p);
    rows.push(`| **${p.name}** | ${p.roleId}${p.roleId <= 2 ? ' / yes' : ' / no'} | ${p.slugs.length ? p.slugs.join(', ') : '—'} | ${p.link ? `linked (${p.link.menus.length} controllers)` : 'none'} | ${r.capabilities.length ? r.capabilities.map(short).join(', ') : '—'} | ${r.nav.join(', ')} | ${r.landing} | ${ENDPOINTS.map((n) => a.statuses[n]).join(' | ')} |`);
  }
  return rows.join('\n');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.stdout.write((await renderPersonaMatrix()) + '\n');
