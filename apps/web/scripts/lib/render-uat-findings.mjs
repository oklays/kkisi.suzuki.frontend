// Renders uat-findings-register.md from owner-uat-checklist.md (rows + the OWNER's Lulus/Gagal cells) and the walkthrough's results.json (MACHINE results).
//   node scripts/lib/render-uat-findings.mjs <results.json> <out.md>
import { readFileSync, writeFileSync } from 'node:fs';
import { parseChecklist, render } from './uat-findings.mjs';
const [resultsFile, outFile] = process.argv.slice(2);
const dir = new URL('../../../../docs/superpowers/specs/unified-console-kosipa-warehouse/', import.meta.url);
const rows = parseChecklist(readFileSync(new URL('owner-uat-checklist.md', dir), 'utf8'));
const { markdown, summary } = render(rows, JSON.parse(readFileSync(resultsFile, 'utf8')), new Date().toISOString().slice(0, 10));
writeFileSync(outFile, markdown);
console.log(`rows ${summary.total}; owner PASS ${summary.owner.PASS} FAIL ${summary.owner.FAIL} BLOCKED ${summary.owner.BLOCKED} NOT TESTED ${summary.owner['NOT TESTED']}; machine PASS ${summary.machine.PASS} FAIL ${summary.machine.FAIL}; invalid ${summary.invalid.length}; owner acceptance: ${summary.ownerComplete ? 'all rows filled (owner decision still required)' : 'none'}`);
