import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Checkpoint 12 regression: every database client must be a process-wide singleton in EVERY environment. A module evaluated twice in one process
// (two Next.js server module graphs) must not build a second client, because each client owns its own pool and the startup guard budgets one pool per DSN.
const ROOT = new URL('..', import.meta.url).pathname;
const DB = join(ROOT, 'src/infrastructure/db');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('the reader module evaluated twice in one PRODUCTION process yields the same client (one pool)', async () => {
  const before = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try {
    delete globalThis.prismaClient;
    const a = (await import('../src/infrastructure/db/prisma.ts?graph=rsc')).prisma;
    const b = (await import('../src/infrastructure/db/prisma.ts?graph=route')).prisma;   // a distinct module instance, as a second server graph would create
    assert.equal(a, b, 'one PrismaClient for the whole process');
    assert.equal(globalThis.prismaClient, a);
  } finally { process.env.NODE_ENV = before; await globalThis.prismaClient?.$disconnect(); delete globalThis.prismaClient; }
});

test('every client module caches its PrismaClient on globalThis unconditionally (no NODE_ENV gate, no bare construction)', () => {
  const files = readdirSync(DB).filter((f) => /^prisma.*\.ts$/.test(f));
  assert.ok(files.length >= 8, files.join(','));
  for (const f of files) {
    const t = strip(readFileSync(join(DB, f), 'utf8'));
    const constructions = [...t.matchAll(/new PrismaClient\(/g)].length;
    const cached = [...t.matchAll(/\?\?=\s*new PrismaClient\(/g)].length;
    assert.equal(cached, constructions, `${f}: every construction is a globalThis ??= assignment`);
    assert.doesNotMatch(t, /NODE_ENV/, `${f}: client caching must not depend on NODE_ENV`);
  }
  const elsewhere = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? elsewhere(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []));
  const outside = elsewhere(join(ROOT, 'src')).filter((p) => !p.startsWith(DB) && /new PrismaClient\(/.test(strip(readFileSync(p, 'utf8'))));
  assert.deepEqual(outside, [], 'no PrismaClient is constructed outside src/infrastructure/db');
});
