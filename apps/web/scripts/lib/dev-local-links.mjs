// Creates the DEV LOCAL identity links THROUGH THE APPLICATION (administrator session, CSRF token, audited), never by writing the console store directly.
// Idempotent: an existing active link is reported and kept. Synthetic accounts only; passwords come from the ignored fixture and are never printed.
import { readFileSync } from 'node:fs';
const base = process.argv[2]; if (new URL(base).hostname !== '127.0.0.1') throw new Error('local only');
const pw = JSON.parse(readFileSync('.env.dev-local-accounts.json', 'utf8'));
const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ username: 'synth_admin', password: pw.admin }) });
if (r.status !== 200) { console.error(`administrator sign-in failed (${r.status})`); process.exit(1); }
const { csrfToken } = await r.json(); const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
// The console administrator (synth_admin) is deliberately NOT linked: the role alone never opens KOSIPA, and the application refuses an administrator linking their own
// account (SELF_LINK), so KOSIPA UAT uses synth_koperasi (all views) and synth_kasir2 (read-only staff).
const planned = [[900002, 9001, 'synth_koperasi -> synth_ksp (KOSIPA administrator, all views)'], [900005, 9004, 'synth_kasir2 -> synth_ksp_staff (KOSIPA read-only staff: members, savings, loans)']];
for (const [consoleUserId, kosipaUserId, label] of planned) {
  const res = await fetch(`${base}/api/console/identity-links`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie, 'x-csrf-token': csrfToken }, body: JSON.stringify({ consoleUserId, kosipaUserId }) });
  const body = await res.json().catch(() => ({}));
  console.log(`${label}: ${res.ok ? 'linked' : body.error === 'CONSOLE_USER_ALREADY_LINKED' ? 'already linked' : `FAILED ${res.status} ${body.error ?? ''}`}`);
}
await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { origin: base, cookie, 'x-csrf-token': csrfToken, 'content-type': 'application/json' }, body: '{}' });
