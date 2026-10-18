// R1 trial checks against a throw-away DEV LOCAL instance (scripts/dev-local.sh r1-trial). Synthetic roles only. Landing is read from the real response of
// /console?entry=login (a streamed NEXT_REDIRECT to /pos, or the rendered console). Passwords come from the ignored accounts file and are never printed.
import { readFileSync } from 'node:fs';
const [base, mode] = process.argv.slice(2); if (new URL(base).hostname !== '127.0.0.1') throw new Error('local only');
const pw = JSON.parse(readFileSync('.env.dev-local-accounts.json', 'utf8'));
async function landing(user) {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ username: `synth_${user}`, password: pw[user] }) });
  if (r.status !== 200) throw new Error(`login ${user}: ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const html = await (await fetch(`${base}/console?entry=login`, { headers: { cookie } })).text();
  const m = /NEXT_REDIRECT;[a-z]+;(\/[a-z]*)/.exec(html);
  const admin = await (await fetch(`${base}/console/settings/identitas`, { headers: { cookie } })).text();
  return { target: m ? m[1] : html.includes('console-nav') ? '/console' : 'unknown', canAdministerLinks: admin.includes('Buat tautan') };
}
const expect = mode === 'policy'
  ? { kasir1: '/pos', kasir2: '/pos', admin: '/console', koperasi: '/console', kepala: '/console' }     // mapping 4:pos,1:console; role 3 unmapped -> derived; role 2 unmapped -> derived
  : { kasir1: '/console', kasir2: '/console', admin: '/console', koperasi: '/console', kepala: '/console' };   // no mapping = today's behaviour: with management grants every role derives to /console (the R1 problem)
let bad = 0;
for (const [user, want] of Object.entries(expect)) {
  const got = await landing(user); const ok = got.target === want;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${mode}] synth_${user} -> ${got.target} (expected ${want}); identity-link administration visible: ${got.canAdministerLinks}`); if (!ok) bad++;
  if (user === 'kasir1' && got.canAdministerLinks) { console.log('FAIL landing must never widen access: the branch-bound cashier can administer links'); bad++; }
}
process.exit(bad ? 1 : 0);
