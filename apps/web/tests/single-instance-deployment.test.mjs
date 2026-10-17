import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// Checkpoint 12: the per-process export limiter (6 per user per 10 minutes) and the connection budget both assume EXACTLY ONE application process.
// This pins the three structural reasons that hold today, so a scale-out cannot happen silently: it has to change this test, and with it the shared-limiter
// requirement (export-security-assessment.md section 4) and the capacity decision (B5).
const REPO = new URL('../../../', import.meta.url);
const compose = readFileSync(new URL('deploy/genesis/docker-compose.yml', REPO), 'utf8');
const dockerfile = readFileSync(new URL('deploy/genesis/Dockerfile', REPO), 'utf8');
const web = compose.slice(compose.indexOf('\n  web:'), compose.indexOf('\nnetworks:'));

test('one container: the web service has a fixed container_name (Compose cannot scale it) and declares no replicas or scale', () => {
  assert.match(web, /\n {4}container_name: genesis-web\n/);
  const settings = web.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');   // the warning comment itself mentions replicas/scale
  assert.doesNotMatch(settings, /replicas|\bscale\b|deploy:/i, 'no replica/scale settings');
  assert.match(web, /Exactly one Next\.js process in one container/);
});

test('one listener: the service shares one network namespace, so a second server could not bind the same port', () => {
  assert.match(web, /network_mode: "service:netns"/);
});

test('one server process: the image starts a single `next start` (no cluster mode, no process manager)', () => {
  const cmd = dockerfile.split('\n').filter((l) => /^CMD /.test(l));
  assert.deepEqual(cmd, ['CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]']);
  assert.doesNotMatch(dockerfile + compose, /pm2|cluster|NODE_CLUSTER|--instances|-i max/i);
});
