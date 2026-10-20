import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Checkpoint 16: DEV LOCAL process OWNERSHIP. The launcher may stop only a server it started (or the user adopted) whose identity (pid + start time + "next" command + directory)
// still matches its record. Fake servers on ephemeral ports stand in for the owner's own `next dev`; no real :3200/:3201 process is ever touched by these tests.
const LIB = new URL('../scripts/lib/dev-local-proc.sh', import.meta.url).pathname;
const SCRIPT = new URL('../scripts/dev-local.sh', import.meta.url).pathname;
const root = realpathSync(mkdtempSync(join(tmpdir(), 'devlocal-proc-')));
const appDir = join(root, 'app'); const otherDir = join(root, 'other'); const runDir = join(root, 'run');
for (const d of [appDir, otherDir]) mkdirSync(d);
writeFileSync(join(root, 'next-fake-server.mjs'), "import http from 'node:http'; http.createServer((q, r) => r.end('ok')).listen(Number(process.argv[2]), '127.0.0.1'); setInterval(() => {}, 1e6);\n");
writeFileSync(join(root, 'plain-fake-server.mjs'), "import http from 'node:http'; http.createServer((q, r) => r.end('ok')).listen(Number(process.argv[2]), '127.0.0.1'); setInterval(() => {}, 1e6);\n");
const children = [];
const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const listening = (port) => new Promise((res) => { const t = Date.now(); const tryOnce = () => { const c = net.connect(port, '127.0.0.1'); c.on('connect', () => { c.destroy(); res(true); }); c.on('error', () => { c.destroy(); if (Date.now() - t > 8000) res(false); else setTimeout(tryOnce, 100); }); }; tryOnce(); });
async function fake({ cwd = appDir, file = 'next-fake-server.mjs' } = {}) {
  const port = await freePort(); const child = spawn(process.execPath, [join(root, file), String(port)], { cwd, stdio: 'ignore' }); children.push(child);
  assert.ok(await listening(port), 'fake server up'); return { port, pid: child.pid, child };
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const gone = async (pid) => { for (let i = 0; i < 50; i++) { if (!alive(pid)) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const sh = (body) => spawnSync('bash', ['-c', `cd "${appDir}"; export DEV_LOCAL_RUN_DIR="${runDir}" DEV_LOCAL_APP_DIR="${appDir}"; . "${LIB}"; ${body}`], { encoding: 'utf8' });
test.after(() => { for (const c of children) { try { c.kill('SIGKILL'); } catch { /* already gone */ } } rmSync(root, { recursive: true, force: true }); });

test('stopping DEV LOCAL stops only the recorded server; an independent next server on another port keeps running', async () => {
  const ours = await fake(); const theirs = await fake();
  assert.equal(sh(`record_server ${ours.port}`).status, 0);
  assert.equal(sh(`server_state ${ours.port}`).stdout.trim(), 'owned'); assert.equal(sh(`server_state ${theirs.port}`).stdout.trim(), 'foreign');
  const stop = sh(`stop_server ${ours.port}`); assert.equal(stop.status, 0, stop.stdout + stop.stderr); assert.ok(await gone(ours.pid), 'the recorded server stopped');
  assert.ok(alive(theirs.pid) && await listening(theirs.port), 'the independent server is untouched');
  const refuse = sh(`stop_server ${theirs.port}`); assert.equal(refuse.status, 2); assert.match(refuse.stdout, /did not start: left alone/); assert.ok(alive(theirs.pid), 'still running after an explicit stop of its port');
  assert.ok(!existsSync(join(runDir, `${ours.port}.rec`)), 'record removed after a clean stop');
});

test('a stale record never targets another process: dead pid, pid reuse (different start time) and a foreign process that took the port', async () => {
  const a = await fake(); assert.equal(sh(`record_server ${a.port}`).status, 0); a.child.kill('SIGKILL'); assert.ok(await gone(a.pid));   // unexpected shutdown
  assert.equal(sh(`server_state ${a.port}`).stdout.trim(), 'stale'); assert.match(sh(`status_line ${a.port}`).stdout, /stopped \(stale record/);
  // pid reuse: a record that names a LIVE process of ours-looking kind (same directory, next command) but with a different start time must not authorise a kill
  const intruder = await fake(); mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, `${intruder.port}.rec`), `port=${intruder.port}\nlistener=${intruder.pid}\nlistener_start=Mon Jan  1 00:00:00 2001\napp_dir=${appDir}\n`);
  const state = sh(`server_state ${intruder.port}`).stdout.trim(); assert.equal(state, 'stale-foreign');
  const stop = sh(`stop_server ${intruder.port}`); assert.equal(stop.status, 2, stop.stdout); assert.ok(alive(intruder.pid), 'pid reuse must not be killed'); assert.ok(await listening(intruder.port));
  assert.ok(!existsSync(join(runDir, `${intruder.port}.rec`)), 'the obsolete record is removed without signalling anything');
});

test('directory and command identity are part of ownership: a next process from another directory, or a non-next process, cannot be recorded or stopped', async () => {
  const elsewhere = await fake({ cwd: otherDir }); const plain = await fake({ file: 'plain-fake-server.mjs' });
  assert.notEqual(sh(`record_server ${elsewhere.port}`).status, 0, 'other directory refused'); assert.notEqual(sh(`record_server ${plain.port}`).status, 0, 'not a next process refused');
  assert.equal(sh(`stop_server ${elsewhere.port}`).status, 2); assert.equal(sh(`stop_server ${plain.port}`).status, 2);
  assert.ok(alive(elsewhere.pid) && alive(plain.pid));
  assert.notEqual(sh(`adopt_server ${elsewhere.port}`).status, 0, 'adopt verifies identity too');
});

test('adopt is an explicit step for a server started by an older version; afterwards stop manages it', async () => {
  const old = await fake(); assert.equal(sh(`server_state ${old.port}`).stdout.trim(), 'foreign');
  assert.equal(sh(`stop_server ${old.port}`).status, 2); assert.ok(alive(old.pid), 'unadopted server is left alone');
  assert.equal(sh(`adopt_server ${old.port}`).status, 0); assert.equal(sh(`stop_server ${old.port}`).status, 0); assert.ok(await gone(old.pid));
});

test('the launcher never kills by port or by name, resets only the production-mode server it owns, and exposes status/stop/restart/adopt', () => {
  const s = readFileSync(SCRIPT, 'utf8'); const lib = readFileSync(LIB, 'utf8');
  const code = (t) => t.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code(s) + code(lib), /pkill|killall|xargs\s+(-r\s+)?kill|kill\s+"\$\(pid_on|\$\(pid_on[^)]*\)"?\s*\|\s*xargs/, 'no broad or port-based termination');
  assert.doesNotMatch(code(s), /kill\s+"?\$p"?|kill\s+"?\$pid"?/, 'dev-local.sh itself signals nothing directly');
  for (const c of ['  stop)', '  restart)', '  adopt)', '  status)']) assert.ok(s.includes(c), c);
  assert.match(s, /"\$0" stop prod \|\| true/, 'reset leaves a next dev server alone');
  assert.match(s, /record_server "\$2" "\$launcher"/);
  assert.match(lib, /kill -KILL "\$listener"/); assert.match(lib, /is_ours_process "\$listener" "\$lstart"; then kill -KILL|if is_ours_process "\$listener" "\$lstart"; then kill -KILL/, 'forced kill only after re-verifying identity');
});
